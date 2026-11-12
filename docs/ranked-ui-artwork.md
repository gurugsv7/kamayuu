# Ranked UI artwork and local review

The imagegen concept is `assets-src/ranked-ui/ranked-screen-mockup.png`.
It uses the existing homepage and sign-in artwork as references: midnight
sapphire, lacquer, aged brass, cream serif lettering, palace lanterns, and the
compass/crescent on the card backs. Original generations and prompts are kept
beside the mockup. Source art is excluded from the development file watcher to
avoid Windows file-lock errors during image writes.

The implementation uses real components and live text, rather than flattened
mockup screenshots. `app/ranked.css` styles ranked entry, availability/recovery,
first-entry disclosure, the leaderboard, score ledger, and rematch states.
Home, sign-in, the game table, card movement, deadlines and server-side rematch
delays are preserved. The shared result view also appears in the tutorial.

## Artwork

- Bronze: copper four-point compass.
- Silver: silver six-point compass.
- Gold: gold eight-point compass.
- Platinum: extended platinum blades and an octagonal frame.
- Diamond: crystal-blue cardinal points.

Each carries the crescent/star card motif. The transparent WebP files in
`public/ranks/` are 300 Ã— 300 and roughly 20â€“28 KB each. The text-free palace
background is 60 KB. All six runtime images total approximately 182 KiB;
full-resolution sources and the mockup are not shipped with the game.

Tier progress reads the existing ladder configuration: Silver 900, Gold 1200,
Platinum 1500, Diamond 1800. Diamond has no invented next tier. Standings show
actual ratings and fixed AI benchmarks, with server pagination (50 per page).
Results keep actual scores, penalties, elimination and tied winners. No
fabricated rating gains, human identity, or online-player counts are added.

## Review and checks

Run the existing Vite mobile dev configuration and open `/ranked-preview.html`.
The review imports the same UI components with explicit sample data; it makes
no sign-in or matchmaking calls. Controls cover tier changes, loading, errors,
disclosure, unavailable/resumable matches, long names, reduced motion, and
rematch offers. This HTML entry and `dev/` fixtures are not part of the app build.

Verified on 390 Ã— 844 and 360 Ã— 740 browser viewports. The actual matchmaking
dialog fits without horizontal overflow. The leaderboard list has bounded
scrolling; result/dialog content can scroll on short screens and with long
names. Actions retain their pending feedback, duplicate-click protection,
expiry and error handling.

Validation: 158 tests passed, TypeScript passed, mobile build passed, and
Capacitor Android asset sync completed. Existing bundle-size and mixed
static/dynamic Google-auth import warnings remain. No new signed APK/AAB was
built during that initial review. The subsequent signed Android 0.4.0 internal
release and website publication are recorded in `play-release-0.4.0.md`.

## Table exit and contextual settings

Leaving previously replaced a Promise reference without invalidating callbacks
already queued behind an animation. A later packet could call `setMenu(false)`
and restore the old game. `TableSession` now fences both transport callbacks and
queued presentations. Leaving closes the drawer, invalidates the queue, cancels
active presentation, clears the game and returns home before notifying the server.
Private/ranked connection completion also checks that its table is still current.
The drawer retains its table contents while closing, avoiding a flash of the
larger home settings after exit.

Practice settings now show sound, haptics and motion. Online settings add emote,
message and rematch preferences. Profile, account, policy links and statistics
stay in home settings; rematch actions stay with results. Both active-game
contexts provide one clear Leave table action. No card timing is changed.

Browser checks used the real game and the local multiplayer transport during
memorization. Leaving returned home and stayed there; changing haptics survived
closing/reopening the panel (then the original preference was restored). The
online drawer measured 493 px high with equal client/scroll heights at the tested
phone viewport. `/dev/table-check.html` reproduces this locally and is excluded
from production. Regression tests cover queued turns, late transport callbacks,
rematch queue replacement and ordered normal playback.
