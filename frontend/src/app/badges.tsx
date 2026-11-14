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

export function OriginChip({ origin }: { origin: DataOrigin }) {
  const live = origin === 'api'
  return (
    <span
      title={
        live
          ? 'Loaded from the backend API.'
          : 'Backend unreachable: showing the JSON bundled with this page. Drawn-area queries, CSV export and live hotspots need the backend.'
      }
      className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-xs text-ink-2"
    >
      <span aria-hidden="true" className={live ? 'text-good' : 'text-muted'}>
        {live ? '●' : '○'}
      </span>
      {live ? 'Live API' : 'Offline bundle'}
    </span>
  )
}
