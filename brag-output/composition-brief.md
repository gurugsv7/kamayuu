# Hyperframes Composition Brief: Kamayuu

## Objective
Create a short launch-style brag video for Kamayuu — a phone-first card game of memory and nerve — that plays one hand in five beats and lands on the parchment tally.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 24 seconds

## Source Material
- Project root: the Kamayuu repo (`app/`, `components/`, `public/`, `index.html`)
- Primary files read: `index.html` (SEO copy, taglines), `app/globals.css` (palette, Ledger & Lacquer overlay system, buzzer, plaque), `app/page.tsx` + `components/tutorial/kamayuu-tutorial.tsx` (the real play loop), `components/score-ledger.tsx` (the tally), `public/cards/*.svg` (card art)
- Product name: Kamayuu
- Tagline / strongest claim: "A Game of Memory & Nerve" · "Remember the card. Follow the position. Know when to buzz." · "Less in your hand. More on your mind."
- Key UI or visual moment to recreate: four face-down cards with only the bottom two revealed; a red King with its ZERO badge; the red ♛ buzzer; the brass "YOU BUZZED · FINAL ROUND" plaque; the parchment ledger with the wax seal
- Copy that must appear verbatim:
  - KAMAYUU
  - A Game of Memory & Nerve
  - kamayuu.builtbygsv.in

## Creative Direction
- Tone preset: cinematic
- Creative direction: a lantern-lit card-table trailer — brass, parchment, one red buzzer; restraint over hype
- Interpretation: declarative caps in Cinzel that hold long enough to read; the card art acts; reveals land on strong beats; one accent hue (brass) plus the buzzer red and seal crimson
- Angle: play one hand (Remember → Draw → Risk → Throw → Call) and end on the tally — the same loop the in-app tutorial teaches
- Hook: four card backs deal in under a lantern glow — FOUR CARDS. / YOU MAY LOOK AT TWO.
- Outro / punchline: the ledger says *You take the hand*, then KAMAYUU / A Game of Memory & Nerve / kamayuu.builtbygsv.in · play it on your phone
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign

## Visual Identity
- Background: `#0b0e14` felt (`assets/img/table.webp` over a `#273039 → #080d12` radial)
- Text: cream `#f5e6cb` on dark; ink `#2b2116` on parchment `#efe0c2`
- Accent: brass `#e1b56b` / `#c9a35a` / `#a07a3a`; buzzer red `#df142a`; wax `#a3232b`
- Display font: Cinzel 600/700 (local `assets/fonts/Cinzel-*.woff2`)
- Body font: Cormorant Garamond 500/600 + italic (local `assets/fonts/CormorantGaramond-*.woff2`)
- Visual references from the project: card SVGs and `back.png`; the buzzer (`.buzzer` CSS); the announcement plaque (`.announce`); the ledger (`.ledger-sheet`, `.ledger-seal`); the lantern glow of the onboarding art

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. The deal — 7.5s — four backs deal on the beat grid; FOUR CARDS. / YOU MAY LOOK AT TWO.; bottom two flip to 10♠ 8♣; REMEMBER THEM. / *They won't show you again.*; flip back
2. The gamble — 4.0s — 2♦ drawn; top-left flips to the red King (ZERO) on 8.74s; EVERY HIDDEN CARD / IS A GAMBLE.; King goes to discard; 2♦ takes its slot
3. The throw — 3.0s — discard shows 8♦; your 8♣ flips and lands on it at 13.11s; MATCH. / ONE LESS CARD.
4. The call — 4.6s — the ♛ buzzer rises; KNOW WHEN TO CALL.; press on 17.47s; brass plaque YOU BUZZED · FINAL ROUND
5. The tally — 5.4s — parchment ledger drops, seal stamps, *You take the hand · 8 points*; sheet leaves; KAMAYUU / A Game of Memory & Nerve / kamayuu.builtbygsv.in · play it on your phone; music fades

## Audio
- Audio role: cinematic support
- Audio arc: steady bed; card sounds on the deal and flips; a thud-and-bell on the King; a shove on the throw; the bell on the buzzer; a wood stamp on the seal; the bed fades under the wordmark
- Music: `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`
- Music treatment: 0.34 from 0s, fade to 0 over 22.4–24.0s
- Music cue guidance: bundled preset `assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json` (~110 BPM). Strong cues locked: 8.74s (King reveal), 13.11s (match lands), 17.47s (buzzer press), 22.93s (wordmark echo). Beat grid for the deal: 0.56 / 1.09 / 1.64 / 2.19.
- Audio-reactive treatment: subtle; lantern glow opacity/scale and a wordmark glow follow RMS/bass from `assets/music/audio-data.js` (pre-extracted with the hyperframes-creative extractor, trimmed to 24s). No waveform or equaliser visuals.
- Audio-coupled moments:
  - deal — card-by-card on the beat grid with `casino/card-slide-1`
  - flips — `casino/card-place-1`
  - King reveal — `impact/impactSoft_medium_001` + `interface/bong_001`
  - throw — `casino/card-shove-1` at the landing
  - buzzer press — `impact/impactBell_heavy_000`
  - ledger landing — `impact/impactSoft_medium_004`; seal — `impact/impactWood_medium_000`; wordmark echo — `impact/impactBell_heavy_003`
- SFX selection guidance: card-native sounds for card motion, one announcement-style bell for the buzzer, nothing on every beat
- SFX analysis guidance: `.claude/skills/brag/assets/sfx/sfx-analysis.md` — low-HF picks for repeated moments (impactSoft_medium family, bong_001)
- Exact SFX choice: chosen per the implemented animation; files copied into `brag-output/composition/assets/sfx/`
- Audio files: music and SFX live under `brag-output/composition/assets/`

## Hyperframes Instructions
Composition authored per `hyperframes-core` (single paused GSAP timeline registered on `window.__timelines["main"]`, `data-*` timing on root-level clips, local fonts via `@font-face`, no CSS transform on tweened elements), motion per `hyperframes-animation` (fromTo entrances, deterministic per-frame audio sampling, finite repeats), creative per `hyperframes-creative` (background/midground/foreground layers, video-scale type, one accent).

Requirements:
- Show at least one real UI, copy, or visual element from the source project — the card art, the buzzer, the plaque and the ledger are all reproduced from the game's own CSS.
- Keep all text readable in the final render (every line holds ≥1.2s settled).
- Keep the video within 15–25 seconds (24s).
- Include the planned music/SFX layer.
- Major reveals land within 0.15s of the locked strong cues; the deal snaps to the beat grid.
- Run `npx hyperframes check` before render — brag's single gate.
