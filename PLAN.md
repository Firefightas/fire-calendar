# PLAN.md: live task board

Agents: tick tasks as you finish them and keep your "Current state" line to one sentence. P1 keeps this file honest. Full spec per role: `TEAM_PLAN.md` §6.

## Current state

| Role | Owner (name) | Agent | Current state |
|---|---|---|---|
| P1 Integrator + pitch | _fill in_ | Gemini Pro #1 | Master plan + H3 mocks committed; PR #1 (P3) merged; P3 fit-window & `is_nrt` rules signed off. |
| P2 Data ingestion | _fill in_ | ChatGPT Plus #1 (Codex) | Not started. `normalize.py` + `download_api.py` ready to use. |
| P3 Harmonization | _fill in_ | Claude Pro #1 (Fable) | `run.py` writes `calendar.json`, `calibration.json` (with orbit check) and `hex_fire_history.parquet`; `chart.py` draws the validation chart; all verified on synthetic known-ratio data; waiting for P2's Río Negro `hex_day.parquet`. |
| P4 Backend | _fill in_ | ChatGPT Plus #2 (Codex) | Stub serves mocks (regions, calendar, calibration, sandbox grid); NRT params parsed. |
| P5 Frontend | _fill in_ | Claude Pro #2 (Fable) | All P5 items plus a calibration-factors panel built and tested on mocks, online and offline; exports, NRT overlay and drawn-area numbers light up as P4's endpoints land; next: real Río Negro data check once P2/P3 files exist. |
| P6 Sandbox | _fill in_ | Claude Pro #3 (Fable) | Not started. |
| Relief pool | _fill in_ | Gemini Pro #2, #3 | Standing by; take over via `HANDOFF.md`. |

## Checkpoints (TEAM_PLAN §7)

- [ ] **A, Sat 19:00:** Río Negro end-to-end slice: real harmonized calendar in the frontend via the backend; Raw ↔ Harmonized toggle removes the 2012 jump.
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
- [ ] Normalize + filter (`type == 0`, `confidence != low`) + clip + H3 → **Río Negro first**: `points.parquet`, `hex_day.parquet`
- [ ] Same for California and Romania
- [ ] Sandbox inputs: WorldCover → `landcover`, `asset_type`, `burnable`; Open-Meteo → `elevation_m`, `slope_deg`; join P3's `hex_fire_history` → `sandbox_grid.json`

## P3: Harmonization
- [x] Method on synthetic/mock data while waiting for P2
- [ ] Río Negro: cell-days per satellite/month; `monthly_factors` (fit 2012–2020), `terra_only_factor`, `noaa20_factor`, `noaa21_factor`; Aqua/Terra orbit check in `diagnostics`
- [ ] Held-out 2021–2025 → `test_mae` → `calibration.json`
- [ ] `calendar.json`: harmonized series, IQR anomaly (floor 1.0), uncertainty, sparse fallback
- [x] `hex_fire_history.parquet` (burn_count, years_since_last_fire) for P2 (code ready; real file once `hex_day.parquet` lands)
- [ ] Method paragraph + raw-vs-harmonized validation chart for the pitch (chart script ready: `pipeline/harmonize/chart.py`; paragraph drafted in `pipeline/harmonize/METHOD.md`; real chart and the paragraph's numbers once real data lands)

## P4: Backend
- [x] Mock-serving endpoints (regions, calendar, calibration, sandbox grid, health)
- [ ] `POST /api/calendar` for a drawn polygon (DuckDB over `hex_day`, factors, < 5 cell-day fallback)
- [ ] CSV exports (points, calendar)
- [ ] Cached FIRMS NRT proxy, region or global bbox, NOAA-20/21 + MODIS NRT
- [ ] Deploy to Render with P1

## P5: Frontend
- [x] Scaffold Vite app (see `frontend/README.md`)
- [x] MapLibre + deck.gl H3 layer + terra-draw + lat/lon + 3 region presets + static JSON fallback loader
- [x] 26 × 12 calendar heatmap, palette switcher (Cividis default), `is_estimated` / `is_nrt` / MOCK badges, tooltips
- [x] Raw ↔ Harmonized toggle, time-series chart, `test_mae` validation badge, IQR anomaly cards
- [x] CSV export buttons, NRT overlay, "Launch Tactical Containment Sandbox" trigger
- [x] Calibration panel under the calendar: 12 monthly factors with ±1 CV, Terra-only / NOAA-20 / NOAA-21 factors, fallback and not-measured flags (all from `calibration.json`)

## P6: Tactical Containment Sandbox
- [ ] CA engine in a Web Worker on the mock grid (TEAM_PLAN §3.2 equation)
- [ ] Wind from Open-Meteo + gust/wind-shift slider; slope; fuel from land cover + years since last fire
- [ ] 8-step UI: drone perimeter, terrain, fuel, weather, attack, 4 interventions, asset triage, exit route
- [ ] Min-cut + Monte Carlo optimizer with identical budget; side-by-side scoreboard
- [ ] Draft RO-ALERT-style advisory modal; permanent banner; wire to real grid

## Requests (cross-folder changes)

_Format: `- [ ] from Px to Py: what and why`_

- [ ] from P3 to P1/P5: when the data ends mid-month, the last row of `calendar.json` is month-to-date: `harmonized` is the count so far and `median_m` / `iqr_m` / `anomaly_z` use the same days of that month in the baseline years (shape unchanged, but `median_m` is not the full-month median for that one row). P1: confirm this reading of the schema. P5: consider a "month to date" label on that cell (`calibration.json` → `diagnostics.last_month_complete`, `last_data_date`).

- [ ] from P3 to P1: add `matplotlib` to the `pipeline` dependency group in `pyproject.toml`. `pipeline/harmonize/chart.py` needs it; until then it runs with `uv run --with matplotlib` and its PNG test is skipped in CI.

- [x] from P3 to P1: confirm the NOAA-21 exception (fitted on Feb 2024 – Oct 2026, outside `fit_years`, because it has no S-NPP overlap in 2012–2020) and that `terra_only_factor` is fitted on 2012–2020. → **Approved by P1** (matches `calibration.schema.json`).
- [x] from P3 to P2/P1: `calendar.json` needs `is_nrt` per month but `hex_day.parquet` has no such column; P3 currently flags the last 6 data months. Say if you can give the real SP/NRT cutoff date. → **Resolved by P1**: keep `hex_day.parquet` schema frozen (`contracts/tables.md` unchanged); P3's 5-month SP lag rule (`last_data_month` + 5 preceding months) is the official standard (or `MIN(date) WHERE is_nrt` from `points.parquet` if present in the same directory).
- [ ] from P5 to P4: the interim `POST /api/calendar` returns whole-region numbers for any polygon and the frontend cannot tell. Until the real aggregation lands, please return 501 (or tell me a marker), so the UI never labels region totals as a drawn area.
- [ ] from P5 to P4/P1: no endpoint gives per-hex historical values, so the map's `H3HexagonLayer` has no archive data source. Interim: P5 shows NRT hotspots binned to H3 res-7 in the browser and the sandbox grid's `burn_count`. Say if you want a per-hex endpoint instead.
- [ ] from P5 to P6: the app lazy-loads the default export of `frontend/src/features/sandbox/index.tsx` (or `.ts`) with the props in `SandboxProps` (`frontend/src/app/SandboxHost.tsx`): `{ regionId: RegionId; area: GeoJSON.Polygon | null; onClose: () => void }`. The host page already shows the required `SANDBOX_BANNER` and a back button, so you do not need to repeat them. Tell me if you want another shape.
- [ ] from P5 to P4: `backend/app/main.py` reads JSON with `read_text()` and no encoding, so on Windows `GET /api/regions` returns "RÃ­o Negro" instead of "Río Negro". Please pass `encoding="utf-8"` (fine on Linux/Render, wrong on Windows laptops and in the demo if the backend runs locally).
- [ ] from P5 to P3: FYI, no change needed. The calibration panel reads three optional things from `calibration.json` `diagnostics` if present: `terra_only.measured`, `noaa20.measured`, `noaa21.measured` (to flag a neutral ×1 placeholder) and `fit_windows.<factor name>` (shown as "Fitted on …"). It works without them; tell me if you rename these keys.
