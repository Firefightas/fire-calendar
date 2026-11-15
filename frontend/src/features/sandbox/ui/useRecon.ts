// Protocol step 1: drone perimeter recon. Live FIRMS hotspots inside the drawn area (the UAV
// recon polygon) set the t = 0 fire.
import { useState } from 'react'
import { explain, loadNrt } from '../../../app/api.ts'
import { hotspotIgnitions, reconBbox } from '../recon/hotspots.ts'
import type { ReconResult } from '../recon/hotspots.ts'

export type ReconState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; days: number; result: ReconResult }
  | { status: 'error'; reason: string }

export const RECON_DAYS = [1, 3, 7]

interface Options {
  area: GeoJSON.Polygon | null
  cells: readonly { lat: number; lon: number }[]
  indexOf: ReadonlyMap<string, number>
  burnable: ArrayLike<number>
  resolution: number
  /** Called with the burnable grid hexes that hold live hotspots (never empty). */
  onIgnitions: (cells: number[]) => void
}

export function useRecon({ area, cells, indexOf, burnable, resolution, onIgnitions }: Options) {
  const [days, setDays] = useState(3)
  const [state, setState] = useState<ReconState>({ status: 'idle' })

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

  return { days, setDays, state, run, hasArea: area !== null }
}

export type Recon = ReturnType<typeof useRecon>
