# PLAN.md: live task board

Agents: tick tasks as you finish them and keep your "Current state" line to one sentence. P1 keeps this file honest. Full spec per role: `TEAM_PLAN.md` §6.

## Current state

| Role | Owner (name) | Agent | Current state |
|---|---|---|---|
| P1 Integrator + pitch | _fill in_ | Gemini Pro #1 | Merged PRs #1–#19; **Checkpoint A achieved**; Render backend & live FIRMS NRT verified (`200 OK`); allowed `data/processed/**/*.parquet` in git for Render. |
| P2 Data ingestion | David | ChatGPT Plus #1 (Codex) | Screened Rio Negro tables verified against P3 PR #21; sandbox history refreshed (1,027 cells, still mock terrain); consistent P4/P6 handoff ready locally. |
| P3 Harmonization | _fill in_ | Claude Pro #1 (Fable) | Río Negro re-run on P2's screened tables and committed: `calendar.json`, `calibration.json`, `hex_fire_history.parquet` (binding median-ratio method: held-out MAE 91 cell-days, MAPE 33 %; MODIS-era mega-fire months still overstated). Chart and `METHOD.md` updated. Next: California and Romania when P2 lands them. |
| P4 Backend | _fill in_ | ChatGPT Plus #2 (Codex) | Backend/live NRT verified; real Rio Negro inputs and local calendar/CSV integration passed; early NOAA handover fixed; P1 will upload Parquet inputs and deploy the follow-up. |
| P5 Frontend | _fill in_ | Claude Pro #2 (Fable) | Checkpoint A verified from the frontend side on real Río Negro data via the deployed backend (see Requests); colour-scale fix and real offline bundle on `feat/p5-checkpoint-a`; next: California and Romania when their real files land, drawn-area check once the parquet tables are on the server, sandbox launch once P6 adds its entry file. |
| P6 Sandbox | _fill in_ | Claude Pro #3 (Fable) | Steps 1–9 of the P6 build order are on `feat/p6-sandbox-engine` (mock grids): hex map with fuel/elevation/slope layers, seeded spread engine in a Web Worker, live Open-Meteo wind with gust/shift sliders, four interventions on a 24-unit budget, scoreboard, greedy simulation-scored optimizer side by side. Next: crew exit route, draft advisory, ignition from live hotspots. Needs a human to judge whether the spread looks believable. |
| Relief pool | _fill in_ | Gemini Pro #2, #3 | Standing by; take over via `HANDOFF.md`. |

## Checkpoints (TEAM_PLAN §7)

- [x] **A, Sat 19:00:** Río Negro end-to-end slice: real harmonized calendar in the frontend via the backend; Raw ↔ Harmonized toggle reduces the 2012 jump (`×5.17` → `×1.44`, MODIS alone `×2.06`).
- [ ] **Sat 19:00 – Sun 02:00:** all 3 regions; polygon queries, CSV exports, NRT overlay, sandbox on real grids.
- [ ] **B, Sun 09:00:** deployed on Vercel + Render, static JSON fallback verified, calendar launches the sandbox.
- [ ] **Freeze, deadline − 3 h:** bug fixes, slides, demo video, rehearsal only.

## P1: Integrator + pitch
- [x] Repo, `AGENTS.md`, contracts, mocks, CI; master plan installed and reconciled
- [ ] Fill in names above; add collaborators on GitHub
- [x] Generate h3 mocks (`uv run python contracts/mocks/generate_mocks.py`) and commit: sandbox grid, sample tables
- [ ] Merge PRs every 30–60 min; run the full app after each merge; keep `PLAN.md`/`DECISIONS.md` current
- [ ] Deploy frontend (Vercel) + backend (Render)
- [ ] Slides, demo script, demo video, submission page, pitch rehearsal

## P2: Data ingestion + sandbox inputs
- [ ] FIRMS MAP_KEY; start Route A (yearly country files), B (archive request), C (area API for 2026)
- [x] Normalize + filter (`type == 0`, `confidence != low`) + clip + H3 → **Río Negro first**: `points.parquet`, `hex_day.parquet` (revised: 307,352 points / 143,233 hex-days; see pipeline/ingest/RIO_NEGRO_STATUS.md)
- [ ] Same for California and Romania
- [ ] Sandbox inputs: WorldCover → `landcover`, `asset_type`, `burnable`; Open-Meteo → `elevation_m`, `slope_deg`; join P3's `hex_fire_history` → `sandbox_grid.json`

## P3: Harmonization
- [x] Method on synthetic/mock data while waiting for P2
- [x] Río Negro: cell-days per satellite/month; `monthly_factors` (fit 2012–2020), `terra_only_factor`, `noaa20_factor`, `noaa21_factor`; Aqua/Terra orbit check in `diagnostics`
- [x] Held-out 2021–2025 → `test_mae` → `calibration.json` (Río Negro, screened tables: MAE 91 cell-days, MAPE 33 %)
- [x] `calendar.json`: harmonized series, IQR anomaly (floor 1.0), uncertainty, sparse fallback (Río Negro committed in `data/processed/rio_negro/`)
- [x] `hex_fire_history.parquet` (burn_count, years_since_last_fire) for P2 (code ready; real file once `hex_day.parquet` lands)
- [x] Method paragraph + raw-vs-harmonized validation chart for the pitch (Río Negro: `pipeline/harmonize/METHOD.md` + `pipeline/harmonize/pitch/rio_negro_validation_chart.png`; redo both if the method changes)

## P4: Backend
- [x] Mock-serving endpoints (regions, calendar, calibration, sandbox grid, health)
- [x] Validate received Rio Negro P2 Parquet tables and real hotspot export through normal lookup (backend/REAL_DATA_HANDOFF.md); full harmonized integration awaits P1/P3
- [x] `POST /api/calendar` for a drawn polygon (DuckDB over `hex_day`, factors, < 5 cell-day fallback)
- [x] CSV exports (points, calendar)
- [x] Cached FIRMS NRT proxy, region or global bbox, NOAA-20/21 + MODIS NRT
- [x] Deploy to Render with P1 (https://fire-calendar.onrender.com; health, all regional JSON schemas, polygon queries and CSV exports verified on 2026-11-14; mock mode)

## P5: Frontend
- [x] Scaffold Vite app (see `frontend/README.md`)
- [x] MapLibre + deck.gl H3 layer + terra-draw + lat/lon + 3 region presets + static JSON fallback loader
- [x] 26 × 12 calendar heatmap, palette switcher (Cividis default), `is_estimated` / `is_nrt` / MOCK badges, tooltips
- [x] Raw ↔ Harmonized toggle, time-series chart, `test_mae` validation badge, IQR anomaly cards
- [x] CSV export buttons, NRT overlay, "Launch Tactical Containment Sandbox" trigger
- [x] Calibration panel under the calendar: 12 monthly factors with ±1 CV, Terra-only / NOAA-20 / NOAA-21 factors, fallback and not-measured flags (all from `calibration.json`)
- [x] "Month to date" label on an incomplete last month (cards, heatmap cell, tooltip), from `calibration.json` `diagnostics.last_month_complete` / `last_data_date` (P3 request)
- [x] Integration with P4's finished backend: production build points at the Render URL, the page paints from the bundle while the backend wakes and then reloads from the API, drawn-area calendar and both CSV exports verified end to end against https://fire-calendar.onrender.com, mock exports labeled in the file name
- [x] Checkpoint A check on real Río Negro data (production build against the deployed backend): every item verified in the running app; fixed the colour scale (one extreme month no longer flattens the calendar) and bundled the real Río Negro files as the offline fallback

## P6: Tactical Containment Sandbox
- [x] CA engine in a Web Worker on the mock grid (TEAM_PLAN §3.2 equation), click-to-ignite, 72 h playback
- [x] Wind from Open-Meteo + gust/wind-shift slider; slope; fuel from land cover + years since last fire
- [ ] 8-step UI: drone perimeter, terrain, fuel, weather, attack, 4 interventions, asset triage, exit route (done: terrain and fuel layers, weather, attack plan, 4 interventions, asset triage; open: drone perimeter from live hotspots, exit route)
- [ ] Min-cut + Monte Carlo optimizer with identical budget; side-by-side scoreboard (done so far: side-by-side scoreboard and a greedy simulation-scored optimizer with the identical budget, seeds and wind; min-cut is not built)
- [ ] Draft RO-ALERT-style advisory modal; permanent banner; wire to real grid

## Requests (cross-folder changes)

_Format: `- [ ] from Px to Py: what and why`_

- [ ] from P3 to P5/P4: Río Negro `calendar.json` / `calibration.json` were regenerated from P2's screened tables (`test_mae` 91.11, `test_mape` 0.332, `harmonized_step_ratio` 1.50, Jan 2001 harmonized 11,399). P5: the tracked fallback copy in `frontend/public/data/rio_negro/` is now stale; re-run `npm run sync-data` and commit. P4: `backend/REAL_DATA_HANDOFF.md` still quotes 102.01 / 0.354.

- [x] from P3 to P1 (method + possible contract change): on real Río Negro data the S-NPP / MODIS cell-day ratio is not constant, it falls as fires get larger (about 1.4 in the biggest months, 5–10 in quiet ones). The binding median-ratio factors give held-out 2021–2025 MAE 102 cell-days (MAPE 35 %) and turn Terra's 2,402 cell-days of Jan 2001 into 11,490. A power law `S-NPP = a · MODIS^b` fitted on the same 2012–2020 months (a ≈ 23, b ≈ 0.57) gives MAE 51 (MAPE 18 %) on the same held-out years. It cannot be written as `monthly_factors`, so it needs new fields in `calibration.schema.json` and a change in P4's polygon math. **Update:** the binding method is shipped for Río Negro so P4/P5 have real data; P3 asks P1 to approve the power law as a follow-up. → **Decided by P1**: keep the binding median-ratio method (`monthly_factors`) and frozen `contracts/` so P3 can commit real Río Negro `calendar.json`, `calibration.json`, and `hex_fire_history.parquet` immediately without breaking P4's deployed polygon math, P5's calibration panel, or additive per-hex `burn_count`. Record the hex-saturation physical explanation and the power-law comparison (`35%` vs `18%` held-out MAPE) in `calibration.json` `diagnostics` and `pipeline/harmonize/METHOD.md` for the scientific pitch.

- [x] from P3 to P1/P5: when the data ends mid-month, the last row of `calendar.json` is month-to-date: `harmonized` is the count so far and `median_m` / `iqr_m` / `anomaly_z` use the same days of that month in the baseline years (shape unchanged, but `median_m` is not the full-month median for that one row). P1: confirm this reading of the schema. P5: consider a "month to date" label on that cell (`calibration.json` → `diagnostics.last_month_complete`, `last_data_date`). → **Approved by P1** (schema preserved; P5 already shows an "in progress" badge and can optionally inspect `diagnostics.last_month_complete`). → **Done by P5** (`feat/p5-month-to-date`): when `diagnostics.last_month_complete` is false the last month reads "Month to date, through <last_data_date>" and its median/IQR are marked "to date"; without those keys the wording stays a neutral "Month in progress".

- [x] from P3 to P1: add `matplotlib` to the `pipeline` dependency group in `pyproject.toml`. `pipeline/harmonize/chart.py` needs it; until then it runs with `uv run --with matplotlib` and its PNG test is skipped in CI. → **Done by P1** (`matplotlib>=3.9` added to `pipeline` in `pyproject.toml` and locked in `uv.lock`).

- [x] from P3 to P1: confirm the NOAA-21 exception (fitted on Feb 2024 – Oct 2026, outside `fit_years`, because it has no S-NPP overlap in 2012–2020) and that `terra_only_factor` is fitted on 2012–2020. → **Approved by P1** (matches `calibration.schema.json`).
- [x] from P3 to P2/P1: `calendar.json` needs `is_nrt` per month but `hex_day.parquet` has no such column; P3 currently flags the last 6 data months. Say if you can give the real SP/NRT cutoff date. → **Resolved by P1**: keep `hex_day.parquet` schema frozen (`contracts/tables.md` unchanged); P3's 5-month SP lag rule (`last_data_month` + 5 preceding months) is the official standard (or `MIN(date) WHERE is_nrt` from `points.parquet` if present in the same directory).
- [x] from P5 to P4: the interim `POST /api/calendar` returns whole-region numbers for any polygon and the frontend cannot tell. Until the real aggregation lands, please return 501 (or tell me a marker), so the UI never labels region totals as a drawn area.
- [x] from P5 to P4/P1: no endpoint gives per-hex historical values, so the map's `H3HexagonLayer` has no archive data source. Interim: P5 shows NRT hotspots binned to H3 res-7 in the browser and the sandbox grid's `burn_count`. Say if you want a per-hex endpoint instead. → **Approved by P1**: keep `contracts/api.md` frozen; `sandbox_grid.json` `burn_count` + browser-binned NRT hexes is the official `H3HexagonLayer` design.
- [x] from P5 to P6: the app lazy-loads the default export of `frontend/src/features/sandbox/index.tsx` (or `.ts`) with the props in `SandboxProps` (`frontend/src/app/SandboxHost.tsx`): `{ regionId: RegionId; area: GeoJSON.Polygon | null; onClose: () => void }`. The host page already shows the required `SANDBOX_BANNER` and a back button, so you do not need to repeat them. Tell me if you want another shape. → **Done by P6** (`feat/p6-sandbox-engine`): `frontend/src/features/sandbox/index.tsx` exists with that shape; P5 please check the launch from the calendar after P1 merges.
- [x] from P5 to P4: `backend/app/main.py` reads JSON with `read_text()` and no encoding, so on Windows `GET /api/regions` returns "RÃ­o Negro" instead of "Río Negro". Please pass `encoding="utf-8"` (fine on Linux/Render, wrong on Windows laptops and in the demo if the backend runs locally).
- [ ] from P5 to P3: FYI, no change needed. The calibration panel reads three optional things from `calibration.json` `diagnostics` if present: `terra_only.measured`, `noaa20.measured`, `noaa21.measured` (to flag a neutral ×1 placeholder) and `fit_windows.<factor name>` (shown as "Fitted on …"). It works without them; tell me if you rename these keys.

- [x] from P4 to P1: add h3>=4.0 and shapely>=2.1 to the root backend group and refresh uv.lock. The human explicitly authorized this dependency-only change; applied and locked.

- [x] from P4 to P1/P5: backend deployment is verified at https://fire-calendar.onrender.com. Set FIRMS_MAP_KEY securely in Render and recheck NRT (currently 503; health reports key unconfigured); coordinate the frontend CORS origin and VITE_API_URL with P5. Real regional archives remain pending P2/P3. → **P5 part done** (`feat/p5-backend-integration`): `frontend/.env.production` sets `VITE_API_URL=https://fire-calendar.onrender.com` for production builds (a `VITE_API_URL` set in the Vercel dashboard overrides it). → **P1 part done**: Render redeployed on `main` (`PR #11`), live `/api/nrt?region_id=rio_negro&days=1` verified returning `200 OK` with live NOAA-20/NOAA-21 `FeatureCollection`.

- P4 review: https://github.com/neamturazvan/fire-calendar/pull/9 (feat/p4-backend-api), pushed after collaborator access was granted; 87 Python tests and 35 frontend tests passed locally. Render deployment is now verified on mocks; live NRT configuration and real-data verification remain pending.

- P4 deployment record: https://github.com/neamturazvan/fire-calendar/pull/10 (feat/p4-render-deploy). No unchecked P4 checklist tasks remain; live NRT key configuration and P5/P2/P3 integration are tracked in Requests.

- [x] from P4 to P1: Render now reports FIRMS_MAP_KEY configured, but region/bbox one-day and seven-day NRT requests return 502. Review/deploy feat/p4-nrt-errors to identify the safe per-source cause; live NRT is not yet verified. Deployment verification is separately recorded in PR #10. → **Resolved**: PR #11's `map_key.strip()` fixed the Render key whitespace issue; `/api/nrt?region_id=rio_negro&days=1` now returns `200 OK` with live hotspots.

- P4 NRT diagnostics PR: https://github.com/neamturazvan/fire-calendar/pull/11 (feat/p4-nrt-errors); 100 Python tests and Ruff passed. Live 502 cause awaits deployment.

- [x] from P2 to P3/P4: Rio Negro tables are ready locally; coordinate cross-laptop transfer (no data committed). See `pipeline/ingest/RIO_NEGRO_STATUS.md` for sizes and counts. S-NPP SP stops 2026-07-31; NOAA-20/21 and MODIS include NRT through November 13. Read per-satellite provenance from points.parquet; NOAA-21 retained NRT starts May 6. → **Done**: transferred to both P3 and P4.

- [x] from P5 to P4/P1: FYI, no change needed. `POST /api/export/calendar` for the whole region box is a polygon aggregation, not P3's regional `calendar.json` (on mocks the totals differ: about 137 vs 19,067 cell-days for `rio_negro`). So the frontend calls that endpoint only for a drawn area; with no area drawn, "Export calendar (CSV)" writes the regional calendar that is on screen, same columns. Say if you would rather serve the regional file from the endpoint when the polygon equals the region box. → **Approved by P1**: exporting the on-screen whole-region `calendar.json` directly when no polygon is drawn is the right design.

- [x] from P4 to P3: P4 received the Rio Negro tables (317,938 points / 149,205 hex-days) and verified integrity and actual-data hotspot export. Provide real calendar.json and calibration.json, with an explicit coverage-aware treatment of missing S-NPP August-October 2026 observations; do not turn the documented SP tail gap into zero fire activity. Inputs are now in data/processed/rio_negro/ on P4's laptop after explicit human authorization; hashes were preserved and normal backend lookup/export passed. → **Done by P3** (`PR #14` & `PR #15` on `main`): `data/processed/rio_negro/calendar.json` and `calibration.json` are committed on `main` with `diagnostics.snpp_reference_until = "2026-07"` (handing over to `NOAA-20 × noaa20_factor` starting Aug 2026). P4 can read `diagnostics.snpp_reference_until` in `backend/app/calendar_service.py` for polygon source selection.

- P4 received-data evidence: backend/REAL_DATA_HANDOFF.md. P2's NOAA-21 SP start explanation resolves the earlier-than-NRT dates; no observations were discarded.

- P4 integration dependency resolved: P1 kept the binding method/frozen contracts and P3's real JSON outputs are on main via PR #15. Local full-history integration and the early NOAA handover fix are verified.

- P4 real-data handoff review: https://github.com/neamturazvan/fire-calendar/pull/17 (merged); input validation and placement completed. The early NOAA handover follow-up adds runtime compatibility and full real-calendar verification.

- [x] P4: verify real Rio Negro calendar, anomaly baselines, month-to-date scores, provenance and CSVs; respect P3's early NOAA handover when the S-NPP archive ends in July. Evidence: backend/REAL_DATA_HANDOFF.md.

- [x] from P4 to P1: the human confirmed P1 will upload the two gitignored Rio Negro Parquet files to data/processed/rio_negro/ on Render and deploy the P4 early NOAA handover follow-up. Regional JSON is already real, but live polygon requests still use samples until the Parquet files are present. → **Resolved by P1**: removed `data/processed/**/*.parquet` from `.gitignore` (`data/raw/` remains gitignored per `AGENTS.md` §6). P2, P3, or P4 (whoever has `data/processed/rio_negro/hex_day.parquet`, `points.parquet`, and `hex_fire_history.parquet` locally) can now commit and open a PR for `data/processed/rio_negro/*.parquet` so Render gets them automatically on deploy.

- P4 real-calendar source fix: https://github.com/neamturazvan/fire-calendar/pull/18 (feat/p4-source-handover); 110 tests and Ruff passed. P1 handles Render Parquet upload and deployment.

- [x] from P5 to P1: **Checkpoint A is met from the frontend side** (checked 14 Nov in the running app, production build against https://fire-calendar.onrender.com, `is_mock: false`, no MOCK DATA badge; California and Romania still show it). Seen on screen: 313 months Nov 2000 – Nov 2026, baseline 2001–2025; Raw steps up at Feb 2012 (Jan 2012 136 → Feb 2012 169, switch marker shown); in Harmonized the 135 months up to Jan 2012 are converted and marked estimated; 2012 step computed from the cells on screen: raw ×5.17, harmonized ×1.44, so the toggle reduces the jump, it does not remove it (MODIS alone ×2.06, shown next to it); calibration values equal `calibration.json`; near-real-time on Aug–Nov 2026 only; Nov 2026 is "month to date, through 13 Nov 2026". Please merge `feat/p5-checkpoint-a` and tick the box. Two things to know: Aug–Nov 2026 differ between the two modes by design (NOAA-20 count × 1.069, source `viirs_noaa20`), so "identical from Feb 2012" holds through Jul 2026; and a drawn polygon in Río Negro still returns MOCK DATA (labelled) until the parquet tables are on the server. → **Merged in PR #19 & Checkpoint A ticked by P1**.
- [x] P2: investigate persistent sources, add conservative res-9 site/year filter and fire-season safeguards, regenerate Rio Negro tables, implement/test rerunnable P3 history join (mock terrain remains labeled).
- [x] from P2 to P3/P4: revised pair is packaged in data/raw/rio_negro-p2-persistence-handoff.zip on David's laptop. P3: regenerate calibration/calendar/history; send replacement hex_fire_history.parquet. P4: deploy only with matching revised calibration. See pipeline/ingest/RIO_NEGRO_STATUS.md for hashes and limits; current sandbox history is provisional and terrain mock. → **P3 part done**: P3 reproduced the revised pair from the original points with `pipeline/ingest/persistence.py` (SHA-256 of both files matches the table in `RIO_NEGRO_STATUS.md`), re-ran the harmonization and committed the replacement `data/processed/rio_negro/hex_fire_history.parquet` (27,405 hexes, total burn_count 130,382) with the matching `calendar.json` / `calibration.json`. P2: re-run the sandbox join. P4: the revised `hex_day.parquet` / `points.parquet` are still not in git. → **Now in git**: committed by P3 on P2's behalf at the human's request (`data/processed/rio_negro/`, SHA-256 equal to the table in `RIO_NEGRO_STATUS.md`). P4: Render can now serve real Río Negro polygons and exports.

- [x] P2: verified P3 PR #21 history/calendar/calibration against screened tables and refreshed sandbox_grid.json (474 history changes; 628 matches / 399 defaults; mock terrain retained). Updated local ZIP contains the matching P4/P6 inputs; real terrain preparation and P4 deployment remain pending.
