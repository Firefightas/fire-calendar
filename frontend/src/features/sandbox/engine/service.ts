// What the Web Worker computes. Pure TS so it can also run in-thread (tests, no-Worker fallback).
import type { SandboxCell } from '../../../types/contracts.ts'
import { buildModel } from './model.ts'
import type { SpreadModel } from './model.ts'
import { meanScore, scoreRun } from './score.ts'
import type { MeanScore, Score } from './score.ts'
import { NEVER, simulate } from './simulate.ts'
import type { RunResult, Scenario } from './simulate.ts'
import { optimizePlan } from '../optimizer/greedy.ts'
import type { OptimizeProgress } from '../optimizer/greedy.ts'
import type { Placement } from './tools.ts'

/** Seeds of an ensemble: the displayed run's seed first, then the following integers. */
export const ENSEMBLE_RUNS = 20
export const ensembleSeeds = (seed: number, runs: number = ENSEMBLE_RUNS): number[] =>
  Array.from({ length: runs }, (_v, k) => seed + k)

export interface RunOutput {
  result: RunResult
  score: Score
}

export interface EnsembleOutput {
  seeds: number[]
  scores: Score[]
  mean: MeanScore
  /** Share of the runs in which each cell burned, 0…1. */
  burnProbability: Float32Array
}

export function runOnce(model: SpreadModel, scenario: Scenario): RunOutput {
  const result = simulate(model, scenario)
  return { result, score: scoreRun(model, result) }
}

/** The same plan, wind and ignitions under each seed. */
export function runEnsemble(model: SpreadModel, scenario: Scenario, seeds: number[]): EnsembleOutput {
  const burnProbability = new Float32Array(model.n)
  const scores: Score[] = []
  for (const seed of seeds) {
    const result = simulate(model, { ...scenario, seed })
    scores.push(scoreRun(model, result))
    for (let i = 0; i < model.n; i++) if (result.ignitedAt[i] !== NEVER) burnProbability[i] += 1
  }
  if (seeds.length > 0) for (let i = 0; i < model.n; i++) burnProbability[i] /= seeds.length
  return { seeds, scores, mean: meanScore(scores), burnProbability }
}

/** The optimizer's plan with the same readouts a human plan gets. */
export interface OptimizeResult {
  plan: Placement[]
  simulatedRuns: number
  run: RunOutput
  ensemble: EnsembleOutput
}

export type SimRequest =
  | { type: 'init'; cells: SandboxCell[] }
  | { type: 'run'; scenario: Scenario }
  | { type: 'ensemble'; scenario: Scenario; seeds: number[] }
  /** `scenario.tools` is ignored: the optimizer starts from an empty plan. */
  | { type: 'optimize'; scenario: Scenario; seeds: number[]; budget: number }

export interface SimResponses {
  init: { cells: number }
  run: RunOutput
  ensemble: EnsembleOutput
  optimize: OptimizeResult
}

export type SimProgress = OptimizeProgress

/** Holds the model for one grid and answers requests. */
export class SimService {
  private model: SpreadModel | null = null

  handle(request: SimRequest, onProgress?: (progress: SimProgress) => void): SimResponses[SimRequest['type']] {
    if (request.type === 'init') {
      this.model = buildModel(request.cells)
      return { cells: this.model.n }
    }
    if (!this.model) throw new Error('The simulation was asked to run before the grid was loaded.')
    if (request.type === 'run') return runOnce(this.model, request.scenario)
    if (request.type === 'optimize') {
      const base: Scenario = { ...request.scenario, tools: [] }
      const { plan, simulatedRuns } = optimizePlan(this.model, base, request.seeds, request.budget, onProgress)
      const withPlan: Scenario = { ...base, tools: plan }
      return {
        plan,
        simulatedRuns,
        run: runOnce(this.model, withPlan),
        ensemble: runEnsemble(this.model, withPlan, request.seeds),
      }
    }
    return runEnsemble(this.model, request.scenario, request.seeds)
  }
}
