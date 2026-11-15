# Method note for the pitch (owner: P3)

**Status: Río Negro numbers filled in** from `data/processed/rio_negro/calibration.json` (real data, run of 14 Nov 2026 on P2's tables after the persistent-source screen, binding median-ratio method). If the calibration is re-run or the method changes (see the power-law request in `PLAN.md`), update every number below from the new file. California was run on 15 Nov 2026 (section at the end). Romania is not run yet.

Chart: `pitch/rio_negro_validation_chart.png`, regenerate with `uv run python -m pipeline.harmonize.chart --region rio_negro --out pipeline/harmonize/pitch/rio_negro_validation_chart.png`.

## The paragraph

> MODIS and VIIRS cannot be compared by counting hotspots: one fire is a single 1 km MODIS pixel but several 375 m VIIRS pixels. We therefore count **active fire cell-days**, the number of H3 resolution-7 hexagons (about 5 km²) with at least one vegetation-fire detection on a given day, after removing low-confidence detections and static sources such as gas flares. Every satellite is then expressed on one scale, **S-NPP VIIRS equivalent**. For each calendar month we take the median ratio of S-NPP to MODIS (Terra and Aqua combined) cell-days over the years they flew together, and use it to convert the MODIS-only years 2000–2012; Terra-only months before July 2002 get an extra factor, and NOAA-20 and NOAA-21 are tied to S-NPP over their own overlaps (factors 1.08 and 1.02) so the record continues past the end of the S-NPP archive. The factors are learned on 2012–2020 only. In Río Negro, on 2021–2025, years the calibration never saw, MODIS converted this way predicts the S-NPP monthly count with a mean absolute error of **91 cell-days (33 %)**. The jump at the 2012 sensor switch goes from **×5.17** in the raw record to **×1.50** after harmonization; MODIS alone rose ×2.06 over the same years, so the remaining step is real fire activity, not sensor bias. Each month is compared with the 2001–2025 median for that calendar month using an **IQR Anomaly Score (Z_IQR)**, which is not thrown off by a single extreme fire year. Months converted from MODIS are marked as estimated and carry an uncertainty band.

## Limits to say out loud

- **33 % is a large error.** The S-NPP / MODIS ratio is not constant: it is about 1.4 in the biggest fire months and 5–10 in quiet ones, because VIIRS adds many small fires that MODIS misses. One factor per calendar month cannot follow that.
- **MODIS-era mega-fires are overstated.** January 2001 (2,402 Terra cell-days) is shown as 11,399 S-NPP-equivalent cell-days, with an uncertainty band of 0–26,063. Treat 2000–2002 as "very large", not as a measured multiple of later years.
- **Some persistent non-fire sources remain.** P2's screen removed 3.3 % of detections (compact sites that recur for months in at least two years, probably industrial; not confirmed). It is deliberately conservative: 135 hexes still have more than 50 harmonized cell-days each. It lowered the held-out error only from 35 % to 33 %.
- A power law fitted on the same 2012–2020 months brought the held-out error to 18 % in a scratch test. It is not in the product: it needs a contract change (requested from P1).

## Where each number comes from

| Number | Field in `calibration.json` |
|---|---|
| 91 cell-days | `test_mae` (91.11) |
| 33 % | `test_mape` (0.332) |
| ×5.17 | `raw_step_ratio` (mean 2013–2015 / mean 2009–2011, naive sensor switch) |
| ×1.50 | `harmonized_step_ratio` |
| ×2.06 | `diagnostics.modis_only_step_ratio` |
| 1.08, 1.02 | `noaa20_factor` (1.075), `noaa21_factor` (1.024), both `measured: true` |
| 1.4 and 5–10 | monthly S-NPP / MODIS ratios in the fit years (not stored; `monthly_factors` range 1.63–8.67) |
| 11,399; 0–26,063 | `calendar.json`, January 2001: `harmonized`, `unc_low`–`unc_high` |
| 3.3 %, 135 hexes | `pipeline/ingest/RIO_NEGRO_STATUS.md` (10,586 of 317,938 points); `hex_fire_history.parquet`, `burn_count > 50` |
| 35 % → 33 % | `test_mape` before and after the screen (0.354, 0.332) |
| 18 % | scratch analysis on the screened tables (MAE 47 cell-days, MAPE 17.5 %), not stored in any output file; do not put it on a slide as a product result |

Checked for this run: no month uses the pooled fallback; S-NPP is the reference until July 2026 (end of its standard-processing archive), NOAA-20 after that.

Optional sentence, supported by `diagnostics.orbit_check`: "Afternoon Aqua alone predicts S-NPP better than morning Terra alone (held-out error 34 % vs. 42 %); the two combined do best (33 %)."

## One-sentence version (slide caption)

> We count fire-affected 5 km² hexagon-days instead of pixels, convert MODIS to the S-NPP VIIRS scale with monthly factors learned on 2012–2020, and check them on 2021–2025: in Río Negro the error is 91 cell-days per month (33 %).

## California (real data, run of 15 Nov 2026)

Numbers from `data/processed/california/calibration.json`, same binding method and same code. Chart: `pitch/california_validation_chart.png`.

> In California the same method, with factors learned on 2012–2020, predicts the 2021–2025 S-NPP monthly count from MODIS with a mean absolute error of **152 cell-days (17.5 %)**, including the August 2021 peak (9,609 observed). The 2012 sensor switch goes from **×3.13** in the raw record to **×1.52** after harmonization, and MODIS alone rose **×1.53** over the same years: the harmonized step equals the real change in fire activity.

| Number | Field in `calibration.json` |
|---|---|
| 152 cell-days, 17.5 % | `test_mae` (152.27), `test_mape` (0.175) |
| ×3.13, ×1.52, ×1.53 | `raw_step_ratio`, `harmonized_step_ratio`, `diagnostics.modis_only_step_ratio` |
| monthly factors 1.53–2.89 | `monthly_factors` (no month uses the pooled fallback; 8–9 fit years each) |
| Terra-only 1.71, NOAA-20 0.98, NOAA-21 1.01 | `terra_only_factor`, `noaa20_factor` (0.976), `noaa21_factor` (1.013), all `measured: true` |
| 9,609 | `calendar.json`, August 2021, `viirs_raw` |
| orbit check 21 % / 24 % / 17.5 % | `diagnostics.orbit_check`: Aqua only, Terra only, combined (`test_mape`) |

Limits for California:

- **The error is half of Río Negro's (17.5 % vs. 33 %)** because the S-NPP / MODIS ratio varies much less here (monthly factors 1.5–2.9 against 1.6–8.7): large timber and chaparral fires are seen by both sensors.
- **Static heat sources remain in the tables.** 270 of 49,314 hexes have more than 50 harmonized cell-days each and hold 6.9 % of the total; 168 of them have detections in at least 15 different years. The largest sit on landfills, refineries and a cement plant around Los Angeles (for example 34.32 N 118.52 W, 33.91 N 118.41 W, 33.79 N 118.24 W). They inflate the baseline of every month a little and give those hexes a wrong fuel history in the sandbox. Whether P2's persistence screen was applied to these tables is not documented yet (asked in `PLAN.md`).
- S-NPP is the reference until July 2026, NOAA-20 after that; November 2026 is month to date (14 Nov).
