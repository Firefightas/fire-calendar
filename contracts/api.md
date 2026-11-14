# API contract (backend, P4)

Base URL: `http://localhost:8000` locally, Render URL when deployed. All JSON unless noted. Errors: `{"detail": "message"}` with a 4xx/5xx status.

The backend reads `data/processed/<region_id>/` and **falls back to `contracts/mocks/<region_id>/`** when real files don't exist yet. Every JSON response that comes from a mock has `"is_mock": true`.

## Endpoints

### `GET /api/health`
`{"status": "ok", "using_mocks": ["rio-negro", ...]}`

### `GET /api/regions`
Returns `contracts/regions.json` (schema: `regions.schema.json`).

### `GET /api/regions/{region_id}/calendar`
Whole-region calendar (schema: `calendar.schema.json`).

### `GET /api/regions/{region_id}/calibration`
Calibration factors and validation numbers (schema: `calibration.schema.json`).

### `POST /api/calendar`
Calendar for a drawn area inside a region.

```json
{
  "region_id": "rio-negro",
  "polygon": { "type": "Polygon", "coordinates": [[[-66.0,-39.5],[-65.3,-39.5],[-65.3,-39.0],[-66.0,-39.0],[-66.0,-39.5]]] },
  "start": "2001-01",
  "end": "2026-11",
  "area_label": "Choele Choel"
}
```

Response: same shape as `calendar.schema.json`, months filtered to `start..end`. How it works: hexes inside the polygon → monthly cell-days per satellite from `hex_day` → region factors from `calibration.json` → median/IQR/anomaly recomputed for the area. If the area has too few detections, factors fall back to the region (flagged in calibration as `fallback`).

### `POST /api/export/points` → `text/csv`
Body: `region_id`, `polygon`, `start`, `end` (as above). Columns exactly as `points.parquet` in `tables.md`. Filename: `hotspots_<region>_<start>_<end>.csv`.

### `POST /api/export/calendar` → `text/csv`
Same body. One row per month with all `months[]` fields from `calendar.schema.json`.

### `GET /api/nrt?region_id=rio-negro&days=1..7`
Live hotspots from FIRMS (NOAA-20, NOAA-21, MODIS NRT; never S-NPP), cached ~15 min. GeoJSON FeatureCollection; each feature's properties: `satellite, date, time, confidence_class, frp, daynight`.

### `GET /api/regions/{region_id}/sandbox-grid`
Sandbox inputs (schema: `sandbox_grid.schema.json`).

## Raw vs. harmonized toggle

No separate endpoint: every month carries both. The frontend shows:
- **Harmonized:** `harmonized`.
- **Raw (naive switch):** `viirs_raw` when not null, otherwise `modis_raw`. This is what you'd get by just switching satellites in 2012, and it shows the jump.
