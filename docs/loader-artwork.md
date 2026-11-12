# Kamayuu loader artwork

Published to the website and Android internal testing on 6 November 2026.
See `play-release-0.4.0.md` for deployment and verification details.

## Current artwork

The homepage (`onboarding-identity-bg.webp`) supplies the visual language:
compass, crescent and stars, aged brass, sapphire, brush lettering and lanterns.
The new opening uses an illustrated palace arch and lakeside table, a transparent
brush wordmark, and a larger compass with five cards that gather and fan out.
Matchmaking v3 uses exactly one large card on each side, with a gentle opposing lift and tilt. Cards stay separated and visible. The stage is now 310 px wide (280 px on shorter screens), up from 248/225 px.

- `public/loaders/opening-deal-v2.webp` / `.gif`: 3 seconds, 72 frames, 384 × 320.
- `public/loaders/matchmaking-duel-v3.webp` / `.gif`: same duration and dimensions.
- `*-still.png`: immediate posters, reduced-motion mode and error fallback.
- `opening-scene.webp` and `kamayuu-wordmark.webp`: 304.5 KiB combined.
- `ensembles-manifest.json` and `duel-manifest.json`: export sizes and durations.

ImageGen originals and prompts are retained under `assets-src/loaders/`, including
`upgrade-prompts.json`. `scripts/render-loader-ensembles.py` choreographs generated
layers and uses FFmpeg to encode the loops. They have real alpha; no chroma key is
needed. Earlier exports remain available; runtime uses opening v2 and matchmaking v3.

The existing two-second opening gate, real asset progress, matchmaking cadence,
card-play movement, reveal holds and turn clocks are preserved. The decorative
loop never delays a completed matchmaking request.

## Bundling and cache

Capacitor serves the game from `dist-mobile`, copied into Android's installed
assets; there is no remote `server.url`. The opening and matchmaking images,
posters, home art, rank badges and fonts are included in that bundle. Opening
images are warmed/decoded before releasing the native splash, with a 1.5-second
failure bound so a damaged/missing image cannot trap startup. Matchmaking art
is warmed next. Native does not install a redundant service worker cache.

The web production build emits `artwork-sw.js` and `artwork-manifest.json` from
actual file hashes. The worker caches only 25 allowlisted public artwork/font
paths, with automatic version changes when those files change. Normal WebP
assets are precached (approximately 5.25 MiB); GIF fallbacks are cached on demand
(up to 10.58 MiB for this artwork set). Only obsolete `kamayuu-artwork-` caches are
removed. HTML, app code, API calls, authentication, account data and external
requests are never intercepted. Errors/quota failures fall back gracefully.
Browser artwork needs a first successful download and remains subject to browser
storage eviction; native artwork is available with the installation itself.

## Review and verification

`/loader-preview.html` renders the actual opening and searching components with
sample progress. `?full=1` shows the full opening. `/ranked-preview.html` includes
the actual matchmaking dialog and other ranked components. Both are local dev
entries, excluded from production. No match or account request is made by these
visual fixtures.

Browser checks covered the 390 × 844 opening, the 360 × 740 searching dialog,
ready exit, decoded images, and reduced-motion posters. The mobile searching
dialog had identical client/scroll dimensions (no internal overflow). Screenshots
are in the task's `outputs` directory. GIF/WebP frame counts and alpha were also
checked with Pillow/FFmpeg. Native physical-device rendering is still untested.

158 tests passed across the standard and local database suites, including late
packet cancellation, offline artwork reads, cache upgrade isolation, HTML fallback
rejection, quota failure and bounded startup warmup. TypeScript and the mobile
build passed; Capacitor Android asset sync completed. All 25 manifest assets were
byte-checked against the Android bundle. Existing bundle-size and mixed
static/dynamic Google-auth import warnings remain. Android 0.4.0 was subsequently
built, signed and released to internal testers, and the website was published.
Physical-device verification remains outstanding; see the release record.
