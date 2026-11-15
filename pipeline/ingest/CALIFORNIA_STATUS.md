# California delivery verification ? 15 November 2026

Verified against main efb661b (PR #24). The local P2 files and the files committed by P3 have identical SHA-256 hashes and row counts:

| File | Rows | Bytes | SHA-256 |
|---|---:|---:|---|
| hex_day.parquet | 521,339 | 3,271,461 | dd2b3a1cb86ce695f3c784df8c79b5610170d227ffca80d0ae5b0bddd7c20872 |
| points.parquet | 2,049,536 | 38,511,137 | cd8f88c933b00a9761dfd920b2c172cedccdd299db33ba8515dbe063481da20d |

## Persistence screen: already applied

Rebuilt the normalized baseline in memory from every local raw California CSV, applied `screen_persistence` with the same constants as Rio Negro, sorted points and aggregated hex_day. Both resulting DataFrames exactly equal the published tables (including dtypes). No replacement is needed; P3's existing calibration/calendar/history remain paired with the correct inputs.

| Measure | Before | After |
|---|---:|---:|
| Points | 2,050,564 | 2,049,536 |
| Hex/day/satellite rows | 522,297 | 521,339 |
| Unique res-7 hexes | 49,314 | 49,314 |

Removed 1,028 points (0.05013%) across 10 output hexes. Rule: res-9 sites with >=20 days on one satellite, >=4 months and >=120-day span, in >=2 years; mask all satellites only in qualifying site-years; protect detections with >=3 active adjacent res-7 cells within +/-1 day. This is conservative inferred-source screening, not an exhaustive industrial mask.

P3's 270 history hexes above 50 harmonized cell-days are reproduced. That whole-record count alone is not an industrial classifier. The three example cells still have suspicious compact recurrent, low-FRP, predominantly nighttime activity:

| Example res-7 cell | Retained points | Distinct days | Years | Max days/satellite/year | Night share | FRP median / p90 (MW) |
|---|---:|---:|---:|---:|---:|---:|
| 8729a1128ffffff (~34.32, -118.52) | 585 | 349 | 17 | 79 | 92.82% | 0.820 / 8.976 |
| 8729a5658ffffff (~33.91, -118.41) | 326 | 277 | 15 | 42 | 97.55% | 1.095 / 1.835 |
| 8729a5602ffffff (~33.79, -118.24) | 358 | 293 | 15 | 47 | 98.60% | 0.925 / 1.366 |

Checking the saved site/year evidence confirms none of these three cells' retained points meets the qualifying recurrent site/year mask; their retention is not caused by the wider-event safeguard. These are consistent with residual static sources, but landfill/refinery identity is not confirmed here. The res-9 recurrence threshold, qualifying-year restriction and wider-event protection deliberately leave some ambiguous sources. Do not claim all industrial sources were removed. No threshold change or res-7 blacklist was introduced under the delivery deadline.

## Coverage and sandbox handoff

All 54 expected annual source/year files are present, plus MODIS/NOAA-20/NOAA-21 NRT through 14 November. S-NPP SP ends 31 July 2026; this is the SP tail gap, not evidence of zero August-November fire. P3's coverage-aware handover handles it. Exact duplicate points: zero; points aggregate exactly to hex_day.

Joined P3's 49,314-row history into the existing 1,027-cell California sandbox grid: 736 matched, 291 absent rows defaulted to 0/null, and 74 matched zero-count rows retain real recency. History SHA-256: `8741df6c0e4103e3f975675360cdb7cb357120f0dde3c531a2df04dc35fe21fd`. Schema validation and repeated-join equality pass. `is_mock=true` because terrain remains mock.

Output: `data/processed/california/sandbox_grid.json` and `sandbox_grid.provenance.json` in David's original checkout and the `fire-calendar-p2-regions` worktree. Data is not added to this PR per the human's no-data-commits instruction; transfer the grid pair to P4/P6 via the human.

Validation: 127 Python tests, Ruff and frontend production build pass. Frontend build's automatic fallback updates were reverted in this P2 branch; P5 owns publishing them.
