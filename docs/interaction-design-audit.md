# Interaction design audit — 2026-11-04

The illustrated homepage establishes a stronger visual identity than the current
ranked, private-table, and leaderboard dialogs. Keep the game’s gold, dark ink,
parchment, serif typography and restrained ornament across these screens. Full
page compositions await the owner’s mockups; this pass improves existing layouts.

## Completed foundation

- Shared ActionButton: immediate request label and spinner, disabled pending
  state, synchronous duplicate-click guard, press movement, hover sheen, and focus
  outline. Existing callers own errors; buttons recover when requests settle.
- Ranked: tier and rating card; animated search orbit; visible preparation,
  acknowledgment and cancellation states; retry after initial availability errors.
  Cancellation stays pending until the server responds, and late search responses
  cannot navigate while cancellation is in progress.
- Private table: Create and Join show pending labels and block concurrent clicks.
- Rematch: sending and confirming requests show progress; the existing server
  response wait and next-hand transition have activity indicators.
- Leaderboard: activity indicator during initial loading.
- New motion respects the OS reduced-motion preference and Shorter movements.
  Indicators represent activity, with no invented percentage or opponent claims.

## Apply mockups next

| Surface | Remaining visual work |
| --- | --- |
| Ranked entry and search | Dedicated illustrated composition, distinct tier emblems, responsive placement, found/connecting transition tied to real events |
| Private table and lobby | Consistent room-code panel, player seats, ready and host actions, connection recovery |
| Leaderboard | Clear rank/name/rating hierarchy, own-player row, tier styling, empty/error/retry states |
| Results and rematch | Match the supplied result composition while preserving incoming, outgoing, declined and expired offer states |
| Settings and help | Retain their existing lacquer/parchment treatment; align action spacing, focus and touch targets with the new screens |

## Research references

- [Uiverse buttons](https://uiverse.io/buttons): interaction-effect reference.
- [Mobbin](https://mobbin.com/): flow and screen reference library; no claim of
  reviewing gated individual app flows.
- [Radix Button](https://www.radix-ui.com/themes/docs/components/button): loading
  and disabled states.
- [Material progress](https://m1.material.io/components/progress-activity.html):
  distinguish indeterminate activity from measurable progress.

The implementation is original CSS and React using existing dependencies.
No reference-site component code or artwork was copied.

## Verification and delivery

All 119 existing tests passed. TypeScript, scoped component lint, production Vite
build and diff whitespace checks passed. A local headless Edge harness using the
actual components and simulated service responses verified 320/360/390 px fit,
minimum 44 px action targets, pending disabled state, animated search, cancellation,
short-motion preference, disclosure saving, and rematch pending/completion.
The harness and screenshots remain in ignored local work/output directories.
No production matches were created during these checks. Physical-device gameplay
and full mockup-based layouts remain outstanding.

Published after owner approval on 2026-11-04 at approximately 17:50 IST:
source `fab804ac672aa0eb1ec6211b7f0f447d10bb2fae`, production deployment
`GEPfrfRWN33uLTfkadvwbZgwXDQD`, aliased to `kamayuu.builtbygsv.in`.
Vercel reported Ready. The public homepage and referenced JS/CSS returned HTTP
200; the live JS contains the new search message and action-button markup, and
the live CSS contains the action-button styling. No new Android package was built.
