# Kamayuu Android candidate

Package: `in.builtbygsv.kamayuu`; version code 1, version name 0.1.0.
Minimum Android 7 (API 24); compile/target API 36. Browser helper 2.7.4,
Android Gradle plugin 8.9.1. Locally verified with Gradle 8.14.3 and JDK 21.

This is a Trusted Web Activity generated with Bubblewrap 1.27.0. It opens
https://kamayuu.builtbygsv.in/ in the supporting Android browser. It does **not**
embed the local website, ranked worker or backend. A bundle build is not a website
deployment. Until approved deployment, the installed app loads the existing live
site. Digital Asset Links must be hosted to remove browser chrome.

## Local build

Install/use JDK 17+ and Android SDK platform 36 with build tools 35.0.0.
Set `JAVA_HOME`, `ANDROID_HOME` (or untracked `local.properties` sdk.dir), and
`GRADLE_USER_HOME` to your own development paths, then from this directory:

```
gradle --no-daemon :app:bundleRelease :app:assembleRelease :app:lintRelease
```

These outputs are unsigned unless explicitly signed. Keep private upload keys and
passwords outside Git. Current local upload key and password are in
`../work/signing/`, ignored by Git. Preserve both and back them up securely.
The release handoff includes only the public certificate, never the private key.

The public `.well-known/assetlinks.json` currently contains the local upload
certificate. Before Play testing add the **Play app-signing certificate** SHA-256
fingerprint from Play Console, which can differ from the upload certificate.
Preserve the approved package ID after first upload. Do not upload the debug APK.

## Release gates

See `../docs/family-release.md`. Parent verification, approved privacy/retention
information, backend/website deployment, Digital Asset Links and actual Android
device tests are outstanding. No Play Console upload, push or deployment is
authorized by generating these local files. New personal developer accounts may
also need the required closed testing period before production access.

The wrapper does not request advertising ID, camera, microphone, contacts or
location permissions. Browser site data is managed separately from the wrapper;
uninstall alone may leave browser sessions. Offline first-launch is not provided.
