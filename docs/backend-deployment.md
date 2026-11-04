# Backend deployment — 4 November 2026

The existing Mumbai Supabase project `ljbysmgzqohvlkcdctyj` is retained. No database
reset, website publication, main-branch merge or Play upload was performed.

## Installed

| Migration | Server version |
| --- | --- |
| ranked_infrastructure | 20261104101142 |
| ranked_named_rivals_fast_queue | 20261104101158 |
| ranked_rematches_social_preferences | 20261104101208 |
| family_safety | 20261104101225 |
| ranked_hosted_worker | 20261104101242 |
| ranked_worker_extension_acl | 20261104104646 |

`ranked_worker_extension_acl` was applied subsequently to attempt narrower extension
grants and rotate the worker token. Extension ownership prevented those REVOKEs
from changing platform-owned grants; do not interpret migration success as proof
that those grants were removed.

Endpoints: `lotus-game` v13; `lotus-ranked`, `lotus-family` and
`lotus-ranked-worker` v1. They validate user sessions or provider/machine credentials
inside the handler. Gateway JWT verification remains off for those authenticated
handler flows, including modern asymmetric Supabase sessions.

Under-13 offline-only follow-up: lotus-game v14, lotus-family v2 and lotus-ranked
v2 are deployed. Parent begin/redeem returns 403, known under-13 accounts are denied
online access even with old consent flags, and the queue trigger rejects them.
No child accounts or queue entries existed at rollout. The UI is updated in this
branch; the public website and existing APK/AAB have not been rebuilt/published
with this follow-up yet. KWS is deferred and no longer a first-release prerequisite.

Ranked is **disabled**. Cron job `kamayuu-ranked-worker` is **inactive**. When later
activated, its two-second dispatcher skips empty queues and due-job scans with no
work. The follow-up `ranked_single_use_worker_tokens` migration replaces the
reusable Vault credential with random single-use credentials that expire after
30 seconds. Only hashes are kept in a private RLS-protected table; validation
atomically consumes each token. The dispatcher alone mints tokens. Player roles
cannot mint, read or validate them; the worker role cannot mint them. No service-role
key enters cron SQL or HTTP headers. Edge runtime supplies its own service key.
Jobs use existing leases, version checks and idempotent settlement.

The existing `lotus-game` endpoint permits unknown-age legacy private-table players
temporarily. Known child/revoked accounts are restricted; ranked requires family
setup. Analytics stays off for unknown-age and child accounts. This compatibility
exception must be removed after the release website migrates existing players
through age/consent setup. It does not establish protection for every legacy user.

## Verified

- 111 tests passed after the compatibility change: 89 core and 22 database tests.
- Follow-up worker hardening: all 25 database tests passed, including three new
  expiry, single-use, ACL and dispatch tests; the 89 core tests were unchanged.
- Frontend and all four Edge entrypoints passed TypeScript checks.
- Unauthenticated game, ranked and family status calls return 401. Worker missing
  credentials return 401; invalid scoped credentials return 403.
- A Vault-backed invocation returned HTTP 200 with `paired:0, processed:0`, both
  before and after scoped-token rotation. Tokens were never returned to the client.
- Unconfigured real parental verification returns a safe setup-unavailable response.
- All ranked/family tables have RLS; no ranked/family RPC grants exist for `anon`
  or `authenticated`. Ranked matches and family accounts remain empty.
- `net` and `cron` are rejected by Data API with HTTP 406; only `public` and
  `graphql_public` are exposed. Keep scheduler/Vault/private schemas unexposed.

The rollback-only synthetic live database test did **not** run: the connector's
confirmation expired. Local database flows passed; no live authenticated gameplay
or actual parental-consent success is claimed.

## Permission limits

Supabase-owned `net` tables retain PUBLIC grants, and cron tables use platform RLS.
The connected database role cannot revoke the owner's grants. These schemas are
not exposed through the Data API, but do not grant untrusted SQL access or expose
them later. The queued token can only invoke a bounded worker; it cannot fetch
player data, choose match actions or administer accounts. The follow-up single-use
token migration removes reusable secrets from this queue. A live invocation returned
200 with no work, consumed its token, and left no token rows. The old Vault credential
was confirmed rejected. Extension schemas must remain outside the Data API; a
Supabase support review is optional additional hardening, not an activation dependency.

Security advisers report intentional service-only tables with RLS/no client policy,
anonymous guest own-row policies, platform cron policies and existing disabled
leaked-password protection. Review the [database adviser guidance](https://supabase.com/docs/guides/database/database-advisors).

## Google and release gates

Android OAuth client `694818732271-fgrgj925halm4tfcjc873gamt0lo14sl.apps.googleusercontent.com`
was created in existing project `kamayuu` for `in.builtbygsv.kamayuu` and the local
release SHA-1 in `mobile-signing-public.json`. The native server client ID remains
the existing **web** client ID. Google shows Testing status. A follow-up inspection
found no configured sensitive/restricted scopes. The code uses Google Identity
Services/Credential Manager basic sign-in. Google's basic identity-scope exception
means the generic test-user warning alone does not prove sign-in is blocked.
The Publish button is disabled until Branding is completed: home, privacy and terms
URLs are blank. No Google branding settings were changed in this follow-up.
Actual device sign-in, publishing status and the eventual Play app-signing SHA-1
remain to be checked. No additional API scopes were configured.

Before enabling ranked for the revised offline-child release: complete India
age-policy, deletion and moderation checks; migrate legacy clients; verify native
authentication and reconnect; test
real leaderboard/rematch flows; and preserve extension isolation. Approve activation
as a separate release step. Do not enable ranked merely because deployment passed.

## Migration history and rollback

Server migration timestamps differ from source filenames. The live analytics
migration has timestamp `20260907134810`; source uses `20260907183000`. Two old
room-membership fixes were already present in live function bodies despite missing
history entries. Do not blindly run `supabase db push`, reset the database or replay
historical cleanup. Compare bodies/history and reconcile deliberately.

The previous `lotus-game` v12 source was saved locally under
`outputs/backend-rollback` outside this repository before replacement. On failure,
keep ranked disabled and cron inactive; redeploy that source if needed. Restoring
v12 also removes known-child endpoint enforcement, so suspend child online access.
Leave additive tables intact while investigating rather than deleting user data.
