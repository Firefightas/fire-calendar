# Method note for the pitch (owner: P3)

**Status: draft.** The text is final in substance; the values in `<angle brackets>` are not known yet. Fill them from the real `data/processed/rio_negro/calibration.json` once P2's data has been run, and never from the synthetic or mock files.

## The paragraph

> MODIS and VIIRS cannot be compared by counting hotspots: one fire is a single 1 km MODIS pixel but several 375 m VIIRS pixels. We therefore count **active fire cell-days**, the number of H3 resolution-7 hexagons (about 5 km²) with at least one vegetation-fire detection on a given day, after removing low-confidence detections and static sources such as gas flares. Every satellite is then expressed on one scale, **S-NPP VIIRS equivalent**. For each calendar month we take the median ratio of S-NPP to MODIS (Terra and Aqua combined) cell-days over the years they flew together, and use it to convert the MODIS-only years 2000–2012; Terra-only months before July 2002 get an extra factor, and NOAA-20 and NOAA-21 are tied to S-NPP over their own overlaps so the record continues after S-NPP stopped delivering data on 2 November 2026. The factors are learned on 2012–2020 only. On 2021–2025, years the calibration never saw, MODIS converted this way predicts the S-NPP monthly count with a mean absolute error of **`<test_mae>` cell-days (`<test_mape>` %)**. The artificial jump at the 2012 sensor switch goes from **×`<raw_step_ratio>`** in the raw record to **×`<harmonized_step_ratio>`** after harmonization. Each month is compared with the 2001–2025 median for that calendar month using an **IQR Anomaly Score (Z_IQR)**, which is not thrown off by a single extreme fire year. Months converted from MODIS are marked as estimated and carry an uncertainty band.

## Values to fill in

| Placeholder | Field in `calibration.json` | Note |
|---|---|---|
| `<test_mae>` | `test_mae` | cell-days per month |
| `<test_mape>` | `test_mape` | stored as 0–1; show as a percentage |
| `<raw_step_ratio>` | `raw_step_ratio` | mean 2013–2015 / mean 2009–2011, naive sensor switch |
| `<harmonized_step_ratio>` | `harmonized_step_ratio` | same ratio on the harmonized series; near 1 is good |

Check before using the paragraph:

- "about 5 km²" is the H3 res-7 average (5.16 km²); "2000–2012" means Nov 2000 – Jan 2012.
- If any `monthly_factors[].fallback` is true for the region, add: "months with too little fire to calibrate use the region's pooled factor".
- If `diagnostics.noaa21.measured` or `diagnostics.noaa20.measured` is false, drop the claim that the satellite is tied to S-NPP.
- The paragraph says nothing about Aqua matching S-NPP better than Terra. Add that only if `diagnostics.orbit_check` on real data supports it.

## One-sentence version (slide caption)

> We count fire-affected 5 km² hexagon-days instead of pixels, convert MODIS to the S-NPP VIIRS scale with monthly factors learned on 2012–2020, and check them on 2021–2025: error `<test_mae>` cell-days (`<test_mape>` %).

The matching chart comes from `pipeline/harmonize/chart.py` (see `README.md`).
