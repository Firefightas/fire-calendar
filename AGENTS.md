# AGENTS.md: read this before doing anything

You are an AI coding agent on a 6-person hackathon team (NASA Space Apps 2026, Challenge #9). Several different agents (Claude, Codex, Gemini) work on this repo in parallel from different laptops. **The repo is the only shared memory.** If something matters, it goes in a file and gets committed.

## On startup, every time

1. Read: `AGENTS.md` (this), `TEAM_PLAN.md`, `PLAN.md`, `DECISIONS.md`, `HANDOFF.md`, and the `README.md` of the folder you own.
2. Run `git log --oneline -10` and the tests (`uv run pytest`, plus `npm test` in `frontend/` if it exists).
3. Ask the human which role you are (P1–P6) if they haven't said.
4. Summarize your role, the current state, and your next task **before changing anything**.

## What we are building

A web app that turns NASA FIRMS fire hotspots from MODIS (Nov 2000→) and VIIRS (S-NPP Jan 2012 → 2 Nov 2026; NOAA-20 Apr 2018→; NOAA-21 Jan 2024→) into one harmonized monthly **burning activity calendar** for a user-selected area, with anomalies vs. the historical median and CSV export. Plus a browser-based containment sandbox. Full detail: `TEAM_PLAN.md`.

## Ownership: only edit what you own

| Role | Owns |
|---|---|
| P1 Integrator | root docs, `contracts/`, `tests/`, `.github/` |
| P2 Data ingestion | `pipeline/ingest/`, `pipeline/sandbox_inputs/` |
| P3 Harmonization | `pipeline/harmonize/` |
| P4 Backend | `backend/` |
| P5 Frontend | `frontend/` except `frontend/src/features/sandbox/` |
| P6 Sandbox | `frontend/src/features/sandbox/` |

Need a change outside your folder? Write it in `PLAN.md` under "Requests" and tell your human. **Never edit `contracts/` unless you are P1.**

## Stack

- Python 3.11, `uv`, pandas, DuckDB, h3, pyarrow (pipeline); FastAPI (backend).
- Vite + React + TypeScript + Tailwind, MapLibre GL, deck.gl, terra-draw, d3-scale-chromatic, Recharts (frontend).
- Sandbox: TypeScript, h3-js, Canvas, Web Worker.
- Shared types for the contracts: `frontend/src/types/contracts.ts` (mirrors `contracts/*.schema.json`).

## Commands

```bash
uv sync --all-groups                               # install Python deps
uv run pytest                                      # contract + unit tests
uv run ruff check .                                # lint
uv run uvicorn backend.app.main:app --reload       # backend on :8000
uv run python contracts/mocks/generate_mocks.py    # regenerate mocks (P1 only)
cd frontend && npm run dev                         # frontend on :5173
```

## Rules

1. **Contracts are law.** Produce and consume exactly the shapes in `contracts/`. Until real data exists, build against `contracts/mocks/`.
2. **Science rules** (details in `TEAM_PLAN.md` §2): learn calibration only on overlap years; never add MODIS + VIIRS counts together; mark converted years `is_estimated`; never present a number that wasn't computed from data.
3. **Secrets** never enter the repo or the chat. The FIRMS MAP_KEY lives only in `backend/.env` (gitignored).
4. **Raw data** never enters git. It lives in `data/raw/` (gitignored).
5. **Small commits**, descriptive messages, on your branch `feat/<role>-<topic>`. Never push to `main`.

## After every task

1. Run the tests and lint; fix until green.
2. Commit.
3. Tick the task in `PLAN.md` and update its "Current state" line for your role.
4. Log any non-obvious choice in `DECISIONS.md` (one line + why).
5. Push and open a PR (`gh pr create`) at least every 30–60 minutes.

## When usage is about to run out (80–90%)

Write `HANDOFF.md` (done, in progress with files, broken, next 3 steps, gotchas), commit, push. The next agent starts from the startup steps above.
