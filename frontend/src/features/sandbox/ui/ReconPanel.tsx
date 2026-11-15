// Protocol step 1: drone perimeter recon. Sets the t = 0 fire from live FIRMS hotspots.
import { useState } from 'react'
import { explain, loadNrt } from '../../../app/api.ts'
import { hotspotIgnitions, reconBbox } from '../recon/hotspots.ts'
import type { ReconResult } from '../recon/hotspots.ts'
import { Button, Panel } from './parts.tsx'

interface Props {
  area: GeoJSON.Polygon | null
  cells: readonly { lat: number; lon: number }[]
  indexOf: ReadonlyMap<string, number>
  burnable: ArrayLike<number>
  resolution: number
  isMock: boolean
  /** Called with the burnable grid hexes that hold live hotspots (never empty). */
  onIgnitions: (cells: number[]) => void
}

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; days: number; result: ReconResult }
  | { status: 'error'; reason: string }

const DAYS = [1, 3, 7]

export function ReconPanel({ area, cells, indexOf, burnable, resolution, isMock, onIgnitions }: Props) {
  const [days, setDays] = useState(3)
  const [state, setState] = useState<State>({ status: 'idle' })

  const run = async () => {
    setState({ status: 'loading' })
    try {
      const collection = await loadNrt({ bbox: reconBbox(area, cells) }, days)
      const points = collection.features.map((f) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }))
      const result = hotspotIgnitions(points, area, indexOf, burnable, resolution)
      setState({ status: 'done', days, result })
      if (result.cells.length > 0) onIgnitions(result.cells)
    } catch (err) {
      setState({ status: 'error', reason: explain(err) })
    }
  }

  const where = area ? 'the drawn area' : 'the grid extent'
  return (
    <Panel title="Drone perimeter recon · live hotspots">
      <p className="text-xs text-ink-2">
        Start the fire from live FIRMS hotspots (NOAA-20/21 and MODIS near-real-time) inside {where}
        {area ? ', which stands in for the UAV recon polygon' : '; draw an area on the calendar map to use it as the UAV recon polygon'}
        .
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-2">Last</span>
        {DAYS.map((d) => (
          <Button key={d} pressed={days === d} onClick={() => setDays(d)}>
            {d} d
          </Button>
        ))}
        <Button onClick={run} disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Asking the backend…' : 'Ignite from live hotspots'}
        </Button>
      </div>
      <p className="tabular mt-2 text-xs text-ink-2" role="status">
        {state.status === 'loading' && 'The backend can take up to a minute to wake up.'}
        {state.status === 'error' && (
          <span className="text-warning">
            Live hotspots unavailable ({state.reason}). Set the ignition points by clicking the map instead.
          </span>
        )}
        {state.status === 'done' &&
          (state.result.cells.length > 0
            ? `${state.result.total} live hotspots in the last ${state.days} d, ${state.result.inArea} inside ${where}: ${state.result.cells.length} burnable ${state.result.cells.length === 1 ? 'hex' : 'hexes'} set on fire at t = 0.`
            : `${state.result.total} live hotspots in the last ${state.days} d, ${state.result.inArea} inside ${where}; none falls on a burnable hex of this grid, so the ignition points were left as they are.`)}
        {state.status === 'done' && isMock && ' The hotspots are real; the grid under them is mock data.'}
      </p>
    </Panel>
  )
}
