# pipeline/harmonize/ (owner: P3)

Turns `hex_day.parquet` into `calendar.json`, `calibration.json` and `hex_fire_history.parquet` (shapes in `contracts/`). This is the scientific core and decides our Validity and Relevance scores. Spec: `TEAM_PLAN.md` §2.

```
hex_day.parquet ─▶ monthly cell-days per satellite ─▶ factors (fit 2012–2020 only) ─▶ harmonized series
                                                                                   ─▶ median / IQR / anomaly_z
                                                                                   ─▶ calendar.json, calibration.json
                └─▶ per-hex harmonized history ─▶ hex_fire_history.parquet (to P2 for the sandbox grid)
```

## Method (binding)

1. **Monthly cell-days** (`contracts/tables.md`): per satellite = rows of `hex_day`; MODIS Terra+Aqua combined = distinct `(h3, date)` with `sensor = 'modis'`.
2. **Reference scale:** `SNPP_VIIRS_EQ` (S-NPP VIIRS, Feb 2012 → Oct 2026).
3. **Four epochs** (TEAM_PLAN §2.2) and the factors in `calibration.json`:

   | Epoch | Months | Harmonized value | `source` |
   |---|---|---|---|
   | Terra-only MODIS | Nov 2000 – Jun 2002 | `terra × terra_only_factor × monthly_factors[m]` | `modis_terra` |
   | Terra+Aqua MODIS | Jul 2002 – Jan 2012 | `modis × monthly_factors[m]` | `modis_terra_aqua` |
   | S-NPP overlap | Feb 2012 – Oct 2026 | S-NPP as observed | `viirs_snpp` |
   | Post-S-NPP | Nov 2026 → | `noaa20 × noaa20_factor` (NOAA-21 if NOAA-20 is missing) | `viirs_noaa20` / `viirs_noaa21` |

   - `monthly_factors[m] = median over 2012–2020 of (S-NPP / MODIS combined)` for calendar month m, with `cv` and `n_years`.
   - `terra_only_factor` = median over overlap months of (Terra+Aqua combined / Terra-only), i.e. what Terra alone misses.
   - `noaa20_factor`, `noaa21_factor` = median of (S-NPP / NOAA-xx) over their overlaps (expected ≈ 1.0, measure it).
   - Orbit check: also compute Aqua-only vs. S-NPP and Terra-only vs. S-NPP factors (afternoon vs. morning) and put them in `diagnostics`.
4. **Never fit across 2000–2026.** Fit 2012–2020 only.
5. **Validate** on 2021–2025: predict S-NPP from MODIS with the fitted factors → `test_mae` (required), `test_mape`, plus `raw_step_ratio` / `harmonized_step_ratio` around 2012.
6. **IQR Anomaly Score:** per calendar month over complete years 2001–2025 (`baseline_years`), `anomaly_z = (H − median) / max(IQR, 1.0)`. Never call it sigma.
7. **Uncertainty:** `unc_low/unc_high` widened by the factor's `cv` for estimated months; Poisson-style interval otherwise.
8. **Sparse fallback:** a month with too few fit-year ratios uses a pooled factor (`fallback: true`). For drawn polygons (backend, P4): < 5 cell-days in month m during the overlap → region factor + wider uncertainty.
9. **Fire history for the sandbox:** per hex, `burn_count` (harmonized cell-days, MODIS-era hexes scaled by the same factors) and `years_since_last_fire` (to the latest data date; null if never) → `data/processed/<region>/hex_fire_history.parquet`.

`contracts/mocks/generate_mocks.py` implements a simplified version of steps 3–7 on fake numbers: a good reference for output shapes.

## Run

```bash
uv run python -m pipeline.harmonize.run --region rio_negro                          # needs P2's hex_day.parquet
uv run python -m pipeline.harmonize.run --region rio_negro --synthetic --out <dir>  # known-ratio test input, is_mock: true
uv run pytest            # validates the outputs against contracts automatically
```

`run.py` writes `calendar.json`, `calibration.json` and `hex_fire_history.parquet`. `--synthetic` refuses to write into `data/processed/` unless `--out` says so, because the backend treats a `calendar.json` there as real data.

Defaults chosen where the method above is silent (also in `DECISIONS.md`):

- A monthly ratio counts only if its denominator has ≥ 5 cell-days and its numerator is > 0; a calendar month with < 3 such fit-year ratios takes the pooled median (`fallback: true`).
- `terra_only_factor` and the orbit-check factors are fitted on Feb 2012 – Dec 2020; `noaa20_factor` on Apr 2018 – Dec 2020; `noaa21_factor` on Feb 2024 – Oct 2026 (no overlap inside the fit years). A factor with no overlap data is 1.0 and `diagnostics.<name>.measured` is false.
- `unc_low/unc_high` = `H ± 1.96·sqrt(H + (cv·H)²)`, with `cv` 0 for S-NPP months.
- `hex_fire_history.parquet` lists only hexes with at least one detection (a hex missing from it never burned: P2 left-joins and gets null). `burn_count` uses the same satellite and factor as the calendar for each month, so the hexes add up to the regional harmonized series; `years_since_last_fire` uses the last detection by any satellite.
- `diagnostics.modis_only_step_ratio` is the 2013–2015 / 2009–2011 ratio on MODIS alone. It says how much fire activity really changed across the 2012 switch, so `harmonized_step_ratio` should be read against it, not against 1.
- Orbit check (`diagnostics.orbit_check`): Aqua only, Terra only and Terra+Aqua combined each get their own monthly factors to S-NPP on the fit years and a `test_mae` / `test_mape` on the test years; `lowest_test_mape` names the best one. The calendar always uses the combined record.
- An incomplete last month (data ends before the month does) is scored month-to-date: its `median_m`, `iqr_m` and `anomaly_z` use the same days of that calendar month in the baseline years, and `harmonized` stays the observed count so far. `diagnostics.last_month_complete` and `last_data_date` say when this applies.
- `is_nrt`: if `points.parquet` sits next to `hex_day.parquet`, a month is NRT when the satellite that supplies its harmonized value has NRT detections that month; otherwise the last data month and the 5 before it (`hex_day` has no `is_nrt` column). `diagnostics.is_nrt_rule` says which was used.
- S-NPP is the reference only up to its last complete month of data (`diagnostics.snpp_reference_until`), at most Oct 2026. The standard-processing archive can stop earlier (Río Negro: 31 Jul 2026) and S-NPP NRT is never used, so NOAA-20 × `noaa20_factor` takes over from the next month; the missing months are not zero fire.

## For the pitch

One chart: raw (naive switch) vs. harmonized monthly series 2000–2026 with the 2012 line marked, plus the held-out test error. Give P1 a one-paragraph method note: draft in `METHOD.md`, with the error and step values left as placeholders until the real Río Negro run.

```bash
uv run --with matplotlib python -m pipeline.harmonize.chart --region rio_negro   # -> data/processed/rio_negro/validation_chart.png
uv run --with matplotlib python -m pipeline.harmonize.chart --region rio_negro --dir <dir> --out chart.png
```

`chart.py` reads `calendar.json` + `calibration.json` and draws two panels: the 12-month running mean of the raw and harmonized series with the Feb 2012 switch marked, and observed vs. predicted S-NPP on the test years with `test_mae`. Mock inputs are labeled "MOCK DATA" on the chart. matplotlib is not a project dependency yet (requested in `PLAN.md`), hence `--with`.
