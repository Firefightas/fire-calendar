# DECISIONS.md

One line per decision: what, and why. Newest at the bottom. Read before changing any of these.

- Stack: Python/uv/DuckDB/h3 pipeline, FastAPI backend, Vite+React+TS frontend, MapLibre+deck.gl map. Why: fast on laptops, free, every agent knows it.
- Unit = "active fire cell-days" (H3 res-7 hexes with ≥1 detection per day, per sensor). Why: stops one fire counting as many VIIRS pixels.
- Common scale = S-NPP-VIIRS-equivalent. Why: VIIRS is the future; MODIS is retiring.
- Calibration learned only on overlap years, per region and calendar month; fit 2012–2020, test 2021–2025. Why: fitting on all years erases real trends; held-out years prove validity.
- S-NPP ended 2 Nov 2026 → chain NOAA-20/21 to S-NPP over their overlaps. Why: the record must continue after S-NPP.
- Terra and Aqua calibrated separately; Aqua matches VIIRS time of day. Why: Terra is a morning pass, Aqua and VIIRS are afternoon.
- Anomaly = (value − monthly median) / max(monthly IQR, floor). Why: robust to mega-fire years; the brief asks for comparison against the median.
- Regions precomputed: Río Negro (hero), California, Romania; drawing allowed inside them. Why: global archive is too big for a demo.
- Frontend falls back to static mock/processed JSON if the backend is down. Why: demo must not depend on one server.
- Sandbox labeled "illustrative scenario"; all its numbers come from simulation runs. Why: scientific honesty with CONAE judges.
- Contracts live in `contracts/`, changed only by P1. Why: parallel work needs a frozen meeting point.
