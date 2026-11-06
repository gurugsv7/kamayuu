# Android 0.3.0 release preparation — 6 November 2026

Follow-up: [release audit and fourteen day plan](release-audit-2026-11-06.md)
records post-0.3.0 source fixes, current gaps and the public-release timeline.
Those fixes require a new bundle; the active 0.3.0 release is unchanged.

Status: 0.3.0 is active and available to the two approved internal testers.
Google Play Android OAuth registration is complete; device sign-in verification
is pending. The app is not publicly released.
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
builtbygsv@gmail.com. Identity verification succeeded. The owner approved legal
declarations and Kamayuu was created as English (US) / Game / Free, app ID
4974823385656892350. Internal track 4699091978083630110, release 1 contains
the accepted 0.3.0 bundle. The owner testing list contains the two approved
accounts; the release was rolled out and visibly confirmed Active / Available
to internal testers. No deobfuscation file warning remains expected because
minifyEnabled is false. No blocking bundle error appeared.
The dashboard confirms 12 closed testers continuously opted in for 14 days before
applying for production access. Internal testing does not count toward that gate.
Internal test opt-in: https://play.google.com/apps/internaltest/4699091978083630110

On 6 November, Google Cloud project kamayuu accepted the Android client
"Kamayuu Android — Google Play signing". Its saved package and SHA-1 were
verified against in.builtbygsv.kamayuu and the owner's supplied Play signing
fingerprint. Public fingerprints and client IDs are in mobile-signing-public.json;
the existing upload/local signing entries are preserved. The app continues to
use its existing web client ID as the server audience. No app rebuild was needed
for this registration. Google indicates propagation may take 5 minutes to a few
hours. Successful login on the actual Play-installed build is not yet verified.
Console also requests trader status by February 2027; owner status must be
established truthfully rather than inferred from the account's personal type.

## Remaining release gates

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
