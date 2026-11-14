# backend/ (owner: P4)

FastAPI service implementing `contracts/api.md`. Already working on mocks: `/api/health`, `/api/regions`, `/api/regions/{id}/calendar`, `/api/regions/{id}/calibration`, `/api/regions/{id}/sandbox-grid`, and a temporary `POST /api/calendar` (whole region trimmed to the date range).

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

1. `POST /api/calendar`: H3 cells inside the polygon (`h3.geo_to_cells` / `polygon_to_cells`, res 7) → DuckDB over `hex_day.parquet` → monthly cell-days per satellite → apply `calibration.json` factors → recompute median/IQR/anomaly for the area. Use the region factors (fallback) when the area is sparse.
2. `POST /api/export/points` and `/api/export/calendar` as CSV (`StreamingResponse`, `text/csv`, filename in `Content-Disposition`).
3. `GET /api/nrt`: FIRMS area API, sources `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`, `MODIS_NRT` (never S-NPP: it stopped on 2 Nov 2026), region bbox, cache ~15 min, return GeoJSON.
4. Deploy on Render: build `pip install -r backend/requirements.txt`, start `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`, env vars `FIRMS_MAP_KEY`, `CORS_ORIGINS`.

FIRMS area API: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/<KEY>/<SOURCE>/<west,south,east,north>/<1..5>[/<YYYY-MM-DD>]`, max 5 days per call, 5,000 transactions per 10 minutes.
