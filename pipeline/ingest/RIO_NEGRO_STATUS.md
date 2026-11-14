# P2 Rio Negro ingestion status - 14 November 2026

## Coverage and downloads

All 54 requested annual SP CSVs exist and parse with valid normalization columns,
satellite codes and dates inside their requested windows: MODIS 2000-2026 (27),
S-NPP 2012-2026 (15), NOAA-20 2018-2026 (9), NOAA-21 2024-2026 (3).
No missing or failed annual files required re-download. There is also a five-day
MODIS 2005 file; overlapping detections were deduplicated.

Annual names follow `api_<SOURCE>_<YEAR>-01-01_<YEAR>-12-31.csv`.
The existing 2026 names describe the requested range, not full-year coverage.
The full local filename/size/date inventory is `data/raw/rio_negro/inventory.csv.txt`.

Downloaded the requested 2026-05-01 through 2026-11-13 NRT windows:
- `api_MODIS_NRT_2026-05-01_2026-11-13.csv`: 246 raw rows.
- `api_VIIRS_NOAA20_NRT_2026-05-01_2026-11-13.csv`: 2,290 raw rows.
- `api_VIIRS_NOAA21_NRT_2026-05-01_2026-11-13.csv`: 3,946 raw rows.

FIRMS availability was checked directly: MODIS SP ends 2026-08-31;
S-NPP/NOAA-20/NOAA-21 SP end 2026-07-31. MODIS NRT begins 2026-09-01,
NOAA-20 NRT begins 2026-08-01; NOAA-21 NRT includes the requested overlap.
Thus S-NPP's November shutdown cannot be verified from this SP-only archive.
Do not interpret its missing August-November tail as zero activity.

## Processed outputs (local, not uploaded to Drive)

Both files are available in `data/processed/rio_negro/` in David's original
`fire-calendar` checkout and the `fire-calendar-p2-status` worktree:
- `points.parquet`: 317,938 rows; 6,356,324 bytes.
- `hex_day.parquet`: 149,205 rows; 1,081,746 bytes.

No files under `data/` are included in this commit. P3 can use `hex_day.parquet`
for harmonization; P4 can use both tables. Cross-laptop transfer remains pending.

Earliest retained observations: Terra 2000-11-08, Aqua 2002-07-04,
S-NPP 2012-01-20, NOAA-20 2018-04-01, NOAA-21 2024-01-01.
The NOAA-21 date is earlier than the README's January 17; FIRMS availability
lists SP from 2023-03-01, while January 17, 2024 is its NRT start.
No records were discarded merely to match the documentation date.
Latest observations: Aqua 2026-11-12; Terra/NOAA-20/NOAA-21 2026-11-13;
S-NPP 2026-07-31. S-NPP / combined MODIS detection ratios for 2012-2025
range from 3.32 to 5.11 (individual sensor counts, not added together).

Earliest retained NRT dates: Terra 2026-09-01, Aqua 2026-09-02,
NOAA-20 2026-08-01, NOAA-21 2026-05-06. P3 should use actual provenance
from `points.parquet`; there is no single common SP/NRT cutoff across satellites.

## Retained detections per year and satellite

| Year | Terra | Aqua | S-NPP | NOAA-20 | NOAA-21 |
|---|---:|---:|---:|---:|---:|
| 2000 | 989 | 0 | 0 | 0 | 0 |
| 2001 | 6,371 | 0 | 0 | 0 | 0 |
| 2002 | 2,362 | 878 | 0 | 0 | 0 |
| 2003 | 1,804 | 3,083 | 0 | 0 | 0 |
| 2004 | 636 | 972 | 0 | 0 | 0 |
| 2005 | 923 | 1,863 | 0 | 0 | 0 |
| 2006 | 613 | 989 | 0 | 0 | 0 |
| 2007 | 426 | 808 | 0 | 0 | 0 |
| 2008 | 439 | 777 | 0 | 0 | 0 |
| 2009 | 305 | 544 | 0 | 0 | 0 |
| 2010 | 204 | 360 | 0 | 0 | 0 |
| 2011 | 424 | 627 | 0 | 0 | 0 |
| 2012 | 364 | 567 | 3,091 | 0 | 0 |
| 2013 | 328 | 661 | 4,336 | 0 | 0 |
| 2014 | 488 | 752 | 5,704 | 0 | 0 |
| 2015 | 1,380 | 2,450 | 14,281 | 0 | 0 |
| 2016 | 2,103 | 3,361 | 24,451 | 0 | 0 |
| 2017 | 3,310 | 4,150 | 30,248 | 0 | 0 |
| 2018 | 1,482 | 2,256 | 13,491 | 3,613 | 0 |
| 2019 | 1,111 | 1,732 | 13,929 | 11,020 | 0 |
| 2020 | 889 | 1,272 | 10,607 | 10,038 | 0 |
| 2021 | 605 | 1,028 | 7,482 | 7,589 | 0 |
| 2022 | 508 | 1,023 | 7,233 | 7,640 | 0 |
| 2023 | 648 | 1,016 | 7,187 | 6,679 | 0 |
| 2024 | 418 | 718 | 5,802 | 6,082 | 4,878 |
| 2025 | 814 | 1,660 | 12,229 | 11,959 | 11,468 |
| 2026 | 240 | 409 | 2,726 | 5,096 | 4,939 |

## California background queue

Started a hidden PowerShell process (PID 16732) from the P2 worktree.
The sequential queue covers MODIS 2000-2026, S-NPP 2012-2026,
NOAA-20 2018-2026 and NOAA-21 2024-2026, using `--end 2026-11-13` for 2026.
MODIS 2000 completed and 2001 was in progress at this handoff.
Local runner: `data/raw/california-download.ps1`; progress/error logs:
`data/raw/california-download.log` and `.err`; PID file: `.pid`.
Keep the worktree and machine available until the queue finishes. The runner
records failed years and continues; inspect failures and re-run only those years.

## Validation and code fixes

- Normalization command from the README completed successfully on all 58 CSVs.
- Output aggregation equals a fresh grouping of points; no duplicate points,
  low-confidence records, disallowed fire types, invalid/non-res-7 H3 cells,
  or NRT records sharing a satellite-day with retained SP observations.
- 92 Python tests pass using a task-local temporary directory because the
  machine's default pytest temp directory has access restrictions.
- `uv run ruff check .` and `npm.cmd run build` pass.
- Fixed native Windows wildcard expansion and UTF-8 reads; downloader failures
  redact key-bearing URLs/bodies, reject malformed CSV responses, retry safely,
  and write completed CSVs atomically. Regression tests cover these failures
  and the PowerShell-style literal wildcard.

The original checkout has an unrelated unfinished merge in PLAN.md. Work was
isolated on `feat/p2-rio-negro-status` from `origin/main` at `350e533`.

Publishing: commit 9d83e55 pushed on feat/p2-rio-negro-status. PR creation remains pending: GitHub connector returned 403 (Resource not accessible by integration); automatic review blocked a local-credential API fallback; browser control was not approved. Open https://github.com/neamturazvan/fire-calendar/compare/main...feat/p2-rio-negro-status?expand=1 to create the PR.
