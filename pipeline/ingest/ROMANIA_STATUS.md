# Romania ingestion handoff - 15 November 2026

Ready for P3/P4. Generated and validated at 2026-11-15T11:57:50 local (Europe/Bucharest), before the 12:30 cut-off. All 54 annual files plus three NRT files are present; no partial files. The 57 CSVs contain 822,093 raw rows; every observation falls inside its requested file date window. Snapshot requests end 14 November 2026.

## Outputs

| File | Rows | Bytes | SHA-256 |
|---|---:|---:|---|
| points.parquet | 712,757 | 13,826,357 | 023420bf5baf59406f252b4d4d979e8e2e7a26921f27705bd7e610fd95ed605d |
| hex_day.parquet | 486,078 | 2,777,658 | f3638b10737be0e04db90a891d439b4ac30bd471af78cfd8e2a204b49d9fe6ae |

The pair is in `data/processed/romania/` in both the original fire-calendar checkout and the fire-calendar-p2-regions worktree. Transfer `data/raw/romania-p2-handoff.zip` to P3; extract its `romania/` directory under `data/processed/`. The bundle includes both Parquet files, hashes, validation results, raw-source hashes, this report and the annual count table. No raw CSVs, API keys or data files are committed by P2.

## Filters and validation

Same unchanged settings as Rio Negro and California: keep type 0/null, remove low confidence, clip to region bbox, deduplicate rows, prefer SP over NRT for each satellite/day, assign H3 res 7. The persistence screen uses res-9 sites with >=20 detection days on one satellite, >=4 months, >=120-day span in >=2 years; applies across satellites only in qualifying site-years; protects points with >=3 adjacent active res-7 cells within +/-1 day. Frozen columns remain unchanged.

| Measure | Before persistence | After persistence |
|---|---:|---:|
| Points | 713,578 | 712,757 |
| Hex/day/satellite rows | 486,562 | 486,078 |
| Unique res-7 hexes | 53,346 | 53,346 |

Removed 821 points (0.11505%) across 5 output hexes. No output hex disappears completely. This remains an inferred persistent-source screen, not confirmation that all industrial sources were removed.

Checks pass: exact aggregation of points to hex_day including n_points and frp_sum; zero exact duplicate points; expected columns; allowed confidence/type values; finite coordinates/FRP; valid time strings; bbox membership; all five satellites. Raw input hashes are recorded in source_manifest.json.

## Observed coverage

| Satellite | First detection | Last detection | Points |
|---|---|---|---:|
| aqua | 2002-07-04 | 2026-11-13 | 104,383 |
| noaa20 | 2018-04-01 | 2026-11-14 | 162,698 |
| noaa21 | 2024-01-01 | 2026-11-14 | 35,751 |
| snpp | 2012-01-23 | 2026-07-31 | 317,532 |
| terra | 2000-11-01 | 2026-11-01 | 92,393 |

- S-NPP ends 2026-07-31: SP tail gap, not zero fire in August-November.
- NOAA-20 and NOAA-21 reach 2026-11-14; retain per-satellite is_nrt provenance.
- Terra last raw and retained detection is 2026-11-01; Aqua last detection is 2026-11-13. Requested downloads cover through 2026-11-14.
- NOAA-21 SP observations begin 2024-01-01 in the supplied archive, earlier than the README start date; not silently discarded.

In complete overlap years 2012-2025, S-NPP point counts are 2.97-4.21 times combined Terra/Aqua point counts, consistent with the expected resolution effect. This is a raw-detection sanity check, not calibration or burned area.

Retained NRT starts: Aqua/Terra 2026-09-01, NOAA-20 2026-08-01, NOAA-21 2026-05-09. P3 should use points.parquet provenance and the coverage-aware NOAA handover after the last complete S-NPP month.

## Points per year and satellite

| year | aqua | noaa20 | noaa21 | snpp | terra |
|---|---|---|---|---|---|
| 2000 | 0 | 0 | 0 | 0 | 104 |
| 2001 | 0 | 0 | 0 | 0 | 9588 |
| 2002 | 942 | 0 | 0 | 0 | 2568 |
| 2003 | 2488 | 0 | 0 | 0 | 1859 |
| 2004 | 4662 | 0 | 0 | 0 | 4534 |
| 2005 | 5505 | 0 | 0 | 0 | 4935 |
| 2006 | 5312 | 0 | 0 | 0 | 4555 |
| 2007 | 5071 | 0 | 0 | 0 | 3884 |
| 2008 | 7168 | 0 | 0 | 0 | 7401 |
| 2009 | 4328 | 0 | 0 | 0 | 3839 |
| 2010 | 4198 | 0 | 0 | 0 | 2564 |
| 2011 | 9007 | 0 | 0 | 0 | 6018 |
| 2012 | 7599 | 0 | 0 | 37295 | 4972 |
| 2013 | 3309 | 0 | 0 | 21775 | 2632 |
| 2014 | 4806 | 0 | 0 | 26907 | 3900 |
| 2015 | 3633 | 0 | 0 | 23003 | 2937 |
| 2016 | 3796 | 0 | 0 | 27740 | 4040 |
| 2017 | 4953 | 0 | 0 | 30627 | 4023 |
| 2018 | 4532 | 24034 | 0 | 24500 | 3231 |
| 2019 | 6270 | 35235 | 0 | 35098 | 4251 |
| 2020 | 3162 | 19645 | 0 | 19801 | 2261 |
| 2021 | 2618 | 16521 | 0 | 15978 | 2072 |
| 2022 | 3724 | 21114 | 0 | 20427 | 2155 |
| 2023 | 1245 | 8035 | 0 | 8170 | 940 |
| 2024 | 1864 | 11611 | 10803 | 10171 | 1008 |
| 2025 | 1984 | 12605 | 11956 | 12319 | 944 |
| 2026 | 2207 | 13898 | 12992 | 3721 | 1178 |

## Next handoff

P3: produce matching Romania calibration.json, calendar.json and hex_fire_history.parquet using the binding method and observed S-NPP cut-off. P4/P5: publish real regional outputs once P3 supplies them; these input tables alone do not replace the mock calendar. Romania sandbox history/terrain remains pending P3 history. Rio Negro and California real terrain are already on main from P3; no duplicate terrain run was made.

Validation on main 8ea24c3: 137 Python tests, Ruff and the frontend production build pass. No ingestion code or filter thresholds were changed for this delivery.
