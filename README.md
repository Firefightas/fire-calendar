# Fire Calendar: Harmonized MODIS + VIIRS Burning Activity Calendar

NASA Space Apps Challenge 2026, Challenge #9: *Harmonization of MODIS and VIIRS Hot Spots* (by CONAE).

One consistent 2000-to-today record of satellite fire hotspots, shown as a burning activity calendar for any area you draw, plus a Tactical Containment Sandbox based on real firefighting doctrine.

- **Stage 1, Harmonization:** MODIS (2000→), VIIRS S-NPP (2012 → Nov 2026) and NOAA-20/21 hotspot counts converted to one scale (`SNPP_VIIRS_EQ` active fire cell-days), so the satellite of origin no longer matters.
- **Stage 2, Burning Activity Calendar:** 26 years × 12 months heatmap, Raw ↔ Harmonized toggle, IQR anomalies vs. the historical median, CSV export, live NRT overlay.
- **Stage 3, Tactical Containment Sandbox:** illustrative fire-spread simulation following a Romanian firefighter's 8-step protocol; a human and an optimizer place interventions with the same budget. Not an operational forecast.

The full plan is [TEAM_PLAN.md](TEAM_PLAN.md).

## Start here

| If you are... | Read |
|---|---|
| A person on the team | [WORKFLOW.md](WORKFLOW.md), then your role in [TEAM_PLAN.md](TEAM_PLAN.md) |
| An AI agent | [AGENTS.md](AGENTS.md), then [TEAM_PLAN.md](TEAM_PLAN.md) |
| Looking for the data formats | [contracts/](contracts/) |

## Quick start

```bash
# Python (pipeline, backend, tests)
uv sync --all-groups
uv run pytest                                   # checks the mocks match the contracts

# Backend (serves mocks until real data lands)
uv run uvicorn backend.app.main:app --reload    # http://localhost:8000/api/regions

# Frontend (P5 scaffolds it first, see frontend/README.md)
cd frontend && npm install && npm run dev
```

## Repo map

```
AGENTS.md        brief every agent reads first (CLAUDE.md / GEMINI.md point here)
TEAM_PLAN.md     the master plan: science, sandbox spec, contracts, roles, timeline
WORKFLOW.md      how we work together
PLAN.md          live task checklist + current state
DECISIONS.md     one line per decision and why
HANDOFF.md       written when an agent runs out of usage
contracts/       data schemas, API spec, mock data (source of truth)
pipeline/        ingest (P2), harmonize (P3), sandbox_inputs (P2)
backend/         FastAPI (P4)
frontend/        React app (P5), sandbox feature (P6)
data/            raw (gitignored) and processed outputs
tests/           contract tests
```

## Data acknowledgment

We acknowledge the use of data from NASA's Fire Information for Resource Management System (FIRMS), part of NASA's LANCE and ESDIS.
