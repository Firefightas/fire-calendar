# AGENTS.md: operational rules for all coding agents

You are an AI coding agent on a 6-person hackathon team (NASA Space Apps 2026, Challenge #9). Claude, Codex and Gemini agents work on this repo in parallel from different laptops. **The repo is the only shared memory.** If something matters, it goes in a file and gets committed.

## On startup, every time

1. Read: `AGENTS.md` (this), `TEAM_PLAN.md` (the master plan), `PLAN.md`, `DECISIONS.md`, `HANDOFF.md`, and the `README.md` of the folder you own.
2. Run `git log --oneline -10` and the tests (`uv run pytest`, plus `npm run build` in `frontend/` if it exists).
3. Ask the human which role you are (P1–P6) if they haven't said.
4. Summarize your role, the current state and your next task **before editing any files**. List anything in the docs that is unclear or contradictory.

## What we are building (details: `TEAM_PLAN.md`)

1. **Harmonization:** MODIS (Nov 2000→), VIIRS S-NPP (Jan 2012 → 2 Nov 2026, ended), NOAA-20 (Apr 2018→) and NOAA-21 (Jan 2024→) hotspots converted to one scale, `SNPP_VIIRS_EQ` active fire cell-days.
2. **Burning Activity Calendar:** web app, 26 years × 12 months for any area drawn inside 3 precomputed regions (`rio_negro`, `california`, `romania`), Raw ↔ Harmonized toggle, IQR anomalies vs. the historical median, CSV export, live global NRT overlay.
3. **Tactical Containment Sandbox:** browser simulation following a Romanian firefighter's 8-step field protocol, human vs. AI optimizer with the same budget.

## 1. Strict folder ownership

| Role | Owns |
|---|---|
| P1 Integrator + pitch | root docs, `contracts/`, `tests/`, `.github/`, `frontend/src/types/contracts.ts` |
| P2 Data ingestion | `pipeline/ingest/`, `pipeline/sandbox_inputs/` |
| P3 Harmonization | `pipeline/harmonize/` |
| P4 Backend | `backend/` |
| P5 Frontend | `frontend/src/{app,features/map,features/calendar,features/export}` + frontend config (`package.json`, vite config, `index.html`, `public/`) |
| P6 Sandbox | `frontend/src/features/sandbox/` |

Work **only** inside your folders. Need a change elsewhere? Add it under "Requests" in `PLAN.md` and tell your human.

## 2. Frozen contracts

`contracts/` is the source of truth for every data shape (schemas, `tables.md`, `api.md`, mocks). Never modify it without explicit sign-off from P1. Until real data exists, build against `contracts/mocks/<region_id>/`.

## 3. Commit discipline (after every sub-task)

1. Run the tests and linters (`uv run pytest`, `uv run ruff check .`); fix until green.
2. Commit with a clear message on your branch `feat/<role>-<topic>` (never push to `main`).
3. Tick the item in `PLAN.md` and update your "Current state" line.
4. Log non-obvious or architectural choices in `DECISIONS.md` (one line + why).
5. Push and open a PR (`gh pr create`) at least every 30–60 minutes.

## 4. Token-limit handoff (at 80–90% quota)

Before you hit the limit, update `HANDOFF.md` with: (a) completed items, (b) in-progress files and their exact state, (c) known bugs, (d) next 3 concrete steps, (e) gotchas. Commit and push immediately so a Gemini Pro relief agent can take over.

## 5. New agent priming prompt

> "Read AGENTS.md, TEAM_PLAN.md, PLAN.md, DECISIONS.md, HANDOFF.md and the README of my folder, then run `git log -10` and the test suite. Summarize your role and current state before editing any files."

## 6. Security and scientific integrity

- Never commit API keys or secrets. `FIRMS_MAP_KEY` lives only in `backend/.env` (gitignored). Never paste it into a chat.
- Raw data never enters git (`data/raw/` is gitignored).
- Never hardcode or fabricate validation metrics, anomaly scores or simulation readouts. Every number in the UI is computed from the data or the simulation engine. Mock data is always labeled "MOCK DATA".
- Calibration factors are learned on 2012–2020 only and tested on 2021–2025. Never fit across all years. Never add MODIS and VIIRS counts together.
- Always label `anomaly_z` as **"IQR Anomaly Score (Z_IQR)"**, never "sigma".
- Never call Stage 3 a "game". It is the **Tactical Containment Sandbox** and always shows the banner: *Illustrative Counterfactual Scenario Tool — Driven by Harmonized FIRMS Fuel History, ESA WorldCover & Open-Meteo (Not an Operational Forecast)*.
- Agencies (IGSU/DSU Romania, CONAE, CAL FIRE) are open-science stakeholders, never "buyers". The RO-ALERT-style output is a draft advisory module, never an official alert.

## Stack and commands

Python 3.11 + `uv`, pandas, DuckDB, h3, pyarrow (pipeline); FastAPI (backend); Vite + React + TS + Tailwind, MapLibre, deck.gl, terra-draw, d3-scale-chromatic, Recharts (frontend); TS + h3-js + Canvas + Web Worker (sandbox).

```bash
uv sync --all-groups                               # install Python deps
uv run pytest                                      # contract + unit tests
uv run ruff check .                                # lint
uv run uvicorn backend.app.main:app --reload       # backend on :8000
uv run python contracts/mocks/generate_mocks.py    # regenerate mocks (P1 only)
cd frontend && npm run dev                         # frontend on :5173
```
