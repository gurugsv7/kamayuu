# Kamayuu release audit and fourteen day test plan

6 November 2026. Kamayuu 0.3.0 is available to the approved internal testers.
Play signing OAuth is registered, but successful Google sign-in on the installed
Play build still needs a phone test. Public release is not ready yet.

Allow roughly **3–5 weeks from today** if app setup, tester recruitment and review
go smoothly. This is a planning estimate, not a Google deadline. Today's source
fixes need a new Android bundle and internal rollout; they are not in the existing
0.3.0 installation or deployed website. Existing visuals and animation durations
are preserved.

## Bugs fixed in this audit

| Problem | Result of the fix | Verification |
| --- | --- | --- |
| Failed initial ranked recovery opened an empty table and started polling | Entry now rejects the failed connection, removes listeners and returns to the ranked entry screen | Failure regression reproduced before the fix and passes afterward |
| A private table could deliver a late packet while its leave request was pending or failed | Close local channels and discard the saved room before the network notification | Delayed failed leave test confirms no old packet reaches the next screen |
| A failed ranked recovery could change connection status after the table was closed | Ignore connection callbacks from the closed table | In-flight rejection regression reproduced and passes |
| A private-table 401 signed the player out and could retry as a new web guest | Refresh the existing session once; preserve the account and action ID; fail normally if refresh fails | Both refresh success and failure regressions reproduced and pass |
| Android room invitations shared the bundled localhost origin | Native invitations now contain the public Kamayuu website and room code | Native versus web share URL test passes |

The connection fixes are in `lib/ranked.ts`, `lib/multiplayer.ts` and
`app/page.tsx`; sharing uses `lib/mobile-policy.mjs`. The token refresh uses the
documented [Supabase refreshSession API](https://supabase.com/docs/reference/javascript/auth-refreshsession).
The SDK response is mocked in regression tests; real phone token renewal remains
a device-test gate.

## Verification and live backend findings

- All 144 Node tests pass, including local database/worker authorization tests.
  Frontend TypeScript and the mobile web production build pass. Five new connection
  and authentication regressions were observed failing before their fixes.
- Repository-wide lint fails with 332 error lines in the pre-fix baseline. These
  include existing explicit-any/hook/promise findings and browser-oriented lint
  attempting to type-check Deno entry points. This is not 332 confirmed gameplay
  bugs. Separate browser and Edge checks, then make the actual release check clean.
- Live ranked is enabled: 268 completed jobs, zero overdue pending jobs, and all
  10 recorded matches finished at the audit snapshot. This small history does not
  demonstrate load capacity or prove that every game was free from glitches.
- Cron runs every two seconds. The prior 24-hour snapshot contained 42,867
  successful cron runs; SQL dispatch success alone does not prove an Edge worker
  completed. The completed jobs and zero backlog are separate checks.
- Only eight function requests were present in the queried last-24-hour logs;
  all returned 200. Per-service average execution was approximately 0.6–0.7 seconds
  and maximum execution was 1.219 seconds. These are server durations from a tiny
  sample, not phone round-trip or matchmaking percentiles.
- The security advisor reports private tables with RLS but no policies, as expected
  for service-only tables. Anonymous and authenticated roles lack usage of the
  ranked schema. Public profile policies require the caller's own user ID;
  Realtime policies require room membership. Cron policies restrict rows to the
  current database user. Do not weaken these policies just to clear warnings.
- Six foreign-key indexes are advisory candidates; prioritize rating-event user
  lookup and growing match/history tables after measuring queries. Small bot
  configuration tables are not an immediate bottleneck. See the
  [Supabase index advisory](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
- Password leak protection is disabled. This app currently uses Google identity
  and web guests; reassess the warning if enabling password authentication. See
  [Supabase password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Delays and operating costs to measure next

The empty-queue bot threshold is 750 ms; the other waiting-player fallback is
3,000 ms. Neither equals total visible matchmaking time. A two-second worker
schedule, bootstrap processing, entry polling every 1.2 seconds and network
round trips add delay. Compatible waiting humans retain priority. Do not remove
card animation time to disguise these delays.

Ranked recovery waits one second after each response before polling again. In
the low-latency limit, 12 continuously connected players can generate about 720
recovery requests per minute, excluding actions. Actual counts are lower when
responses take longer. Before growing traffic, measure costs and consider private
Realtime notifications with recovery polling as a fallback; preserve versioning,
redaction and reconnect behavior. This architecture change is not implemented here.

Both game transports allow a 15-second request timeout and one network retry:
roughly 30 seconds of fetch waiting, plus session work, can occur during a bad
connection. Test airplane mode, silent packet loss and Wi-Fi/mobile switching;
improve retry feedback and cancellation based on recordings rather than blindly
shortening timeouts. Authentication failures and connection failures must remain
distinguishable.

The mobile entry bundle is about 674 kB minified (about 199 kB gzip). Vite reports
an ineffective dynamic import of Google auth because the main page also imports
it statically. Profile cold launch on a lower-end phone before splitting tutorial,
account and leaderboard code. Local bundled assets already support offline use.

Cron history had 81,851 rows using about 13.4 MiB since 4 November. No scheduled
history cleanup was found in the inspected migrations. Establish a documented
retention window and bounded cleanup for cron/job history; preserve required
match and abuse evidence. Idle dispatch exits before calling the Edge worker,
so cron executions are not equivalent to paid Edge invocations.

## Gates before closed and public release

| Priority | Gate | Evidence needed |
| --- | --- | --- |
| Blocker | Play-installed native Google sign-in | Account chooser, cancellation, successful login, profile, ranked match, restart and logout on the iQOO |
| Blocker | Closed test setup and real testers | Complete app setup and publish the closed track; aim for 15–20 genuine testers so at least 12 qualify even if people leave |
| Blocker | Store and policy declarations | Accurate Data safety, target audience/Families, IARC, ads declaration, app-access instructions, privacy/deletion links and India distribution |
| Blocker | Children and teen treatment | Review India requirements and the mixed-age product before declaring compliance; under-13 offline practice does not settle all duties for ages 13–17 |
| High | Deletion, privacy and account isolation | Disposable-account deletion through the real backend, old-session rejection, cross-account checks, retention and support procedure |
| High | Device and network reliability | At least two real phones and a lower-end device or Play pre-launch devices; offline cold launch, background/resume, audio, safe areas, keyboard, back and reconnect |
| High | Match correctness under concurrency | Two real players enter together, cancellation races, duplicate actions, rating counted once, rematch accept/decline/expiry and another-opponent flow |
| High | Moderation and disclosure | Verify first-entry AI disclosure and benchmark leaderboard semantics; test player-supplied names, mute/report/block needs and support handling |
| High | Repeatable release checks | Add CI for unit/database tests, frontend types, separate Deno validation and Android release checks; no GitHub Actions workflow is currently present |
| Medium | Scale and retention | Measure queue/worker latency and errors, polling volume, database growth and retry behavior; tune from results |

Data safety preparation already exists in `play-data-safety-inventory.md`.
Authentic phone screenshots, store icon/feature graphic and reviewer access must
be finalized. Do not mark these complete merely because a signed AAB uploaded.
Review the generated Android lint/pre-launch reports, including lower-priority
resource and monochrome-icon warnings.

## Work plan for the next fourteen days

The work schedule starts now. Google's eligibility clock starts separately when
the qualifying testers opt in to the available closed test. If closed release
approval or recruitment takes longer, the remaining testing dates move with it.

| Day | Work | Exit evidence |
| --- | --- | --- |
| 1 | Test Play Google login; package today's fixes with a higher versionCode; recruit testers | Successful owner login and online game; internal update available |
| 2 | Complete listing, audience/data declarations, India distribution and reviewer access; submit closed track | Submission recorded; tester instructions prepared |
| 3 | When approved, enroll 15–20 testers and record opt-in timestamps | At least 12 confirmed closed-test opt-ins; actual eligibility start recorded |
| 4 | Offline cold launch, tutorial, practice, settings, sound and haptics | Device/version checklist and feedback |
| 5 | Human versus human games; simultaneous joins and cancel races | No double matches, wrong seats or lost queue state |
| 6 | Empty-queue rivals, all tiers, action timing and power reveals | Recorded queue duration; complete animations and fresh 7/25-second budgets |
| 7 | Rematch requests, acceptance, decline, expiry and another opponent | No instant unintended restart, stale results or stuck invitations |
| 8 | Airplane mode, weak network, app backgrounding and force-stop/reopen | Recoverable game/account state and honest connection feedback |
| 9 | Account changes, refresh, logout, disposable deletion and access controls | No identity substitution or cross-account data exposure |
| 10 | Two phone sizes, cutouts, keyboard, back, larger text and low-end performance | Usable controls and preserved table layout; measure cold launch |
| 11 | Concurrent matches and repeated actions in a controlled test environment | Worker backlog, error rate and duplicate-result checks; no stress test on real players |
| 12 | Triage feedback and ship only needed fixes to the same closed test | Linked bug-to-fix records and regression results |
| 13 | Recheck critical flows and Play pre-launch findings; finalize listing assets | No unresolved crash, login, lost-match or privacy blocker |
| 14 | Review readiness and continuous opt-ins; prepare production-access answers | Honest usage/feedback summary; apply only when Console confirms the full 14 days |

Ask testers for roughly 10–15 minutes on most days, covering the assigned flows,
and record device, app version, steps, expected/actual behavior and screenshots.
That frequency is our test plan, not a mandated Google daily-minutes quota. Use
real participants, not duplicate owner accounts or fabricated engagement.

## Public release timeline

Google requires at least 12 closed testers opted in continuously for 14 days
before applying for production access. Internal testing does not satisfy this.
The access review usually takes seven days or less, but can take longer or require
more testing. [Google testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465).

Production access is followed by the production-release review and publishing
process. Google says processing can take hours to seven days or longer, and
recommends a week of buffer. [Google publishing guidance](https://support.google.com/googleplay/android-developer/answer/9859654).

For example, if the qualifying 12 testers are all opted in by **9 November**, the
14 full days finish no earlier than the corresponding time on **23 November**.
That is eligibility to apply, not a promised public launch. A working launch
window is late November to early December, approximately **27 November–11
December**, conditional on prompt setup/recruitment, approval and no release
blockers. A delay in closed-test approval or losing qualifying testers moves this
window. Continue the test while access is reviewed.

For production, use the tested artifact, verify India availability and monitor
crashes, sign-in failures, queue wait and unfinished matches closely at launch.
Keep the previous signed artifact and backend rollback information available.

## Storage and scope

The read-only scan of Documents/Codex measured about 4.08 GiB across projects with
about 295 GiB free on C:. Kamayuu dependencies occupy 596 MiB; Android build output
is 297 MiB and the project Gradle cache is 16 MiB. Those last two are approximately
313 MiB of rebuildable output, useful during ongoing release work. Nothing was
deleted; the owner's instruction to keep development dependencies remains in effect.
The scan skipped reparse points and measures logical file sizes.

This audit combines source review, deterministic regression tests, a mobile web
build and read-only production diagnostics. It is not a complete security
certification, a real-device pass or a production load test. Today's changes do
not alter game rules, animation timing, age policy or the deployed backend.
