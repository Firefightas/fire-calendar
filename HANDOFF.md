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
Done: all P5 items in PLAN.md (merged in PR #3); calibration panel (branch `feat/p5-calibration-panel`); "month to date" label for an incomplete last month (branch `feat/p5-month-to-date`, which also contains the calibration panel). Both branches are pushed with all checks green.
In progress (files + exact state): nothing half-written.
Broken / known issues: none in P5 code. Drawn-area numbers, CSV exports and the NRT overlay still depend on P4 endpoints (see P5's requests in PLAN.md).
Next 3 steps:
1. Merge the two pull requests (calibration panel first, then month to date).
2. When P2/P3 land real Río Negro files: `cd frontend && npm run sync-data`, commit `public/data/`, check the page (Checkpoint A).
3. Re-check the drawn-area calendar, exports and NRT overlay as P4's endpoints stop returning 501.
Gotchas: `gh` is not installed on this laptop. After switching branches restart `npm run dev` (a stale dev server served the page unstyled). MapLibre 6 needs `setWorkerUrl` (already done in `MapPanel.tsx`). Every append to DECISIONS.md conflicts with other roles' appends: keep both sides.


## P4 Backend - 14 November 2026 - Codex
Done: API implementation merged in PR #9. User deployed the service at https://fire-calendar.onrender.com. Live health, region discovery, all calendar/calibration/sandbox-grid JSON schemas for the three regions, polygon calendar, calendar and hotspot CSVs, validation errors and CORS preflight verified.
In progress (files + exact state): deployment verification documented on feat/p4-render-deploy; preparing the deployment-record PR. No partially implemented code.
Broken / known issues: the deployed health response reports all three regions using mocks and FIRMS key unconfigured; NRT returns 503. Real archives are not available in this checkout. Runtime deployment has passed; live NRT and real-data integration are separate pending checks.
Next 3 steps:
1. P1 sets FIRMS_MAP_KEY securely in Render Environment and saves/redeploys; P4 rechecks live NRT without copying credentials into files tracked by Git or into chat.
2. P5 sets its deployed VITE_API_URL to https://fire-calendar.onrender.com and coordinates CORS_ORIGINS with P1; this is outside P4's folder ownership.
3. When P2/P3 deliver real files, verify the Rio Negro region/polygon/CSV slice and update data provenance.
Gotchas: every region currently returns is_mock=true; CSVs expose X-Data-Source: MOCK DATA. Do not interpret mock deployment verification as scientific validation. The current CORS response allows all origins. Preserve frozen contracts and other role folders.
Validation: live API verification passed except NRT, which correctly returns 503 until a key is configured. Required local validation passed: 87 Python tests, Ruff and the frontend build.
