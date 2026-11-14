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

## P5 Frontend — Sat 14 Nov 2026 ~16:45 — Claude (Fable), usage limit reached
Done: all P5 items in PLAN.md (merged in PR #3) plus the calibration panel (branch `feat/p5-calibration-panel`, pushed, includes latest `main`, all checks green; PR must be opened from the GitHub page).
In progress (files + exact state): nothing half-written. Working tree clean on `feat/p5-calibration-panel`.
Broken / known issues: the "Month in progress: reads low until it ends" chip (`features/calendar/AnomalyCards.tsx`, `MonthTooltip.tsx`, via `isMonthInProgress` in `model.ts`) is now wrong for real P3 output, because P3 scores an incomplete last month month-to-date (see P3's request to P5 in PLAN.md).
Next 3 steps:
1. Open and merge the PR for `feat/p5-calibration-panel`.
2. New branch `feat/p5-month-to-date` from `main`: when `calibration.json` `diagnostics.last_month_complete === false`, label the last month "Month to date, through <diagnostics.last_data_date>: median and score use the same days in the baseline years"; when the file does not say (mocks, drawn areas), use neutral wording ("Month in progress: count still accumulating"). Read `diagnostics` defensively as in `features/calendar/calibration.ts`. Tick P3's request in PLAN.md.
3. When P2/P3 land real Río Negro files: `cd frontend && npm run sync-data`, commit `public/data/`, check the page (Checkpoint A).
Gotchas: `gh` is not installed on this laptop. After switching branches restart `npm run dev` (a stale dev server served the page unstyled). MapLibre 6 needs `setWorkerUrl` (already done in `MapPanel.tsx`). Every append to DECISIONS.md conflicts with other roles' appends: keep both sides.

