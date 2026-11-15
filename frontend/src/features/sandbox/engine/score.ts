// Scoreboard numbers, computed from a finished run. Nothing here is a constant.
import { ASSET_FARM, ASSET_VILLAGE } from './model.ts'
import type { SpreadModel } from './model.ts'
import { NEVER } from './simulate.ts'
import type { RunResult } from './simulate.ts'

export interface Score {
  villagesTotal: number
  villagesBurned: number
  villagesProtected: number
  farmsTotal: number
  farmsBurned: number
  farmsProtected: number
  /** Hexes that burned or are burning at the end, backfires included. */
  cellsBurned: number
  /** Sum of h3.cellArea over those hexes. */
  hectaresBurned: number
  /** Hexes still burning at the end of the run. */
  cellsStillBurning: number
  /**
   * Share of the fire's outer edge that cannot advance at the end of the run, in percent.
   * An edge between a fire hex and a hex outside the fire is "open" when the fire hex is still
   * burning and the outside hex could ignite (burnable and Rtool < 1) or lies beyond the
   * modelled area. 100 when no edge is open, or when nothing burned.
   */
  containmentPct: number
}

export function scoreRun(model: SpreadModel, result: RunResult): Score {
  const { ignitedAt, burnedOutAt, finalRtool } = result
  let villagesTotal = 0
  let villagesBurned = 0
  let farmsTotal = 0
  let farmsBurned = 0
  let cellsBurned = 0
  let hectaresBurned = 0
  let cellsStillBurning = 0
  let edges = 0
  let open = 0

  for (let i = 0; i < model.n; i++) {
    const fire = ignitedAt[i] !== NEVER
    if (model.asset[i] === ASSET_VILLAGE) {
      villagesTotal++
      if (fire) villagesBurned++
    } else if (model.asset[i] === ASSET_FARM) {
      farmsTotal++
      if (fire) farmsBurned++
    }
    if (!fire) continue
    cellsBurned++
    hectaresBurned += model.areaHa[i]
    const burning = burnedOutAt[i] === NEVER
    if (burning) cellsStillBurning++

    for (let k = model.nbrStart[i]; k < model.nbrStart[i + 1]; k++) {
      const j = model.nbrIndex[k]
      if (ignitedAt[j] !== NEVER) continue
      edges++
      if (burning && model.burnable[j] && finalRtool[j] < 1) open++
    }
    edges += model.missingNeighbours[i]
    if (burning) open += model.missingNeighbours[i]
  }

  return {
    villagesTotal,
    villagesBurned,
    villagesProtected: villagesTotal - villagesBurned,
    farmsTotal,
    farmsBurned,
    farmsProtected: farmsTotal - farmsBurned,
    cellsBurned,
    hectaresBurned,
    cellsStillBurning,
    containmentPct: edges === 0 ? 100 : (100 * (edges - open)) / edges,
  }
}

/** Mean scores over several seeded runs of the same plan. Totals are identical across runs. */
export interface MeanScore {
  runs: number
  villagesTotal: number
  farmsTotal: number
  villagesProtected: number
  farmsProtected: number
  hectaresBurned: number
  containmentPct: number
}

export function meanScore(scores: readonly Score[]): MeanScore {
  const runs = scores.length
  const mean = (pick: (s: Score) => number) => (runs === 0 ? 0 : scores.reduce((sum, s) => sum + pick(s), 0) / runs)
  return {
    runs,
    villagesTotal: runs === 0 ? 0 : scores[0].villagesTotal,
    farmsTotal: runs === 0 ? 0 : scores[0].farmsTotal,
    villagesProtected: mean((s) => s.villagesProtected),
    farmsProtected: mean((s) => s.farmsProtected),
    hectaresBurned: mean((s) => s.hectaresBurned),
    containmentPct: mean((s) => s.containmentPct),
  }
}

/**
 * Triage order of protocol step 7: villages first, farms second, hectares third.
 * Negative when `a` is the better outcome.
 */
export function compareOutcome(a: MeanScore, b: MeanScore): number {
  const eps = 1e-9
  if (Math.abs(a.villagesProtected - b.villagesProtected) > eps) return b.villagesProtected - a.villagesProtected
  if (Math.abs(a.farmsProtected - b.farmsProtected) > eps) return b.farmsProtected - a.farmsProtected
  if (Math.abs(a.hectaresBurned - b.hectaresBurned) > eps) return a.hectaresBurned - b.hectaresBurned
  return 0
}
