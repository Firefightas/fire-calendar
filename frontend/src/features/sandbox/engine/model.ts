// Static spread model built once per grid: neighbours, edge geometry, fuel. Pure TS, no React.
import { cellArea, greatCircleDistance, gridDisk } from 'h3-js'
import type { SandboxCell } from '../../../types/contracts.ts'

/** Tunable constants of the README spread formula. */
export interface SpreadParams {
  /** P0: base hourly ignition probability across one hex edge. */
  p0: number
  /** γw: wind gain. */
  gammaWind: number
  /** γs: slope gain. */
  gammaSlope: number
}

export const DEFAULT_PARAMS: SpreadParams = { p0: 0.04, gammaWind: 1.5, gammaSlope: 4 }

/** Coniferous montane forest above this elevation gets a flammability boost (README). */
export const MONTANE_ELEVATION_M = 800
export const MONTANE_BOOST = 1.2

/** BaseFlammability(landcover), README values. Anything not listed does not carry fire. */
export function baseFlammability(cell: Pick<SandboxCell, 'landcover' | 'elevation_m' | 'burnable'>): number {
  if (!cell.burnable) return 0
  switch (cell.landcover) {
    case 10:
      return cell.elevation_m > MONTANE_ELEVATION_M ? 1.0 * MONTANE_BOOST : 1.0
    case 20:
      return 0.9
    case 30:
      return 0.8
    case 40:
      return 0.5
    case 50:
      return 0.3
    default:
      return 0
  }
}

/** min(1.5, 0.25 + 0.08 · years_since_last_fire); never burned → the 1.5 cap. */
export function fuelAgeFactor(yearsSinceLastFire: number | null): number {
  if (yearsSinceLastFire === null) return 1.5
  return Math.min(1.5, 0.25 + 0.08 * yearsSinceLastFire)
}

/** Φfuel(j) = BaseFlammability · fuel-age factor. */
export const fuelFactor = (cell: SandboxCell): number =>
  baseFlammability(cell) * fuelAgeFactor(cell.years_since_last_fire)

/** Hours a hex keeps burning (and spreading) once ignited. A modelling choice, see DECISIONS.md. */
export function burnDurationHours(landcover: number): number {
  switch (landcover) {
    case 10:
      return 10
    case 20:
      return 6
    case 50:
      return 8
    default:
      return 4
  }
}

export const ASSET_NONE = 0
export const ASSET_VILLAGE = 1
export const ASSET_FARM = 2

export interface SpreadModel {
  n: number
  h3: string[]
  landcover: Int16Array
  /** 1 if fire can enter the cell (burnable and Φfuel > 0). */
  burnable: Uint8Array
  /** Φfuel per cell. */
  fuel: Float32Array
  burnDuration: Int16Array
  /** Hex area in hectares (h3.cellArea). */
  areaHa: Float32Array
  /** ASSET_VILLAGE / ASSET_FARM / ASSET_NONE. */
  asset: Uint8Array
  /** Edges of cell i are nbrStart[i] .. nbrStart[i+1]-1. */
  nbrStart: Int32Array
  nbrIndex: Int32Array
  /** Unit vector from i to j: east and north components. */
  nbrEast: Float32Array
  nbrNorth: Float32Array
  /** tan θij: rise from i to j over the centre distance; positive is uphill. */
  nbrTan: Float32Array
  /** Number of H3 neighbours of i that are not in the grid (the edge of the modelled area). */
  missingNeighbours: Uint8Array
}

export function buildModel(cells: SandboxCell[]): SpreadModel {
  const n = cells.length
  const indexOf = new Map<string, number>()
  cells.forEach((c, i) => indexOf.set(c.h3, i))

  const model: SpreadModel = {
    n,
    h3: cells.map((c) => c.h3),
    landcover: new Int16Array(n),
    burnable: new Uint8Array(n),
    fuel: new Float32Array(n),
    burnDuration: new Int16Array(n),
    areaHa: new Float32Array(n),
    asset: new Uint8Array(n),
    nbrStart: new Int32Array(n + 1),
    nbrIndex: new Int32Array(0),
    nbrEast: new Float32Array(0),
    nbrNorth: new Float32Array(0),
    nbrTan: new Float32Array(0),
    missingNeighbours: new Uint8Array(n),
  }

  const index: number[] = []
  const east: number[] = []
  const north: number[] = []
  const tan: number[] = []
  cells.forEach((c, i) => {
    const phi = fuelFactor(c)
    model.landcover[i] = c.landcover
    model.fuel[i] = phi
    model.burnable[i] = c.burnable && phi > 0 ? 1 : 0
    model.burnDuration[i] = burnDurationHours(c.landcover)
    model.areaHa[i] = cellArea(c.h3, 'km2') * 100
    model.asset[i] = c.asset_type === 'village' ? ASSET_VILLAGE : c.asset_type === 'farm' ? ASSET_FARM : ASSET_NONE

    model.nbrStart[i] = index.length
    const kx = Math.cos((c.lat * Math.PI) / 180)
    for (const h of gridDisk(c.h3, 1)) {
      if (h === c.h3) continue
      const j = indexOf.get(h)
      if (j === undefined) {
        model.missingNeighbours[i]++
        continue
      }
      const o = cells[j]
      const dx = (o.lon - c.lon) * kx
      const dy = o.lat - c.lat
      const len = Math.hypot(dx, dy) || 1
      const distM = greatCircleDistance([c.lat, c.lon], [o.lat, o.lon], 'km') * 1000
      index.push(j)
      east.push(dx / len)
      north.push(dy / len)
      tan.push(distM > 0 ? (o.elevation_m - c.elevation_m) / distM : 0)
    }
  })
  model.nbrStart[n] = index.length
  model.nbrIndex = Int32Array.from(index)
  model.nbrEast = Float32Array.from(east)
  model.nbrNorth = Float32Array.from(north)
  model.nbrTan = Float32Array.from(tan)
  return model
}
