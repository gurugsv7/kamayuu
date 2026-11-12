# Ranked progression and scheduled rival form

Owner requested easier early progression and changing rival standings, then
clarified: no simulated matches, fabricated records or recent-match UI.

## Progression

Forward-only settlement formula, same reward against people and rivals.
At equal ratings (win / loss): Bronze +35 / -9, Silver +31 / -12,
Gold +27 / -15, Platinum +23 / -18, Diamond +16 / -16.
Early-tier wins range 30–40 / 26–36 / 22–32 / 18–28 respectively,
depending on opponent rating. Early-tier draws give zero; Diamond uses K32 Elo.
Ratings remain 0–4000. Existing scores/events are preserved; no retroactive bonus.

## Rival movement

Private season/identity adjustment state, separate from matches and results.
Daily deterministic form target (-120..120), approached by at most 12 points
after six elapsed hours. Scheduler checks every ten minutes. Missed intervals
make one step; no catch-up burst, history backfill, fabricated wins or matches.
Active opponents are skipped, and duplicate concurrent runs are guarded by an
advisory transaction lock. At 100 completed real games/day movement halves;
at 1,000 it pauses. Season setting disabled also pauses updates.

Current rival rating retains actual player-match deltas, plus scheduled form.
This is background variation, not a guarantee that a particular rival becomes
number one. Rival skill/personality profiles are unchanged.

Leaderboard rival rows show tier rather than a zero-game win record. Human rows
retain actual wins/played. Footer explains the scheduled rival adjustments;
existing first-entry AI disclosure remains. No per-row identity claims added.

## Verification and deployment

135 regression tests; 32 focused ranked/database tests; TypeScript; web build
passed. Database parity covers all tier boundaries, large rating gaps and caps.
Scheduling tests cover six-hour wait, idempotence, ±12 step, ±120 total bound,
no created games/results/ratings/events, disabled mode and public denial.

Hosted migration `20261109224447` applied successfully to `ljbysmgzqohvlkcdctyj`.
Live checks confirmed scoring examples, 180 zero-initialized adjustments,
active `kamayuu-rival-motion` cron, no authenticated execution/table permission.
First due timestamp 2026-11-10 04:44:47 UTC (10:14:47 IST); the next ten-minute
scheduler check may apply it, unless that rival is in an active match.
Private RLS/no-policy INFO is expected; no new public access was granted.

Backend rollback: unschedule `kamayuu-rival-motion`; restore the prior settle
definition and rival_rating definition from migration 20261109222213. Keep the
motion table/history intact for audit. Do not rewrite historical rating events.
