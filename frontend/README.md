# frontend/ (owners: P5, and P6 for `src/features/sandbox/`)

Vite + React + TypeScript + Tailwind. Not scaffolded yet on purpose: P5 runs the scaffold on their machine (needs npm).

## First-time scaffold (P5, once)

```bash
cd frontend
npm create vite@latest . -- --template react-ts    # choose "Ignore files and continue" when asked
npm install
npm install maplibre-gl @deck.gl/core @deck.gl/layers @deck.gl/geo-layers @deck.gl/mapbox \
  terra-draw terra-draw-maplibre-gl-adapter h3-js d3-scale d3-scale-chromatic recharts
npm install -D tailwindcss @tailwindcss/vite @types/geojson @types/d3-scale @types/d3-scale-chromatic
```

Keep the existing `src/types/contracts.ts` and folder layout. Dependencies for the sandbox (`h3-js`) are already in this list, so P6 doesn't need to touch `package.json`.

## Run it (scaffold is done)

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173, backend expected on VITE_API_URL (default http://localhost:8000)
npm run build      # type-check + production build (CI runs this)
npm test           # vitest unit tests (calendar model, CSV, geometry)
npm run lint       # oxlint
npm run sync-data  # refresh public/data/ from data/processed/, else contracts/mocks/ (also runs before dev/build)
```

The app works with the backend down: whole-region calendars, calibration and sandbox grids come from `public/data/`. Drawn-area calendars, the hotspot CSV and live hotspots need the backend, and the UI says so when it is missing. Commit `public/data/` after `sync-data` changes it, so the deployed build carries the latest fallback.

Where things live: `src/app/api.ts` (all fetching + fallback), `src/app/App.tsx` (state: region, drawn polygon, sandbox open), `src/features/calendar/model.ts` (every derived number), `src/features/map/MapPanel.tsx` (MapLibre, terra-draw, deck.gl), `src/features/export/`, `src/app/SandboxHost.tsx` (mounts P6's `features/sandbox/index.tsx`).

## Layout and ownership

```
frontend/
├── package.json, vite config, index.html     scaffold + config          [P5]
└── src/
    ├── app/                 shell, routing, data loading, fallback        [P5]
    ├── features/map/        MapLibre + deck.gl, region presets, draw      [P5]
    ├── features/calendar/   heatmap, toggle, anomaly cards, charts        [P5]
    ├── features/export/     CSV download buttons                          [P5]
    ├── features/sandbox/    Tactical Containment Sandbox                  [P6]
    └── types/contracts.ts   shared types, mirrors contracts/              [P1]
```

## Data

- API base: `VITE_API_URL` (default `http://localhost:8000`). Endpoints: `contracts/api.md`.
- **Static fallback (TEAM_PLAN §1):** the build bundles `public/data/<region_id>/calendar.json`, `calibration.json` and `sandbox_grid.json` for the 3 regions (copy from `data/processed/`, or from `contracts/mocks/` until real data exists). If the API fails, load these. The demo must work offline.
- Region ids: `rio_negro`, `california`, `romania`.

## Calendar (P5): what the plan requires

1. MapLibre + deck.gl `H3HexagonLayer` + terra-draw polygon tool + lat/lon input + 3 region preset buttons.
2. **26-year × 12-month Burning Activity Calendar:** rows = years, columns = months (consider a July→June season view for Río Negro). Palette switcher **Cividis (default)**, Viridis, Inferno. Mark `is_estimated` months (hatching/dot) and `is_nrt` months (outline). Rich tooltips: harmonized, raw MODIS/VIIRS, monthly median, anomaly, uncertainty, source satellite.
3. The centerpiece toggle **`[ Raw Unharmonized ]` ↔ `[ Harmonized (S-NPP Equivalent) ]`**: harmonized = `m.harmonized`, raw = `rawValue(m)`. In raw mode the 2012 jump must be obvious.
4. Time-series chart showing the 2012 jump disappearing; **validation badge** with `test_mae` from `calibration.json` (held-out 2021–2025).
5. Anomaly cards ("this month vs. historical median"), labeled **"IQR Anomaly Score (Z_IQR)"** (`ANOMALY_LABEL` in `contracts.ts`). Never "sigma".
6. CSV export buttons (points + calendar), and the **"Launch Tactical Containment Sandbox"** button (from an anomalous cell or an NRT hotspot cluster), passing region and area to P6.
7. Show a visible "MOCK DATA" badge whenever `is_mock` is true.

## Sandbox (P6)

See `src/features/sandbox/README.md`.
