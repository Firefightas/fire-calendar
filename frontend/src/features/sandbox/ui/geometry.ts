// Flat-map geometry for the hex canvas: a local equirectangular projection of the grid.
import { cellToBoundary, latLngToCell } from 'h3-js'
import type { SandboxCell } from '../../../types/contracts.ts'

export interface GridGeometry {
  /** Hex outlines in unit coordinates: x in 0..1 (west→east), y in 0..aspect (north→south). */
  outlines: Float32Array[]
  /** Hex centres, same coordinates, [x0, y0, x1, y1, ...]. */
  centres: Float32Array
  /** Height / width of the grid's bounding box. */
  aspect: number
  /** Approximate hex "radius" in unit coordinates (for glyph sizes). */
  hexSize: number
  indexOf: Map<string, number>
  resolution: number
  toUnit: (lat: number, lon: number) => [number, number]
  toLatLon: (x: number, y: number) => [number, number]
}

export function buildGeometry(cells: SandboxCell[], resolution: number): GridGeometry {
  const boundaries = cells.map((c) => cellToBoundary(c.h3))
  let south = Infinity
  let north = -Infinity
  let west = Infinity
  let east = -Infinity
  for (const ring of boundaries) {
    for (const [lat, lon] of ring) {
      south = Math.min(south, lat)
      north = Math.max(north, lat)
      west = Math.min(west, lon)
      east = Math.max(east, lon)
    }
  }
  const kx = Math.cos((((south + north) / 2) * Math.PI) / 180)
  const width = Math.max((east - west) * kx, 1e-9)
  const toUnit = (lat: number, lon: number): [number, number] => [((lon - west) * kx) / width, (north - lat) / width]
  const toLatLon = (x: number, y: number): [number, number] => [north - y * width, west + (x * width) / kx]

  const outlines = boundaries.map((ring) => {
    const out = new Float32Array(ring.length * 2)
    ring.forEach(([lat, lon], k) => {
      const [x, y] = toUnit(lat, lon)
      out[k * 2] = x
      out[k * 2 + 1] = y
    })
    return out
  })
  const centres = new Float32Array(cells.length * 2)
  const indexOf = new Map<string, number>()
  cells.forEach((c, i) => {
    const [x, y] = toUnit(c.lat, c.lon)
    centres[i * 2] = x
    centres[i * 2 + 1] = y
    indexOf.set(c.h3, i)
  })
  let hexSize = 0.02
  if (outlines.length > 0) {
    const o = outlines[0]
    hexSize = Math.hypot(o[0] - centres[0], o[1] - centres[1])
  }
  return { outlines, centres, aspect: (north - south) / width, hexSize, indexOf, resolution, toUnit, toLatLon }
}

/** Index of the grid cell under a point in unit coordinates, or -1. */
export function cellAt(geo: GridGeometry, x: number, y: number): number {
  const [lat, lon] = geo.toLatLon(x, y)
  return geo.indexOf.get(latLngToCell(lat, lon, geo.resolution)) ?? -1
}
