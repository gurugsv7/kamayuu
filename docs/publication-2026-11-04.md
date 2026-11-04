# Website and policy publication — 4 November 2026

The owner authorized publishing the policy pages to the existing website. The
production deployment was built with production environment settings and aliased
to kamayuu.builtbygsv.in and kamayuu.vercel.app. No main-branch merge occurred.

- Source: codex/capacitor-mobile-release, commit 08b14358d7dda437d6b8db719b99067b8268c211.
- Preview deployment: DKq4BDxvp5qisiCVYfNnQPZ73EMP.
- Production deployment: 5rBFhx2u2XxZ8yC54WJnfnkdwfvy.
- Production build: Ready; existing npm/config/chunk warnings remain non-fatal.
- A later source commit records the backend cutover and these notes; it does not
  change the published frontend bundle. Future production promotions must include
  this release branch's changes; main is still older.

## Public pages

- https://kamayuu.builtbygsv.in/
- https://kamayuu.builtbygsv.in/privacy.html
- https://kamayuu.builtbygsv.in/terms.html
- https://kamayuu.builtbygsv.in/parents.html
- https://kamayuu.builtbygsv.in/delete-account.html

Each policy was checked to return HTTP 200 with its own title and canonical URL,
readable HTML without JavaScript, working local assets, valid in-page anchors and
support contact. The homepage links Privacy/Terms before sign-in, and the home menu
and settings include legal links. The initial production policy URLs had returned
the SPA homepage; they now return standalone documents. A local and production
run of scripts/verify-policy-pages.mjs passed. Protected preview checks were done
in the authenticated browser; unauthenticated preview requests redirect to Vercel.

The privacy layout was visually checked at desktop and phone width with no
horizontal overflow. The hosted Under 13 flow entered the game without parent
setup and its online entry offered practice rather than sign-in. This is browser
verification, not an Android device test. The existing APK/AAB still needs rebuilding.

## Google Branding

Google confirmed Branding changes saved with:

- App name: Kamayuu.
- Home: https://kamayuu.builtbygsv.in/
- Privacy: https://kamayuu.builtbygsv.in/privacy.html
- Terms: https://kamayuu.builtbygsv.in/terms.html
- Existing support address and authorized domain retained.

OAuth remains Testing. This update does not claim Google brand-verification
approval, Play approval or a public Android release.

## Backend cutover

Once the new frontend was live, the temporary unknown-age exception was removed.
Current endpoints: lotus-game v15, lotus-ranked v3, lotus-family v3. All online
players require age setup; known under-13 players remain offline-only regardless
of old consent flags. Old cached web clients may need to refresh. The retired
legacy option cannot bypass the shared policy. Targeted policy/service tests and
Edge TypeScript passed. Ranked enabled=false and cron active=false were confirmed
in the database after publication. No user/account records were deleted.

Screenshots are stored outside Git in the original task outputs directory, including
kamayuu-privacy-live.jpg. No private signing or server credentials were uploaded.
