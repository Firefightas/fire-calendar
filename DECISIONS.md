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

## P3 harmonization defaults (`pipeline/harmonize/run.py`)

- A monthly ratio is used only if its denominator has ≥ 5 cell-days and its numerator is > 0; a calendar month with < 3 usable fit-year ratios takes the pooled median (`fallback: true`). Why: the README names a sparse fallback without a threshold; 5 matches the polygon rule.
- `terra_only_factor` is fitted on Feb 2012 – Dec 2020, `noaa20_factor` on Apr 2018 – Dec 2020. Why: keeps every factor that can be inside the fit years inside them.
- `noaa21_factor` is fitted on Feb 2024 – Oct 2026. Why: NOAA-21 has no S-NPP overlap in 2012–2020; the exception is recorded in `diagnostics.fit_windows`.
- A NOAA factor with no overlap data is written as 1.0 with `diagnostics.<name>.measured: false`. Why: the schema requires a positive number.
- Uncertainty band = `H ± 1.96·sqrt(H + (cv·H)²)`. Why: Poisson count noise plus factor spread, same as the mocks.
- `is_nrt` = last data month and the 5 before it. Why: `hex_day` has no `is_nrt` column; standard processing lags ~5 months.
- Synthetic runs need an explicit `--out`. Why: the backend reports a region as real once `data/processed/<region>/calendar.json` exists.
- P1 sign-off on P3 requests: approved `terra_only_factor` fit on 2012–2020, `noaa21_factor` fit on Feb 2024 – Oct 2026 (only S-NPP overlap window), and the 5-month `is_nrt` lag rule so `hex_day.parquet` stays frozen. Why: zero contract churn across P2/P3/P4 while honoring TEAM_PLAN §2.2 and §2.4.
- `hex_fire_history.parquet` holds only hexes with ≥ 1 detection; `burn_count` counts, per month, the same satellite × factor the calendar uses; `years_since_last_fire` uses the last detection by any satellite. Why: hexes then sum to the regional harmonized series (MODIS and VIIRS are never added), while recency should not ignore a fire just because a non-reference satellite saw it.

## P5 frontend defaults (`frontend/`)

- Static fallback JSON is committed in `frontend/public/data/` and refreshed by `scripts/sync-data.mjs` before `dev`/`build` (`data/processed/` first, else `contracts/mocks/`). Why: the deployed frontend must work offline and cannot rely on files outside `frontend/`.
- The heatmap uses one square-root color scale, 0 to the largest raw-or-harmonized month, shared by both toggle states. Why: flipping the toggle never rescales colors, so a cell that changes color changed value; counts are heavy-tailed.
- The calendar shows every calendar year in the record (27 rows for Nov 2000 – Nov 2026), with empty slots where there is no month. Why: "26 years" spans 27 calendar years.
- `is_estimated` is a corner dot (not hatching) and is hidden in the raw view; `is_nrt` is an outline. Why: hatching fights the color scale; raw counts are not estimates.
- The annual time series plots only years with all 12 months; the raw annual total sums the naive switch series (`rawValue`) month by month. Why: partial years would look like real dips; MODIS and VIIRS are never added for the same month.
- A "month in progress" chip is shown when the latest month is the current UTC month by the browser clock. Why: the contract has no partial-month flag, and a part-month count against a full-month median reads falsely low.
- Anomaly wording bands (±0.5, ±1.5) are display text only; the score always comes from `anomaly_z`. Why: readers need a plain-language reading next to the number.
- The validation tile is flagged "whole-region calibration" when a drawn area is shown. Why: `test_mae` is regional and in cell-days, so it does not describe a small polygon.
- Basemap = OpenFreeMap "dark" vector style (no token); if it cannot be fetched the map falls back to a blank style that still shows region boxes, the drawn area and hex layers. Why: free, and the demo must survive without internet tiles.
- terra-draw is only the pen: a finished shape is validated (every vertex inside the region bbox), stored as one GeoJSON polygon in app state and drawn by our own MapLibre layer. One area at a time. Why: one source of truth for the area shared by calendar, exports and sandbox; the 26-year archive only exists inside the three regions.
- The map's `H3HexagonLayer` shows (a) `burn_count` from the region's sandbox grid and (b) live NRT hotspots binned to H3 res-7 in the browser, loaded on demand for the current map view via `GET /api/nrt?bbox=`. Why: no contract endpoint returns per-hex archive values; NRT by view bbox keeps the overlay global (TEAM_PLAN §0.1).
- MapLibre 6 gets its worker through `setWorkerUrl()` with a Vite `?url` asset import. Why: it resolves the worker relative to its own module at runtime, which breaks once Vite bundles it.
- When an area calendar comes back identical to the whole-region series, the UI says so. Why: the interim `POST /api/calendar` ignores the polygon, and region totals must not be presented as a drawn area's numbers.
- "Export calendar (CSV)" falls back to a CSV built in the browser from the calendar on screen (contract column order) when the backend export fails, and says so; "Export hotspots (CSV)" has no fallback. Why: the monthly table is already in the page, the point archive is not.
- The sandbox is mounted through `import.meta.glob('../features/sandbox/index.{ts,tsx}')` inside a host page that always shows `SANDBOX_BANNER`. Why: P5's build stays green before P6's entry exists, and the banner rule holds no matter what the module renders.
- The map (MapLibre + deck.gl + h3-js) is a lazy chunk. Why: the calendar, which is the judged centerpiece, paints first.
- The newest month's status comes from `calibration.json` `diagnostics.last_month_complete` / `last_data_date` when they are well-formed and the whole-region calendar is shown: incomplete → "Month to date, through <date>: median, IQR and score use the same days in the baseline years". When the file does not say (mocks, drawn areas), the browser clock decides and the wording is neutral ("Month in progress: count still accumulating"). This replaces the "reads low until it ends" chip. Why: P3 now scores an incomplete last month month-to-date, so claiming it reads low would be wrong; and regional diagnostics say nothing about how a drawn area was scored.
- The month-to-date label now also applies to a drawn area in the same region (this replaces the "drawn areas" exception in the line above). Why: P4's `POST /api/calendar` scores an incomplete last month of an area calendar by P3's month-to-date rule, using the same regional diagnostics.
- `frontend/.env.production` is committed with `VITE_API_URL=https://fire-calendar.onrender.com`. Why: it is a public URL, so the Vercel build works without dashboard setup; a dashboard `VITE_API_URL` still wins.
- Reads that have a bundled copy wait 4 s for the backend, backend-only calls (drawn-area calendar, exports, live overlay) wait 90 s, and a health check started at page load reloads bundled data from the API once the backend answers. Why: the hosted backend sleeps when idle and takes up to a minute to wake; the calendar must paint at once and the backend-only features must not fail during the wake-up.
- "Export calendar (CSV)" calls the backend only when a drawn-area calendar is on screen; for the whole region it writes the calendar on screen. Why: the endpoint aggregates the polygon it is given, which for the region box is a different computation from P3's regional `calendar.json`, and an export must match the numbers the user is looking at.
- Mock exports get a `MOCK_DATA_` file-name prefix and a "(MOCK DATA)" note, from the backend's `X-Data-Source` header or the calendar's `is_mock`. Why: a saved CSV travels without the page's badge.
- Calibration panel: monthly factors are drawn as a dot (factor) with a ±1 CV line (`factor × (1 ± cv)`) on an axis that always includes ×1; fallback months are hollow dots. Why: a factor is a ratio, so "no conversion" (×1) is the honest reference, and `cv` is the spread the contract provides.
- The panel reads `diagnostics.{terra_only,noaa20,noaa21}.measured` and `diagnostics.fit_windows` only if present and well-formed, and otherwise shows the factor alone. Why: `diagnostics` is free-form in the contract, but P3 writes a neutral 1.0 when a NOAA factor has no overlap data, and showing that as a measured factor would mislead.

- An incomplete last month is scored month-to-date: `median_m`, `iqr_m` and `anomaly_z` of that one row use the same days of the month in the baseline years; `harmonized` stays the observed count. Why: against full-month medians a 13-day month always looks unusually quiet, and scaling the count up would invent data.
- P1 sign-off on P3 & P5 requests: approved month-to-date baseline for an incomplete last month, added `matplotlib>=3.9` to `pipeline` dependencies in `pyproject.toml`, and approved P5's `H3HexagonLayer` design (`sandbox_grid.json` `burn_count` + browser-binned NRT hexes) without adding a new API endpoint. Why: keeps `contracts/` frozen and makes `pipeline.harmonize.chart` + its PNG test run in CI.

## P4 backend polygon calendars

- Polygon monthly factors use P3's >=5 MODIS cell-days per ratio and >=3 fit-year ratios, restricted to Feb 2012-Dec 2020; sparse months inherit the regional factor/CV. Terra-only and NOAA factors stay regional. Why: stable small-area calibration without fitting held-out years.
- Polygon calendars use regional archive month coverage, baseline years, NRT flags and post-S-NPP source availability, then recompute area medians/IQR before filtering the requested dates. Why: no-detection months are zeros, and neither date filtering nor a quiet area establishes satellite availability.
- Area calendars read real hex_day.parquet first, else the labeled hex_day.sample.csv; any mock input keeps is_mock=true. Why: P5 can integrate honest polygon results before P2 delivers the archive.

- Hotspot CSV exports filter actual lon/lat (including polygon holes/boundaries) after DuckDB bbox/date pushdown, rather than filtering by H3 alone; downloads expose Content-Disposition and X-Data-Source (MOCK DATA/processed). Why: points near a selected hex edge can be outside the polygon, and browser clients need filenames and provenance.

- NRT fetches NOAA-20/21 and MODIS concurrently, splits 6-7 days into NASA's <=5-day forward-date windows, caches complete successes for 15 minutes and returns a sanitized 502 on any source failure. Why: frontend latency, rate limits, honest coverage and no MAP_KEY leaks in errors.

- Area calendars follow P1's approved month-to-date rule when regional diagnostics identify an incomplete last month: only that row's baseline median/IQR/score use the same acquisition-day cutoff across baseline years; factors remain fitted on full fit-year months and observed counts stay unchanged. Why: partial-month observations must be compared with partial-month history.

- Render backend deployment is verified at https://fire-calendar.onrender.com on 2026-11-14 using labeled mocks; deployment completion is recorded separately from pending FIRMS key activation and real-archive validation. Why: a healthy mock-backed deployment must not imply that live NRT or real historical data has been verified.

- NRT failures expose only predefined per-source categories and numeric HTTP statuses; warning logs omit raw bodies, URLs and credentials. Why: the first live configured-key requests returned opaque 502 errors, which did not distinguish key/quota problems from transport or CSV failures. Health's configured flag means presence, not successful NASA authentication.

- P2 ingestion expands CSV globs in Python for Windows and rejects malformed API responses; errors omit request URLs/response bodies and completed downloads publish atomically. Why: PowerShell does not expand native-command globs, and FIRMS URLs contain the secret key.
- S-NPP is the reference only up to its last complete month of data, at most Oct 2026; NOAA-20 × `noaa20_factor` takes over after that. Why: the S-NPP standard-processing archive stops on 31 Jul 2026 and S-NPP NRT is never used, so Aug–Oct 2026 would otherwise be reported as zero fire.
- `is_nrt` uses `points.parquet` provenance when the file is next to `hex_day.parquet` (the satellite that supplies the month's value has NRT rows), else the 5-month lag rule. Why: P1's resolution; P2 reports there is no single SP/NRT cutoff across satellites.
- Río Negro ships with the binding median-ratio method although its held-out error is high (MAE 102 cell-days, MAPE 35 %): the S-NPP / MODIS ratio falls as fires get larger, so fixed monthly factors overstate MODIS-era mega-fire months (Jan 2001). Why: Checkpoint A needs real data with no contract change; a power law (held-out MAPE 18 % in a scratch test) is requested from P1 as a follow-up.
