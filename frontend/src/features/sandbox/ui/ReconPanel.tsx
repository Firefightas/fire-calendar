// Protocol step 1 controls: the live-hotspot button and its one-line status, shown in the run panel.
import { InfoTip } from './InfoTip.tsx'
import { RECON_DAYS } from './useRecon.ts'
import type { Recon } from './useRecon.ts'

/** The live-hotspot button with its day picker and the ⓘ explaining the recon. */
export function ReconButton({ recon, isMock }: { recon: Recon; isMock: boolean }) {
  const where = recon.hasArea ? 'the drawn area' : 'the grid extent'
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex overflow-hidden rounded-md border border-hairline">
        <button
          type="button"
          onClick={recon.run}
          disabled={recon.state.status === 'loading'}
          className="px-2.5 py-1.5 text-sm text-ink hover:bg-raised disabled:cursor-wait disabled:opacity-60"
        >
          📡 {recon.state.status === 'loading' ? 'Asking…' : `Live hotspots (${recon.days}d)`}
        </button>
        <select
          aria-label="Days of live hotspots"
          value={recon.days}
          onChange={(e) => recon.setDays(Number(e.target.value))}
          className="border-l border-hairline bg-surface px-1 text-xs text-ink-2"
        >
          {RECON_DAYS.map((d) => (
            <option key={d} value={d}>
              {d}d
            </option>
          ))}
        </select>
      </span>
      <InfoTip label="About drone perimeter recon">
        Drone perimeter recon (protocol step 1): live FIRMS hotspots (NOAA-20/21 and MODIS near-real-time) inside {where}{' '}
        set the fire at t = 0.{' '}
        {recon.hasArea
          ? 'The area drawn on the calendar map stands in for the UAV recon polygon.'
          : 'Draw an area on the calendar map to use it as the UAV recon polygon.'}{' '}
        The backend can take up to a minute to wake up.
        {isMock && ' The hotspots are real; the grid under them is mock data.'}
      </InfoTip>
    </span>
  )
}

/** One line of feedback after a recon request, or nothing. */
export function ReconStatus({ recon }: { recon: Recon }) {
  const s = recon.state
  if (s.status === 'idle' || s.status === 'loading') return null
  if (s.status === 'error') {
    return (
      <p role="status" className="text-xs text-warning">
        ▲ Live hotspots unavailable ({s.reason}). Click the map or use the highest-risk hex instead.
      </p>
    )
  }
  const n = s.result.cells.length
  return (
    <p role="status" className="tabular text-xs text-ink-2">
      📡 {s.result.total} hotspots ({s.days}d) · {s.result.inArea} in {recon.hasArea ? 'area' : 'grid'} ·{' '}
      {n > 0 ? `${n} burnable ${n === 1 ? 'hex' : 'hexes'} ignited` : 'none on a burnable hex, ignition points unchanged'}
    </p>
  )
}
