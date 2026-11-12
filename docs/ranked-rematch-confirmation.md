# Ranked AI rematch confirmation

Deployed to the existing production Supabase project on 2026-11-04 using
`20261104115847_ranked_rematch_confirmation_delay.sql`.

A player request could cross a scheduled AI offer and be treated as immediate
acceptance. Explicitly accepting an AI offer also allocated the next game at once.
Both paths now return the existing waiting state and schedule a 2–5 second
server-side confirmation. The next client poll displays the reply, so the visible
wait can include the polling interval. An AI that already offered remains willing;
fresh player requests retain the stored accept/decline decision.

Retries preserve the original deadline. Cancellation prevents subsequent polling
from allocating a match. Human acceptance and crossed human requests remain
immediate. Timing starts after locks are acquired. Existing ratings, match data,
AI identity, and disclosure remain unchanged. No frontend rebuild is required.

Validation: all 119 automated tests passed, including four new database regression
tests for crossed AI offers, accepting AI offers and retrying, cancellation, and
crossed human requests. Scoped test lint and `git diff --check` passed. Production
read-back confirmed the migration, service-only RPC access, ranked enabled, and
worker active. A full device gameplay pass remains for production testing.
