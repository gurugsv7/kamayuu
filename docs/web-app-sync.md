# Web and Android source synchronization

The website and Capacitor app share `app/`, `components/`, `lib/` and the Vite
entry point. Use `npm run build:vercel` for the website and `npm run build:mobile`
for the app. Native platform behavior remains guarded by `isNative()`.

On 12 November 2026, the shared app branch through `bf2d45b` was merged into
GitHub `main`, retaining the search-indexing changes from `110df4e`. Previously,
production Vercel builds had been promoted directly from the local mobile branch
without updating `main`; a later automatic main deployment replaced those builds
with older game code.

Publish future shared releases from `main` after merging the current app changes.
Before deploying, compare the deployed revision with the app release source,
run application tests and TypeScript, build both targets, and verify policy pages.
Both builds now include `client-release.json` with their Git source revision and
target, allowing direct checks against the published website and mobile bundle.

This synchronization does not change Play Console releases or unfinished native
release configuration. Device-specific sign-in, navigation and offline behavior
still require Android verification when those native components change.
