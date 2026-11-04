# Matching and turn handoff correction — 2026-11-04

## Rules review

Kamayuu's engine, existing engine tests, tutorial and in-app rule text treat a
successful matching throw as a reaction: it removes the matching card without
spending the normal draw/play turn. A wrong throw on the active player's turn
adds the penalty and spends that turn. A player holding a drawn card must finish
playing it before throwing a match. Empty hands and the final rotation keep their
existing special handling.

The [CABO publisher's rules](https://www.cabogame.com/how-to-play) were checked for
comparison. They describe a different matching/exchange variant; they do not
override Kamayuu's established throw mechanic. No external game's turn rules
were substituted for the shipped Kamayuu rules.

## Two independent causes

1. A successful own-turn throw left the original draw deadline untouched. A late
   throw could leave less time than the next scheduled AI move, making timeout
   win even though the normal draw had not been taken. Such a successful throw
   now opens a fresh 7-second draw window for the same player. Another player's
   reaction does not refill or consume the active player's clock. No 25-second
   power window is refilled by an inspection or social action.
2. Server turn handoff already creates a new 7-second deadline, but the browser
   could keep displaying/animating the previous player while that deadline ran.
   Fresh ready-state handoffs now interrupt the old animation queue and apply
   the authoritative state immediately, including metadata-only recovery arriving
   while presentation lags. Old animation tokens cannot later repaint old state.
   Ongoing powers and ordinary reaction animations retain their normal behavior.

Network/polling transit still counts against the authoritative deadline; the UI
does not manufacture extra seconds for late packets. The fixed handoff removes
the additional client animation delay and input lock.

## Verification

All 132 tests passed, including new own-turn throw, out-of-turn throw, scheduled
AI follow-up, quick completion/next-player deadline, and presentation handoff
regressions. The own-turn throw test first failed against the previous behavior.
Frontend/Edge TypeScript checks, scoped new-code lint, production build and diff
whitespace checks passed. A browser test using the real page injected a new turn
during an old Queen animation: within 60 ms it showed 7, active player zero,
Draw enabled and presentation unlocked; after the old animation's duration the
new state remained intact. This was local synthetic gameplay, not a claim of
physical-device or live player verification. No schema or rating data changes.

## Approved production release

After explicit owner approval, deployed lotus-game v17, lotus-ranked v5 and
lotus-ranked-worker v3. Read-back confirmed the updated matching rule in all
three bundles. Unauthorized smoke requests returned 401; ranked admission and
worker cron remained enabled/active. Security advisors retained the existing six
warnings. No authentication permissions were expanded.

Web source `c32e958360e78a0eb6894f26493c6df9695ed7ef` was promoted to production
deployment `GPEaQDn3F93ayFUe6A32XmsUEGEf` after Vercel email reauthentication.
Vercel reported Ready with `kamayuu.builtbygsv.in` assigned. Public HTML/JS/CSS
returned HTTP 200, and the live JS contains the immediate-handoff path. All four
policy-page checks passed. Refresh cached clients before testing; no new Android
binary was built during this correction.
