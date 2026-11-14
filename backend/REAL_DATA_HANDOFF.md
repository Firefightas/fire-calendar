# P4 verification of the P2 Rio Negro handoff

Verified on 14 November 2026 against main at 3b9ff6c.
Sources: the supplied Parquet files, contracts/tables.md, and
pipeline/ingest/RIO_NEGRO_STATUS.md (P2 provenance/coverage notes).

## Received inputs

| File | Rows | Bytes | Observed dates |
| --- | ---: | ---: | --- |
| points.parquet | 317,938 | 6,356,324 | 2000-11-08 to 2026-11-13 |
| hex_day.parquet | 149,205 | 1,081,746 | 2000-11-08 to 2026-11-13 |

Both tables contain 27,405 unique H3 cells. All points lie within the Rio Negro
region bbox; none lie within the California or Romania bbox.

The files were received directly under data/processed/. The human explicitly
authorized organizing them under data/processed/rio_negro/; both files were moved
there without overwriting targets and with SHA-256 preserved. Both remain
gitignored. Normal production lookup now selects these real inputs.

SHA-256:

- hex_day.parquet: bc45fd6d833890fe59dc593e65e1bd1d8775e9d947a3dc5a0d50a0939cdd35b9
- points.parquet: f80ad73b399e9db063326650c0cdde03671a61c5867f3a8f231dc000f8305f35

## Checks completed

All required columns and Parquet types match the tabular contracts (Arrow
large_string represents contract strings). Checks found zero invalid required
values, invalid acquisition times, negative/nonfinite FRP values, invalid sensor
mappings, invalid/non-resolution-7 H3 cells, coordinate-to-H3 mismatches, duplicate
hex/day/satellite groups, or point-to-hex count/FRP aggregation mismatches.

Only nominal/high confidence is retained. Fire type is 0 or null. No NRT row shares
a retained SP satellite-day. There are 313,191 SP points and 4,747 NRT points.
Both the 2012-2020 fit window and 2021-2025 held-out window contain MODIS and S-NPP.

A TestClient hotspot CSV request using normal production lookup returned HTTP
200, X-Data-Source: processed, and 22 records for 2003-01, matching an independent
DuckDB date/bbox query. No resolver override was used in this final verification.
Health and the regional calendar correctly remain labeled as mock until P3's real
JSON outputs are available.

## Coverage constraints requiring P3

S-NPP ends 2026-07-31. August-October have no S-NPP rows, while NOAA-20 has 438, 622
and 237 cell-days respectively and NOAA-21 also has observations. These are missing
S-NPP coverage months, not evidence of zero fire activity. The current main-branch epoch rules
use S-NPP through October 2026. P3's newly pushed feat/p3-rio-negro-run branch
handles the coverage gap, but its real JSON outputs are withheld pending P1's
calibration-method decision. P4's polygon source selection must also follow the
approved regional reference when its coverage ends before the nominal epoch.

There are 114 NOAA-21 points before 2024-01-17. P2's provenance note explains that
January 17 is its NRT start, while the supplied SP archive starts earlier. Retain
these observations; the documentation-date discrepancy is not a filtering error.

SP/NRT cutoffs differ by satellite. Earliest retained NRT is 2026-05-06; standard
observations extend to 2026-08-28. Use points.parquet provenance and P2's documented
per-satellite windows when interpreting recent months.

## Next dependencies

P3's real calendar.json and calibration.json are absent both from this checkout
and the newly pushed P3 branch. P3 has requested P1's decision on retaining the
frozen median-ratio method versus a different calibration requiring new contract
fields. Full real-data calendar/anomaly/CSV verification remains pending that
decision and the resulting outputs. No calibration factors, validation scores or anomaly values
were invented, and no mock JSON was relabeled as real.

Placement and real hotspot export verification are complete. After P3 outputs
arrive, compare regional/polygon/calendar CSV results and provenance, then
coordinate distribution of the gitignored Parquet files to Render with P1.

## Repository checks

105 Python tests passed. Ruff and the frontend production build passed. These
checks establish repository compatibility; they are separate from P3's held-out
scientific validation, which is still pending.
