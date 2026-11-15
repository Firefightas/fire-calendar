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

## P5 Frontend — Sun 15 Nov 2026 — Claude (Fable)
Done: all P5 items in PLAN.md. Río Negro (re-run) and California are verified on real data through the deployed backend and from the offline bundle, including drawn-area calendars and both CSV exports.
In progress (files + exact state): nothing half-written.
Broken / known issues: none in P5 code. The sandbox button opens the host page (banner, region or drawn area, back button) with a placeholder until P6 adds `frontend/src/features/sandbox/index.tsx`. Romania and every sandbox grid are still mocks and labelled.
Next 3 steps:
1. When P6's entry file is on main: in the production build, launch the sandbox for a region and for a drawn area and check it opens, shows the banner once, and "Back to the calendar" returns.
2. When Romania gets real files: `cd frontend && npm run sync-data`, commit `public/data/`, repeat the region checks.
3. Checkpoint B: check the Vercel deployment once P1 has it up, including the offline fallback.
Gotchas: `gh` is not installed on this laptop. `npm run build` reads `frontend/.env.production`, so a local production build or `vite preview` talks to the Render backend; `npm run dev` still uses `http://localhost:8000`. After switching branches restart `npm run dev` (a stale dev server served the page unstyled). MapLibre 6 needs `setWorkerUrl` (already done in `MapPanel.tsx`). Every append to DECISIONS.md conflicts with other roles' appends: keep both sides.


## P4 Backend - 14 November 2026 - Codex
Done: API implementation merged in PR #9. User deployed the service at https://fire-calendar.onrender.com. Live health, region discovery, all calendar/calibration/sandbox-grid JSON schemas for the three regions, polygon calendar, calendar and hotspot CSVs, validation errors and CORS preflight verified.
In progress (files + exact state): deployment verification documented and pushed on feat/p4-render-deploy; PR: https://github.com/neamturazvan/fire-calendar/pull/10. No partially implemented code.
Broken / known issues: the deployed health response reports all three regions using mocks and FIRMS key unconfigured; NRT returns 503. Real archives are not available in this checkout. Runtime deployment has passed; live NRT and real-data integration are separate pending checks.
Next 3 steps:
1. P1 sets FIRMS_MAP_KEY securely in Render Environment and saves/redeploys; P4 rechecks live NRT without copying credentials into files tracked by Git or into chat.
2. P5 sets its deployed VITE_API_URL to https://fire-calendar.onrender.com and coordinates CORS_ORIGINS with P1; this is outside P4's folder ownership.
3. When P2/P3 deliver real files, verify the Rio Negro region/polygon/CSV slice and update data provenance.
Gotchas: every region currently returns is_mock=true; CSVs expose X-Data-Source: MOCK DATA. Do not interpret mock deployment verification as scientific validation. The current CORS response allows all origins. Preserve frozen contracts and other role folders.
Validation: live API verification passed except NRT, which correctly returns 503 until a key is configured. Required local validation passed: 87 Python tests, Ruff and the frontend build.

## P4 NRT follow-up - 14 November 2026 - Codex
Done: Render health now reports FIRMS key configured; live region/bbox one-day and seven-day requests were checked and returned 502. Added safe per-source diagnostics and environment-whitespace trimming on feat/p4-nrt-errors, with regression tests for key/quota/status/transport/CSV failures and credential redaction.
In progress: diagnostics implementation complete, 100 Python tests and Ruff passed, and pushed; PR: https://github.com/neamturazvan/fire-calendar/pull/11. PR #10 separately records the healthy mock-backed deployment.
Known issue: the live upstream cause remains unknown until this diagnostics update is deployed; no successful live NRT response has been observed.
Next 3 steps:
1. Review/merge/deploy the diagnostics PR with P1.
2. Recheck https://fire-calendar.onrender.com/api/nrt?region_id=rio_negro&days=1 and the seven-day variant, then resolve the reported category.
3. Recheck global bbox, caching and P5's overlay once NRT is successful.
Gotchas: keep credentials out of Git, logs and chat; response details must never echo upstream error bodies or URLs. All historical regions still use mocks.


## P2 - 14 November 2026 - Codex
Done: verified all 54 annual Rio Negro CSVs, downloaded three requested NRT windows, normalized and validated 317,938 points / 149,205 hex-days; code fixes and detailed evidence in pipeline/ingest/RIO_NEGRO_STATUS.md.
In progress: California's 54-year/source queue runs from the fire-calendar-p2-status worktree (PowerShell PID 16732); progress/error logs and runner under data/raw/california-download.*; MODIS 2000 complete, 2001 running at handoff.
Known issues: S-NPP SP ends July 31, 2026, so its November shutdown is not observable in these files. Outputs are local, not on Drive. Original fire-calendar checkout has an unrelated unfinished merge; it was preserved.
Next 3 steps:
1. Review/merge feat/p2-rio-negro-status and transfer local Parquet files to P3/P4.
2. Monitor California's log; retry only failed years, then download its NRT tail and normalize.
3. Start Romania and prepare sandbox inputs against P3 history.
Gotchas: data/raw in the P2 worktree is a junction to the original checkout; do not delete either tree while downloads run. Python env is in the P2 worktree. For tests set PYTEST_DEBUG_TEMPROOT to its .venv/test-temp directory. No data or secrets were committed.

Publishing: commit 9d83e55 pushed on feat/p2-rio-negro-status. PR creation remains pending: GitHub connector returned 403 (Resource not accessible by integration); automatic review blocked a local-credential API fallback; browser control was not approved. Open https://github.com/neamturazvan/fire-calendar/compare/main...feat/p2-rio-negro-status?expand=1 to create the PR.

## P4 real-data integration - 14 November 2026 - Codex
Done: P2 inputs installed under data/processed/rio_negro/ with explicit human authorization and SHA-256 preserved. Ingestion integrity, real hotspot export, 313-month calendar, raw counts, provenance, NumPy anomaly baselines, November 13 month-to-date baseline and calendar CSV verified against P3's real outputs. P1 kept the binding method/frozen contracts; the dependency is resolved.
In progress: Input verification merged in PR #17; publishing the backend early NOAA handover follow-up with three regressions and evidence in backend/REAL_DATA_HANDOFF.md. P3's coverage-aware source now drives polygon conversion even before the nominal November handover.
Known issues: Render has the real regional JSON but live polygon requests still fall back to samples because real Parquet files are absent there. The human assigned that file upload to P1. California/Romania and sandbox inputs remain mock/pending their owners.
Next 3 steps:
1. P1 reviews/merges/deploys the early NOAA handover follow-up and uploads both Parquet inputs to data/processed/rio_negro/ on Render.
2. Verify non-mock drawn-area calendars/hotspot exports and recent NOAA months on Render.
3. P5 refreshes/rechecks the real calendar UI; P2 continues remaining regions and sandbox inputs.
Gotchas: do not commit Parquet inputs or change the P1-approved calibration method. Polygon H3-center selection can exclude region-edge hexes; the whole-region JSON export remains distinct by design. Evidence hashes, coverage, observed limits and validation steps are in backend/REAL_DATA_HANDOFF.md.

Validation after the real-data source fix: 110 Python tests and Ruff passed. The frontend baseline build passed; final CI builds against the newly available P3 JSON.

- P4 real-calendar source fix: https://github.com/neamturazvan/fire-calendar/pull/18 (feat/p4-source-handover); 110 tests and Ruff passed. P1 handles Render Parquet upload and deployment.

## P3 working in P2's folder - 15 November 2026 - Claude
With approval from the humans of P3 and P2, P3 is writing `pipeline/sandbox_inputs/terrain.py` on `feat/p3-sandbox-terrain` (real land cover from ESA WorldCover, elevation and slope from Open-Meteo) to replace the mock sandbox terrain, Río Negro first. P2 keeps Romania and everything in `pipeline/ingest/`. State and results are reported in the PR and in `pipeline/sandbox_inputs/README.md`.
Done (11:05): `terrain.py` + tests; real grids committed for Río Negro and California (`is_mock: false`). Not done: Romania (needs P3's fire history first, then one command). Gotchas: `rasterio` is supplied with `uv run --with rasterio`, it is not in `pyproject.toml`; Open-Meteo rate-limits the elevation calls (the script waits and retries); the land-cover rule is not a plain majority (README).
