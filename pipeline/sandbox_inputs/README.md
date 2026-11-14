# pipeline/sandbox_inputs/ (owner: P2, with P3 for fire history)

Builds `data/processed/<region>/sandbox_grid.json` (schema: `contracts/sandbox_grid.schema.json`) for P6's simulation. One cell per H3 res-7 hex.

| Field | Source |
|---|---|
| `landcover` | ESA WorldCover 10 m, majority class per hex (10 tree, 20 shrub, 30 grass, 40 crop, 50 built, 60 bare, 80 water) |
| `burnable` | landcover in {10, 20, 30, 40} |
| `elevation_m` | Open-Meteo elevation API (no key) at the hex center, batched |
| `burn_count` | harmonized fire cell-days in the hex over the whole record (from `hex_day`, with P3's factors) |
| `years_since_last_fire` | years since the hex's last detection; `null` if never |

Scope: don't build the whole province. A sub-area of ~1,000–5,000 hexes around the demo fire (Choele Choel for Río Negro) is enough for the sandbox.

Honesty note for the pitch: hotspot history is a **proxy** for fuel depletion, not a fuel map, and absence of hotspots can mean cropland, water or cloud. Land cover masks the obvious cases.
