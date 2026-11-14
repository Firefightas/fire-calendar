# Team Plan: Harmonized Burning Activity Calendar + Tactical Containment Sandbox

NASA Space Apps 2026, Challenge #9: Harmonization of MODIS and VIIRS Hot Spots.
Team: 6 people. Agents: 3x Claude Pro (Fable), 2x ChatGPT Plus (Codex), 3x Gemini Pro (Gemini CLI).

All three stages are in scope. Each stage has its own owner from the start, so none blocks the others.

---

## 1. Stack (decided)

| Layer | Choice | Why |
|---|---|---|
| Data pipeline | **Python 3.11**, `uv` for envs, **DuckDB** + **pandas**, **h3-py**, **pyarrow** (Parquet) | DuckDB crunches multi-GB CSVs on a laptop in seconds; Parquet keeps outputs small and fast |
| Backend API | **FastAPI** + DuckDB reading the processed Parquet | Same language as the pipeline; keeps the FIRMS MAP_KEY secret; does polygon queries and CSV export |
| Frontend | **Vite + React + TypeScript + Tailwind** | Fast to scaffold, every agent knows it well |
| Map | **MapLibre GL JS** (free, no token) + **deck.gl** `H3HexagonLayer` + **terra-draw** for drawing polygons | Renders H3 hexes natively; no Mapbox billing |
| Calendar + charts | **d3-scale** + **d3-scale-chromatic** (Viridis, Cividis, Inferno) for the heatmap; **Recharts** for line charts | Colorblind-safe ramps built in |
| Sandbox | TypeScript, **h3-js**, **HTML5 Canvas**, simulation in a **Web Worker** | Runs entirely in the browser; doesn't freeze the UI |
| External data | NASA FIRMS (archive + NRT API), **Open-Meteo** (wind and elevation, no key), **ESA WorldCover** (land cover) | All free |
| Deploy | Frontend on **Vercel**, backend on **Render** | Free tiers, deploy from GitHub |
| Fallback | Frontend can read precomputed `calendar.json` files directly if the backend is down | The demo never depends on one server |

---

## 2. Core scientific decisions

1. **Unit:** "active fire cell-days" = number of H3 resolution-7 hexes with at least one detection per day, per sensor. This removes the "one fire = 7 VIIRS points" double-count.
2. **Common scale: S-NPP-VIIRS-equivalent.** MODIS-only years (Nov 2000 to Jan 2012) are converted and marked `is_estimated: true`. **Suomi NPP stopped delivering new data on 2 Nov 2026** (its archive stays available), so the record continues with NOAA-20 (from Apr 2018) and NOAA-21 (from Jan 2024), each calibrated to S-NPP over its overlap. Same instrument, same orbit plane, about 50 minutes apart, so expect factors near 1, but measure them. This makes the record future-proof: MODIS → S-NPP → NOAA-20/21.
3. **Calibration is learned only on the overlap** (both sensors flying), per region and per calendar month: `factor(m) = median(VIIRS / MODIS)`. Apply to MODIS-only years. Never fit on the whole 2000–2026 range (that erases real trends).
4. **Validation:** fit on 2012–2020, test on 2021–2025. Report error and show the raw-vs-harmonized "step" at 2012.
5. **Anomaly:** `z = (value - median_m) / max(IQR_m, floor)`, median and IQR per calendar month across all years. Not called "sigma".
6. **Sparse areas:** if an area has too few detections, fall back to the whole region's factor and widen the uncertainty band.
7. **Stage 3 honesty:** the sandbox is labeled an illustrative scenario tool, not an operational forecast. Its numbers come from the simulation, never invented. Fuel uses recent fire activity as a depletion proxy, masked by land cover (water, urban, bare ground are not fuel).

**Gotchas for the data owners:**
- Aqua MODIS joins in mid-2002, so combined MODIS counts jump then. Handle Terra-only 2000–2002 explicitly.
- Terra passes in the morning (~3 h before Aqua); Aqua passes in the afternoon like VIIRS. Calibrate Aqua against VIIRS (same time of day) and Terra separately.
- **Filter non-fires:** keep MODIS `type == 0` (vegetation fire) where the column exists; drop volcanoes, static industrial sources and offshore. Matters for Río Negro, which sits near oil and gas activity (gas flares).
- **Confidence:** MODIS is numeric 0–100, VIIRS is `l/n/h`. Normalize to `low/nominal/high` (MODIS: <30 low, 30–79 nominal, ≥80 high) and drop `low` by default.
- Standard (SP) data replaces NRT with roughly a 5-month lag. Recent months are NRT; flag them `is_nrt: true`.
- Live overlay uses NOAA-20/21 NRT (+ MODIS NRT), never S-NPP.
- Terra and Aqua orbits drift in later years; the 2012–2020 fit window limits the impact.

---

## 3. Regions (precomputed)

1. **Río Negro / Choele Choel, Argentina** (hero demo, the CONAE example)
2. **California, USA**
3. **Romania**

Users can draw any area **inside** a loaded region. Live NRT hotspots (last 1–7 days) overlay on top.

---

## 4. Repo structure and ownership

```
/
├── AGENTS.md            # brief for all agents (CLAUDE.md, GEMINI.md symlink here)   [P1]
├── WORKFLOW.md  PLAN.md  DECISIONS.md  HANDOFF.md  TEAM_PLAN.md                    [P1]
├── contracts/           # JSON schemas + mock data, the source of truth            [P1]
│   ├── calendar.schema.json
│   ├── sandbox_grid.schema.json
│   ├── api.md
│   └── mocks/
├── pipeline/
│   ├── ingest/          # download, clean, H3-bin FIRMS data                        [P2]
│   ├── sandbox_inputs/  # land cover, elevation, fire history per hex                [P2]
│   └── harmonize/       # calibration, validation, anomalies, outputs               [P3]
├── data/
│   ├── raw/             # gitignored
│   └── processed/<region_id>/   # outputs (shared via Drive if > 50 MB)
├── backend/             # FastAPI                                                   [P4]
└── frontend/
    └── src/
        ├── app/  features/map/  features/calendar/  features/export/               [P5]
        └── features/sandbox/                                                        [P6]
```

---

## 5. Data contract (agree in the first hour, then freeze)

Files in `data/processed/<region_id>/`:

| File | Contents | Producer | Consumers |
|---|---|---|---|
| `points.parquet` | raw detections: `date, time, lat, lon, h3, sensor, satellite, confidence_class, frp, daynight, type, is_nrt` | P2 | P4 (CSV export) |
| `hex_day.parquet` | `h3, date, sensor, n_points, frp_sum` | P2 | P3, P4 |
| `calendar.json` | per year-month: `modis_raw, viirs_raw, harmonized, is_estimated, median_m, iqr_m, anomaly_z, unc_low, unc_high` | P3 | P4, P5 |
| `calibration.json` | per month: `factor, cv, n_years`; plus `fit_years, test_years, test_mae, method` | P3 | P4, P5 |
| `sandbox_grid.json` | per hex: `h3, landcover, burnable, elevation_m, burn_count, years_since_last_fire` | P2 + P3 | P6 |

API (P4), in `contracts/api.md`:

| Endpoint | Purpose |
|---|---|
| `GET /api/regions` | list regions with bounds |
| `GET /api/regions/{id}/calendar` | whole-region calendar (carries both raw and harmonized values) |
| `GET /api/regions/{id}/calibration` | factors + validation numbers |
| `POST /api/calendar` | body: `region_id, polygon (GeoJSON), start, end`; calendar for a drawn area |
| `POST /api/export/points` | CSV of raw hotspots in the area |
| `POST /api/export/calendar` | CSV of the harmonized monthly table |
| `GET /api/nrt?region_id=&days=1..7` | live FIRMS hotspots (cached proxy) |
| `GET /api/regions/{id}/sandbox-grid` | sandbox inputs |

**Mocks first:** P1 commits mock files for every contract in hour 1, so P4, P5 and P6 build against fake data while the real pipeline runs.

---

## 6. People, roles and agents

The person holding the matching subscription takes the role. Fable goes where the reasoning is hardest.

| # | Role | Owns | Primary agent | Why this agent |
|---|---|---|---|---|
| P1 | **Integrator + pitch lead** | contracts, root docs, CI, merges, deploy, slides, demo script | Gemini Pro #1 | Huge context window for reviewing the whole repo and diffs |
| P2 | **Data ingestion + sandbox inputs** | `pipeline/ingest/`, `pipeline/sandbox_inputs/` | ChatGPT Plus #1 (Codex) | Solid, well-defined scripting work |
| P3 | **Harmonization scientist** | `pipeline/harmonize/` | **Claude Pro #1 (Fable)** | Critical path, hardest science, decides the Validity score |
| P4 | **Backend API** | `backend/` | ChatGPT Plus #2 (Codex) | Standard FastAPI + DuckDB work |
| P5 | **Frontend: map, calendar, export** | `frontend/src/app`, `map`, `calendar`, `export` | **Claude Pro #2 (Fable)** | Biggest visible surface; drives Presentation |
| P6 | **Sandbox: simulation + optimizer** | `frontend/src/features/sandbox/` | **Claude Pro #3 (Fable)** | Hardest algorithms (CA engine, min-cut, Monte Carlo) |
| — | **Relief pool** | any role | Gemini Pro #2, #3 | Takes over via HANDOFF.md when a primary agent hits its limit |

### P1: Integrator + pitch lead
1. Create repo, root docs, symlinks, `.gitignore`, CI (lint + tests on push).
2. Write `contracts/` schemas and mock files (hour 1), then freeze them; contract changes go through P1 only.
3. Merge PRs every 30–60 min, run the full app, keep `PLAN.md` current.
4. From Saturday evening: deploy, slides, demo script, submission page, demo video.
- **Done when:** the deployed app runs end to end and the pitch is rehearsed.

### P2: Data ingestion + sandbox inputs
1. **Minute 0:** get a free FIRMS MAP_KEY (firms.modaps.eosdis.nasa.gov/api/map_key) and start downloads. Three routes, use all in parallel:
   - **Yearly country CSVs (main route for history):** on firms.modaps.eosdis.nasa.gov/download, click "Download yearly summary by country". Get MODIS, VIIRS S-NPP, NOAA-20, NOAA-21 for Argentina, USA, Romania, every available year. Reported pattern: `.../data/country/zips/<sensor>_<year>_all_countries.zip` containing `<sensor>_<year>_<Country>.csv` (verify on the page).
   - **Archive Download tool (backup):** same page, log in with Earthdata or an email code, request each region's bounding box for all dates. Results arrive by email, so submit now.
   - **Area API (recent tail + live):** `/api/area/csv/<KEY>/<SOURCE>/<west,south,east,north>/<1..5>/<YYYY-MM-DD>`. Max 5 days per call, 5,000 transactions per 10 min. Sources: `MODIS_SP|MODIS_NRT`, `VIIRS_SNPP_SP`, `VIIRS_NOAA20_SP|_NRT`, `VIIRS_NOAA21_SP|_NRT`. Check `/api/data_availability/csv/<KEY>/ALL` for where SP ends. The `country` API is currently down; don't use it.
2. Normalize both schemas (MODIS: `brightness, bright_t31, confidence 0–100, satellite T/A, type`; VIIRS: `bright_ti4, bright_ti5, confidence l/n/h, satellite N/N20/N21`), filter per the gotchas, clip to region bounds, bin to H3 res 7 → `points.parquet`, `hex_day.parquet`.
3. Then sandbox inputs: WorldCover land cover, Open-Meteo elevation, per-hex fire history → `sandbox_grid.json` (with P3 for `years_since_last_fire`).
- **Done when:** all 3 regions have valid files matching the contract.

### P3: Harmonization scientist
1. Start on Río Negro as soon as its data lands; use synthetic data until then.
2. Compute cell-days per sensor per month, overlap factors per month, apply to MODIS-only years, handle Terra-only 2000–2002.
3. Fit 2012–2020, test 2021–2025, write `calibration.json` with error metrics.
4. Anomaly scores, uncertainty band, sparse-area fallback → `calendar.json`.
5. Write a one-paragraph method note for the pitch (P1).
- **Done when:** the harmonized calendar shows no step at 2012 and the test error is reported.

### P4: Backend API
1. Scaffold FastAPI serving the mock files, so P5 can integrate immediately.
2. Implement polygon queries: hexes inside the polygon → aggregate `hex_day` → apply region factors from `calibration.json`.
3. CSV exports, cached FIRMS NRT proxy, sandbox-grid endpoint.
4. Deploy to Render with P1.
- **Done when:** every endpoint in `contracts/api.md` works on real data and the deployed URL responds.

### P5: Frontend (map, calendar, export)
1. Scaffold the app shell, MapLibre map, region presets, terra-draw polygon + lat/lon input.
2. Calendar heatmap (years × months) with palette switcher (Cividis default), estimated-years marker, tooltips.
3. The **Raw ↔ Harmonized toggle** (the core demo moment), anomaly cards ("this month vs. historical median"), line chart, export buttons, NRT overlay.
4. "Launch Tactical Containment Sandbox" button that opens P6's feature with the selected area.
- **Done when:** a judge can pick Río Negro, draw an area, flip the toggle, and download both CSVs.

### P6: Tactical Containment Sandbox
1. Build against `contracts/mocks/sandbox_grid.json` from hour 1.
2. Cellular automaton on the H3 grid in a Web Worker: spread probability from wind (Open-Meteo), slope (elevation), fuel (land cover + years since last fire).
3. Player phase: a fixed resource budget (firebreaks, retardant drops, backfires) placed on the map, then a simulated 72 h run.
4. AI optimizer: min-cut on the spread graph to propose firebreak placements, scored by Monte Carlo runs (same budget).
5. Side-by-side readout (hectares burned, containment %) computed from the actual runs. Visible "illustrative scenario" label.
- **Done when:** the sandbox opens from the calendar with a real region grid and the human-vs-AI comparison runs.

---

## 7. Timeline (Saturday 12:00 start, adjust to the submission deadline)

| When | Milestone |
|---|---|
| Sat 12:00–13:00 | Repo, docs, contracts, mocks (P1). Downloads started (P2). Everyone primes their agent. |
| Sat 13:00–19:00 | Everyone builds against mocks. P2 lands Río Negro data first. |
| **Sat 19:00, Checkpoint A** | Río Negro: real harmonized calendar visible in the frontend through the backend. |
| Sat 19:00–Sun 02:00 | All 3 regions, exports, NRT overlay, sandbox on the real grid. |
| **Sun 09:00, Checkpoint B** | Everything integrated and deployed. Sandbox launches from the calendar. |
| Deadline − 3 h | **Feature freeze.** Only bug fixes, pitch and video from here. |

---

## 8. Agent rules (paste into AGENTS.md)

- Work only inside your owned folders. Contracts change only through P1.
- After every task: run tests, commit, tick `PLAN.md`, log choices in `DECISIONS.md`.
- At 80–90% usage: write `HANDOFF.md` (done, in progress, broken, next 3 steps, gotchas), commit, and switch to a relief-pool agent.
- New agent priming prompt:
  > Read AGENTS.md, TEAM_PLAN.md, PLAN.md, DECISIONS.md and HANDOFF.md, then run `git log -10` and the tests. Summarize your role and current state before changing anything.
- Never commit secrets. The FIRMS MAP_KEY lives in `backend/.env` only.
- Never present numbers that weren't computed from the data.
