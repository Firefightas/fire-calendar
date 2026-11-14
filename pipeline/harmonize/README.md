# pipeline/harmonize/ (owner: P3)

Turns `hex_day.parquet` into `calendar.json` and `calibration.json` (schemas in `contracts/`). This is the scientific core and decides our Validity score.

```
hex_day.parquet ─▶ monthly cell-days per satellite ─▶ factors (overlap only) ─▶ harmonized series
                                                                              ─▶ median / IQR / anomaly
                                                                              ─▶ calendar.json + calibration.json
```

## Method (from TEAM_PLAN.md §2, binding)

1. **Monthly counts:** cell-days = rows of `hex_day` per satellite per month.
2. **Reference:** S-NPP VIIRS (Feb 2012 → Oct 2026).
3. **Factors**, per calendar month, learned on **fit years 2012–2020 only**: `factor(m) = median over years of (snpp / sensor)`. Separate factors for `modis_terra` (Terra-only months, 2000–2002), `modis_terra_aqua` (combined), and also check `modis_aqua` alone (same time of day as VIIRS). NOAA-20 and NOAA-21 get factors to S-NPP over their own overlaps.
4. **Apply:** MODIS-only months (Nov 2000 → Jan 2012) = MODIS × factor, `is_estimated: true`. After S-NPP ends (Nov 2026) = NOAA-20 × factor.
5. **Validate** on test years 2021–2025: predict S-NPP from MODIS, report MAE and MAPE. Also report the raw vs. harmonized step ratio around 2012.
6. **Anomaly:** per calendar month over 2001–2025, `z = (value − median) / max(IQR, max(1, 0.1·median))`.
7. **Uncertainty:** widen by the factor's CV for estimated months; Poisson-style interval otherwise.
8. **Sparse data:** months with too few fit-year ratios fall back to a pooled factor (flag `fallback: true`).

`contracts/mocks/generate_mocks.py` implements a simplified version of steps 3–7 on fake numbers. It's a good reference for output shapes.

## Run (to be written)

```bash
uv run python -m pipeline.harmonize.run --region rio-negro
```

Writes `data/processed/<region>/calendar.json` and `calibration.json`. `uv run pytest` validates them against the contracts automatically.

## For the pitch

Produce one chart: raw (naive switch) vs. harmonized monthly series 2000–2026 with the 2012 line marked, plus test-year error. Give P1 a one-paragraph method note.
