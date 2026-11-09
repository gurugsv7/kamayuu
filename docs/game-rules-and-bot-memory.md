# Kamayuu rules and rival memory decisions

Owner clarification (10 November 2026): forgetting is desirable, but only after
multiple turns. Do not make bots permanently remember everything or forget their
opening two cards / a new placement immediately. Preserve existing game rules,
UI, animation timing, settings, identities and personalities when tuning bots.

## Rules source of truth

`lib/engine.mjs`, `lib/multiplayer-rules.mjs`, `lib/turn-timing.mjs` and their
regression tests define this app's variant. External Cabo/Cambio variants are
references, not authority to change Kamayuu's powers or scoring.

- Four fixed starting positions. Each seat sees only its own bottom two initially.
- A deck draw can replace one occupied position or be discarded. The replaced
  card becomes public; the incoming deck card is known privately to its owner.
- Taking the public discard requires a replacement. Players cannot take their
  own latest discard back. Incoming public cards can legitimately be tracked.
- A is 1, number cards face value, J 11, Q 12, black K 13, red K 0.
- Deck-drawn red J peeks at one own card. Red Q inspects own/opponent cards at
  the SAME position, then optionally trades. Fresh inspected faces are known.
  Taking a power card from discard does not activate its power.
- Matching uses rank, not numeric score. Failed matches reveal the attempted
  card and add a penalty card; discard-specific locks must remain enforced.
  Successful own-turn throws retain the normal move. Six occupied cards eliminate.
- Buzz and final-turn rotation follow the engine (including caller's current
  turn); lowest eligible total wins. Preserve current reaction/final-round rules.
- Online draw/play budgets and presentation pauses remain unchanged.

## Research checked

Publisher's Cabo rules: https://www.cabogame.com/how-to-play
Related online implementation: https://playcabo.io/how-to-play
Both describe the two-card opening memory and drawing/replacing to lower scores.
They differ in powers, matching and ending details. Neither prescribes a bot's
forgetting rate; the following is explicit game-design tuning, not a rule or a
scientifically measured model of human memory. No third-party text copied.

## Ranked policy changes

Earlier deterministic recall masking could erase a particular card on every
decision from the first turn. Missing a reaction also erased the matching card
before selecting a discard replacement. Together these could repeatedly value
a known low card as unknown and cycle through the same slot.

Server-private memory now tracks each LEGALLY observed card by identity/position:
learned-at personal turn, last checked turn, forgotten flag. Personal turn count
advances only when that bot's turn ends, not on polls, holds or card animations.
No hidden deck or unseen face is supplied to the decision policy.

Own-card protection: Bronze 3, Silver 4, Gold 5, Platinum 7, Diamond 9 completed
personal turns. Known values 0–2 get two additional protected turns. After that,
each new personal turn has forgetting chance (1-recall)*0.35; opponent memories
age after one turn with chance (1-recall). Once forgotten, a card stays unknown
until a legitimate peek/reveal or acquisition refreshes it. New incoming cards
and private power reveals refresh recency. Old deployed rooms initialize safely
without an immediate forgetting burst. Memory stays out of public packets.

Knowledge-backed replacements choose a strictly better known card; unknown
slots use the existing estimate and personality margin. Equal candidates use
stable per-turn/identity tie-breaking instead of always selecting the first slot.
Reaction misses and match locks do not corrupt replacement valuation. Queen
confirmation uses the freshly inspected pair; no equal/worse trade just because
the opponent called. Red J is skipped when there is nothing unknown to learn.

Bronze still misses some matches, tracks opponents less reliably, forgets older
information and uses its existing cautious/risky personality and buzz thresholds.
No perfect information, fake activity, UI changes or shortened timing added.

## Verification

Regression cases cover the reported opening low-card replacement, 2/3 cycles,
useful 3->2 improvement, varied equal-slot choices, fresh Queen comparisons,
delayed persistent forgetting, polling idempotence, power refresh, matching locks
and private-memory redaction. Existing all-profile/full-match tests remain.

143 application regressions, 30 database/worker checks and TypeScript passed.
Published ranked Edge version 8 and worker version 5 on 10 November 2026 (IST).
Both reported ACTIVE; retrieved deployed runtime matches the tested source.
Only ranked-runtime changed substantively relative to the deployed worker;
other apparent source differences were trailing newlines. No schema, game-rule,
presentation or authentication changes were made. New online matches in the
existing Android app and website use the server policy; no APK is required.
No new physical-phone match was played during this verification. Difficulty
calibration remains a playtest task; tests establish correctness, not human IQ.
