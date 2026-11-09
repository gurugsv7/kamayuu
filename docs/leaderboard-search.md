# Leaderboard name search

Compact navy/gold 44px search field below the season summary, above columns.
Case-insensitive literal substring match over every ranked entry, with original
global ranks. Query changes reset pagination; clear returns to the full board.
250ms debounce, 40-character bound, stale responses ignored on query/page changes.
Previous rows dim while busy so the dialog keeps its position. Empty results and
failures have explicit feedback. No changes to match rules or leaderboard scores.

Service-only `ranked_search_leaderboard` ranks first, filters second, then pages.
Old clients and empty queries retain the existing RPC. No wildcard SQL behavior,
dynamic SQL, public function permissions or direct table access were added.
Existing verified-session, age and request-rate guards remain in the Edge entry.

Validation: 33 focused service/database checks, 136 application tests, TypeScript,
production build. Tested cross-page lookup (global rank 181), literal `_` / `%`,
case folding, query validation, disclosure/public denial and paginated results.
Browser fixture: search, clear and no-results states, matching existing palette.
Local fixture screenshot: enclosing workspace outputs/web-update-2026-11-10/
leaderboard-search-preview.png (sample data, not a live account screenshot).

Hosted migration 20261109225218 applied; lotus-ranked Edge version 7 active.
Live query `viGNesh_` found vignesh_07 at its global position 27; authenticated
direct RPC execution remains denied. verify_jwt=false retained from the existing
configuration; the handler authenticates every operation with auth.getUser.
Android control requires the next bundled release; website deployment tracked
in the working release record after publication.
