# Method note for the pitch (owner: P3)

**Status: Río Negro numbers filled in** from `data/processed/rio_negro/calibration.json` (real data, run of 14 Nov 2026, binding median-ratio method). If the calibration is re-run or the method changes (see the power-law request in `PLAN.md`), update every number below from the new file. California and Romania are not run yet.

Chart: `pitch/rio_negro_validation_chart.png`, regenerate with `uv run python -m pipeline.harmonize.chart --region rio_negro --out pipeline/harmonize/pitch/rio_negro_validation_chart.png`.

## The paragraph

> MODIS and VIIRS cannot be compared by counting hotspots: one fire is a single 1 km MODIS pixel but several 375 m VIIRS pixels. We therefore count **active fire cell-days**, the number of H3 resolution-7 hexagons (about 5 km²) with at least one vegetation-fire detection on a given day, after removing low-confidence detections and static sources such as gas flares. Every satellite is then expressed on one scale, **S-NPP VIIRS equivalent**. For each calendar month we take the median ratio of S-NPP to MODIS (Terra and Aqua combined) cell-days over the years they flew together, and use it to convert the MODIS-only years 2000–2012; Terra-only months before July 2002 get an extra factor, and NOAA-20 and NOAA-21 are tied to S-NPP over their own overlaps (factors 1.07 and 1.01) so the record continues past the end of the S-NPP archive. The factors are learned on 2012–2020 only. In Río Negro, on 2021–2025, years the calibration never saw, MODIS converted this way predicts the S-NPP monthly count with a mean absolute error of **102 cell-days (35 %)**. The jump at the 2012 sensor switch goes from **×5.17** in the raw record to **×1.44** after harmonization; MODIS alone rose ×2.06 over the same years, so the remaining step is real fire activity, not sensor bias. Each month is compared with the 2001–2025 median for that calendar month using an **IQR Anomaly Score (Z_IQR)**, which is not thrown off by a single extreme fire year. Months converted from MODIS are marked as estimated and carry an uncertainty band.

## Limits to say out loud

- **35 % is a large error.** The S-NPP / MODIS ratio is not constant: it is about 1.4 in the biggest fire months and 5–10 in quiet ones, because VIIRS adds many small fires that MODIS misses. One factor per calendar month cannot follow that.
- **MODIS-era mega-fires are overstated.** January 2001 (2,402 Terra cell-days) is shown as 11,490 S-NPP-equivalent cell-days, with an uncertainty band of 0–26,411. Treat 2000–2002 as "very large", not as a measured multiple of later years.
- A power law fitted on the same 2012–2020 months brought the held-out error to 18 % in a scratch test. It is not in the product: it needs a contract change (requested from P1).

## Where each number comes from

| Number | Field in `calibration.json` |
|---|---|
| 102 cell-days | `test_mae` |
| 35 % | `test_mape` (0.354) |
| ×5.17 | `raw_step_ratio` (mean 2013–2015 / mean 2009–2011, naive sensor switch) |
| ×1.44 | `harmonized_step_ratio` |
| ×2.06 | `diagnostics.modis_only_step_ratio` |
| 1.07, 1.01 | `noaa20_factor`, `noaa21_factor` (both `measured: true`) |
| 1.4 and 5–10 | monthly S-NPP / MODIS ratios in the fit years (not stored; `monthly_factors` range 1.65–9.24) |
| 11,490; 0–26,411 | `calendar.json`, January 2001: `harmonized`, `unc_low`–`unc_high` |
| 18 % | scratch analysis, not stored in any output file; do not put it on a slide as a product result |

Checked for this run: no month uses the pooled fallback; S-NPP is the reference until July 2026 (end of its standard-processing archive), NOAA-20 after that.

Optional sentence, supported by `diagnostics.orbit_check`: "Afternoon Aqua alone predicts S-NPP better than morning Terra alone (held-out error 37 % vs. 46 %); the two combined do best (35 %)."

## One-sentence version (slide caption)

> We count fire-affected 5 km² hexagon-days instead of pixels, convert MODIS to the S-NPP VIIRS scale with monthly factors learned on 2012–2020, and check them on 2021–2025: in Río Negro the error is 102 cell-days per month (35 %).
