# PLAN.md: live task board

Agents: tick tasks as you finish them and keep your "Current state" line to one sentence. P1 keeps this file honest.

## Current state

| Role | Owner (name) | Agent | Current state |
|---|---|---|---|
| P1 Integrator | _fill in_ | Gemini Pro | Repo skeleton, contracts and mocks committed. |
| P2 Data ingestion | _fill in_ | Codex | Not started. |
| P3 Harmonization | _fill in_ | Claude (Fable) | Not started. |
| P4 Backend | _fill in_ | Codex | Stub serves mock regions/calendar/calibration. |
| P5 Frontend | _fill in_ | Claude (Fable) | Not started (scaffold Vite first). |
| P6 Sandbox | _fill in_ | Claude (Fable) | Not started. |

## Checkpoints

- [ ] **A, Sat 19:00:** Río Negro real harmonized calendar visible in the frontend through the backend.
- [ ] **B, Sun 09:00:** everything integrated and deployed; sandbox launches from the calendar.
- [ ] **Freeze, deadline − 3 h:** bug fixes, pitch and video only.

## P1: Integrator + pitch
- [x] Repo skeleton, docs, contracts, mocks, CI
- [ ] Fill in names above; create GitHub repo; add everyone as collaborators
- [ ] Generate `sandbox_grid.json` + `points.csv` mocks (needs `h3`: `uv run python contracts/mocks/generate_mocks.py`)
- [ ] Merge PRs every 30–60 min; run the full app after each merge
- [ ] Deploy frontend (Vercel) + backend (Render)
- [ ] Slides, demo script, demo video, submission page

## P2: Data ingestion + sandbox inputs
- [ ] FIRMS MAP_KEY; start all downloads (see `pipeline/ingest/README.md`)
- [ ] Normalize + filter + clip + H3 bin → Río Negro `points.parquet`, `hex_day.parquet`
- [ ] Same for California and Romania
- [ ] Sandbox inputs (land cover, elevation, fire history) → `sandbox_grid.json`

## P3: Harmonization
- [ ] Method on synthetic data while waiting for P2
- [ ] Río Negro: cell-days per sensor/month, overlap factors, Terra/Aqua split, NOAA-20/21 chain
- [ ] Fit 2012–2020, test 2021–2025 → `calibration.json`
- [ ] Anomalies, uncertainty, sparse fallback → `calendar.json`
- [ ] Method paragraph + validation chart for the pitch

## P4: Backend
- [ ] Stub endpoints on mocks (regions, calendar, calibration) ✔ started
- [ ] `POST /api/calendar` for a drawn polygon
- [ ] CSV exports
- [ ] Cached FIRMS NRT proxy
- [ ] Sandbox grid endpoint; deploy

## P5: Frontend
- [ ] Scaffold Vite app (see `frontend/README.md`)
- [ ] Map, region presets, polygon + lat/lon input
- [ ] Calendar heatmap, palette switcher, estimated-year markers
- [ ] Raw ↔ Harmonized toggle, anomaly cards, line chart, exports, NRT overlay
- [ ] "Launch sandbox" button

## P6: Sandbox
- [ ] CA engine on H3 grid in a Web Worker (mock grid)
- [ ] Player phase with resource budget
- [ ] Min-cut optimizer + Monte Carlo scoring
- [ ] Side-by-side readout, "illustrative scenario" label, wire to real grid

## Requests (cross-folder changes)

_Format: `- [ ] from Px to Py: what and why`_
