# Backend (owner: P4)

FastAPI implementation of [the frozen API contract](../contracts/api.md).

## Run and verify

From the repository root:

```powershell
uv sync --all-groups --locked
uv run uvicorn backend.app.main:app --reload
uv run pytest
uv run ruff check .
```

API docs: http://localhost:8000/docs. Copy `.env.example` to `backend/.env` and set
`FIRMS_MAP_KEY` locally to enable the live overlay. Never commit or paste the key.
Without a key, historical endpoints still work; NRT returns 503.

## Implemented endpoints

- Health, region presets, whole-region calendars, calibration and sandbox grids.
- `POST /api/calendar`: polygon-specific calibrated monthly cell-days and IQR anomalies.
- `POST /api/export/points` and `POST /api/export/calendar`: streamed contract CSVs.
- `GET /api/nrt`: region or global bbox, 1-7 days, NOAA-20/21 and MODIS NRT.

Each JSON file resolves to `data/processed/<region>/` first, then
`contracts/mocks/<region>/`. Tables resolve to real Parquet first, then the matching
`*.sample.csv`. Sample-derived calendars and any calendar with mock metadata or
calibration remain `is_mock: true`. CSV provenance is in `X-Data-Source`
(`MOCK DATA` or `processed`); download headers are exposed through CORS.
JSON is explicitly read as UTF-8 on every platform.

## Polygon and scientific behavior

Polygons must be valid, nonempty closed GeoJSON polygons (holes supported), entirely
inside the chosen region bbox; invalid geometry/date windows return 422.

Calendars include H3 resolution-7 cells whose centers lie inside the polygon, following
`h3.geo_to_cells`. MODIS Terra/Aqua observations of the same hex-day count once;
pixel counts and different satellite records are never added together. Hotspot exports
instead filter actual coordinates, including boundaries and excluding hole interiors.

Monthly local MODIS-to-S-NPP factors use Feb 2012-Dec 2020 only, with at least five
MODIS cell-days per usable yearly ratio and three usable years per calendar month.
Sparse months inherit the regional factor/CV. Terra-only and NOAA conversion factors
remain regional. Epochs match P3: Terra-only through June 2002, combined MODIS through
January 2012, S-NPP through October 2026, then the regional NOAA reference satellite.
Zero detections inside a polygon do not establish that a satellite was unavailable.

Coverage, baseline years and NRT flags come from the regional calendar. Area baseline
statistics are recomputed before the requested date range is applied. Uncertainty uses
the recorded factor CV plus Poisson count noise, following P3's formula.

## Live overlay

The proxy fetches the three allowed sources concurrently, splits dated requests into
windows of at most five days, and normalizes confidence, coordinates and acquisition
times to the frozen GeoJSON contract. Low-confidence and known non-vegetation sources
are excluded. Exact duplicate observations are removed within a satellite; different
satellites remain separate observations. Successful complete results are cached for
15 minutes (bounded to 64 bbox/day/date entries). Upstream failure returns a sanitized
502; incomplete source results are never presented as a complete overlay.

The FIRMS window/date behavior follows [NASA's Area API documentation](https://firms.modaps.eosdis.nasa.gov/api/area).
Weather remains a direct browser call to Open-Meteo.

## Render deployment with P1

Create a Python web service from the repository. Keep the service root at the repository
root, so `contracts/` and `data/processed/` remain available.

- Build: `pip install -r backend/requirements.txt`
- Start: `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`
- Health check: `/api/health`
- Environment: `PYTHON_VERSION=3.11.18`, `FIRMS_MAP_KEY`, and a comma-separated
  `CORS_ORIGINS` including the frontend deployment origin.

Use the Render dashboard for secret values. Configure P5's `VITE_API_URL` to the
resulting backend URL and verify an area calendar, both CSVs, health and live NRT.
See [Render's Python version settings](https://render.com/docs/python-version).

No service has been published by this branch. Real archive validation still depends
on P2/P3's files; until then the demo deliberately serves labeled sample/mock data.