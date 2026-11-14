# backend/ (owner: P4)

FastAPI service implementing `contracts/api.md`. Already working on mocks: `/api/health`, `/api/regions`, `/api/regions/{id}/calendar`, `/api/regions/{id}/calibration`, `/api/regions/{id}/sandbox-grid`, and polygon-specific `POST /api/calendar` (DuckDB aggregation, calibration, uncertainty and area IQR anomalies).

## Run

```bash
cp backend/.env.example backend/.env      # add the FIRMS MAP_KEY
uv run uvicorn backend.app.main:app --reload
uv run pytest backend
```

Docs at http://localhost:8000/docs.

## Data resolution

For every file the backend tries `data/processed/<region>/` first, then `contracts/mocks/<region>/`. When P2/P3 drop real files in, the API switches automatically; `/api/health` lists which regions still use mocks.

## Your tasks (TODOs in `app/main.py`)

1. `POST /api/calendar`: H3 cells inside the polygon (`h3.geo_to_cells`, res 7) → DuckDB over `hex_day.parquet` → monthly cell-days per satellite (MODIS combined = distinct hex-days, see `contracts/tables.md`) → apply `calibration.json` (`terra_only_factor`, `monthly_factors`, `noaa20_factor`, `noaa21_factor`) → recompute median/IQR/`anomaly_z` (floor 1.0) for the area. **Sparse fallback:** < 5 cell-days in month m during the overlap → region factor + widen uncertainty with the regional `cv`. Reject polygons outside the region bbox (422).
2. `POST /api/export/points` and `/api/export/calendar` as CSV (`StreamingResponse`, `text/csv`, filename in `Content-Disposition`).
3. `GET /api/nrt`: works for a `region_id` **or any global `bbox`** (parameter parsing already done in `nrt_bbox`). FIRMS area API, sources `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`, `MODIS_NRT` (never S-NPP: it stopped on 2 Nov 2026), cache ~15 min, return GeoJSON. The sandbox uses it for the t = 0 drone perimeter.
4. Deploy on Render: build `pip install -r backend/requirements.txt`, start `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`, env vars `FIRMS_MAP_KEY`, `CORS_ORIGINS`.

FIRMS area API: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/<KEY>/<SOURCE>/<west,south,east,north>/<1..5>[/<YYYY-MM-DD>]`, max 5 days per call, 5,000 transactions per 10 minutes.

## P4 implementation status

Polygon calendars now validate closed, non-self-intersecting polygons and holes inside the region bbox. They select H3 res-7 cells by cell center, count distinct hex-days, apply the four epochs and recompute anomalies over the full regional baseline before date filtering. Until real Parquet files arrive, sample CSV tables are used with is_mock=true. JSON reads explicitly use UTF-8 on Windows.

Local monthly factors require three fit-year ratios, each with at least five MODIS cell-days, from Feb 2012-Dec 2020. Sparse months inherit the region factor/CV. Terra-only and NOAA factors remain regional. Post-S-NPP satellite availability and NRT flags come from the regional calendar, including months with no area detections.

Runtime dependencies are in backend/requirements.txt. Until P1 adds Shapely to the root group, install it with uv pip install -r backend/requirements.txt after uv sync. CSV and NRT endpoints are the next tasks.
