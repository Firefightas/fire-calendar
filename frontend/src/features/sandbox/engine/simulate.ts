// Cellular-automaton fire spread on the H3 grid (TEAM_PLAN §3.2, sandbox README). Pure TS.
//
//   P(i→j) = clamp( P0 · Φfuel(j) · (1 + γw · max(0, ŵ·d̂ij)) · (1 + γs · tan θij) · (1 − Rtool(j)), 0, 1 )
//
// One step is one hour. A burning hex tries each unburned neighbour once per hour.
import { DEFAULT_PARAMS } from './model.ts'
import type { SpreadModel, SpreadParams } from './model.ts'
import { hash01 } from './rng.ts'
import { TOOLS, toolStrength } from './tools.ts'
import type { Placement } from './tools.ts'
import type { WindVector } from './wind.ts'

export const RUN_HOURS = 72
export const NEVER = -1

export interface Scenario {
  seed: number
  hours: number
  /** Cell indices burning at t = 0. */
  ignitions: number[]
  /** Wind per hour; the last entry repeats if the run is longer. Empty = calm. */
  wind: WindVector[]
  tools: Placement[]
  params?: SpreadParams
}

export interface RunResult {
  hours: number
  /** Hour each cell caught fire, or NEVER. */
  ignitedAt: Int16Array
  /** Hour each cell stopped burning, or NEVER (never burned, or still burning at the end). */
  burnedOutAt: Int16Array
  /** Rtool per cell in effect at the end of the run. */
  finalRtool: Float32Array
}

const CALM: WindVector = { east: 0, north: 0 }

/** The README formula for one edge. `edge` indexes the model's neighbour arrays; j = nbrIndex[edge]. */
export function spreadProbability(
  model: SpreadModel,
  edge: number,
  wind: WindVector,
  rtool: number,
  params: SpreadParams = DEFAULT_PARAMS,
): number {
  const j = model.nbrIndex[edge]
  if (!model.burnable[j]) return 0
  const along = wind.east * model.nbrEast[edge] + wind.north * model.nbrNorth[edge]
  const p =
    params.p0 *
    model.fuel[j] *
    (1 + params.gammaWind * Math.max(0, along)) *
    (1 + params.gammaSlope * model.nbrTan[edge]) *
    (1 - rtool)
  return Math.min(1, Math.max(0, p))
}

/** Index into the neighbour arrays of the edge i→j, or -1 if they are not adjacent. */
export function edgeBetween(model: SpreadModel, i: number, j: number): number {
  for (let k = model.nbrStart[i]; k < model.nbrStart[i + 1]; k++) if (model.nbrIndex[k] === j) return k
  return -1
}

export function simulate(model: SpreadModel, scenario: Scenario): RunResult {
  const { n } = model
  const { seed, hours } = scenario
  const params = scenario.params ?? DEFAULT_PARAMS
  const ignitedAt = new Int16Array(n).fill(NEVER)
  const burnedOutAt = new Int16Array(n).fill(NEVER)

  // Rtool per cell is `toolR` during hours [toolFrom, toolUntil).
  const toolR = new Float32Array(n)
  const toolFrom = new Int16Array(n)
  const toolUntil = new Int16Array(n)
  for (const { cell, kind } of scenario.tools) {
    const spec = TOOLS[kind]
    toolR[cell] = toolStrength(kind, model.landcover[cell])
    toolFrom[cell] = spec.readyHour
    toolUntil[cell] = spec.durationHours === null ? 32767 : spec.readyHour + spec.durationHours
  }

  let active: number[] = []
  for (const i of scenario.ignitions) {
    if (i >= 0 && i < n && model.burnable[i] && ignitedAt[i] === NEVER) {
      ignitedAt[i] = 0
      active.push(i)
    }
  }

  for (let t = 0; t < hours; t++) {
    // Resources that arrive this hour.
    for (const { cell, kind } of scenario.tools) {
      if (TOOLS[kind].readyHour !== t) continue
      if (kind === 'water' && ignitedAt[cell] !== NEVER && burnedOutAt[cell] === NEVER) {
        burnedOutAt[cell] = t // the drop puts the hex out
      } else if (kind === 'backfire' && ignitedAt[cell] === NEVER && model.burnable[cell]) {
        ignitedAt[cell] = t // fuel consumed under control: burned, never an active front
        burnedOutAt[cell] = t
      }
    }

    const wind = scenario.wind.length > 0 ? scenario.wind[Math.min(t, scenario.wind.length - 1)] : CALM
    const next: number[] = []
    for (const i of active) {
      if (burnedOutAt[i] !== NEVER) continue
      if (t - ignitedAt[i] >= model.burnDuration[i]) {
        burnedOutAt[i] = t
        continue
      }
      next.push(i)
      for (let k = model.nbrStart[i]; k < model.nbrStart[i + 1]; k++) {
        const j = model.nbrIndex[k]
        if (ignitedAt[j] !== NEVER || !model.burnable[j]) continue
        const rtool = t >= toolFrom[j] && t < toolUntil[j] ? toolR[j] : 0
        const p = spreadProbability(model, k, wind, rtool, params)
        if (p > 0 && hash01(seed, t, i, j) < p) {
          ignitedAt[j] = t + 1
          next.push(j)
        }
      }
    }
    active = next
  }

  const finalRtool = new Float32Array(n)
  for (let i = 0; i < n; i++) if (hours >= toolFrom[i] && hours < toolUntil[i]) finalRtool[i] = toolR[i]
  return { hours, ignitedAt, burnedOutAt, finalRtool }
}

export const UNBURNED = 0
export const BURNING = 1
export const BURNED = 2

/** Fire state of every cell at the start of `hour` (0 … hours): UNBURNED, BURNING or BURNED. */
export function frameAt(result: RunResult, hour: number, out?: Uint8Array): Uint8Array {
  const n = result.ignitedAt.length
  const frame = out ?? new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const ignited = result.ignitedAt[i]
    const out_ = result.burnedOutAt[i]
    frame[i] = ignited === NEVER || ignited > hour ? UNBURNED : out_ !== NEVER && out_ <= hour ? BURNED : BURNING
  }
  return frame
}
