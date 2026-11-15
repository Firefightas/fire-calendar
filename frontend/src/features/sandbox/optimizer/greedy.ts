// Algorithmic optimizer (greedy, simulation-scored). Pure TS, runs in the worker.
//
// It places one resource at a time. For every candidate (hex × tool) that fits the remaining
// budget it simulates the plan under a fixed list of seeds and keeps the candidate with the
// best mean outcome in triage order: villages first, farms second, hectares third. It stops
// when the budget is spent or no candidate improves the outcome. It is a heuristic: it does
// not search combinations, so it can miss lines that only pay off once complete.
import type { SpreadModel } from '../engine/model.ts'
import { compareOutcome, meanScore, scoreRun } from '../engine/score.ts'
import type { MeanScore } from '../engine/score.ts'
import { NEVER, simulate } from '../engine/simulate.ts'
import type { Scenario } from '../engine/simulate.ts'
import { placementProblem, planCost, TOOL_KINDS, TOOLS } from '../engine/tools.ts'
import type { Placement } from '../engine/tools.ts'

export const OPTIMIZER_LABEL = 'Algorithmic optimizer (greedy, simulation-scored)'

/** At most this many hexes are tried per step: the ones most often reached by the fire. */
export const MAX_CANDIDATE_CELLS = 80

export interface OptimizeProgress {
  placed: number
  costUsed: number
  budget: number
  simulatedRuns: number
}

export interface OptimizeOutput {
  plan: Placement[]
  /** Total simulated 72 h runs used to choose the plan. */
  simulatedRuns: number
  /** Mean outcome on the scoring seeds before any resource and after the last one. */
  before: MeanScore
  after: MeanScore
}

interface Evaluation {
  mean: MeanScore
  /** Share of the runs in which each cell burned. */
  burnShare: Float32Array
}

function evaluate(model: SpreadModel, scenario: Scenario, tools: Placement[], seeds: number[]): Evaluation {
  const burnShare = new Float32Array(model.n)
  const scores = seeds.map((seed) => {
    const result = simulate(model, { ...scenario, seed, tools })
    for (let i = 0; i < model.n; i++) if (result.ignitedAt[i] !== NEVER) burnShare[i] += 1 / seeds.length
    return scoreRun(model, result)
  })
  return { mean: meanScore(scores), burnShare }
}

/** Hexes worth trying: reached by the fire in at least one run, or next to such a hex. */
function candidateCells(model: SpreadModel, burnShare: Float32Array, taken: ReadonlySet<number>): number[] {
  const threat = new Float32Array(model.n)
  for (let i = 0; i < model.n; i++) {
    if (burnShare[i] <= 0) continue
    threat[i] = Math.max(threat[i], burnShare[i])
    for (let k = model.nbrStart[i]; k < model.nbrStart[i + 1]; k++) {
      const j = model.nbrIndex[k]
      // A neighbour of a threatened hex is a place for a barrier just ahead of the fire.
      threat[j] = Math.max(threat[j], burnShare[i] * 0.5)
    }
  }
  const cells: number[] = []
  for (let i = 0; i < model.n; i++) if (threat[i] > 0 && model.burnable[i] && !taken.has(i)) cells.push(i)
  // Most threatened first; ties by index so the result is repeatable.
  cells.sort((a, b) => threat[b] - threat[a] || a - b)
  return cells.slice(0, MAX_CANDIDATE_CELLS)
}

export function optimizePlan(
  model: SpreadModel,
  scenario: Scenario,
  seeds: number[],
  budget: number,
  onProgress?: (progress: OptimizeProgress) => void,
  /** Resources already decided (for example a min-cut anchor line); the greedy steps add to them. */
  initial: readonly Placement[] = [],
): OptimizeOutput {
  const plan: Placement[] = [...initial]
  let simulatedRuns = seeds.length
  let current = evaluate(model, scenario, plan, seeds)
  const before = current.mean
  const cheapest = Math.min(...TOOL_KINDS.map((kind) => TOOLS[kind].cost))

  for (;;) {
    const remaining = budget - planCost(plan)
    if (remaining < cheapest) break
    const taken = new Set(plan.map((p) => p.cell))
    let best: { placement: Placement; evaluation: Evaluation } | null = null

    for (const cell of candidateCells(model, current.burnShare, taken)) {
      for (const kind of TOOL_KINDS) {
        if (TOOLS[kind].cost > remaining) continue
        if (placementProblem(model, plan, scenario.ignitions, kind, cell) !== null) continue
        const evaluation = evaluate(model, scenario, [...plan, { cell, kind }], seeds)
        simulatedRuns += seeds.length
        const versusBest = best ? compareOutcome(evaluation.mean, best.evaluation.mean) : -1
        // Better outcome wins; on an equal outcome the cheaper resource wins.
        if (versusBest < 0 || (versusBest === 0 && best && TOOLS[kind].cost < TOOLS[best.placement.kind].cost)) {
          best = { placement: { cell, kind }, evaluation }
        }
      }
    }

    if (!best || compareOutcome(best.evaluation.mean, current.mean) >= 0) break
    plan.push(best.placement)
    current = best.evaluation
    onProgress?.({ placed: plan.length, costUsed: planCost(plan), budget, simulatedRuns })
  }

  return { plan, simulatedRuns, before, after: current.mean }
}
