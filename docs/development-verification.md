# Development verification — 4 November 2026

## Passed locally

- 110 Node tests covering engine/multiplayer, ranked queue/database/worker/service,
  deterministic rivals/rematches, settings, family consent/privacy and mobile policy.
- Frontend TypeScript and scoped lint for the new mobile/family modules.
- Edge endpoint TypeScript against the installed Supabase SDK and local declarations
  of Deno globals; this is not a deployed Deno-runtime test.
- Mobile and browser production builds. The existing large-JavaScript-chunk warning
  remains. The whole repository still has unrelated pre-existing lint issues.
- Android release APK/AAB build, release lint and the generated JVM unit-test task,
  using JDK 21, Gradle 8.14.3, AGP 8.13.0, target/compile API 36, minimum API 24.
  Android lint reports zero errors and 19 warnings, mainly generated resources and
  dependency-update suggestions. Google ID SDK 1.2.0 is pinned because 1.2.1's Kotlin
  2.4 metadata exceeds this toolchain's lint parser; the used sign-in APIs are the same.
- APK/AAB signatures verified locally using the existing upload key. Artifact audit
  found 137 embedded web files, including entry JavaScript, card art, local fonts,
  privacy/parent/deletion pages and offline-practice assets. No development harness,
  environment files or private signing material entered the APK. No remote game
  server URL is configured; native bridge logging is disabled.
- Desktop native-event simulation checked 390 × 844 layout, one age question,
  immediate offline entry, practice startup, settings persistence across reload,
  back-to-settings behavior and foreground recovery. External fetches were blocked
  in that test harness. This is UI/policy evidence, not Android hardware verification.

## Important limits

The website's desktop invitation was found to interfere with wide native layouts
and has been disabled inside Capacitor. The final landscape behavior still needs
an Android check. The desktop browser connection closed during the later UI pass.

The iQOO was paired successfully, but app installation and device testing were
stopped when the owner asked to leave the phone unused while travelling. No phone
test pass is claimed. Verify actual Google account selection/cancellation, auth
refresh, Keystore round trips, cold offline launch, system insets/keyboard, audio,
back navigation, rotation and online reconnect on Android before release.

The real consent provider and the new family/ranked backend have not been deployed.
Their absence does not authorize online access: the client fails closed and keeps
practice available. Register Android Google OAuth with the correct signing
certificate before claiming native sign-in works end to end. Review target-country
age thresholds, privacy/retention/deletion and moderation before child online release.

The public certificate and SHA-1/SHA-256 information are in
`android/upload-certificate.der` and `docs/mobile-signing-public.json`. They are not
the private upload key. The private key/password remain on the original laptop in
ignored `work/signing`; preserve them and arrange a secure backup separately.
