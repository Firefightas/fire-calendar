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

Keep the existing `src/types/contracts.ts` and folder layout.

## Layout and ownership

```
src/
├── app/                 shell, routing, data fetching            [P5]
├── features/map/        MapLibre + deck.gl, region presets, draw  [P5]
├── features/calendar/   heatmap, toggle, anomaly cards, charts    [P5]
├── features/export/     CSV download buttons                      [P5]
├── features/sandbox/    simulation, optimizer, sandbox UI         [P6]
└── types/contracts.ts   shared types (P1, mirrors contracts/)
```

## Data

- API base: `VITE_API_URL` (default `http://localhost:8000`). Endpoints: `contracts/api.md`.
- **Fallback:** if the API fails, load `/data/<region>/calendar.json` from `public/data/` (copy from `contracts/mocks/` or `data/processed/`). The demo must never die because of the backend.
- **Raw ↔ Harmonized toggle:** harmonized = `m.harmonized`; raw = `rawValue(m)` from `contracts.ts` (VIIRS if present, else MODIS). In raw mode the 2012 jump must be obvious.
- Mark `is_estimated` months (hatching or a dot) and `is_nrt` months (outline). Show `is_mock` data with a visible "MOCK DATA" badge.

## Calendar design rules

- Rows = years, columns = months. For southern-hemisphere regions, consider a July→June season view.
- Color: Cividis by default; switcher with Viridis and Inferno (all colorblind-safe). Anomaly view uses a diverging ramp centered on 0.
- Tooltip: harmonized value, raw MODIS/VIIRS, median for that month, anomaly, uncertainty, source satellite.
- Headline card: "This month vs. historical median" for the selected area.

## Sandbox (P6)

Opened from the calendar with the selected area. Load `/api/regions/<id>/sandbox-grid` (mock: `contracts/mocks/<region>/sandbox_grid.json`, generated with `uv run`). Simulation runs in a Web Worker. Visible label: "Illustrative scenario, not an operational forecast."
