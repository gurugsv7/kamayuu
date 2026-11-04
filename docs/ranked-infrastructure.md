# Ranked infrastructure, version 1

This change builds a single human-first 1v1 ladder. It does not enable the ranked
button, apply a production migration, deploy an Edge function, or start a worker.
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

Labels can change independently of tier IDs. Future roster changes require new
profile IDs/versions and a new migration, not editing an applied migration.
`node scripts/ranked-seed.mjs` regenerates this initial, unapplied migration's
roster from configuration; the database tests verify that both agree.

## First entry

The service returns a versioned notice:

> Ranked matchmaking prioritizes players and may use AI-controlled opponents when
> needed. Both count toward your rank.

The UI must display it before the player explicitly acknowledges and queues.
Acknowledgment is stored against the authenticated account, so routine re-entry
does not show it again. A materially changed notice version requires a fresh
acknowledgment. Guest accounts retain it while retaining the same auth identity;
a genuinely new account will see it again. Never call acknowledge automatically.
The rules and terms must describe the same system before public release. Per-match
opponent badges are undecided; no fabricated human claims are implemented here.

## Queue

One queue serves all tiers per configured region (initially Mumbai,
`ap-south-1`). Compatibility starts at ±150, widens to ±250 after 5 seconds and
±350 after 10 seconds. Both tickets must permit the rating difference. Renewing
an unexpired ticket keeps its ID, region, and original join time. Clients should
renew every 10 seconds while actively waiting; the default lease is 30 seconds.
Queue cancellation, admission, and pairing share a short transaction-level
advisory lock, appropriate to this launch population. It prevents a locked human
ticket from being skipped in favour of a bot. Pairing searches all eligible human
pairs first; only when none exists can an eligible 12-second ticket get a bot.
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
The ranked table UI still needs an adapter, clock/reconnect handling, and either
bounded recovery polling or dedicated per-seat Realtime delivery. Do not point
the existing private-table transport at raw ranked database records.

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
3. Connect the first-entry notice, queue, ladder, and table UI. Enable only a test
   cohort first. Turning `settings.enabled` off stops new entries and pairings;
   existing matches can still finish.
4. Calibrate the bot rating anchors and tier ordering against human results.
   Add repeated-opponent farming limits, queue churn/collusion signals, and season
   prize/top-rank eligibility before public competitive rewards.
5. Verify simultaneous multi-connection queue/cancel/job races, network loss,
   worker restarts, auth expiry, and realistic latency. No production migration,
   deployment, or public rollout has been performed by this change.
