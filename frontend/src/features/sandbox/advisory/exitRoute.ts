// Protocol step 8: crew exit route check. Pure TS, computed from a finished run.
//
// Ground crews work on trench, clearing and backfire hexes (water drops are aerial). A crew
// leaves when its job is done (the tool's ready hour) or when fire reaches its hex or a
// neighbouring hex, whichever comes first. From then it moves one hex per hour through hexes
// that are not burning, to the nearest hex that cannot burn (river, water or bare ground).
import type { SpreadModel } from '../engine/model.ts'
import { NEVER } from '../engine/simulate.ts'
import type { RunResult } from '../engine/simulate.ts'
import { TOOLS } from '../engine/tools.ts'
import type { Placement, ToolKind } from '../engine/tools.ts'

export type ExitStatus = 'clear' | 'cut_off' | 'overrun'

export interface CrewExit {
  cell: number
  kind: ToolKind
  /** Hour the crew starts moving out. */
  leaveHour: number
  status: ExitStatus
  /** Hexes from the crew's position to the safe hex (inclusive); empty unless clear. */
  path: number[]
  /** Hours of travel to the safe hex; null unless clear. */
  hoursToSafety: number | null
}

export interface ExitSummary {
  crews: CrewExit[]
  clear: number
  total: number
}

const burningAt = (result: RunResult, i: number, hour: number): boolean => {
  const ignited = result.ignitedAt[i]
  if (ignited === NEVER || ignited > hour) return false
  const out = result.burnedOutAt[i]
  return out === NEVER || out > hour
}

function crewExit(model: SpreadModel, result: RunResult, placement: Placement): CrewExit {
  const { cell, kind } = placement
  const ready = TOOLS[kind].readyHour
  let leaveHour = ready
  for (let h = 0; h <= ready && leaveHour === ready; h++) {
    let fireNear = burningAt(result, cell, h)
    for (let k = model.nbrStart[cell]; k < model.nbrStart[cell + 1] && !fireNear; k++) {
      fireNear = burningAt(result, model.nbrIndex[k], h)
    }
    if (fireNear) leaveHour = h
  }
  const base = { cell, kind, leaveHour }
  if (burningAt(result, cell, leaveHour)) return { ...base, status: 'overrun', path: [], hoursToSafety: null }

  // Breadth-first search in time: one hex per hour, never onto a hex that is burning on arrival.
  const parent = new Map<number, number>([[cell, -1]])
  let frontier = [cell]
  for (let hour = leaveHour; frontier.length > 0 && hour < leaveHour + model.n; hour++) {
    const next: number[] = []
    for (const at of frontier) {
      for (let k = model.nbrStart[at]; k < model.nbrStart[at + 1]; k++) {
        const j = model.nbrIndex[k]
        if (parent.has(j)) continue
        if (!model.burnable[j]) {
          const path = [j]
          for (let p = at; p !== -1; p = parent.get(p) as number) path.push(p)
          path.reverse()
          return { ...base, status: 'clear', path, hoursToSafety: path.length - 1 }
        }
        if (burningAt(result, j, hour + 1)) continue
        parent.set(j, at)
        next.push(j)
      }
    }
    frontier = next
  }
  return { ...base, status: 'cut_off', path: [], hoursToSafety: null }
}

export function crewExitRoutes(model: SpreadModel, result: RunResult, plan: readonly Placement[]): ExitSummary {
  const crews = plan.filter((p) => p.kind !== 'water').map((p) => crewExit(model, result, p))
  return { crews, clear: crews.filter((c) => c.status === 'clear').length, total: crews.length }
}
