# pipeline/sandbox_inputs/ (owner: P2, with P3's fire history)

Builds `data/processed/<region>/sandbox_grid.json` (schema: `contracts/sandbox_grid.schema.json`) for P6's Tactical Containment Sandbox. One cell per H3 res-7 hex. No extra data sources beyond ESA WorldCover and Open-Meteo (TEAM_PLAN §0.3).

| Field | How |
|---|---|
| `h3`, `lat`, `lon` | hex id and its center (`h3.cell_to_latlng`) |
| `landcover` | ESA WorldCover 10 m, majority class per hex |
| `asset_type` | deterministic: 10 → `forest`, 20/30 → `grassland`, 40 → `farm`, 50 → `village`, 80 → `river`, anything else → `none` |
| `burnable` | `landcover` in {10, 20, 30, 40, 50}; water (80) never burns |
| `elevation_m` | Open-Meteo elevation API (no key) at the hex center, batched (many coordinates per call) |
| `slope_deg` | max over the 6 neighbors of `atan(abs(Δelevation) / center distance)`, in degrees |
| `burn_count`, `years_since_last_fire` | join P3's `hex_fire_history.parquet` on `h3`; hexes not in it get `0` and `null` |

Scope: don't build the whole province. A sub-area of ~1,000–5,000 hexes around each demo area (Choele Choel for Río Negro, a Carpathian valley for Romania, a chaparral area for California) is enough.

Until P3's history exists, use `contracts/mocks/<region>/hex_fire_history.sample.csv` to test the join.

Honesty note for the pitch: hotspot history is a **proxy** for fuel depletion, not a fuel map; absence of hotspots can mean cropland, water or cloud. Land cover masks the obvious cases.

## Rerunnable fire-history join

```bash
uv run python -m pipeline.sandbox_inputs.join_history --region rio_negro --grid contracts/mocks/rio_negro/sandbox_grid.json --history data/processed/rio_negro/hex_fire_history.parquet --out data/processed/rio_negro/sandbox_grid.json
```

Replace `--grid` with a real terrain/land-cover grid when available. The current
Río Negro run uses 1,027 mock terrain cells and P3's replacement history from
PR #21, computed on persistence-screened inputs: 628 matches and 399 missing
cells. The output stays `is_mock: true`;
this unblocks join/UI integration without claiming that the terrain is real.
Real WorldCover/elevation preparation remains pending.

The left join requires unique valid res-7 H3 IDs and finite non-negative values.
A missing history row gets `burn_count=0` and `years_since_last_fire=null`.
An existing row with zero burn count retains its recency (28 such matches in
this grid; 3,050 in the supplied history). Every previous history value is
overwritten, so the exact command can be rerun when P3 sends replacement history.
The base grid is not changed and any mock input keeps the output marked mock.
The output is validated against the frozen sandbox schema before atomic write.

`sandbox_grid.provenance.json` records input hashes, row/match counts and mock
state separately from the frozen schema. The current history has SHA-256
`69f306f3e267ca187222e078d0b99ba59b6650d2a99dc78047c61833bb05b7a3`.
The replacement contains 27,405 hexes and 130,382.08 harmonized cell-days.
P2 reproduced its history, calendar and calibration from the screened input
tables before joining. The refresh changes history in 474 grid cells; the
grid's burn_count sum changes from 6,020.07 to 5,905.03. No terrain fields
change. History is now current; real terrain preparation remains pending.

## California history (15 November)

Use the same join command with `--region california` and California paths.
PR #24 history has 49,314 rows; the 1,027-cell base grid has 736 matches and
291 absent-history defaults. All 74 matched zero-count cells keep their real
recency. Output remains `is_mock: true` until terrain is replaced. See
`pipeline/ingest/CALIFORNIA_STATUS.md` for input hashes and delivery details.

## Real terrain grid (`terrain.py`, written by P3 on 15 Nov 2026 with both humans' approval)

```bash
uv run --with rasterio python -m pipeline.sandbox_inputs.terrain --region rio_negro
uv run --with rasterio python -m pipeline.sandbox_inputs.terrain --region california
```

`rasterio` is not in `pyproject.toml` (root file, P1), so it is added for the run only; the tests do not need it. Each run takes about a minute (most of it waiting for Open-Meteo's rate limit) and writes `data/processed/<region>/sandbox_grid.json` plus `sandbox_grid.provenance.json`. It replaces the mock base grid: the output is `is_mock: false`, and `join_history.py` is called unchanged for the fire history.

| Step | Source and rule |
|---|---|
| Cells | the 1,027 res-7 hexes within 18 rings of the region centre in `contracts/regions.json` (same footprint as the mock grid); `--center LAT LON` and `--rings` move or resize it |
| Land cover | ESA WorldCover 10 m 2021 v200 (public S3 bucket), every 8th pixel = an 80 m systematic sample, about 800 samples per hex |
| Hex class | **built-up (50) if it covers at least 5 % of the hex, else water (80) if at least 5 %, else the majority class** |
| Elevation | Open-Meteo elevation API at the hex centre, 100 points per call, retry on HTTP 429 |
| Slope | max over the neighbours that are inside the grid of `atan(abs(Δelevation) / centre distance)` |
| Fire history | P3's `hex_fire_history.parquet` through `join_history` |

Why the hex class is not a plain majority: a res-7 hex is about 5 km², far larger than a river or a village. With a plain majority Río Negro has 0 water hexes and 1 built-up hex, and California 3 and 2, so the sandbox would have no natural barriers and nothing to protect. At 5 % the two arms of the Río Negro around Choele Choel come out as two nearly continuous chains (32 and 27 hexes). The cost: a hex classed as river is wholly non-burnable although water covers only part of it, so barriers are somewhat wider than in reality. This deviates from the wording "majority class" in `contracts/sandbox_grid.schema.json` (description only; the schema validates) and is flagged to P1 in `PLAN.md`.

Results of the runs of 15 Nov 2026 (all numbers from the provenance files):

| | Río Negro | California |
|---|---|---|
| Centre | 39.30 S, 65.60 W (Choele Choel valley) | 37.20 N, 119.50 W (Sierra Nevada foothills east of Fresno) |
| Forest / grassland / farm | 4 / 877 / 68 | 624 / 331 / 5 |
| Village / river / none | 13 / 65 / 0 | 26 / 36 / 5 |
| Elevation | 108–231 m | 84–3,097 m |
| Steepest slope | 1.9° | 20.8° |
| Hexes with fire history | 628 of 1,027 | 736 of 1,027 |

Limits: land cover is the 2021 map, so recent burns show as whatever regrew or remained; "village" means any built-up hex, including the edge of a city; lakes and reservoirs are classed `river`; slope between hex centres 2.4 km apart smooths out everything smaller, so Río Negro is practically flat in the sandbox. Romania has no grid yet because it has no fire history.
