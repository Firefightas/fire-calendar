# FINAL MASTER PLAN: Harmonized Burning Activity Calendar & Tactical Containment Sandbox

**NASA Space Apps Challenge 2026 — Challenge #9: Harmonization of MODIS and VIIRS Hot Spots**
**Team Size:** 6 Developers (`P1`–`P6`) | **Agent Fleet:** $3\times$ Claude Pro (Fable), $2\times$ ChatGPT Plus (Codex), $3\times$ Gemini Pro (Gemini CLI)

> **How to read this plan:** this file states *what* we build and *why*. The exact field-level data shapes live in `contracts/` and are authoritative: if this plan and a schema in `contracts/` ever disagree, the schema wins and P1 fixes this file. Reconciliation notes are logged in `DECISIONS.md`.

---

## 0. Binding Resolution of Contradictions & Ambiguities

Before any agent writes code, these **6 contradictions** between the earlier research notes and `TEAM_PLAN.md` are formally resolved. **These rules are binding across all repository contracts.**

### 1. Global Polygon Queries vs. 3 Precomputed Regional Archives
* **The Conflict:** Earlier research proposed arbitrary global 26-year polygon queries on the fly. `TEAM_PLAN.md` restricts historical polygon queries to areas **inside** 3 precomputed regions (*Río Negro, Argentina; California, USA; Romania*).
* **Why:** The live NASA FIRMS Area API (`/api/area/csv/`) allows a maximum of $1\text{--}5\text{ days}$ per request. Generating a 26-year ($2000\text{--}2026$) calendar live for an uncached bounding box would require $\sim 1,900$ sequential API requests and breach rate limits.
* **Binding Resolution:**
  1. **Globally Agnostic Pipeline:** `pipeline/` accepts any country/region FIRMS archive CSV without code changes.
  2. **Pre-Indexed 26-Year Polygon Queries (`POST /api/calendar`):** Users draw custom polygons anywhere **inside the 3 precomputed DuckDB/Parquet regions** (*Río Negro / Choele Choel, Argentina*; *California, USA*; *Romania*) for sub-second 26-year historical harmonization.
  3. **Live Global NRT & Weather (`GET /api/nrt`):** Live $1\text{--}7\text{ day}$ FIRMS NRT overlays (`NOAA-20/21` + `MODIS NRT`) and Open-Meteo wind vectors work globally.

### 2. Harmonization Math: FRP Quantile Mapping vs. Active Fire Cell-Days Ratio Calibration
* **The Conflict:** Earlier notes proposed a combined count + $\sum FRP$ regression with ECDF matching across $2012\text{--}2025$ and called anomalies "$\sigma$". `TEAM_PLAN.md` defines **"active fire cell-days"** (H3 Resolution-7 hexes with $\ge 1$ detection/day/sensor) scaled to **`S-NPP-VIIRS-equivalent`** via monthly median ratios (`fit: 2012–2020`, `test: 2021–2025`), accounting for Terra-only ($2000\text{--}2002$) and **Suomi-NPP's Nov 2, 2026 end of new data delivery**.
* **Binding Resolution:**
  1. **Primary Calibration (`P3`):** Adopt `TEAM_PLAN.md`'s **Active Fire Cell-Days (`S-NPP-VIIRS-equivalent`)** chain (`MODIS Terra/Aqua` $\to$ `S-NPP VIIRS` $\to$ `NOAA-20 / NOAA-21 VIIRS`), trained strictly on $2012\text{--}2020$ and validated out-of-sample on $2021\text{--}2025$ (`test_mae` reported in `calibration.json`).
  2. **Retain `frp_sum` for Intensity:** `P2` keeps `frp_sum` in `hex_day.parquet` for intensity inspection and Sandbox burn severity.
  3. **No "Sigma" Label:** The IQR anomaly score (`anomaly_z`) must be labeled **"IQR Anomaly Score ($Z_{\text{IQR}}$)"** in all UI tooltips and slides—never "$\sigma$" (sigma).

### 3. Integrating the Romanian Firefighter Doctrine with Zero Extra Data Scraping
* **The Conflict:** The Romanian firefighter workflow requires terrain/rivers, forest biomass type, wind forecast, 4 physical containment tools, village/farm damage triage, crew exit routes, and RO-ALERT advisories. `TEAM_PLAN.md` defines a compact `sandbox_grid.json` using **ESA WorldCover** + **Open-Meteo**.
* **Binding Resolution:**
  * **Zero Extra Data Scraping for `P2`:** ESA WorldCover (`landcover` in `sandbox_grid.json`) already encodes the firefighter's field layers:
    * Class `10` (Tree cover) $\to$ **Forest Canopy** (high intensity / crown fire risk, boosted at coniferous montane elevations $> 800\text{ m}$).
    * Class `20` / `30` (Shrubland / Grassland) $\to$ **Rapid Surface Fuel**.
    * Class `40` (Cropland) $\to$ **Farms (*Ferme*)** (high agricultural damage weight).
    * Class `50` (Built-up) $\to$ **Villages / Settlements (*Sate*)** (critical life-safety triage weight).
    * Class `80` (Permanent water) $\to$ **Rivers / Lakes (*Râuri*)** (`burnable: false`, natural firebreak anchor).
  * **Add 2 Deterministic Fields to `sandbox_grid.json`:** `slope_deg` (derived from `elevation_m` hex neighbors) and `asset_type` (`"village" | "farm" | "river" | "forest" | "grassland" | "none"`).

### 4. Scientific Honesty Guardrail vs. Tactical Decision-Support Naming
* **Binding Resolution:** Never call Stage 3 a "game." Title it **"Tactical Containment Sandbox"** and display a visible banner: **`Illustrative Counterfactual Scenario Tool — Driven by Harmonized FIRMS Fuel History, ESA WorldCover & Open-Meteo (Not an Operational Forecast)`**. Every metric (hectares burned, containment $\%$, villages/farms protected, exit-route clearance) must be computed dynamically by the Web Worker simulation—never hardcoded.

### 5. Public Agency Stakeholders vs. "Selling Data to Governments"
* **Binding Resolution:** Frame civil protection and space agencies (**IGSU/DSU Romania, CONAE Argentina, CAL FIRE**) as **Open-Science Operational Stakeholders**, never commercial "buyers." Present the **RO-ALERT / Cell Broadcast Advisory Export** as an open-source public safety module.

### 6. Authoritative Team Roster & AI Fleet
* **Binding Resolution:** `TEAM_PLAN.md`'s 6-person structure (`P1`–`P6`) and 8 AI subscriptions ($3\times$ Claude Pro/Fable, $2\times$ ChatGPT Plus/Codex, $3\times$ Gemini Pro/CLI) is the locked operational plan.

---

## 1. Technology Stack

| Layer | Choice | Why |
| :--- | :--- | :--- |
| **Data Pipeline** | **Python 3.11**, `uv`, **DuckDB**, **pandas**, **h3-py**, **pyarrow** (Parquet) | DuckDB crunches multi-GB CSV archives in seconds; Parquet keeps outputs small and fast. |
| **Backend API** | **FastAPI** + **DuckDB** reading processed Parquet/JSON | Same language as pipeline; keeps `FIRMS_MAP_KEY` secret; runs custom polygon queries & CSV export. |
| **Frontend** | **Vite + React + TypeScript + Tailwind CSS** | Fast scaffolding, strongly typed against `/contracts/`. |
| **Map** | **MapLibre GL JS** (free, no token) + **deck.gl** (`H3HexagonLayer`) + **terra-draw** | Renders H3 hexes natively on GPU; polygon drawing with zero Mapbox billing risk. |
| **Calendar + Charts** | **d3-scale** + **d3-scale-chromatic** (`Cividis`, `Viridis`, `Inferno`) + **Recharts** | Colorblind-safe scientific ramps built in (`Cividis` default). |
| **Sandbox** | **TypeScript**, **h3-js**, **HTML5 Canvas**, **Web Worker** | Runs Cellular Automata, Min-Cut graph solver, and Monte Carlo runs in browser without freezing UI. |
| **External Data** | **NASA FIRMS** (archive + NRT API), **Open-Meteo** (wind + DEM), **ESA WorldCover** | 100% free and open access. |
| **Deploy & Fallback** | Frontend on **Vercel**, Backend on **Render** + bundled JSON fallback | Frontend can load precomputed `calendar.json` and `sandbox_grid.json` directly if backend is unreachable. |

---

## 2. Core Scientific Specification (Stage 1 & Stage 2)

### 2.1 Spatial-Temporal Unit: Active Fire Cell-Days
* **Definition:** Number of unique **H3 Resolution-7** hexagons ($\sim 5.16\text{ km}^2$) with $\ge 1$ valid fire detection per calendar day, per sensor family.
* **Purpose:** Removes the spatial resolution bias where a single $1\text{ km}^2$ fire produces $1$ MODIS pixel ($1\text{ km}$) but $6\text{--}8$ VIIRS pixels ($375\text{ m}$).

### 2.2 Multi-Sensor Continuity Chain (`MODIS` $\to$ `S-NPP` $\to$ `NOAA-20/21`)
* **Common Reporting Scale:** **`S-NPP-VIIRS-equivalent` active fire cell-days**.
* **Four Operational Epochs:**
  1. **Terra-Only MODIS ($\text{Nov } 2000\text{--Jun } 2002$):** Only morning-orbit Terra MODIS was active. Calibrated separately so early years do not artificially drop by $\sim 50\%$. Marked `is_estimated: true`.
  2. **Terra + Aqua MODIS ($\text{Jul } 2002\text{--Jan } 2012$):** Combined MODIS era; scaled to `S-NPP-VIIRS-equivalent` using learned monthly overlap factors. Marked `is_estimated: true`.
  3. **MODIS + S-NPP VIIRS Overlap ($\text{Jan } 2012\text{--Oct } 2026$):** Afternoon **Aqua MODIS** is calibrated against afternoon **S-NPP VIIRS** (same orbital time of day); morning **Terra MODIS** is calibrated separately.
  4. **Post-S-NPP Continuity ($\text{Nov } 2, 2026\text{+}$):** Because **Suomi-NPP stopped delivering new data on 2 Nov 2026**, the record continues with **NOAA-20** (from Apr 2018) and **NOAA-21** (from Jan 2024), each cross-calibrated to S-NPP over its overlap ($\text{factor} \approx 1.0$, measured empirically).

### 2.3 Calibration, Validation & Anomaly Equations
1. **Monthly Overlap Calibration Factor (Fit strictly on $Y_{\text{fit}} = [2012, 2020]$):**
   $$\text{factor}(m) = \text{median}_{y \in [2012, 2020]}\left(\frac{C_{\text{VIIRS}}(y, m)}{C_{\text{MODIS}}(y, m)}\right)$$
   * *Never fit across all years $2000\text{--}2026$* (that erases real climate trends).
   * *Sparse-Polygon Fallback:* If a user-drawn polygon has $< 5$ active fire cell-days in month $m$ during the overlap window, fall back to the parent region's $\text{factor}(m)$ and widen `unc_low` / `unc_high` using the regional coefficient of variation ($\text{CV}_m$).
2. **Held-Out Validation (Tested on $Y_{\text{test}} = [2021, 2025]$):**
   Apply $\text{factor}(m)$ learned on $2012\text{--}2020$ to MODIS cell-days in $2021\text{--}2025$ and compute $\text{MAE}_{\text{test}}$ against observed VIIRS cell-days. Report in `calibration.json` and display in the UI.
3. **Non-Parametric Anomaly Score (`anomaly_z`):**
   $$\text{anomaly\_z}(y, m) = \frac{H(y, m) - \text{median}_{y'}(H(y', m))}{\max\left(\text{IQR}_{y'}(H(y', m)), 1.0\right)}$$
   * Baseline $y'$ = all **complete** years of the record ($2001\text{--}2025$), stored as `baseline_years` in `calendar.json`. Floor = $1.0$ cell-day.

### 2.4 Mandatory Data Hygiene Gotchas (`P2` & `P3`)
* **Filter Non-Vegetation Sources:** Where MODIS `type` exists, keep only `type == 0` (vegetation fire); drop volcanoes (`1`), static industrial/oil-gas flares (`2` — critical for Río Negro / Neuquén basin), and offshore (`3`).
* **Confidence Normalization:** Map MODIS numeric $0\text{--}100$ ($< 30 \to \text{low}$, $30\text{--}79 \to \text{nominal}$, $\ge 80 \to \text{high}$) and VIIRS `l/n/h` to `low/nominal/high`. Drop `low` by default.
* **SP vs. NRT Lag:** Standard Processing (`SP`) lags by $\sim 5\text{ months}$. Flag recent NRT months `is_nrt: true`. Live $1\text{--}7\text{ day}$ overlays use `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`, and `MODIS_NRT` (never `VIIRS_SNPP_NRT`).

---

## 3. Tactical Containment Sandbox Specification (Stage 3 — Firefighter Doctrine)

The Sandbox translates our Romanian firefighter's **8-step field protocol** ("*prognostic cu datele minimale*") into an interactive Web Worker simulation on the H3 hex grid.

### 3.1 Field Protocol to Simulator Mapping

| Firefighter Field Step | Simulator Mechanic (`P2` Data + `P6` Web Worker) |
| :--- | :--- |
| **1. Drone Perimeter Recon (*Determinare perimetru prin drone*)** | Initializes $t = 0$ active fire perimeter from live FIRMS NRT hotspots enclosed by a UAV recon polygon overlay. |
| **2. Terrain & Natural Barriers (*Analiza terenului*)** | Uses Open-Meteo `elevation_m` and `slope_deg` (uphill acceleration) + ESA WorldCover Class `80` (**Rivers / *Râuri***) as natural zero-cost barriers (`burnable: false`). |
| **3. Biomass & Fuel History (*Analiza biomasă / combustibil*)** | Combines **26-Year Harmonized Burn History** (`years_since_last_fire`, `burn_count`) with ESA WorldCover canopy class (`10` Forest vs. `20/30` Shrub/Grass). Recent burns ($1\text{--}3\text{ yrs}$) reduce fuel; unburned forests ($> 10\text{ yrs}$) carry high fuel debt. |
| **4. Weather Consultation (*Consultare prognoza meteo*)** | Pulls live Open-Meteo wind speed/direction $\vec{W}$ for the region centroid + an interactive **High-Sky Gust & Wind-Shift Slider** to test containment under wind reversals. |
| **5. Attack Strategy (*Strategie de atac*)** | **Specialist vs. AI Optimizer:** User deploys a fixed resource budget on the H3 grid before running a $72\text{h}$ simulation. The AI solver uses **Min-Cut Graph Bottleneck** + **Monte Carlo rollouts** with the identical budget to find optimal anchor lines (often anchoring into rivers and recent VIIRS burn scars). |
| **6. Physical Damage Control (*Damage control*)** | **4 Authentic Interventions:**<br>1. 💧 **Aerial / Water Drop (*Apă*):** Cools active fire hexes (instant suppression, short duration).<br>2. 🪓 **Controlled Timber Clearing (*Defrișare Controlată*):** Removes canopy fuel (`Class 10`) to stop crown fire spread.<br>3. 🚜 **Bulldozer Mineral Trench (*Șanț / Rupere Strat Biologic*):** Cuts down to mineral soil to block surface/litter creeping fires.<br>4. 🔥 **Strategic Backfire (*Foc Tactic*):** Consumes dry fuel ahead of the main front along an anchored barrier. |
| **7. Asset Triage (*Determinare potențiale pagube*)** | Tracks threatened **Villages (*Sate*, `Class 50`)** and **Farms (*Ferme*, `Class 40`)**. Both human and AI strategies are scored on protecting human settlements and farms first, total hectares second. |
| **8. Crew Exit Route & Civil Alert (*Exit plan route & RO-ALERT*)** | Verifies an unblocked **Crew Escape Corridor** from the deployment line to a safe road/river barrier, and generates a **Draft Civil Protection (RO-ALERT style) JSON/Text Advisory** listing threatened village hexes, estimated arrival window, and safe evacuation direction orthogonal/upwind of $\vec{W}$. |

### 3.2 Cellular Automata Spread Equation (`P6`)
For burning hex $i$ and burnable neighbor $j$ at time step $\Delta t$:
$$P_{\text{burn}}(i \to j) = \text{clamp}\left(P_0 \cdot \Phi_{\text{fuel}}(j) \cdot \left(1 + \gamma_w \max(0, \hat{w} \cdot \hat{d}_{ij})\right) \cdot \left(1 + \gamma_s \tan(\theta_{ij})\right) \cdot (1 - R_{\text{tool}}(j)),\ 0,\ 1\right)$$
where $\Phi_{\text{fuel}}(j) = \text{BaseFlammability}(\text{landcover}_j) \cdot \min\left(1.5,\ 0.25 + 0.08 \cdot \text{years\_since\_last\_fire}_j\right)$, $\hat{w}$ is the wind vector, $\theta_{ij}$ is upslope angle from $i$ to $j$, and $R_{\text{tool}}(j) \in [0, 1]$ is the suppression factor of any deployed firefighting tool on hex $j$.

---

## 4. Precomputed Regions & Repository Structure

### 4.1 Three Showcase Regions
1. **`rio_negro` — Río Negro / Choele Choel, Argentina** *(Hero Demo — CONAE briefing case study)*
2. **`california` — California, USA** *(High-intensity timber/chaparral regime)*
3. **`romania` — Romania (Carpathians & Sub-Carpathians)** *(Mixed forest/agricultural regime + firefighter field doctrine)*

### 4.2 Repository Layout & Folder Ownership
```text
/
├── AGENTS.md            # Brief for all agents (CLAUDE.md, GEMINI.md import it)       [P1]
├── WORKFLOW.md  PLAN.md  DECISIONS.md  HANDOFF.md  TEAM_PLAN.md                    [P1]
├── contracts/           # Frozen JSON schemas + Hour-1 mocks (Source of Truth)     [P1]
│   ├── calendar.schema.json
│   ├── sandbox_grid.schema.json
│   ├── api.md
│   └── mocks/
├── pipeline/
│   ├── ingest/          # Download, clean, filter, H3-bin FIRMS data               [P2]
│   ├── sandbox_inputs/  # WorldCover, Open-Meteo DEM, fire history per hex         [P2]
│   └── harmonize/       # Overlap calibration, train/test validation, anomalies    [P3]
├── data/
│   ├── raw/             # gitignored
│   └── processed/<region_id>/   # Parquet + JSON outputs
├── backend/             # FastAPI + DuckDB                                         [P4]
└── frontend/
    └── src/
        ├── app/  features/map/  features/calendar/  features/export/               [P5]
        └── features/sandbox/                                                       [P6]
```

---

## 5. Frozen Data Contracts & API Specification (Freeze in Hour 1)

### 5.1 Processed Files in `data/processed/<region_id>/`

| File | Schema / Columns | Producer | Consumers |
| :--- | :--- | :--- | :--- |
| `points.parquet` | `date, time, lat, lon, h3, sensor, satellite, confidence_class, frp, daynight, type, is_nrt` | `P2` | `P4` (CSV export) |
| `hex_day.parquet` | One row per (hex, day, satellite): `h3, date, sensor, satellite, n_points, frp_sum`. `satellite` (`terra/aqua/snpp/noaa20/noaa21`) is required to separate the epochs in §2.2. | `P2` | `P3`, `P4` |
| `calendar.json` | `{region_id, unit, scale, is_mock, generated_at, first_month, last_month, baseline_years, months: [{year, month, modis_raw, viirs_raw, harmonized, is_estimated, is_nrt, median_m, iqr_m, anomaly_z, unc_low, unc_high, source}]}` | `P3` | `P4`, `P5` |
| `calibration.json` | `{region_id, is_mock, generated_at, method, target_scale: "SNPP_VIIRS_EQ", fit_years: [2012,2020], test_years: [2021,2025], test_mae, terra_only_factor, noaa20_factor, noaa21_factor, monthly_factors: [{month, factor, cv, n_years, fallback}]}` + optional `test_mape`, `raw_step_ratio`, `harmonized_step_ratio`, `diagnostics` | `P3` | `P4`, `P5` |
| `sandbox_grid.json` | `{region_id, is_mock, h3_resolution: 7, landcover_classes, cells: [{h3, lat, lon, landcover, asset_type, burnable, elevation_m, slope_deg, burn_count, years_since_last_fire}]}` | `P2` + `P3` | `P4`, `P6` |
| `hex_fire_history.parquet` | Per hex: `h3, burn_count, years_since_last_fire` (harmonized fire history, P3's hand-off to P2's sandbox grid) | `P3` | `P2` |

### 5.2 Backend API Endpoints (`contracts/api.md` — `P4`)

| Endpoint | Method & Parameters | Purpose |
| :--- | :--- | :--- |
| `/api/health` | `GET` | Status + which regions are still served from mocks. |
| `/api/regions` | `GET` | List the 3 regions (`rio_negro`, `california`, `romania`) with bounding boxes & centroids. |
| `/api/regions/{id}/calendar` | `GET` | Whole-region 2000–2026 monthly calendar (`raw` and `harmonized`). |
| `/api/regions/{id}/calibration` | `GET` | Overlap calibration factors and held-out $2021\text{--}2025$ validation metrics. |
| `/api/calendar` | `POST` `{region_id, polygon, start, end}` | Aggregate `hex_day.parquet` inside drawn GeoJSON polygon and apply calibration factors. |
| `/api/export/points` | `POST` `{region_id, polygon, start, end}` | Stream CSV of filtered hotspots inside the selected polygon/date window. |
| `/api/export/calendar` | `POST` `{region_id, polygon, start, end}` | Stream CSV of the harmonized monthly calendar table (`modis_raw, viirs_raw, harmonized, anomaly_z`). |
| `/api/nrt` | `GET ?region_id=&days=1..7` **or** `?bbox=w,s,e,n&days=1..7` (global, per §0.1) | Cached proxy to live NASA FIRMS Area API (`NOAA-20/21` + `MODIS NRT`), returns GeoJSON. |
| `/api/regions/{id}/sandbox-grid` | `GET` | Returns `sandbox_grid.json` for the Tactical Containment Sandbox. |

---

## 6. People, Roles & AI Agent Assignments

| # | Role | Owns | Primary Agent | Why This Agent |
| :--- | :--- | :--- | :--- | :--- |
| **P1** | **Integrator + Pitch Lead** | `contracts/`, root docs, CI, merges, deploy, slides, video | **Gemini Pro #1** | Massive context window for reviewing full-repo diffs and contract compliance. |
| **P2** | **Data Ingestion + Sandbox Inputs** | `pipeline/ingest/`, `pipeline/sandbox_inputs/` | **ChatGPT Plus #1 (Codex)** | Fast, reliable Python/DuckDB/H3 data engineering scripts. |
| **P3** | **Harmonization Scientist** | `pipeline/harmonize/` | **Claude Pro #1 (Fable)** | Critical scientific path; drives the **Validity** and **Relevance** scores. |
| **P4** | **Backend API** | `backend/` | **ChatGPT Plus #2 (Codex)** | Standard FastAPI + DuckDB spatial query and CSV streaming endpoints. |
| **P5** | **Frontend: Map, Calendar, Export** | `frontend/src/app`, `map`, `calendar`, `export` | **Claude Pro #2 (Fable)** | Primary user-facing visual surface; drives **Presentation** and **Usability**. |
| **P6** | **Sandbox: Simulation + Optimizer** | `frontend/src/features/sandbox/` | **Claude Pro #3 (Fable)** | Complex browser algorithms (Web Worker CA, Min-Cut graph solver, Monte Carlo). |
| **—** | **Relief Pool** | Any role hitting token limits | **Gemini Pro #2, #3** | Takes over seamlessly via `HANDOFF.md` when any primary agent reaches $80\text{--}90\%$ quota. |

### Detailed Role Checklists

* **P1 (Integrator + Pitch Lead):**
  1. **Hour 1:** Initialize repo, create `AGENTS.md` (with `CLAUDE.md` and `GEMINI.md` importing it), commit JSON schemas and realistic mock files in `contracts/mocks/`, then freeze contracts.
  2. Merge PRs every $30\text{--}60\text{ min}$, run integration checks, maintain `PLAN.md` and `DECISIONS.md`.
  3. From Saturday evening: manage Vercel + Render deployments, slide deck, demo video, and pitch rehearsal.
* **P2 (Data Ingestion + Sandbox Inputs):**
  1. **Minute 0:** Request free FIRMS `MAP_KEY` (`firms.modaps.eosdis.nasa.gov/api/map_key`) and pull historical data via three parallel routes:
     * *Route A (Primary History):* Yearly country summary ZIPs on `firms.modaps.eosdis.nasa.gov/download` (`MODIS`, `VIIRS S-NPP`, `NOAA-20`, `NOAA-21` for Argentina, USA, Romania).
     * *Route B (Backup):* Archive Download tool bounding-box requests for the 3 regions.
     * *Route C (Recent Tail + Live):* Area API `/api/area/csv/<KEY>/<SOURCE>/<w,s,e,n>/<1..5>/<YYYY-MM-DD>`. Never use the deprecated `country` endpoint.
  2. Normalize schemas, filter `type == 0` and `confidence != low`, clip to region bounding boxes, bin to H3 res-7 $\to$ `points.parquet` and `hex_day.parquet` (land **Río Negro first**).
  3. Sample ESA WorldCover (`landcover` $\to$ `asset_type`, `burnable`) and Open-Meteo elevation (`elevation_m`, `slope_deg`), merge with `P3`'s fire history $\to$ `sandbox_grid.json`.
* **P3 (Harmonization Scientist):**
  1. Develop against synthetic data in Hour 1; switch to Río Negro `hex_day.parquet` as soon as `P2` lands it.
  2. Compute active fire cell-days per sensor/month, fit monthly overlap factors on $2012\text{--}2020$ (separating Terra-only $2000\text{--}2002$, Aqua/Terra MODIS, S-NPP, and NOAA-20/21), and evaluate $\text{MAE}_{\text{test}}$ on $2021\text{--}2025$ $\to$ `calibration.json`.
  3. Generate `calendar.json` with `anomaly_z`, uncertainty bands, and sparse-polygon fallback logic, plus `burn_count` and `years_since_last_fire` per hex for `sandbox_grid.json`.
* **P4 (Backend API):**
  1. Scaffold FastAPI serving `contracts/mocks/` in Hour 1 so `P5` and `P6` can integrate immediately.
  2. Implement DuckDB polygon-in-region queries (`POST /api/calendar`), streaming CSV exports (`/api/export/points`, `/api/export/calendar`), cached NRT proxy (`/api/nrt`), and deploy to Render.
* **P5 (Frontend — Map, Calendar, Export):**
  1. Build MapLibre + `deck.gl` `H3HexagonLayer` + `terra-draw` polygon tool + 3 region preset buttons + static JSON fallback loader.
  2. Build the 26-year $\times$ 12-month **Burning Activity Calendar** with colorblind-safe palette switcher (`Cividis` default, `Viridis`, `Inferno`), `is_estimated` and `is_nrt` badges, and rich tooltips.
  3. Build the centerpiece **`[ Raw Unharmonized ]` $\leftrightarrow$ `[ Harmonized (S-NPP Equivalent) ]` Toggle**, time-series chart showing the $2012$ sensor jump disappearing, IQR anomaly cards, CSV export buttons, and the **"Launch Tactical Containment Sandbox"** trigger.
* **P6 (Tactical Containment Sandbox):**
  1. Build against `contracts/mocks/sandbox_grid.json` from Hour 1 inside `frontend/src/features/sandbox/`.
  2. Implement the H3 Cellular Automata engine in a Web Worker driven by Open-Meteo wind (with interactive gust/wind-shift sliders), slope, ESA WorldCover, and harmonized `years_since_last_fire`.
  3. Implement the **8-Step Firefighter Workflow UI**: UAV perimeter overlay, the 4 physical interventions (💧 *Apă*, 🪓 *Defrișare*, 🚜 *Șanț Buldozer*, 🔥 *Foc Tactic*), **Min-Cut + Monte Carlo AI Optimizer**, side-by-side scoreboard (Villages Protected, Farms Protected, Hectares Burned, Containment %, Crew Exit Route status), **Draft RO-ALERT Advisory modal**, and the **"Illustrative Scenario Tool"** badge.

---

## 7. Execution Timeline & Milestones

| Window | Milestone |
| :--- | :--- |
| **Sat 12:00–13:00** | Repo initialized, `AGENTS.md` + `contracts/` + mocks committed (`P1`). FIRMS downloads running (`P2`). All agents primed. |
| **Sat 13:00–19:00** | `P3`–`P6` build against Hour-1 mocks. `P2` lands **Río Negro** Parquet files first. |
| **Sat 19:00 — Checkpoint A** | **End-to-End Río Negro Vertical Slice:** Real harmonized calendar rendered in frontend via backend; Raw $\leftrightarrow$ Harmonized toggle removes the 2012 step jump. |
| **Sat 19:00–Sun 02:00** | All 3 regions (`rio_negro`, `california`, `romania`) processed; custom polygon queries, CSV exports, NRT overlay, and Sandbox running on real grids. |
| **Sun 09:00 — Checkpoint B** | Full integration deployed on Vercel + Render (with static JSON fallback verified). Calendar launches Sandbox seamlessly. |
| **Deadline − 3 Hours** | **Strict Feature Freeze.** Only bug fixes, slide polish, demo video recording, and pitch rehearsal. |

---

## 8. Mandatory Agent Rules (Copy Directly into `AGENTS.md`)

```markdown
# AGENTS.md — Operational Rules for All Coding Agents

1. **Strict Folder Ownership:** Work ONLY inside your assigned directory (`P1`: root & `contracts/`, `P2`: `pipeline/ingest` & `pipeline/sandbox_inputs`, `P3`: `pipeline/harmonize`, `P4`: `backend/`, `P5`: `frontend/src/{app,features/map,features/calendar,features/export}`, `P6`: `frontend/src/features/sandbox`).
2. **Frozen Contracts:** Never modify schemas in `contracts/` without explicit sign-off from P1.
3. **Commit Discipline:** After completing each sub-task, run tests/linters, commit with a clear message, check off the item in `PLAN.md`, and log architectural choices in `DECISIONS.md`.
4. **Token Limit Handoff Protocol (80–90% Quota):** Before hitting rate limits, update `HANDOFF.md` with: (a) Completed items, (b) In-progress files, (c) Known bugs, (d) Next 3 concrete steps, and (e) Gotchas. Commit immediately so a Gemini Pro relief agent can take over.
5. **New Agent Priming Prompt:**
   > "Read AGENTS.md, TEAM_PLAN.md, PLAN.md, DECISIONS.md, HANDOFF.md and the README of my folder, then run `git log -10` and the test suite. Summarize your role and current state before editing any files."
6. **Security & Scientific Integrity:**
   - Never commit API keys or secrets (`FIRMS_MAP_KEY` belongs only in `backend/.env`).
   - Never hardcode or fabricate validation metrics, anomaly scores, or simulation readouts—all numbers displayed in the UI must be computed from the data or simulation engine.
   - Always label `anomaly_z` as "IQR Anomaly Score" (never "sigma"), and always display the "Illustrative Scenario Tool" disclaimer on the Tactical Containment Sandbox.
```

---

## 9. Judging Rubric Alignment & 30-Second Pitch Script

### Rubric Coverage
* **Relevance:** Directly solves the MODIS ($1\text{ km}$) to VIIRS ($375\text{ m}$) and S-NPP-to-NOAA-20/21 continuity gap across $2000\text{--}2026$, delivers the interactive **Burning Activity Calendar**, compares monthly activity against historical medians, uses colorblind-safe ramps (`Cividis`), and exports raw + harmonized CSVs.
* **Validity:** Uses H3 Resolution-7 active fire cell-days, separates morning/afternoon orbits, filters industrial gas flares (`type == 0`), trains strictly on $2012\text{--}2020$, and reports held-out $2021\text{--}2025$ test error (`test_mae`).
* **Creativity & Impact:** Bridges 26 years of satellite burn history into a real-world **Tactical Containment Sandbox** modeled on authentic Romanian wildland firefighting doctrine (*drone perimeter, fuel-debt analysis, bulldozer trenches, timber clearing, village/farm triage, crew exit routes, and draft RO-ALERT advisories*).

### 30-Second Pitch Opening Hook
> *"For 26 years, NASA satellites have tracked global wildfires—but because MODIS is retiring, Suomi-NPP ended new data delivery in November 2026, and VIIRS detects fires at nearly three times the spatial resolution, comparing today's fire season to 2005 in raw data creates an artificial spike after 2012. Our platform unifies MODIS, S-NPP, and NOAA-20/21 into a single, validated S-NPP-equivalent Burning Activity Calendar. Watch what happens in Río Negro, Argentina and Romania's Carpathians when we flip our Raw-to-Harmonized toggle: sensor bias disappears, true IQR anomalies emerge, and incident commanders can launch our Tactical Containment Sandbox—using 26 years of unburned fuel history to test bulldozer trenches, timber firebreaks, and crew escape routes alongside an AI Min-Cut optimizer."*