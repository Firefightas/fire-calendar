# features/sandbox/ (owner: P6)

Tactical Containment Sandbox: illustrative fire spread on an H3 res-7 grid, with a human and an optimizer placing containment under the same budget.

## Inputs

`SandboxGrid` from `src/types/contracts.ts` (mock: `contracts/mocks/<region>/sandbox_grid.json`). Wind: Open-Meteo forecast API (no key) at the area center.

## Suggested structure

```
sandbox/
├── engine/        cellular automaton (pure TS, no React), runs in a Web Worker
├── optimizer/     min-cut candidate firebreaks + Monte Carlo scoring
├── ui/            map overlay, budget panel, timeline, side-by-side readout
└── index.ts       public entry: <Sandbox regionId area />
```

## Rules

- Spread probability from neighbor i to j uses wind alignment, slope (elevation difference), and fuel (land cover + years since last fire). Non-burnable cells never ignite.
- Same random seeds for the human and optimizer runs, so the comparison is fair.
- Every number on screen (hectares, containment %) comes from the runs. Hex area at res 7 ≈ 5.16 km² (use `h3.cellArea`).
- Visible label: "Illustrative scenario, not an operational forecast."
