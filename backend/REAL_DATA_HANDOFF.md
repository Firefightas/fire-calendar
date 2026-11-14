# P4 real Rio Negro integration verification

Verified on 14 November 2026 using P2's supplied inputs and P3's real JSON outputs
from PR #15. P1 approved retaining the median-ratio method and frozen contracts in
commit 151ecfc.

## Inputs and placement

| File | Rows | Bytes | Observed dates |
| --- | ---: | ---: | --- |
| points.parquet | 317,938 | 6,356,324 | 2000-11-08 to 2026-11-13 |
| hex_day.parquet | 149,205 | 1,081,746 | 2000-11-08 to 2026-11-13 |

Both tables contain 27,405 unique H3 cells and match P2's handoff counts/sizes.
All points lie within the Rio Negro bbox. The human explicitly authorized moving
the received root-level files into data/processed/rio_negro/. Both hashes were
preserved, no existing targets were overwritten, and the Parquet inputs remain
gitignored and uncommitted.

- points.parquet SHA-256: f80ad73b399e9db063326650c0cdde03671a61c5867f3a8f231dc000f8305f35
- hex_day.parquet SHA-256: bc45fd6d833890fe59dc593e65e1bd1d8775e9d947a3dc5a0d50a0939cdd35b9

## Ingestion integrity

Required columns/types match contracts/tables.md. Checks found zero invalid
required values, invalid acquisition times, negative/nonfinite FRP values, invalid
sensor mappings, invalid/non-resolution-7 H3 cells, coordinate-to-H3 mismatches,
duplicate hex/day/satellite groups, or point-to-hex count/FRP mismatches.

Confidence is nominal/high and fire type is 0 or null. There are 313,191 SP and
4,747 NRT points, with no retained NRT row sharing an SP satellite-day. Both the
2012-2020 fit window and 2021-2025 held-out window contain MODIS and S-NPP.

P2 explains the 114 NOAA-21 points before 2024-01-17: that date is its NRT start,
while the supplied SP archive starts earlier. These observations are retained.

## Calendar integration and source fix

P3's real calendar and calibration have is_mock=false. S-NPP archive coverage ends
in July 2026; P3 hands over to NOAA-20 from August instead of reporting the missing
S-NPP tail as zero activity. The backend previously forced S-NPP through October,
which incorrectly produced zero polygon values in these months.

The backend now respects an explicit regional NOAA-20/21 reference before the
nominal handover. It uses P3's supplied conversion factors and provenance; it does
not infer availability from a quiet polygon. Three regression cases for August,
September and October reproduced the failure before the fix and pass afterward.
Calibration math and contracts are unchanged.

Normal backend file lookup and API verification passed:

- Region calendar/calibration GET responses exactly match P3's real files.
- Health stops listing Rio Negro as mock; California and Romania remain mock.
- The 313-month area calendar validates against the frozen schema and is real.
- Raw monthly counts match independent DuckDB queries; source and NRT flags match
  P3 for every month. VIIRS/NOAA converted values and uncertainty bounds check out.
- Baseline medians/IQR/anomaly scores match independent NumPy calculations.
- November 2026's month-to-date baseline independently matches the November 13
  cutoff across baseline years.
- Date-filtered results match the corresponding full-history rows.
- The August-November calendar CSV has four rows matching the API and processed
  provenance.
- A January 2003 hotspot export returns 22 real rows matching independent DuckDB
  filtering, through normal production lookup with no resolver override.

A whole-region bbox polygon selects H3 cell centers, while P3's regional file uses
all supplied region-clipped observations. Edge cells can therefore produce small
differences (September polygon NOAA-20 raw count 621 versus regional 622). This is
consistent with the approved polygon contract and P5's separate regional export.

P3 reports held-out test_mae=102.01 cell-days and
test_mape=0.354 for the P1-approved binding method. These are P3's
scientific validation results, not new P4 estimates. The known large-fire
overstatement limitation and alternative-method comparison remain in P3's
diagnostics and method note.

## Deployment handoff

Render now serves the real Rio Negro regional JSON, but the verified live
drawn-area response still has is_mock=true and uses the sample archive. The input
Parquet files are not distributed by Git. The human confirmed P1 will handle
their upload to data/processed/rio_negro/ on Render.

Deploy this backend fix and provide both real Parquet files before verifying
non-mock drawn-area calendars and hotspot exports on Render. Sandbox grids still
depend on P2/P6 and are outside this calendar integration work.

## Validation

All 110 repository Python tests and Ruff pass after the source fix. The frontend
production build passed on the starting integrated main; CI also builds against
the newly committed P3 JSON. P5 owns refreshing committed frontend fallback data
and the real-data UI review. No Parquet inputs, credentials or generated calibration
values are committed by P4.
