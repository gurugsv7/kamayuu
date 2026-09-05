# Kamayuu — deployment

## Supabase

Lotus now has its own project. It shares nothing with `cheatbetter`.

| | |
|---|---|
| Project | `lotus-buzzer` |
| Ref | `ljbysmgzqohvlkcdctyj` |
| Region | `ap-south-1` (Mumbai) |
| URL | `https://ljbysmgzqohvlkcdctyj.supabase.co` |
| Publishable key | `sb_publishable_S2Iy4SJ7I-xRdy3I7j3nog_CDyxmYQN` |

Deployed:

- Migration `lotus_private_multiplayer` — `lotus_private` schema (`rooms`, `results`,
  `rate_limits`), `public.lotus_memberships`, four service-role-only RPCs, and the two
  `realtime.messages` policies that scope each player to their own broadcast topic.
- Migration `player_profiles` — `public.profiles`, its own-row policies, the stats-freezing
  trigger and `lotus_record_result`.
- Migration `commit_records_profile_stats` — `lotus_commit` also writes the match result
  and moves profile stats.
- Edge function `lotus-game` (`verify_jwt: false` — it validates the bearer token itself
  with `auth.getUser`, which is required for asymmetric Auth tokens).

All three migrations are in `supabase/migrations/`, named with the versions the remote has
applied. `supabase db push` against a fresh project reproduces production exactly.

### hCaptcha

Supabase Auth verifies the CAPTCHA itself, so the flow is:

1. The browser gets a token from hCaptcha (invisible widget, loaded lazily on the
   first online sign-in only — solo play never pulls the script).
2. It is passed to `signInAnonymously({ options: { captchaToken } })`.
3. Supabase checks it against the hCaptcha **secret** stored in
   *Authentication -> Attack Protection -> CAPTCHA*.

The **secret never appears in this repo or the browser bundle** — only the public
sitekey does, via `NEXT_PUBLIC_HCAPTCHA_SITEKEY`.

**Hostname allowlist:** an hCaptcha sitekey only issues tokens for hostnames
registered against it. Add every host you use, or sign-in fails with
`CAPTCHA could not be completed (network-error)`:

- `localhost` and `127.0.0.1` — for local development
- your Vercel production domain, and the `*.vercel.app` preview domain

### Google sign-in

Sign-in uses **Google Identity Services + `signInWithIdToken`**, not Supabase's redirect
flow. The redirect flow sends the browser to `<ref>.supabase.co/auth/v1/callback`, and
Google's consent screen then names that host; rebranding it needs a paid Supabase custom
domain. Here the ID token is fetched in the page, so Google only ever shows this app's
own name and origin — free, and no client secret is needed.

**Google Cloud Console**

1. *OAuth consent screen* — External, App name `Kamayuu`, scopes `openid`, `email`,
   `profile` only (all non-sensitive, so no verification review). Publish before launch or
   only test users can sign in.
2. *Credentials -> OAuth client ID -> Web application*
   - **Authorised JavaScript origins**: `http://localhost:3000`, your Vercel domain, and
     the `*.vercel.app` preview domain.
   - **Authorised redirect URIs: leave empty.** Adding Supabase's callback is what
     reintroduces the `supabase.co` branding.
3. Copy the **Client ID** into `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. It is public by design.

**Supabase** — *Authentication -> Sign In / Providers -> Google*: enable, and paste the
Client ID into the **Client IDs** allowlist (used to verify ID tokens). Leave
"Skip nonce check" off; the app sends a hashed nonce to Google and the raw one to Supabase.

Also enable **Allow manual linking** if you want guests to upgrade to Google while keeping
their existing profile and stats.

### Profiles

`public.profiles` — one own-row record per account: `display_name`, `avatar`,
`matches_played`, `matches_won`. RLS is own-row only; no player can read another's profile.
Names shown at a table travel in the room payload, so no cross-player read is ever needed.

**Stats cannot be forged.** A `before update` trigger reverts any client write to
`matches_played` / `matches_won` unless the caller is `service_role`. They move only via
`lotus_record_result`, called from `lotus_commit` on the server's own view of who won.

Solo results stay in `localStorage`; profile stats count online matches only.

### Expected advisor warnings

`get_advisors` reports "Anonymous Access Policies" on `profiles`, `lotus_memberships` and
`realtime.messages`. That is by design: guests **are** anonymous users and must be able to
play. Every one of those policies is strictly own-row (`auth.uid()` equality), so an
anonymous user can only ever reach their own data. "Leaked password protection" is
irrelevant — there is no password auth.

### ⚠️ One manual step

**Authentication → Sign In / Providers → Allow anonymous sign-ins → Enable.**

Online play cannot work until this is on; the app shows
"Guest sign-in needs to be enabled in Supabase." until then.

While you are on that screen, also enable **CAPTCHA** for anonymous sign-ins. Every guest
is a real `auth.users` row counting toward the 50,000 MAU free-tier cap, and without
CAPTCHA that is trivially farmable.

## Vercel

The app is entirely client-rendered (one `'use client'` page, no server routes), so it
ships as a static SPA. `vinext` + Cloudflare Workers is still what `npm run dev` uses
locally; the Vercel path is a separate Vite build that does not disturb it.

| Setting | Value |
|---|---|
| Framework Preset | Other |
| Build Command | `npm run build:vercel` |
| Output Directory | `dist-vercel` |
| Install Command | `npm install` |

Environment variables (all four are public, safe to ship in the browser bundle):

```
NEXT_PUBLIC_SUPABASE_URL=https://ljbysmgzqohvlkcdctyj.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_S2Iy4SJ7I-xRdy3I7j3nog_CDyxmYQN
NEXT_PUBLIC_HCAPTCHA_SITEKEY=1a767756-c9e2-4e8e-bd30-8ddec5ee2e4c
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<from Google Cloud Console>
```

`vercel.json` already encodes the build command, output directory and the SPA rewrite,
so the dashboard should pick those up. The env vars must be set by hand.

These values are inlined at build time by `vite.config.vercel.ts`. Vite does **not**
inline bare `process.env.NEXT_PUBLIC_*` on its own — that is a Next convention — so if
you ever change how the build works, re-check that the URL still appears in
`dist-vercel/assets/*.js`, or online play will silently break in production.

## Local

```bash
npm run dev            # vinext dev on :3000, reads .env
npm run build:vercel   # production SPA into dist-vercel/
node --test tests/*.test.mjs
```

`.env` is gitignored. `.env.example` documents the shape.

## Editing game rules

`lib/engine.mjs` and `lib/multiplayer-rules.mjs` are the source of truth and run in three
places: the browser, the Node tests, and the Deno edge function. `supabase/functions/lotus-game/`
holds **copies**. After changing either file:

```bash
node scripts/sync-edge.mjs
```

then redeploy the edge function. Nothing enforces this — a stale edge deploy means the
server plays by different rules than the client, which is exactly the bug class the
`assertState` invariants exist to catch.

## Free-tier headroom

Measured, not estimated. A packet costs one send plus one delivery, and each player needs
a separately redacted payload, so a 4-player action costs 6 realtime messages (the actor
gets theirs in the HTTP response instead of a broadcast).

| Limit | Free tier | Our usage | Ceiling |
|---|---|---|---|
| Realtime messages | 2M/mo | ~520/match | ~3,800 matches/mo |
| Edge invocations | 500k/mo | ~85/match | **~5,800 matches/mo** ← binding |
| Egress | 5 GB/mo | ~300 KB/match | ~16,000 matches/mo |
| Peak connections | 200 | 1 per player | 50 concurrent tables |
| MAU | 50,000 | 1 per guest | 50,000 players |

Backstops already in the schema: `lotus_gate` caps 80 requests/user/minute in Postgres,
`lotus_create` caps 3 rooms per user, rooms self-delete after 24h.

If you outgrow this, the next lever is broadcasting one shared packet to all non-actors
instead of one each — worth ~50%. It requires moving seat rotation to the client, which
is the code that keeps opponents' cards secret, so it needs care.
