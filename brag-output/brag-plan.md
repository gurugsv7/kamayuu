# Brag Plan: Kamayuu

## What is this app?
Kamayuu is a free, phone-first card game of memory and nerve: four face-down cards, you may look at two, and you must remember them while you draw, swap, throw matches and — when you believe you hold the lowest total — press the buzzer to call *Kamayuu*.

## The angle
Treat it like a trailer for a lantern-lit table you've been invited to sit at. No feature list — the video *plays one hand* in five beats, exactly the loop the in-app tutorial teaches (Remember → Draw → Risk → Throw → Call), and lands on the parchment tally that ends every real match. The tension is the product: "they won't show you again."

## Hook (first 2-3 seconds)
Four card backs deal onto dark felt, one by one, under a breathing lantern glow. Text: **FOUR CARDS.** then **YOU MAY LOOK AT TWO.** The restriction is the hook.

## Key moments (the middle)
- The bottom two cards flip up (10♠, 8♣), hold just long enough to read, and flip back — **REMEMBER THEM.** / *They won't show you again.*
- A draw arrives (2♦); a hidden card is gambled away and turns out to be a red King — the **ZERO** badge from the real card art — **EVERY HIDDEN CARD IS A GAMBLE.**
- Kai's discard shows an 8♦; your 8♣ flips and is thrown onto it — **MATCH. ONE LESS CARD.**
- The red buzzer with the ♛ rises; it's pressed; the brass proclamation plaque **YOU BUZZED · FINAL ROUND** slams in — **KNOW WHEN TO CALL.**

## Outro / punchline
The parchment ledger drops onto the table with its wax seal: *You take the hand — 8 points*. Then the wordmark **KAMAYUU**, *A Game of Memory & Nerve*, and the address with a phone cue: **kamayuu.builtbygsv.in · play it on your phone**.

## User flow worth showing
memorize two cards → draw and replace (safe swap, then a blind gamble) → throw a match on the discard → press the buzzer → the tally reveals the winner. These are the centrepiece scenes; there is no landing-page recreation.

## Tone
- Preset: cinematic
- Creative direction: "a lantern-lit card-table trailer — brass, parchment, one red buzzer; restraint over hype"
- Interpretation: short declarative caps in Cinzel, each held long enough to read; big card art doing the acting; dramatic reveals on strong beats rather than quick cuts; one accent hue (brass gold) plus the buzzer's red and the seal's crimson as the only other colours.

## Format: landscape — 1920x1080
## Duration: 23s

## Visual identity (from the project)
- Background: `#090f15` (table felt via `table.webp` over `radial-gradient(#273039, #080d12)`)
- Accent: brass `#e1b56b` → `#b88a48` (lantern gold `#d9aa63`)
- Text: cream `#f5e6cb` on dark; ink `#2b2116` on parchment `#efe0c2`
- Display font: Cinzel (600/700, letter-spaced caps — the game's own wordmark face)
- Body/headline italic font: Cormorant Garamond (500/600 italic — the ledger headline face)
- Strongest visual element: the real card art (`/cards/*.svg`, `back.png`) on the felt, the red ♛ buzzer, and the parchment ledger with the wax seal (Ledger & Lacquer overlay system)

## Share copy (draft)
Kamayuu. Four cards, you may look at two — remember them, gamble on the rest, and know when to call. Play it free on your phone: kamayuu.builtbygsv.in

## Audio direction
- Role: cinematic support — steady bed with restrained accents
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (steady, clean; the cinematic/polished pick)
- Music treatment: starts at 0 at 0.34, fades to 0 over the final 1.6s under the wordmark
- Music cue guidance: preset read (`assets/music/cues/…vol-12.music-cues.md`, ~110 BPM). Strong cues to target: **8.74s** (red King reveal), **13.11s** (the thrown match lands), **17.47s** (buzzer press), **22.93s** (wax seal / wordmark). Beat grid for the four-card deal: 0.56, 1.09, 1.64, 2.19.
- Audio-reactive treatment: subtle; the lantern glow's opacity/scale and the wordmark's text-glow breathe with RMS/bass. No waveform or equaliser visuals.
- SFX posture: sparse, card-native — `casino/card-slide-1` on the deal, `casino/card-place-1` on flips, `impact/impactSoft_medium_001` + `interface/bong_001` on the King reveal, `casino/card-shove-1` on the throw, `impact/impactBell_heavy_000` on the buzzer, `impact/impactSoft_medium_004` for the ledger landing, `impact/impactWood_medium_000` for the seal.
- Audio-coupled moments: card-by-card deal on the beat grid; flips; the buzzer press; the seal stamp.
- Restraint rule: no stacked hits, nothing on every beat; text never flashes on a beat it can't be read in.

## Storyboard

### Scene 1 — The deal — 7.5s
Dark felt, lantern glow breathing top-left, a thin brass rule. Four card backs slide in one by one (beat grid 0.56 / 1.09 / 1.64 / 2.19). **FOUR CARDS.** slams in at 0.8s (left-anchored, Cinzel 120px), **YOU MAY LOOK AT TWO.** rises under it at 2.4s. At 3.6s the bottom two cards flip to 10♠ and 8♣ (card-place); **REMEMBER THEM.** replaces the previous lines at 3.9s; *They won't show you again.* (Cormorant italic) at 5.0s; at 6.4s the two cards flip back face-down.
Sequential/interaction: yes — four cards arrive one by one; two flip up, then back down.
Audio intent: quiet anticipation; the flip-back is the first small sting.
Audio-coupled idea: deal on the beat grid; flips with card-place.
Music: steady bed from 0.
Transition mood: dramatic (cards slide left, felt holds) → Scene 2

### Scene 2 — The gamble — 4.0s (7.5–11.5s)
Same felt. A card arrives from the deck stack (2♦) at 7.7s; the top-left back lifts and flips to reveal the red King with its ZERO badge exactly on the strong cue at 8.74s, glowing gold for a beat, then flies away to a discard pile at 9.9s. **EVERY HIDDEN CARD** at 8.9s, **IS A GAMBLE.** at 9.6s (right-anchored this time).
Sequential/interaction: yes — draw, flip, discard.
Audio intent: the reveal is the emotional beat; a warm thud plus a low bell.
Audio-coupled idea: reveal locked to 8.74s.
Transition mood: soft crossfade → Scene 3

### Scene 3 — The throw — 3.0s (11.5–14.5s)
Discard pile shows 8♦ (large, centre-right). Your 8♣ flips face-up at 12.2s and is thrown onto the pile, landing on the strong cue at 13.11s with a card-shove. **MATCH.** at 12.4s, **ONE LESS CARD.** at 13.3s.
Sequential/interaction: yes — flip, throw, land.
Audio intent: satisfying, physical.
Audio-coupled idea: landing locked to 13.11s.
Transition mood: hard cut → Scene 4

### Scene 4 — The call — 4.0s (14.5–18.5s)
The red buzzer (the game's own ♛ button) rises to centre at 14.6s over a deepening vignette. **KNOW WHEN TO CALL.** at 15.0s. A press: the buzzer compresses on 17.47s (bell), and the brass plaque **YOU BUZZED · FINAL ROUND** slams in at 17.6s.
Sequential/interaction: yes — a simulated press.
Audio intent: the biggest hit of the video.
Audio-coupled idea: press locked to 17.47s.
Transition mood: dramatic (plaque holds, felt darkens) → Scene 5

### Scene 5 — The tally and the invitation — 4.5s (18.5–23.0s)
The parchment ledger drops onto the table at 18.7s: eyebrow THE TALLY, *You take the hand*, "8 points · lowest at the table", two dotted rows (You 8 / Kai 27). The wax seal stamps at 19.5s. At 21.0s the sheet slides down and out; the wordmark **KAMAYUU** and *A Game of Memory & Nerve* appear at 21.2s, then **kamayuu.builtbygsv.in · play it on your phone** at 21.9s; the seal's stamp echoes on the wordmark at 22.93s. Music fades from 21.4s.
Sequential/interaction: yes — ledger lands, seal stamps, wordmark reveals.
Audio intent: resolution, then quiet.
Audio-coupled idea: seal stamp on 22.93s echo; wordmark glow breathes with the bed until the fade.

**Music mood for this video:** cinematic
**Audio summary:** a steady bed under a hand of cards — sparse card sounds, one thud-and-bell for the King, one bell for the buzzer, a wood stamp for the seal, then the bed fades under the wordmark.
