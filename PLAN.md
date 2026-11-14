# PLAN.md: live task board

Agents: tick tasks as you finish them and keep your "Current state" line to one sentence. P1 keeps this file honest. Full spec per role: `TEAM_PLAN.md` §6.

## Current state

| Role | Owner (name) | Agent | Current state |
|---|---|---|---|
| P1 Integrator + pitch | _fill in_ | Gemini Pro #1 | Master plan installed; repo, contracts and mocks aligned to it. |
| P2 Data ingestion | _fill in_ | ChatGPT Plus #1 (Codex) | Not started. `normalize.py` + `download_api.py` ready to use. |
| P3 Harmonization | _fill in_ | Claude Pro #1 (Fable) | Not started. |
| P4 Backend | _fill in_ | ChatGPT Plus #2 (Codex) | Stub serves mocks (regions, calendar, calibration, sandbox grid); NRT params parsed. |
| P5 Frontend | _fill in_ | Claude Pro #2 (Fable) | Not started (scaffold Vite first). |
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
- [ ] Generate h3 mocks (`uv run python contracts/mocks/generate_mocks.py`) and commit: sandbox grid, sample tables
- [ ] Merge PRs every 30–60 min; run the full app after each merge; keep `PLAN.md`/`DECISIONS.md` current
- [ ] Deploy frontend (Vercel) + backend (Render)
- [ ] Slides, demo script, demo video, submission page, pitch rehearsal

## P2: Data ingestion + sandbox inputs
- [ ] FIRMS MAP_KEY; start Route A (yearly country files), B (archive request), C (area API for 2026)
- [ ] Normalize + filter (`type == 0`, `confidence != low`) + clip + H3 → **Río Negro first**: `points.parquet`, `hex_day.parquet`
- [ ] Same for California and Romania
- [ ] Sandbox inputs: WorldCover → `landcover`, `asset_type`, `burnable`; Open-Meteo → `elevation_m`, `slope_deg`; join P3's `hex_fire_history` → `sandbox_grid.json`

## P3: Harmonization
- [ ] Method on synthetic/mock data while waiting for P2
- [ ] Río Negro: cell-days per satellite/month; `monthly_factors` (fit 2012–2020), `terra_only_factor`, `noaa20_factor`, `noaa21_factor`; Aqua/Terra orbit check in `diagnostics`
- [ ] Held-out 2021–2025 → `test_mae` → `calibration.json`
- [ ] `calendar.json`: harmonized series, IQR anomaly (floor 1.0), uncertainty, sparse fallback
- [ ] `hex_fire_history.parquet` (burn_count, years_since_last_fire) for P2
- [ ] Method paragraph + raw-vs-harmonized validation chart for the pitch

## P4: Backend
- [x] Mock-serving endpoints (regions, calendar, calibration, sandbox grid, health)
- [ ] `POST /api/calendar` for a drawn polygon (DuckDB over `hex_day`, factors, < 5 cell-day fallback)
- [ ] CSV exports (points, calendar)
- [ ] Cached FIRMS NRT proxy, region or global bbox, NOAA-20/21 + MODIS NRT
- [ ] Deploy to Render with P1

## P5: Frontend
- [ ] Scaffold Vite app (see `frontend/README.md`)
- [ ] MapLibre + deck.gl H3 layer + terra-draw + lat/lon + 3 region presets + static JSON fallback loader
- [ ] 26 × 12 calendar heatmap, palette switcher (Cividis default), `is_estimated` / `is_nrt` / MOCK badges, tooltips
- [ ] Raw ↔ Harmonized toggle, time-series chart, `test_mae` validation badge, IQR anomaly cards
- [ ] CSV export buttons, NRT overlay, "Launch Tactical Containment Sandbox" trigger

## P6: Tactical Containment Sandbox
- [ ] CA engine in a Web Worker on the mock grid (TEAM_PLAN §3.2 equation)
- [ ] Wind from Open-Meteo + gust/wind-shift slider; slope; fuel from land cover + years since last fire
- [ ] 8-step UI: drone perimeter, terrain, fuel, weather, attack, 4 interventions, asset triage, exit route
- [ ] Min-cut + Monte Carlo optimizer with identical budget; side-by-side scoreboard
- [ ] Draft RO-ALERT-style advisory modal; permanent banner; wire to real grid

## Requests (cross-folder changes)

_Format: `- [ ] from Px to Py: what and why`_
