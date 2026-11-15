# features/sandbox/ (owner: P6): Tactical Containment Sandbox

Spec: `TEAM_PLAN.md` §3 (firefighter doctrine) and §0.3–0.5. Never call it a "game".

## Inputs

| Input | Source |
|---|---|
| Hex grid | `SandboxGrid` (`src/types/contracts.ts`): `GET /api/regions/<id>/sandbox-grid`, fallback `public/data/<id>/sandbox_grid.json`, mock `contracts/mocks/<id>/sandbox_grid.json` (generated with `uv run`) |
| t = 0 fire | Live hotspots `GET /api/nrt?bbox=...&days=1..7` inside the user's drone recon polygon; if none, a user-placed ignition |
| Wind | Open-Meteo forecast API (no key) at the area centroid, called from the browser |

## Mechanics (TEAM_PLAN §3.2)

For burning hex i and burnable neighbor j each step:

```
P(i→j) = clamp( P0 · Φfuel(j) · (1 + γw · max(0, ŵ·d̂ij)) · (1 + γs · tan θij) · (1 − Rtool(j)), 0, 1 )
Φfuel(j) = BaseFlammability(landcover_j) · min(1.5, 0.25 + 0.08 · years_since_last_fire_j)
```

- `θij` from `elevation_m` of i and j and the center distance (`h3.greatCircleDistance`); `slope_deg` in the grid is a per-cell summary for display.
- `years_since_last_fire = null` (never burned) → treat as the cap (1.5 multiplier).
- Suggested BaseFlammability: forest 1.0 (boost above 800 m for coniferous montane), shrub 0.9, grass 0.8, farm 0.5, village 0.3, everything else 0 (`burnable: false`; rivers are natural barriers).
- Burn severity may use `burn_count`/`frp_sum` as a weight.
- Runs in a **Web Worker**; same random seeds for human and AI runs so the comparison is fair. Hex area at res 7 ≈ 5.16 km² (use `h3.cellArea`).

## The 8-step workflow UI

1. **Drone Perimeter Recon** (*Determinare perimetru prin drone*): user draws a UAV recon polygon; NRT hotspots inside it ignite at t = 0.
2. **Terrain & Natural Barriers** (*Analiza terenului*): elevation/slope shading, rivers highlighted as anchors.
3. **Biomass & Fuel History** (*Analiza biomasă / combustibil*): fuel layer from land cover + years since last fire (recent burns 1–3 yrs = depleted, >10 yrs = high fuel debt).
4. **Weather** (*Consultare prognoza meteo*): live wind + **gust / wind-shift slider**.
5. **Attack Strategy** (*Strategie de atac*): fixed resource budget, human places interventions, then a 72 h run. **AI optimizer:** min-cut on the spread graph proposes anchor lines (often into rivers and recent burn scars), scored by Monte Carlo rollouts with the identical budget.
6. **Damage Control: 4 interventions** (each sets `Rtool` on the hexes it covers):
   - 💧 Aerial / Water Drop (*Apă*): instant, short-lived suppression on active fire hexes
   - 🪓 Controlled Timber Clearing (*Defrișare Controlată*): removes canopy fuel on forest (10) hexes
   - 🚜 Bulldozer Mineral Trench (*Șanț / Rupere Strat Biologic*): blocks surface/litter spread
   - 🔥 Strategic Backfire (*Foc Tactic*): burns fuel ahead of the front from an anchored barrier
7. **Asset Triage** (*Determinare potențiale pagube*): villages (*Sate*, `asset_type: village`) first, farms (*Ferme*) second, hectares third.
8. **Crew Exit Route & Civil Alert**: check an unblocked escape corridor from the deployment line to a road/river barrier; generate a **draft RO-ALERT-style advisory** (JSON/text: threatened village hexes, estimated arrival window, evacuation direction upwind/orthogonal to the wind). It is a draft for civil protection, an open-source module, never an official alert.

## Scoreboard (human vs. AI, side by side)

Villages protected · Farms protected · Hectares burned · Containment % · Crew exit route status. **Every number comes from the simulation runs.** Nothing hardcoded.

## Required banner (always visible)

`SANDBOX_BANNER` in `contracts.ts`:
> Illustrative Counterfactual Scenario Tool — Driven by Harmonized FIRMS Fuel History, ESA WorldCover & Open-Meteo (Not an Operational Forecast)

## Suggested structure

```
sandbox/
├── engine/      cellular automaton (pure TS, no React), Web Worker entry
├── optimizer/   min-cut candidate lines + Monte Carlo scoring
├── advisory/    exit-route check + RO-ALERT-style draft generator
├── ui/          map overlay, 8-step panel, tools palette, sliders, scoreboard
└── index.ts     public entry: <Sandbox regionId area />
```

## As built (P6, Sun 15 Nov)

```
sandbox/
├── index.tsx     entry: loads the grid, loading/error states, MOCK DATA label
├── engine/       model.ts (neighbours, fuel), simulate.ts (the formula, 1 h steps), rng.ts (seeded,
│                 counter-based), wind.ts, tools.ts (4 interventions, budget), score.ts,
│                 service.ts + worker.ts + client.ts (Web Worker, in-thread fallback)
├── optimizer/    greedy.ts: "Algorithmic optimizer (greedy, simulation-scored)". No min-cut yet.
├── advisory/     exitRoute.ts (crew exit check), draft.ts (draft advisory text + JSON)
├── recon/        hotspots.ts (live hotspots inside the drawn area → ignition hexes)
├── weather/      openMeteo.ts (current wind, no key)
└── ui/           SandboxView.tsx (state), HexMap.tsx (canvas), panels, scoreboard, advisory modal
```

- Constants that the spec leaves open (P0, γw, γs, burn durations, tool strengths, costs, delays, budget) are
  illustrative and listed in `DECISIONS.md` under "P6 sandbox defaults". Change them in `engine/model.ts` and
  `engine/tools.ts`; the tests pin the formula, not the constants.
- Tests: `npm run test` (engine, optimizer, advisory, recon, weather parsing). On Windows run it from a path
  with the drive letter in upper case (`C:\...`), otherwise vitest fails with "failed to find the current suite".
- Not built: min-cut + Monte Carlo optimizer. Real grids need no code change, only P2's `sandbox_grid.json`.

