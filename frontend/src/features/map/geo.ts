// Pure geometry helpers for the map (no MapLibre, no React).
import { latLngToCell } from 'h3-js'
import type { NrtHotspotProps } from '../../types/contracts.ts'

/** [west, south, east, north], the order used by contracts/regions.json and FIRMS. */
export type Bbox = [number, number, number, number]

export const H3_RES = 7

const round = (v: number, digits: number) => Number(v.toFixed(digits))

export function bboxPolygon([w, s, e, n]: Bbox): GeoJSON.Polygon {
  return { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] }
}

/** Rounds coordinates (5 decimals ≈ 1 m) and guarantees a closed outer ring. Holes are dropped. */
export function cleanPolygon(p: GeoJSON.Polygon, digits = 5): GeoJSON.Polygon {
  const ring = p.coordinates[0].map(([x, y]) => [round(x, digits), round(y, digits)])
  const [fx, fy] = ring[0]
  const [lx, ly] = ring[ring.length - 1]
  if (fx !== lx || fy !== ly) ring.push([fx, fy])
  return { type: 'Polygon', coordinates: [ring] }
}

export function polygonBbox(p: GeoJSON.Polygon): Bbox {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of p.coordinates[0]) {
    w = Math.min(w, x)
    e = Math.max(e, x)
    s = Math.min(s, y)
    n = Math.max(n, y)
  }
  return [w, s, e, n]
}

/** True when every vertex lies inside the bbox (the rule for 26-year queries, TEAM_PLAN §0.1). */
export function polygonInBbox(p: GeoJSON.Polygon, [w, s, e, n]: Bbox): boolean {
  return p.coordinates[0].every(([x, y]) => x >= w && x <= e && y >= s && y <= n)
}

/** Square of side 2·halfKm centered on a point. */
export function boxAround(lat: number, lon: number, halfKm: number): GeoJSON.Polygon {
  const dLat = halfKm / 110.574
  const dLon = halfKm / (111.32 * Math.cos((lat * Math.PI) / 180))
  return cleanPolygon(bboxPolygon([lon - dLon, lat - dLat, lon + dLon, lat + dLat]))
}

/** Spherical area of the outer ring in km² (Chamberlain–Duquette). */
export function polygonAreaKm2(p: GeoJSON.Polygon): number {
  const R = 6371.0088
  const rad = Math.PI / 180
  const ring = p.coordinates[0]
  let sum = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[i + 1]
    sum += (x2 - x1) * rad * (2 + Math.sin(y1 * rad) + Math.sin(y2 * rad))
  }
  return Math.abs((sum * R * R) / 2)
}

export function isValidLatLon(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
}

/** Clamp a map viewport to a legal `bbox` query for GET /api/nrt. */
export function clampBbox([w, s, e, n]: Bbox): Bbox {
  return [
    round(Math.max(w, -180), 3),
    round(Math.max(s, -90), 3),
    round(Math.min(e, 180), 3),
    round(Math.min(n, 90), 3),
  ]
}

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
