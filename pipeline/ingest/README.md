# pipeline/ingest/ (owner: P2)

Gets raw FIRMS hotspots onto disk and turns them into the contract tables (`contracts/tables.md`).

```
data/raw/<region>/*.csv  ──normalize.py──▶  data/processed/<region>/points.parquet
                                            data/processed/<region>/hex_day.parquet
```

## 1. Get the data (start these first, they take time)

Get a free MAP_KEY at https://firms.modaps.eosdis.nasa.gov/api/map_key and put it in `backend/.env` as `FIRMS_MAP_KEY=...`.

| Route | Use for | How |
|---|---|---|
| **Yearly country CSVs** | full history, fastest | https://firms.modaps.eosdis.nasa.gov/download → "Download yearly summary by country". MODIS, VIIRS S-NPP, NOAA-20, NOAA-21 × Argentina, USA, Romania × every year. Save to `data/raw/<region>/`. |
| **Archive Download tool** | backup / custom bbox | Same page, log in (Earthdata or email code), request each region bbox (see `contracts/regions.json`), all dates. Arrives by email. |
| **Area API** | months after the yearly files, gaps | `uv run python -m pipeline.ingest.download_api --region rio_negro --source VIIRS_NOAA20_SP --start 2026-01-01 --end 2026-11-13` |

Coverage: MODIS from 1 Nov 2000; VIIRS S-NPP 20 Jan 2012 → 2 Nov 2026 (ended); NOAA-20 from 1 Apr 2018; NOAA-21 from 17 Jan 2024. Standard (SP) data lags NRT by ~5 months. The FIRMS `country` API is currently down; don't use it. Check availability with `/api/data_availability/csv/<KEY>/ALL`.

Country files cover whole countries: `normalize.py` clips them to the region bbox.

## 2. Normalize

```bash
uv run python -m pipeline.ingest.normalize --region rio_negro data/raw/rio_negro/*.csv
uv run pytest pipeline/ingest
```

What it does: detects MODIS vs VIIRS by columns, maps satellite codes (`T/A/N/N20/N21`...) to `terra/aqua/snpp/noaa20/noaa21`, converts confidence to `low/nominal/high` (MODIS <30 / 30–79 / ≥80), keeps `type` 0 or missing (drops volcanoes, gas flares, offshore), drops low confidence, clips to bbox, removes NRT rows where standard data exists, adds H3 res 7, writes both Parquet files, prints counts per year × satellite.

**Sanity check the printout:** S-NPP should start in 2012, Aqua mid-2002, NOAA-20 2018, and VIIRS counts should be several times MODIS. If a satellite code is unknown, it stops and tells you; pass `--satellite`.

## 3. Share

Parquet over ~50 MB goes to the team Drive folder, not git. Tell P3 and P4 in `PLAN.md` when Río Negro lands.
