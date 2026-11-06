# Android 0.3.0 release preparation — 6 November 2026

Status: signed candidate prepared; not uploaded or approved for public release.
Package `in.builtbygsv.kamayuu`, versionCode 3, versionName 0.3.0,
minimum API 24, target/compile API 36. Existing upload key retained.

## Verified artifacts

Task outputs/capacitor-android contains the signed 0.3.0 CANDIDATE.aab,
TEST.apk, public upload certificate, SHA256SUMS.txt, signature verification,
package-audit-0.3.0.json, automated-tests.txt and android-lint-results.txt.
138 tests passed. Mobile build and Capacitor sync passed. Gradle release APK,
bundle and lint tasks passed: 0 errors, 18 warnings (dependency versions,
unused/obsolete resource configurations, monochrome icon and image density).
Package audit found 139 bundled web files, local fonts and required offline
assets, no remote server URL, no private/test files, and disabled native logging.
APK size is 28,752,493 bytes. Hardware execution is not yet verified.

## Console evidence

BuiltbyGSV account 8505523695270508859 is a personal account, signed in as
builtbygsv@gmail.com. Identity verification succeeded. No existing apps were
listed. Create-app form is prepared for Kamayuu / English (US) / Game / Free;
the package ID is available. Legal declarations await owner confirmation.
Console also requests trader status by February 2027; owner status must be
established truthfully rather than inferred from the account's personal type.

## Remaining release gates

- Create app after approval of Play Signing terms and policy/export declarations.
- Upload candidate to testing, enable Play App Signing, record its signing SHA-1,
  and register that certificate for Android OAuth in the existing Google project.
- Test native Google login on the Play-signed build; verify secure session restore,
  logout, account deletion, offline cold launch, background/resume, cutouts,
  keyboard, reconnect, ranked matches, leaderboard and rematches on Android.
- Confirm India teen age treatment and current applicable legal duties; under-13
  offline practice does not by itself establish compliance for ages 13–17.
- Finish accurate Data safety, Families/target audience, ads, IARC/content rating,
  app access instructions and India availability. No review credentials should
  be committed or placed in public documentation.
- Supply authentic app screenshots, a 512px icon and 1024x500 feature graphic.
- Complete applicable closed testing (new personal accounts: at least 12 testers
  opted in continuously for 14 days), then apply for production access and review.
- Review operational support, moderation/reporting and retention/deletion handling.

## Store text draft

Name: Kamayuu

Short description: A game of memory and clever card moves. Practise or compete in 1v1.

Full description:

Remember your cards, watch the table and choose your next move in Kamayuu.
Practise offline with adjustable AI difficulty, create a private table with
friends, or join the Bronze-to-Diamond ranked 1v1 ladder.

Online matchmaking prioritizes available players and can use simulated opponents
to keep matches available. Card powers, swaps and well-timed matching throws
reward observation and careful decisions. Play again with rematches, express
yourself with preset reactions, and adjust sound and game preferences.

Practice works without an online account. Online play requires a connection and
is available to ages 13 and above; under-13 players use local practice.

Support: builtbygsv@gmail.com
Privacy: https://kamayuu.builtbygsv.in/privacy.html
Deletion: https://kamayuu.builtbygsv.in/delete-account.html

Release notes: Bundled offline practice, native Google sign-in integration,
ranked 1v1 and rematches. Restored full card animation timing with action clocks
starting or resuming after presentation.

References:
https://support.google.com/googleplay/android-developer/answer/14151465
https://developer.android.com/google/play/requirements/target-sdk
