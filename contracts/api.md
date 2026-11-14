# API contract (backend, P4)

Base URL: `http://localhost:8000` locally, Render URL when deployed. All JSON unless noted. Errors: `{"detail": "message"}` with a 4xx/5xx status. Region ids: `rio_negro`, `california`, `romania`.

The backend reads `data/processed/<region_id>/` and **falls back to `contracts/mocks/<region_id>/`** when real files don't exist yet. Every JSON response that comes from a mock has `"is_mock": true`.

## Endpoints

### `GET /api/health`
`{"status": "ok", "using_mocks": ["rio_negro", ...], "firms_key_configured": true}`

### `GET /api/regions`
Returns `contracts/regions.json` (schema: `regions.schema.json`).

### `GET /api/regions/{region_id}/calendar`
Whole-region 2000–2026 calendar (schema: `calendar.schema.json`). Every month carries both raw and harmonized values.

### `GET /api/regions/{region_id}/calibration`
Calibration factors and held-out 2021–2025 validation (schema: `calibration.schema.json`).

### `POST /api/calendar`
Calendar for a drawn area **inside** a precomputed region.

```json
{
  "region_id": "rio_negro",
  "polygon": { "type": "Polygon", "coordinates": [[[-66.0,-39.5],[-65.3,-39.5],[-65.3,-39.0],[-66.0,-39.0],[-66.0,-39.5]]] },
  "start": "2001-01",
  "end": "2026-11",
  "area_label": "Choele Choel"
}
```

Response: same shape as `calendar.schema.json`, months filtered to `start..end`. How: H3 res-7 cells inside the polygon → monthly cell-days per satellite from `hex_day` → factors from `calibration.json` → median/IQR/anomaly recomputed for the area. **Sparse fallback (TEAM_PLAN §2.3):** if the area has < 5 cell-days in month *m* during the overlap window, use the region's `factor(m)` and widen `unc_low/unc_high` with the regional `cv`. Polygon outside the region bbox → 422.

### `POST /api/export/points` → `text/csv`
Body: `region_id`, `polygon`, `start`, `end`. Columns exactly as `points.parquet` in `tables.md`. Filename: `hotspots_<region>_<start>_<end>.csv`.

### `POST /api/export/calendar` → `text/csv`
Same body. One row per month with all `months[]` fields from `calendar.schema.json`. Filename: `calendar_<region>_<start>_<end>.csv`.

### `GET /api/nrt`
Live hotspots, cached ~15 min. Works **globally** (TEAM_PLAN §0.1). Query:
- `region_id=rio_negro` (uses the region bbox) **or** `bbox=west,south,east,north`
- `days=1..7`

Sources: `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`, `MODIS_NRT`. Never S-NPP (stopped 2 Nov 2026). Returns a GeoJSON FeatureCollection; feature properties: `satellite, date, time, confidence_class, frp, daynight`. The sandbox uses this for the t = 0 drone perimeter.

### `GET /api/regions/{region_id}/sandbox-grid`
Sandbox inputs (schema: `sandbox_grid.schema.json`).

## Raw vs. harmonized toggle

No separate endpoint: every month carries both. The frontend shows:
- **Harmonized (S-NPP Equivalent):** `harmonized`.
- **Raw Unharmonized:** `viirs_raw` when not null, otherwise `modis_raw`. This is what you'd get by just switching satellites in 2012, and it shows the jump.

## Labels (TEAM_PLAN §0.2, §0.4)
- `anomaly_z` is shown as **"IQR Anomaly Score (Z_IQR)"**, never "sigma".
- Weather (Open-Meteo) is called directly from the browser; no backend endpoint.
