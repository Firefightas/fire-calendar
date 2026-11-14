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

