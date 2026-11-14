# DECISIONS.md

One line per decision: what, and why. Newest at the bottom. Read before changing any of these.

## Core (TEAM_PLAN.md, final master plan)

- Stack: Python/uv/DuckDB/h3 pipeline, FastAPI backend, Vite+React+TS frontend, MapLibre+deck.gl map, sandbox in a Web Worker. Why: fast on laptops, free, every agent knows it.
- Unit = active fire cell-days (H3 res-7 hexes with ≥1 detection per day, per sensor). Why: stops one fire counting as many VIIRS pixels.
- Common scale = `SNPP_VIIRS_EQ`. Chain: Terra-only → Terra+Aqua MODIS → S-NPP → NOAA-20/21. Why: VIIRS is the future; S-NPP ended 2 Nov 2026, so the record must continue on NOAA-20/21.
- Calibration learned only on 2012–2020, tested on 2021–2025 (`test_mae`). Why: fitting on all years erases real trends; held-out years prove validity.
- Terra (morning) and Aqua (afternoon, like VIIRS) are distinguished; Terra-only era gets `terra_only_factor`. Why: orbit time of day and the mid-2002 Aqua step.
- Anomaly = IQR Anomaly Score: (H − monthly median) / max(IQR, 1.0), baseline 2001–2025. Never "sigma". Why: robust to mega-fire years; non-parametric.
- Sparse polygons: < 5 cell-days in month m during the overlap → region factor + wider uncertainty. Why: tiny areas give noisy ratios.
- 26-year polygon queries only inside 3 precomputed regions (`rio_negro`, `california`, `romania`); NRT overlay and weather work globally. Why: the FIRMS API allows 1–5 days per call; a live 26-year query would need ~1,900 calls.
- Frontend bundles static JSON fallbacks. Why: the demo must not depend on one server.
- Sandbox follows the Romanian firefighter 8-step protocol using only ESA WorldCover + Open-Meteo + harmonized history; `asset_type` and `slope_deg` derived deterministically. Why: no extra data scraping.
- Sandbox never called a "game"; permanent "Illustrative Counterfactual Scenario Tool" banner; all metrics from simulation runs. Why: scientific honesty with CONAE judges.
- Agencies are open-science stakeholders; RO-ALERT output is a draft advisory module. Why: Space Apps is open science.

## Reconciliation of the master plan with the repo (P1, Sat ~14:00)

- `contracts/` is authoritative for exact shapes; TEAM_PLAN describes intent. Why: one source of truth for field names.
- `hex_day.parquet` keeps both `sensor` and `satellite` (plan table listed only `sensor`). Why: §2.2 needs Terra/Aqua and S-NPP/NOAA separated; with `sensor` alone the epochs can't be computed.
- `calendar.json` is an object with metadata (`region_id`, `is_mock`, `baseline_years`, ...) wrapping `months[]`, and months keep a `source` field (plan table showed a bare array). Why: mock labeling, provenance tooltips and the S-NPP → NOAA handover.
- `calibration.json` uses the plan's field names (`target_scale`, `terra_only_factor`, `noaa20_factor`, `noaa21_factor`, `monthly_factors`, `test_mae`) plus `is_mock`, `generated_at`, `method` and optional `diagnostics`. Why: plan shape + room for the Aqua/Terra orbit check.
- `calendar.json.scale` = `SNPP_VIIRS_EQ` (same token as `target_scale`). Why: one name for the scale everywhere.
- `GET /api/nrt` accepts `region_id` or a global `bbox` (plan §5.2 listed only `region_id`, §0.1 says global). Why: honor §0.1.
- New hand-off table `hex_fire_history.parquet` (P3 → P2). Why: the plan has P3 compute fire history and P2 build the grid, but no file between them.
- Region ids use underscores (`rio_negro`). Why: matches the plan.
- `CLAUDE.md` / `GEMINI.md` import `AGENTS.md` (`@AGENTS.md`) instead of symlinks. Why: symlinks break on Windows and in zips.
- `burnable` includes villages (50) with low flammability. Why: village triage needs fire to be able to reach village hexes; water (80) never burns.
- P5 also owns frontend config (`package.json`, vite config); P1 owns `frontend/src/types/contracts.ts`. Why: the plan left these unowned.
