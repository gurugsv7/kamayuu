# Online turn timing and power controls — 2026-11-04

Online turns allow 7 seconds to draw from the deck or discard, then 25 seconds to
complete that play. Jack/Queen selection and Queen inspection/confirmation share
the same 25-second window. Presence claims, social actions, recovery and ordinary
phase changes do not refill it. New turns start a new draw clock. Existing memory,
final-call, missed-turn strikes and stalled-play forfeits remain in place.

Previously every phase change opened another 7-second deadline, while a presence
claim could change it to 45 seconds. The client also normalized its ring against
whatever time remained on the latest packet, so a recovered 4-second timer could
look completely full. Explicit duration/start/phase metadata now accompanies the
deadline. The client counts whole seconds upwards with ceil and draws the ring
from the continuous remaining fraction. Local packet receipt time is recorded
before animations. Ranked polling is now once per second rather than every two
seconds; private timeout nudges no longer add a 6-second active-player stagger.
Network/polling latency can still mean a turn is first seen after it starts; the
display preserves the server deadline rather than inventing extra time.

Discard/Skip power and Trade/Keep choices now appear in a horizontal instruction
row above the player's hand. The piles make room during these phases. Message
keeps its own position, and the held card remains visible.

Validation: 124 tests passed, including 5 new timing regressions. Frontend and
Edge TypeScript checks, scoped new-module lint, production build and whitespace
checks passed. Broader rules lint still reports a pre-existing fallback-spread
warning. Actual table browser checks covered decision, peek, swap and swapConfirm
at 320×568, 360×740 and 390×844. These use local development state, not production
player records. Physical-device gameplay remains to be checked.

Backend deployed: lotus-game v16, lotus-ranked v4, lotus-ranked-worker v2.
All retain their internal authorization and verify_jwt=false configuration.
Unauthenticated HTTP smoke requests returned 401. Ranked admission and worker cron
were read back enabled/active. No database schema, ratings or player data changed.
Existing turns retain their stored deadlines until the next relevant transition.

Web source `87147795b64975f381a23824ba28674915192831` was promoted to production
deployment `D3TZmvdw7MhvyJW2F5gHjnc1jgyB` at approximately 18:07 IST. Vercel
reported Ready with the existing public domain assigned. Refresh cached clients
before testing. No Android package was rebuilt during this correction.
