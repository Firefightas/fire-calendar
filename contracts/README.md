# contracts/ (owner: P1)

These files are **authoritative** for data shapes: `TEAM_PLAN.md` describes intent, the schemas here define exact fields. If they disagree, the schema wins.

The frozen meeting point between everyone's code. Think of it as the agreed spot where two bridge crews meet in the middle: if the shapes here don't change, everyone's pieces fit.

| File | What it defines | Producer → consumer |
|---|---|---|
| `regions.json` (+ schema) | the 3 demo regions, bboxes in FIRMS order `[west, south, east, north]` | P1 → everyone |
| `calendar.schema.json` | monthly calendar (raw, harmonized, anomaly, uncertainty) | P3 / P4 → P5 |
| `calibration.schema.json` | conversion factors + validation numbers | P3 → P4, P5 |
| `sandbox_grid.schema.json` | per-hex sandbox inputs (land cover, asset type, slope, fire history) | P2 + P3 → P4, P6 |
| `tables.md` | `points.parquet`, `hex_day.parquet` (P2 → P3, P4) and `hex_fire_history.parquet` (P3 → P2) columns | see file |
| `api.md` | backend endpoints | P4 → P5, P6 |
| `mocks/<region>/` | **fake data** in exactly these shapes (`is_mock: true`) | P1 → everyone until real data lands |

## Rules

- Only P1 edits this folder. Need a change? Add it under "Requests" in `PLAN.md`.
- Every change here must keep `uv run pytest` green (the tests validate every mock against its schema).
- Frontend types mirroring these schemas: `frontend/src/types/contracts.ts`. Update both together.

## Regenerating mocks

```bash
uv run python contracts/mocks/generate_mocks.py
```

Without `h3` installed it writes only `calendar.json` and `calibration.json`. With `uv run` (h3 installed) it also writes `sandbox_grid.json` (a ~1,000-hex demo map with a river, villages, farms, forest and two recent burn scars), `points.sample.csv`, `hex_day.sample.csv` and `hex_fire_history.sample.csv`.

All mock numbers are synthetic. Never show them in the pitch as results.
