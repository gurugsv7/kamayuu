# Restore card motion at turn handoff — 2026-11-04

The previous timing fix applied new turns immediately as recovery packets. That
prevented old animation queues from using the next player's draw window, but also
skipped the discard/replacement/power movement carried by the handoff packet.

Immediate state and input availability remain. Handoff events now create cosmetic
card overlays that move independently over the authoritative board. Discards,
replacements, Queen exchanges, peek feedback and matching penalties retain visual
movement. An overlay never hides, reveals or rewrites a live board element and
cannot block taps. It removes only itself when finished. Existing animation epochs
cancel obsolete overlays. Normal in-turn animation sequences remain in place.

Movement uses only the event payload already redacted for this viewer. Hidden
opponent replacement cards and unrevealed Queen/Jack faces stay card backs.
True recovery packets do not fabricate/replay missed moves. Hidden tabs and OS
reduced motion skip travel; Shorter movements uses a shorter overlay duration.

Validation: all 135 tests, frontend TypeScript, scoped new-module lint, production
build and whitespace checks passed. A browser regression delivered a fresh turn
during an old Queen animation: discard motion remained visible while Draw was
enabled, the clock showed 7 and input was unlocked. It then delivered a newer
discard during the flight and confirmed the older overlay's completion did not
overwrite it. Overlays ignored pointer input and cleaned up after completion.
Local screenshot: outputs/restored-discard-motion.png (outside tracked source).
No backend, deadline, rating or account changes are part of this correction.

After owner approval, source `9a0d3b2651a4ab5cb6e51bf2781ab9c6053da578` was
promoted to production deployment `SEE5dnwUAomqy8iFPcFzWDYUtg5v`. Vercel reported
Ready with `kamayuu.builtbygsv.in` assigned. Public HTML/JS/CSS returned HTTP 200;
the live JS includes both the card-motion overlay and handoff event handling.
All four policy-page checks passed. Backend functions were unchanged.

The owner's request to obtain approval before unrequested changes to existing UI,
animations or working behaviour is recorded in the repository's AGENTS.md.
