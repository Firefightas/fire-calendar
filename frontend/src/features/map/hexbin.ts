// H3 binning for the live hotspot overlay. Kept apart from geo.ts so the app shell
// does not pull h3-js into its first chunk.
import { latLngToCell } from 'h3-js'
import type { NrtHotspotProps } from '../../types/contracts.ts'

export const H3_RES = 7

export interface HexBin {
  h3: string
  /** Number of detections in the hex. */
  count: number
  frpSum: number
  satellites: string[]
}

/** Bin live hotspots to H3 res-7 cells, the same cells the cell-day unit counts. */
export function binHotspots(
  fc: GeoJSON.FeatureCollection<GeoJSON.Point, NrtHotspotProps>,
  res: number = H3_RES,
): HexBin[] {
  const bins = new Map<string, HexBin>()
  for (const f of fc.features) {
    const [lon, lat] = f.geometry.coordinates
    const h3 = latLngToCell(lat, lon, res)
    let bin = bins.get(h3)
    if (!bin) {
      bin = { h3, count: 0, frpSum: 0, satellites: [] }
      bins.set(h3, bin)
    }
    bin.count += 1
    bin.frpSum += f.properties.frp ?? 0
    if (!bin.satellites.includes(f.properties.satellite)) bin.satellites.push(f.properties.satellite)
  }
  return [...bins.values()]
}
