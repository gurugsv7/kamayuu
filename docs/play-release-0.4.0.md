# Kamayuu 0.4.0 release — 6 November 2026

Source: `1b808dc78d1aa90cd03823477b7aed1f8e5477eb` on
`codex/capacitor-mobile-release`. The owner authorized publishing the website
and updating the existing Capacitor app. Main was not changed.

## Published destinations

- Website: https://kamayuu.builtbygsv.in
- Vercel production deployment: `TZuNE1rS15xbBzEvYxM75f22CJK2`, observed Ready
  with the production domain assigned and the source commit above.
- Android package: `in.builtbygsv.kamayuu`, version name `0.4.0`, code `4`.
- Play track: Internal testing, release `0.4.0 - Artwork and table fixes`.
  Console confirmed **Available to internal testers** on 6 November at 4:43 PM.
- Tester opt-in: https://play.google.com/apps/internaltest/4699091978083630110

Google indicated that Play visibility normally propagates within an hour but
may take longer. This is an internal-test update, not a public store release.
The Console still shows the temporary unreviewed package name pending app setup
and review. Existing tester access and device support were preserved.

## Included changes

Exactly one large animated card on each side replaces the small card stacks.
The matchmaking stage grows from 248 to 310 pixels, or 225 to 280 on short
screens. Opening artwork, tier emblems, ranked/results/rematch styles, artwork
preloading and cache support, table-exit cancellation and contextual in-match
settings are included. No game timing or reveal-duration changes were made.

Android contains local game assets and fonts with no remote `server.url`.
The three matchmaking v3 files inside the signed AAB were byte-compared with
the approved source exports. Website requests for the animated WebP and poster
returned HTTP 200 and matched local SHA-256 hashes; its cache manifest references
the new version. The home page also returned HTTP 200.

## Validation and artifacts

158 tests passed, TypeScript passed, and the mobile web build and Capacitor sync
passed. Android `assembleRelease`, `bundleRelease` and `lintRelease` passed.
APK and AAB signatures were verified. Package checks found 167 bundled web
files, local fonts, no remote server URL and no private/test files.

Signed artifacts are in the task's `outputs/capacitor-android/` directory:

- `kamayuu-0.4.0-CAPACITOR-CANDIDATE.aab` — uploaded to Play.
- `kamayuu-0.4.0-CAPACITOR-TEST.apk` — local signed test artifact.
- `SHA256SUMS-0.4.0.txt` and `package-0.4.0-verification.json`.
- `play-0.4.0-published.png` — Console availability evidence.

The actual matchmaking dialog was visually checked with v3 artwork loaded and
two separate large cards. The current browser viewport override did not apply;
that final check used 1280 × 720, not a simulated phone viewport. Earlier mobile
layout checks are documented separately. A fresh physical-device installation,
cold/offline launch and Google sign-in check remain for the owner/testers.

Play reported no blocking errors. Nonblocking warnings concern increased
download size (43.2 MB for new installs) and the absent optional deobfuscation
file; this release does not enable R8/ProGuard minification. Existing frontend
chunk-size and mixed Google-auth import warnings also remain.

No caches, dependencies, signing materials, old source artwork or project data
were deleted. Existing development dependencies remain available as requested.
