# Continue Kamayuu from a cloud computer

Use branch `codex/capacitor-mobile-release`. It includes the local ranked ladder,
180 rivals, human-first queue, rematches, settings, child-safety infrastructure and
the bundled Capacitor Android app. Nothing has been merged to main. Supabase
foundations are deployed with ranked disabled; see `backend-deployment.md`.

## Browser development

Use Node 22.13 or newer (Node 24 was tested):

```sh
npm ci
npm run dev:mobile -- --host 0.0.0.0
```

Open the preview URL supplied by your cloud environment. This runs the web version
of the same UI/game; Google uses its browser flow here. The desktop invitation
can be dismissed with its continue option, or use a mobile viewport.
On a phone-sized preview, select an age group and use guest/solo practice.
The Android-specific offline button and Credential Manager run in the installed app.

`config/mobile-public.json` contains only the existing public Supabase URL,
publishable/anon key and web OAuth client ID from the deployed game's public
JavaScript. These are intended client configuration, not service credentials.
No private keys, passwords, service-role keys or parental-verification credentials
are present. Mobile build mode reads this configuration by default. Environment
files can override it. Browser OAuth still requires an authorized web origin.

## Android build

Install JDK 21, Android SDK platform 36 and build tools 35.0.0, and set
`JAVA_HOME` and `ANDROID_HOME` or create an untracked `android/local.properties`.

```sh
npm run android:sync
cd android
./gradlew :app:assembleDebug :app:bundleRelease :app:lintRelease
```

On Windows use `gradlew.bat`. No Android Studio project regeneration is required.
`dist-mobile` and copied assets are generated, excluded from Git and regenerated
by `android:sync`. The release bundle is unsigned until the private upload key is
provided securely. Do not commit signing material. The upload key remains on the
original laptop under ignored `work/signing`; its public certificate/fingerprint
can be shared separately. Do not replace it merely because this cloud checkout
does not contain it.

The app loads its bundled `https://localhost` assets. It has no remote `server.url`.
Offline practice, fonts, artwork, sounds and rules ship inside the package. Native
Google uses Android Credential Manager and exchanges the ID token with Supabase.
Supabase sessions and the parent device secret use AES-GCM with Android Keystore.
Back opens game settings during play and minimizes only from the home menu. Solo
timers/audio pause in background; online games remain server-authoritative.

Native guests start offline immediately. Native online play requires Google
sign-in for older users, or verified parent-approved child setup. Merely opening
Home/Ranked never creates an anonymous account or triggers CAPTCHA. Browser guest
sign-in remains available through its existing CAPTCHA flow.

## Checks

```sh
npm test
npm run test:family:db
npm run test:ranked:db
npx tsc --noEmit
npm run build:mobile
```

See `family-release.md` for consent, privacy and retention release gates. The local
UI simulation files in `work` are test aids, not production source or APK content.

## Before online or Play release

- An Android OAuth client is registered for `in.builtbygsv.kamayuu` in the existing
  Google project using the local release certificate. For Play builds, register
  the Play app-signing certificate SHA-1 too. The native request uses
  the **web** client ID as its server client ID. Never put a client secret in the app.
- The family/ranked migrations and Edge endpoints are deployed. Ranked and its
  hosted scheduler remain disabled. Complete the checks in `backend-deployment.md`
  before activating either. Legacy unknown-age private-table players retain access;
  this temporary compatibility path is not a complete child-safety rollout.
- Configure a reviewed real parental-consent provider and secure parent handoff.
  Finalize countries/age thresholds, privacy, retention, deletion and moderation.
- Complete actual Android Google sign-in, storage, cutout/keyboard, background,
  offline first-launch and reconnect tests on a device. Phone tests were paused at
  the owner's request; desktop simulation is not a substitute for those checks.

Android OAuth and Supabase were updated on 4 November 2026. The release website and
Play listing have not been published. Google currently reports OAuth test-user
restrictions; review publishing status before public sign-in testing.
