# Original animations before action clocks — 2026-11-04

Requested behavior: restore the original timing of every card action. Full draws,
replacement reveals, discard flights, successful/failed matching sequences,
Jack viewing holds, Queen inspection/trade and flip-back sequences run without
the shortened overlay path or the earlier forced turn-handoff interruption.
Card Web Animations use their original durations, including when the old Shorter
movements preference is set. No page layout or card rules were redesigned.

## Server and client coordination

- A server transition reserves its original animation duration and a bounded
  delivery allowance before starting/resuming the action clock. The next draw
  keeps seven seconds; drawn-card play keeps 25 seconds. Presentation of a reaction
  or Queen inspection pauses the remaining budget rather than refilling it.
- The active human acknowledges completion after the full client sequence. The
  server can release unused delivery allowance, but cannot start before the
  original minimum duration. Acknowledgments are scoped to the current transition,
  cannot be sent on another player's behalf, and retries cannot refill a timer.
- AI moves and social jobs wait for presentation to finish. An absent client has
  a bounded fallback, so it cannot stall the table indefinitely.
- Metadata polls no longer cancel an in-progress reveal. Recovery updates queue
  behind the current full animation. A short-lived retained transition survives
  clock-acknowledgment versions and is redacted through playerPacket. Transports
  display it once rather than repeatedly replaying it. Private Jack/Queen faces
  remain visible only to their authorized viewer.
- During the sequence, the turn indicator shows a paused state. The full action
  countdown begins/resumes after presentation. New clients and game functions
  should be released together; refreshed clients are needed to use the new flow.

## Verification

138 automated tests passed, plus frontend and Edge TypeScript, scoped new-code
lint, production build and whitespace checks. Database/auth policies and schema
are unchanged. Tests cover bounded fallback, early/duplicate/stale/wrong-player
acknowledgments, AI/social scheduling, preserved budgets and redacted replay.

A browser test using the actual page and trusted local rules measured original
draw, replacement, successful/failed matching, Queen swap, Jack viewing hold,
flip-back and discard sequences. It injected a metadata poll while the Jack face
was visible and confirmed the full viewing hold survived. The seven-second timer
remained full afterward. These are local synthetic tests, not a live-device pass.
The screenshot outputs/original-jack-view.png is stored outside tracked source.
