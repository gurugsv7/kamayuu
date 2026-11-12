# Ranked infrastructure, version 1

This change builds a single human-first 1v1 ladder. The ranked entry and table
transport are connected locally, but no production migration, Edge deployment,
or production worker has been started.
The database feature flag starts disabled. Existing private tables are unchanged.

## Ladder and roster

| Stable ID | Initial display label | Rating floor | Provisional bot rating |
| --- | --- | ---: | ---: |
| bronze | Bronze | 0 | 650 |
| silver | Silver | 900 | 1050 |
| gold | Gold | 1200 | 1350 |
| platinum | Platinum | 1500 | 1650 |
| diamond | Diamond | 1800 | 1950 |

New accounts start at 600. Rating is bounded to 0–4000. Expected score uses the
standard logistic curve with a 400-point scale, K=32 for humans and K=16 for bots.
Ties score 0.5. Bot ratings are fixed calibration anchors, not leaderboard users.
Both opponent types update the same season rating. Existing profile win counters
are not used or modified by this independent ladder.

`lib/ranked-config.mjs` defines stable tier IDs, provisional labels, and 15 bot
profiles: patient, opportunist, and tracker within every tier. These profiles vary
observation recall, reaction frequency and delay, replacement margin, and buzz
timing. Their identity, version, parameters, and seed are snapshotted at allocation.
Roster edits do not change an ongoing match. Selection avoids the previous bot
profile where another enabled profile is available. All policies use `aiView`;
they cannot inspect unrevealed cards or deck order. Recall v1 models missed
observations; persistent time-dependent forgetting and search-based play are future
policy versions. Strength and tier win rates still need human calibration.

`lib/ranked-roster.mjs` supplies 180 fictional names (140 Indian names and 40
other Asian names). Each tier has 36 identities, with 12 assigned to each style.
Names, tier/style assignments and policy seeds persist across matches. Allocation
avoids the last rival when another is available and prefers idle rivals, but can run parallel AI challenges
if the tier roster is busy. Every match snapshots the name and policy. No real
accounts, photos, locations, online indicators, or invented career records are
created for these rivals.

The authenticated `leaderboard` command returns paginated standings on one rating
scale. Bot entries retain `kind: bot` and `rating_type: benchmark`; human entries
use competitive ratings and appear after a completed match. Bot anchor ratings
are provisional and fixed, while their displayed played/win counts come only
from completed ranked results. Consumers must preserve the identity distinction
in profile/details and avoid describing this table as exclusively human players.

Labels can change independently of tier IDs. Future roster changes require new
profile IDs/versions and a new migration, not editing an applied migration.
`node scripts/ranked-seed.mjs` regenerates this initial, unapplied migration's
roster from configuration; the database tests verify that both agree.

## First entry

The service returns a versioned notice:

> Ranked matchmaking prioritizes players and may use AI-controlled opponents when
> needed. Both count toward your rank. The leaderboard includes AI-controlled rivals.

The UI must display it before the player explicitly acknowledges and queues.
Acknowledgment is stored against the authenticated account, so routine re-entry
does not show it again. A materially changed notice version requires a fresh
acknowledgment. Guest accounts retain it while retaining the same auth identity;
a genuinely new account will see it again. Never call acknowledge automatically.
The rules and terms must describe the same system before public release. Per-match
opponent badges are undecided; no fabricated human claims are implemented here.

## Queue

One queue serves all tiers per configured region (initially Mumbai,
`ap-south-1`). Compatibility starts at ±150, widens to ±250 after 1 second and
±350 after 2 seconds. Both tickets must permit the rating difference. Renewing
an unexpired ticket keeps its ID, region, and original join time. Clients should
renew every 10 seconds while actively waiting; the default lease is 30 seconds.
Queue cancellation, admission, and pairing share a short transaction-level
advisory lock, appropriate to this launch population. It prevents a locked human
ticket from being skipped in favour of a bot. Pairing searches all eligible human
pairs first. With no other waiting humans in the region, a bot becomes eligible
after 750 ms. With incompatible humans waiting, the search window is 3 seconds.
The admission request itself pairs compatible humans immediately. Actual match
entry also includes worker scheduling, database/network latency, and bootstrap;
these eligibility thresholds are not a guaranteed end-to-end latency SLA.
Queue cancellation after allocation returns the active match rather than undoing
an already-started pairing. Leaving the match uses the normal forfeit path.

`active_users` enforces one public match per user across regions. Participant seat
UUIDs are independent of auth user UUIDs. Bots have no auth account. Finished and
cancelled matches release active memberships atomically. Expired waiting tickets
cannot receive a match. No participant is replaced during a match.

## API and worker

`lotus-ranked` validates bearer tokens with `auth.getUser` before calling any
service-role-only RPC. Request user IDs, ratings, bot settings, and winners are
ignored. The transport in `lib/ranked.ts` supports these commands:

| Command | Extra fields | Result |
| --- | --- | --- |
| status | none | rating, tier, notice requirement, ticket and active match |
| leaderboard | offset (optional) | 50 standings; kind, rating type, real result counts; no auth IDs |
| acknowledge | version | updated status |
| enqueue | region | renewed ticket or active match |
| cancel | none | updated status |
| recover | matchId | filtered player packet, or pending bootstrap |
| remember / hold / leave | matchId, actionId | filtered player packet |
| action | matchId, actionId, version, action | filtered packet; HTTP 409 on stale version |

All private tables have RLS and no client grants. Public RPCs are SECURITY INVOKER
with default execution revoked and service-role execution granted. Raw match
records and bot settings are never returned through the authenticated endpoint.
The endpoint reuses the existing per-user request gate. Account and network abuse
hardening beyond that gate is a rollout prerequisite.

`scripts/ranked-worker.mjs` is a Node 22+ foreground worker requiring only
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on a trusted host. Never put the
service key in a public/browser environment variable. `RANKED_REGIONS` optionally
sets a comma-separated list that must agree with the database configuration.
`node scripts/ranked-worker.mjs --once` performs a bounded tick; without `--once`
it continues at a 250 ms polling interval. It emits aggregate activity only, not
idle logs, credentials, hidden cards, or request payloads.

Jobs are durable records. Workers claim due jobs using SKIP LOCKED, a 30-second
lease, and a fresh token. A lost lease cannot commit. Compare-and-swap version
checks, job completion, next-job creation, terminal result insertion, rating
updates, and active-user release are transactional. After five handled failures,
the match is cancelled without a rating result and active users are released in
the same transaction. Expired claims are reclaimed after a process crash.

The runner initializes a secure deal, drives legal bot moves, and advances memory,
turn, and final-call deadlines without browser assistance. Human moves cancel
stale scheduled work atomically and create the next job. Unchanged bot decisions
retain their sampled execution time across human holds. Holds cannot repeatedly
extend the same phase. Human request retries retain their action ID and receive
the previously committed state instead of applying twice.

The foundation uses filtered HTTP recovery, not new Realtime channel policies.
`RankedTable` adapts it to the shared game screen with two-second recovery,
version checks, old-match response rejection, reconnect handling, and delayed
turn claiming to avoid racing the player's move. Sequential versions can animate
the last action; gaps repaint authoritative state. Cosmetic events have a bounded
sequence feed, age checks, and local deduplication. Dedicated per-seat Realtime
delivery remains a future improvement. The legacy leaderboard screen still needs
connection to the real leaderboard API; it is not verified by this UI work.

## Rematches, rival pace, and preferences

Ranked rematches are durable offers, not host resets. Either human can request;
the other must accept. A bot's fixed style, match result, score gap and series
length select one stored acceptance decision and an optional proactive offer.
Requests appear after 3–6 seconds; replies take 2–5 seconds. Offers expire after
15 seconds. Polling realizes scheduled replies without keeping an Edge timer
alive. A duplicate accept returns the same new match. The new match has a fresh
deal, a distinct result ID, current rating snapshots and the opposite opening
seat, while retaining the rival's identity, configuration and policy seed.
Accepting an old offer cannot steal a participant from a fresh match or queue.
Turning off ranked or changing seasons prevents new rematches. Offer/request
actions never change rating; only completed games do. Repeated-opponent farming
limits remain required before a public rewards rollout.

Private 1v1 tables use the same request/accept/decline/cancel controls. Two to four
player group tables keep their host-and-ready lobby flow. A player who departed
cannot be silently reseated by an opponent's request.

Rivals study initial cards for roughly 4–9 seconds, take 1–3 seconds for routine
moves, and spend longer on replacements, Queen decisions and buzzing. Style
changes pace; higher rank does not uniformly accelerate every move. Reaction
timings still follow tier parameters. Plans persist their sampled deadlines, so
emotes and settings do not restart or pause an opponent's decision.

Social behavior uses existing emote art and preset messages only, reacts to public
match/swap/final events, and is capped at four reactions per game with a 15-second
cooldown. It never changes cards, strength or outcome. Human reactions have a
2.5-second cooldown and a server allowlist in ranked. Messages and bot parameters
are not accepted as arbitrary client text.

Sound, haptics, shorter movements, opponent-emote mute and opponent-message mute
persist on the device. Saved values are normalized, including old settings.
Haptics work independently of the audio switch. Incoming-rematch preference is
also synchronized to the server account. Disabling requests declines an existing
incoming offer. Offline settings dialogs pause local practice as before; online
opponent scheduling remains server-driven. Reduced animation time never changes
server thinking delays. Physical vibration still depends on device support.

## Verification

After `npm ci`:

```
npm test
npm run test:ranked:db
npm run sync:edge
npx tsc --noEmit --incremental false
npm run build:vercel
```

Database tests use pinned PGlite (an embedded PostgreSQL engine), with minimal
Supabase auth/profile fixtures. An optional `PGLITE_MODULE` can reference an
existing installation. Tests exercise real SQL functions, permissions, human
priority at fallback, 15-player bursts, ticket expiry, cancellation, frozen bot
configuration, stale leases, once-only settlement, and a complete API/worker match.
Policy simulations cover all 15 profiles over 120 mixed matches. Source/Edge copy
parity is tested. These are not substitutes for multi-connection concurrency,
Supabase Auth/Realtime, Deno execution, and worker load tests in staging.

## Before opening ranked

1. Apply and inspect the additive migration in staging, run database advisors,
   and verify service-only permissions against the real Data API.
2. Deploy `lotus-ranked`, start the trusted worker near Mumbai, and monitor job
   lag, retry counts, RPC volume, pairing rate, waiting time, and completion rate.
3. Verify the connected first-entry notice, queue, and table UI against staging;
   finish the real leaderboard screen. Enable only a test
   cohort first. Turning `settings.enabled` off stops new entries and pairings;
   existing matches can still finish.
4. Calibrate the bot rating anchors and tier ordering against human results.
   Add repeated-opponent farming limits, queue churn/collusion signals, and season
   prize/top-rank eligibility before public competitive rewards.
5. Verify simultaneous multi-connection queue/cancel/job races, network loss,
   worker restarts, auth expiry, and realistic latency. No production migration,
   deployment, or public rollout has been performed by this change.
