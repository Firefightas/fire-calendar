import type { DataOrigin } from './api.ts'

/** Required whenever `is_mock` is true (AGENTS.md §6). */
export function MockBadge() {
  return (
    <span
      role="status"
      title="These numbers are synthetic placeholders, not results."
      className="inline-flex items-center gap-1.5 rounded-md border border-warning/60 bg-warning/10 px-2 py-1 text-xs font-semibold tracking-wide text-ink"
    >
      <span aria-hidden="true" className="text-warning">
        ▲
      </span>
      MOCK DATA
    </span>
  )
}

/** Where the numbers on screen came from. `waking` = the backend has not answered yet. */
export function OriginChip({ origin, waking = false }: { origin: DataOrigin; waking?: boolean }) {
  const live = origin === 'api'
  const pending = !live && waking
  return (
    <span
      title={
        live
          ? 'Loaded from the backend API.'
          : pending
            ? 'Showing the JSON bundled with this page while the backend starts (up to a minute). Drawn-area queries, the hotspot CSV and live hotspots wait for it.'
            : 'Backend unreachable: showing the JSON bundled with this page. Drawn-area queries, the hotspot CSV and live hotspots need the backend.'
      }
      className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-ink-2"
    >
      <span aria-hidden="true" className={live ? 'text-good' : 'text-muted'}>
        {live ? '●' : '○'}
      </span>
      {live ? 'Live API' : pending ? 'Backend waking up…' : 'Offline bundle'}
    </span>
  )
}
