# Product

<!-- impeccable:product-schema 1 -->

Written by P3 on 15 Nov 2026 from the repository's own documents (README.md, TEAM_PLAN.md, AGENTS.md, PLAN.md, DECISIONS.md) without an interview. Lines marked *(assumption)* were inferred, not confirmed; replace them when someone confirms or corrects them. The repo root belongs to P1, who reviews this file.

## Platform

web

## Users

- **Hackathon judges** of NASA Space Apps 2026, Challenge #9 (*Harmonization of MODIS and VIIRS Hot Spots*, posed by CONAE). They see the product in a short pitch and demo, and score relevance, validity, creativity and impact, and presentation. *(assumption: the primary audience until the submission on 15 Nov 2026, 16:00)*
- **Open-science fire stakeholders:** analysts at CONAE (Argentina), IGSU/DSU (Romania) and CAL FIRE who want a continuous 2000-to-today fire record for an area they care about. They are stakeholders, never "buyers".
- **Firefighters and incident planners** rehearsing containment decisions in the sandbox, following a Romanian firefighter's 8-step field protocol. *(assumption: a demonstration audience, not current users)*

## Product Purpose

Satellite fire records cannot be compared across the 2012 sensor switch: MODIS (1 km pixels, from Nov 2000) sees far fewer small fires than VIIRS (375 m, S-NPP from 2012, NOAA-20 from 2018, NOAA-21 from 2024), so raw counts show an artificial jump. The product converts every satellite to one scale and lets people see what fire activity really did.

1. **Harmonization:** all satellites expressed as `SNPP_VIIRS_EQ` active fire cell-days, with factors learned on 2012–2020 and tested on 2021–2025.
2. **Burning Activity Calendar:** 26 years × 12 months for any area drawn inside three regions, Raw ↔ Harmonized toggle, IQR anomaly scores against the historical median, CSV export, live near-real-time hotspot overlay, NASA GIBS before/after burn scar imagery for peak months.
3. **Tactical Containment Sandbox:** a browser fire-spread simulation on real terrain and harmonized fire history, where a person and an algorithmic optimizer contain the same fire with the same budget.

Success: a viewer flips Raw → Harmonized and sees the 2012 sensor artefact disappear while real fire activity stays; the numbers behind it are checkable.

## Positioning

- The record is continuous across five satellites and four sensor epochs, and its error is measured on years the calibration never saw (held-out mean absolute error: Río Negro 91 cell-days / 33 %, California 152 / 17.5 %, Romania 118 / 25 %).
- In Romania the raw record rises ×1.90 across the 2012 switch while fire activity actually fell; harmonized it is ×0.68, matching MODIS alone (×0.71). The raw data gets the direction wrong.
- The sandbox's fuel comes from the same harmonized fire history (years since last fire), so the calendar and the simulation are one dataset, not two products.
- The sandbox follows an authentic field protocol: drone perimeter, terrain and natural barriers, fuel history, weather, attack strategy, four physical interventions (water drop *Apă*, controlled timber clearing *Defrișare Controlată*, bulldozer trench *Șanț / Rupere Strat Biologic*, strategic backfire *Foc Tactic*), village and farm triage, crew exit route with a draft advisory.

## Operating Context

- Three precomputed regions: `rio_negro` (Río Negro / Choele Choel, Argentina, the hero case), `california`, `romania` (a bounding box that also covers parts of neighbouring countries). Drawn areas must lie inside one of them.
- Demo setting: a live pitch and a recorded demo video, on a laptop or projector. *(assumption)*
- Deployment: backend on Render (free tier, sleeps when idle, 512 MB), frontend on Vercel; the frontend paints from a bundled static copy while the backend wakes.
- Built by a six-person team with AI coding agents in parallel; the repo is the only shared memory.

## Capabilities and Constraints

- Stack: Vite + React + TypeScript + Tailwind, MapLibre, deck.gl, terra-draw, d3-scale-chromatic, Recharts; sandbox in TypeScript + h3-js + Canvas + Web Worker; FastAPI + DuckDB backend; Python pipeline.
- Data contracts in `contracts/` are frozen; every data shape comes from there.
- Unit everywhere: active fire cell-days (H3 resolution-7 hexes, about 5 km², with at least one detection per day).
- Every number in the UI is computed from the data or the simulation; nothing hardcoded. Mock data is always labelled "MOCK DATA" (today no region is mock).
- `anomaly_z` is always labelled **"IQR Anomaly Score (Z_IQR)"**, never "sigma".
- Estimated months (converted from MODIS) and near-real-time months are marked; MODIS-era estimates carry an uncertainty band; an incomplete last month is labelled month to date.
- The sandbox is never called a "game". It always shows: *Illustrative Counterfactual Scenario Tool — Driven by Harmonized FIRMS Fuel History, ESA WorldCover & Open-Meteo (Not an Operational Forecast)*.
- The optimizer is algorithmic (greedy and min-cut search scored by simulation), not machine learning; it is labelled for what it is.
- The advisory output is a draft, never an official alert.
- The sandbox opens one fixed ~1,000-hex patch per region (Choele Choel valley, Sierra Nevada foothills east of Fresno, Făgăraș in southern Transylvania), not the drawn area.
- Undecided: whether the sandbox will follow the drawn area.

## Brand Commitments

- Name in the README: "Fire Calendar: Harmonized MODIS + VIIRS Burning Activity Calendar". No logo exists; `frontend/public/favicon.svg` is the only mark.
- Data acknowledgement required: NASA FIRMS, part of NASA's LANCE and ESDIS.
- Voice: plain, factual, scientifically honest; limits are stated rather than hidden.

## Evidence on Hand

- Real calendars, calibrations and fire histories for all three regions: `data/processed/<region>/`.
- Validation charts: `pipeline/harmonize/pitch/{rio_negro,california,romania}_validation_chart.png`; method and limits with the source of every number: `pipeline/harmonize/METHOD.md`.
- Real sandbox terrain grids (ESA WorldCover, Open-Meteo elevation): `data/processed/<region>/sandbox_grid.json`, method in `pipeline/sandbox_inputs/README.md`.
- Live FIRMS near-real-time hotspots through the backend.
- Absent, and not to be fabricated: users, testimonials, agency endorsements or partnerships, operational use, forecast accuracy for the sandbox.

## Product Principles

1. **Show the evidence, not a claim.** Every figure traces to a data file or a simulation run, and the held-out error is shown next to the result.
2. **Honest about limits.** Uncertainty bands, estimated and month-to-date flags, and the sandbox banner stay visible; weak results are stated as weak.
3. **One dataset, three views.** Calendar, anomalies and sandbox fuel all come from the same harmonized record.
4. **Legible in a few minutes.** The Raw ↔ Harmonized flip and the sandbox comparison must be understood by a non-specialist during a short demo.
5. **Stakeholders, not customers.** Agencies are framed as open-science partners; nothing implies an official or commercial relationship.

## Accessibility & Inclusion

- Colorblind-safe sequential palettes for the calendar (Cividis default, Viridis, Inferno), and no meaning carried by colour alone (badges and labels accompany colour).
- English UI; the sandbox keeps the Romanian names of the protocol steps and interventions alongside the English ones.
- Readable on a projector and in a screen recording. *(assumption)*
- No formal conformance target has been set.
