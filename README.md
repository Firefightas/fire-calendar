# Fire Calendar: Harmonized MODIS + VIIRS Burning Activity Calendar

NASA Space Apps Challenge 2026, Challenge #9: *Harmonization of MODIS and VIIRS Hot Spots* (by CONAE).

One consistent 2000-to-today record of satellite fire hotspots, shown as a burning activity calendar for any area you draw, plus a tactical containment sandbox.

- **Stage 1, Harmonization:** MODIS (2000→) and VIIRS (2012→) hotspot counts converted to one common scale, so the satellite of origin no longer matters.
- **Stage 2, Calendar:** years × months heatmap, raw vs. harmonized toggle, anomalies against the historical median, CSV export.
- **Stage 3, Sandbox:** illustrative fire spread simulation where a human and an optimizer place firebreaks with the same budget.

## Start here

| If you are... | Read |
|---|---|
| A person on the team | [WORKFLOW.md](WORKFLOW.md), then your role in [TEAM_PLAN.md](TEAM_PLAN.md) |
| An AI agent | [AGENTS.md](AGENTS.md) |
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
TEAM_PLAN.md     roles, stack, science decisions, timeline
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
