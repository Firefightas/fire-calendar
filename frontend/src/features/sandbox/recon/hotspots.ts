// Protocol step 1: drone perimeter recon. Live FIRMS hotspots inside the recon polygon
// become the t = 0 fire hexes. Pure TS; the fetch itself is app/api.ts loadNrt.
import { latLngToCell } from 'h3-js'

/** Ray casting; holes are respected. Coordinates are [lon, lat]. */
export function pointInPolygon(lon: number, lat: number, polygon: GeoJSON.Polygon): boolean {
  let inside = false
  for (const ring of polygon.coordinates) {
    for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      const [xa, ya] = ring[a]
      const [xb, yb] = ring[b]
      if (ya > lat !== yb > lat && lon < ((xb - xa) * (lat - ya)) / (yb - ya) + xa) inside = !inside
    }
  }
  return inside
}

export interface ReconResult {
  /** Hotspots returned by the backend. */
  total: number
  /** Of those, inside the recon polygon (all of them when there is no polygon). */
  inArea: number
  /** Distinct burnable grid hexes that contain at least one such hotspot. */
  cells: number[]
}

export function hotspotIgnitions(
  points: readonly { lon: number; lat: number }[],
  area: GeoJSON.Polygon | null,
  indexOf: ReadonlyMap<string, number>,
  burnable: ArrayLike<number>,
  resolution: number,
): ReconResult {
  const cells = new Set<number>()
  let inArea = 0
  for (const { lon, lat } of points) {
    if (area && !pointInPolygon(lon, lat, area)) continue
    inArea++
    const i = indexOf.get(latLngToCell(lat, lon, resolution))
    if (i !== undefined && burnable[i]) cells.add(i)
  }
  return { total: points.length, inArea, cells: [...cells].sort((a, b) => a - b) }
}

/** [west, south, east, north] of the recon polygon, or of the grid when there is none. */
export function reconBbox(
  area: GeoJSON.Polygon | null,
  cells: readonly { lat: number; lon: number }[],
): [number, number, number, number] {
  const pts: [number, number][] = area ? (area.coordinates[0] as [number, number][]) : cells.map((c) => [c.lon, c.lat])
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const [lon, lat] of pts) {
    west = Math.min(west, lon)
    east = Math.max(east, lon)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  const round = (v: number) => Math.round(v * 1e4) / 1e4
  return [round(west), round(south), round(east), round(north)]
}
