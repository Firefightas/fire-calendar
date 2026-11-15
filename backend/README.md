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

CSV downloads send the header immediately and batch subsequent complete records
into about 64 Ki characters per chunk. DuckDB queries use one thread, a 128 MiB
buffer budget and a private temporary spill directory, cleaned up when the query
or download closes. This budget does not cap total process memory.

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
statistics are recomputed before the requested date range is applied. When regional calibration diagnostics identify an incomplete last month, that row compares against the same days of that month in every baseline year, matching P3's month-to-date rule; observed counts are never extrapolated. Uncertainty uses
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

- Current Render build: `uv sync --frozen && uv cache prune --ci`
- Alternative pip build: `pip install -r backend/requirements.txt`
- Start: `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`
- Health check: `/api/health`
- Environment: `PYTHON_VERSION=3.11.18`, `FIRMS_MAP_KEY`, and a comma-separated
  `CORS_ORIGINS` including the frontend deployment origin.

Use the Render dashboard for secret values. Configure P5's `VITE_API_URL` to the
resulting backend URL and verify an area calendar, both CSVs, health and live NRT.
See [Render's Python version settings](https://render.com/docs/python-version).

## Verified deployment

- Backend: https://fire-calendar.onrender.com
- Health check: https://fire-calendar.onrender.com/api/health
- API documentation: https://fire-calendar.onrender.com/docs

Live verification on 14 November 2026 passed health and region discovery; calendar,
calibration and sandbox-grid schemas for all three regions; a polygon calendar;
both CSV exports (including filenames and MOCK DATA provenance); invalid-query 422
responses; and the localhost CORS preflight. Calendar CSV values matched the
corresponding polygon response.

On 15 November 2026, deployment `efb661b` passed real-data checks for both screened
Rio Negro and California: regional JSON matches the committed files, drawn-area
calendars return 313 real months and both CSV exports have processed provenance.
Health lists only Romania under `using_mocks`. The Parquet tables are now tracked
in Git and deployed with the matching calibration files. Sandbox terrain remains
mock independently of calendar provenance.

PR #27's CSV batching and DuckDB resource limits are now verified live on
`3636a0e`: all 2,049,536 California points exported in 108.457 seconds, with headers
in 9.393 seconds; sampled instance memory stayed at or below 270.9 MiB / 512 MiB
across the verification run. Large CSV downloads still take time to transfer. See
[REAL_DATA_HANDOFF.md](REAL_DATA_HANDOFF.md) for timings, sampled Render memory,
current calibration metrics and verification evidence.

P1 verified live NRT after configuring the key and deploying PR #11.
Keep credentials out of Git and chat.

P5 should configure VITE_API_URL=https://fire-calendar.onrender.com in the frontend
deployment and coordinate its origin with CORS_ORIGINS (the current backend allows
all origins). That frontend configuration belongs to P5.

Regions without real inputs continue to serve labeled sample/mock data.

## Diagnosing NRT failures

A true firms_key_configured field in health means the environment variable is
present, not that NASA has accepted the key. During initial verification on
14 November 2026, the deployed
service reported a configured key, while one-day region, equivalent global bbox
and seven-day requests returned generic 502 responses. P1 subsequently verified
live NRT after the key whitespace fix.

The proxy now returns safe per-source reasons for rejected keys, exhausted quota,
timeouts, network failures, upstream HTTP errors, unavailable source/date data and
unexpected CSV responses. Warning logs contain only source, category and status;
raw response bodies, credentials and upstream URLs are omitted. HTTP status and
the frozen detail-string error shape remain unchanged. Failed or partial results
are not cached. Header-only valid CSV is still a successful empty observation set.

Leading/trailing whitespace is stripped from the configured key. After merging
this diagnostics fix and redeploying Render, recheck the live NRT error before
deciding whether key activation, quota, network access or parsing needs attention.

Real Rio Negro/California inputs, the early NOAA handover fix, calendar/CSV
verification and the completed performance deployment check are documented in
[REAL_DATA_HANDOFF.md](REAL_DATA_HANDOFF.md).
