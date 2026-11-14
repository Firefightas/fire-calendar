# HANDOFF.md

Overwrite your role's section when your agent is about to run out of usage (80–90%). Commit and push right after.

Template:

```
## <Role> — <date time> — <agent that wrote this>
Done:
In progress (files + exact state):
Broken / known issues:
Next 3 steps:
1.
2.
3.
Gotchas:
```

---

## P5 Frontend — Sat 14 Nov 2026 — Claude (Fable)
Done: all P5 items in PLAN.md, including the calibration panel, the month-to-date label and the integration with P4's deployed backend (drawn-area calendar, both CSV exports, cold-start handling; verified end to end on mocks against https://fire-calendar.onrender.com).
In progress (files + exact state): nothing half-written.
Broken / known issues: the live overlay shows "Unavailable" because the backend's FIRMS requests return 502 (P4/P1 are on it; the frontend needs no change). The sandbox button opens a placeholder until P6 adds `frontend/src/features/sandbox/index.tsx`.
Next 3 steps:
1. When P2/P3 land real Río Negro files: `cd frontend && npm run sync-data`, commit `public/data/`, check the page (Checkpoint A).
2. Re-check the live overlay once `/api/nrt` returns 200.
3. Check the sandbox launch once P6's entry file exists.
Gotchas: `gh` is not installed on this laptop. `npm run build` reads `frontend/.env.production`, so a local production build or `vite preview` talks to the Render backend; `npm run dev` still uses `http://localhost:8000`. After switching branches restart `npm run dev` (a stale dev server served the page unstyled). MapLibre 6 needs `setWorkerUrl` (already done in `MapPanel.tsx`). Every append to DECISIONS.md conflicts with other roles' appends: keep both sides.


## P4 Backend - 14 November 2026 - Codex
Done: API implementation merged in PR #9. User deployed the service at https://fire-calendar.onrender.com. Live health, region discovery, all calendar/calibration/sandbox-grid JSON schemas for the three regions, polygon calendar, calendar and hotspot CSVs, validation errors and CORS preflight verified.
In progress (files + exact state): deployment verification documented and pushed on feat/p4-render-deploy; PR: https://github.com/neamturazvan/fire-calendar/pull/10. No partially implemented code.
Broken / known issues: the deployed health response reports all three regions using mocks and FIRMS key unconfigured; NRT returns 503. Real archives are not available in this checkout. Runtime deployment has passed; live NRT and real-data integration are separate pending checks.
Next 3 steps:
1. P1 sets FIRMS_MAP_KEY securely in Render Environment and saves/redeploys; P4 rechecks live NRT without copying credentials into files tracked by Git or into chat.
2. P5 sets its deployed VITE_API_URL to https://fire-calendar.onrender.com and coordinates CORS_ORIGINS with P1; this is outside P4's folder ownership.
3. When P2/P3 deliver real files, verify the Rio Negro region/polygon/CSV slice and update data provenance.
Gotchas: every region currently returns is_mock=true; CSVs expose X-Data-Source: MOCK DATA. Do not interpret mock deployment verification as scientific validation. The current CORS response allows all origins. Preserve frozen contracts and other role folders.
Validation: live API verification passed except NRT, which correctly returns 503 until a key is configured. Required local validation passed: 87 Python tests, Ruff and the frontend build.


## P4 NRT follow-up - 14 November 2026 - Codex
Done: Render health now reports FIRMS key configured; live region/bbox one-day and seven-day requests were checked and returned 502. Added safe per-source diagnostics and environment-whitespace trimming on feat/p4-nrt-errors, with regression tests for key/quota/status/transport/CSV failures and credential redaction.
In progress: diagnostics implementation complete, 100 Python tests and Ruff passed, and pushed; PR: https://github.com/neamturazvan/fire-calendar/pull/11. PR #10 separately records the healthy mock-backed deployment.
Known issue: the live upstream cause remains unknown until this diagnostics update is deployed; no successful live NRT response has been observed.
Next 3 steps:
1. Review/merge/deploy the diagnostics PR with P1.
2. Recheck https://fire-calendar.onrender.com/api/nrt?region_id=rio_negro&days=1 and the seven-day variant, then resolve the reported category.
3. Recheck global bbox, caching and P5's overlay once NRT is successful.
Gotchas: keep credentials out of Git, logs and chat; response details must never echo upstream error bodies or URLs. All historical regions still use mocks.
