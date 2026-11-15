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

For 2026 requests, use `--end 2026-11-13` for this data snapshot. An annual
filename records the requested window, not guaranteed observation coverage;
check the CSV dates as well. Download the recent tail separately with
`MODIS_NRT`, `VIIRS_NOAA20_NRT` and `VIIRS_NOAA21_NRT`, from `2026-05-01` to
`2026-11-13`. An SP-only S-NPP file may end months before its delivery shutdown.

The downloader validates response columns, retries failures without logging
secret-bearing URLs or response bodies, and publishes a CSV only after all
windows succeed. A valid header-only CSV represents no detections; a failed
request must not be treated as zero fire activity. Explicit transaction-limit
responses and HTTP 429 wait in one-minute steps (at most eleven waits per
chunk), retaining earlier chunks from the year. Other failures retain the
existing four-attempt retry limit. Exhausted waits still fail safely without
publishing a partial CSV or logging response bodies.

## 2. Normalize

```bash
uv run python -m pipeline.ingest.normalize --region rio_negro data/raw/rio_negro/*.csv
uv run pytest pipeline/ingest
```

What it does: detects MODIS vs VIIRS by columns, maps satellite codes (`T/A/N/N20/N21`...) to `terra/aqua/snpp/noaa20/noaa21`, converts confidence to `low/nominal/high` (MODIS <30 / 30–79 / ≥80), keeps `type` 0 or missing (drops volcanoes, gas flares, offshore), drops low confidence, clips to bbox, removes NRT rows where standard data exists, adds H3 res 7, writes both Parquet files, prints counts per year × satellite.

The CLI expands CSV wildcards itself, including on Windows PowerShell, and
reads each matching path once even if arguments overlap.

**Sanity check the printout:** S-NPP should start in 2012, Aqua mid-2002, NOAA-20 2018, and VIIRS counts should be several times MODIS. If a satellite code is unknown, it stops and tells you; pass `--satellite`.

### Persistent thermal source screen

After ordinary filtering, SP/NRT deduplication and H3 assignment, normalization
screens H3 resolution-9 sites (about 0.1 km²). A site must have at least 20
distinct detection days on one satellite, in at least four months spanning at
least 120 days, in at least two distinct calendar years. Satellite counts are
never added to reach the threshold. The common site/year mask then applies to
every satellite, but only in qualifying years. Other years and locations in the
same resolution-7 output hex remain. A wider-event safeguard preserves a point
if at least three adjacent resolution-7 hexes are active within one day either
side, counting unique neighbor cells, not detections.

This is a conservative, retrospective **inferred persistent-source screen**,
not a confirmed industrial mask. Fixed thresholds prioritize specificity;
intermittent sources, shifted pixels and ambiguous recurrent vegetation fires
can remain. Detection frequency depends on overpass availability. FRP and
nighttime share support the audit but are not hardcoded classification cutoffs.
The rule uses the historical archive for quality control, not calibration
fitting or a forward prediction; no threshold was optimized against P3's
held-out calibration error. A future location-validated industrial mask would
be stronger evidence. Do not claim that this guarantees every real fire stays.

`persistence_evidence.csv` records site/satellite/year counts and decisions
outside the frozen output tables. `--no-persistence-filter` reproduces the
baseline for review only. Retained points always generate `hex_day.parquet`.
For reproducible diagnostics (run against a saved unfiltered points file):

```bash
uv run python -m pipeline.ingest.audit_persistence --points data/raw/rio_negro-pre-persistence/points.parquet --suspects data/processed/rio_negro/suspect_persistent_hexes.csv --out data/raw/rio_negro-persistence-audit
```

NASA documents that the FIRMS layer includes non-vegetation thermal anomalies
and that static sources can be labeled type 0; this supports investigating the
failure mode but does not confirm our individual sites or thresholds:
[FIRMS static thermal anomalies](https://firms.modaps.eosdis.nasa.gov/descriptions/Static_Thermal_Anomalies_Mask.html).

## 3. Share

Parquet over ~50 MB goes to the team Drive folder, not git. Tell P3 and P4 in `PLAN.md` when Río Negro lands.
