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

## Run (to be written)

```bash
uv run python -m pipeline.harmonize.run --region rio_negro
uv run pytest            # validates the outputs against contracts automatically
```

## For the pitch

One chart: raw (naive switch) vs. harmonized monthly series 2000–2026 with the 2012 line marked, plus the held-out test error. Give P1 a one-paragraph method note.
