# Rematch and ranked recovery UX — 2026-11-04

Ranked recovery now uses a themed connection card and a retry action. Only absent
or expired sessions offer Sign in. Generic recovery, network, rate-limit and server
failures no longer lead to Online account setup. This fixes the misleading UI;
the screenshot alone does not establish the original server response's cause.

RankedTable closes polling and packet delivery before sending leave/rematch-decline
notifications. Previously a late response could repopulate the old room while the
next-opponent panel was opening. Finding another opponent explicitly dismisses the
old results. A regression test delays the leave response and verifies it cannot
replace the new navigation with an old match packet or rematch ID.

Rematch controls now have a lacquer invitation card inside the parchment results,
with opponent name, incoming/outgoing/accepted/closed states, actual offer expiry,
shared request locking, visible inline errors and busy actions. Declined and
expired offers direct the player onward. The results sheet is centered in the
visible viewport and scrolls internally when needed, including short phones.
Existing rematch timing, AI disclosure and server accept/decline decisions remain.

Validation: all 127 tests passed; frontend TypeScript, scoped component/helper
lint, production build and whitespace checks passed. Local browser checks used
actual UI components with simulated responses: eight states at 320×568, 360×740
and 390×844; inline request failure and retry; authentication classification; and
recovery back to ranked entry. Screenshots were visually inspected. No production
player data or backend schema was changed. Native packaging and physical-device
testing are separate from this web update.
