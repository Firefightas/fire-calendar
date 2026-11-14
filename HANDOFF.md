# HANDOFF.md

Overwrite your role's section when your agent is about to run out of usage (80–90%). Commit and push right after.

Template:

```
## <Role> — <date time> — <agent that wrote this>
Done:
In progress (files + exact state):
Broken / known issues:
Next 3 steps:
1.
2.
3.
Gotchas:
```

---

## P5 Frontend — Sat 14 Nov 2026 — Claude (Fable)
Done: all P5 items in PLAN.md (merged in PR #3); calibration panel (branch `feat/p5-calibration-panel`); "month to date" label for an incomplete last month (branch `feat/p5-month-to-date`, which also contains the calibration panel). Both branches are pushed with all checks green.
In progress (files + exact state): nothing half-written.
Broken / known issues: none in P5 code. Drawn-area numbers, CSV exports and the NRT overlay still depend on P4 endpoints (see P5's requests in PLAN.md).
Next 3 steps:
1. Merge the two pull requests (calibration panel first, then month to date).
2. When P2/P3 land real Río Negro files: `cd frontend && npm run sync-data`, commit `public/data/`, check the page (Checkpoint A).
3. Re-check the drawn-area calendar, exports and NRT overlay as P4's endpoints stop returning 501.
Gotchas: `gh` is not installed on this laptop. After switching branches restart `npm run dev` (a stale dev server served the page unstyled). MapLibre 6 needs `setWorkerUrl` (already done in `MapPanel.tsx`). Every append to DECISIONS.md conflicts with other roles' appends: keep both sides.


## P4 Backend ? 14 November 2026 ? Codex
Done: polygon-specific DuckDB/H3 calendars with sparse regional calibration fallback, epoch conversion, full-baseline and month-to-date IQR anomalies; geometry/date validation; UTF-8 JSON reads; exact-coordinate streamed hotspot CSVs and calendar CSVs; cached concurrent FIRMS NRT proxy with seven-day window splitting, confidence filtering and sanitized failure responses. The human explicitly authorized h3/Shapely additions to the root backend group and lockfile. Integrated origin/main through a8bcee7, preserving P1/P3/P5 changes.
In progress (files + exact state): implementation and docs complete on feat/p4-backend-api; preparing push/PR. No half-written files.
Broken / known issues: no known failing checks. No real processed archives from P2/P3 or backend/.env; live FIRMS integration and Render deployment have not been exercised. NRT returns 503 without a key. Large frontend chunk and Starlette/httpx deprecation warnings predate/are outside this backend implementation.
Next 3 steps:
1. P1 reviews/merges the P4 PR; P5 verifies drawn-area results and downloads using the implemented API.
2. When P2/P3 deliver R?o Negro files, validate the real region/polygon/CSV slice and provenance; supply FIRMS_MAP_KEY only via backend/.env or Render secret environment.
3. P1 deploys Render using backend/README.md, coordinates CORS_ORIGINS and P5 VITE_API_URL, then verifies live NRT and the static frontend fallback.
Gotchas: preserve contracts unchanged. Area statistics use full baseline before request-date slicing, with same-day cutoff for an incomplete last month. MODIS counts distinct hex-days; never sum MODIS+VIIRS. Samples produce is_mock=true and CSV X-Data-Source: MOCK DATA. New terminals need refreshed PATH after tool installation.
Validation: uv sync --all-groups --locked; uv run pytest (87 passed, no skips); uv run ruff check .; frontend build/lint and 35 frontend tests passed.
