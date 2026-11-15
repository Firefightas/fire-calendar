import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SandboxGrid } from '../../../types/contracts.ts'
import { buildModel, DEFAULT_PARAMS } from '../engine/model.ts'
import { compareOutcome } from '../engine/score.ts'
import { ensembleSeeds, runEnsemble } from '../engine/service.ts'
import type { Scenario } from '../engine/simulate.ts'
import { diskGrid } from '../engine/testGrid.ts'
import { BUDGET_UNITS, placementProblem, planCost } from '../engine/tools.ts'
import { windVector } from '../engine/wind.ts'
import { optimizePlan } from './greedy.ts'

const seeds = [1, 2, 3, 4, 5, 6]

describe('greedy optimizer', () => {
  // Grass disk with a village on ring 2; brisk spread so the village is usually reached.
  const cells = diskGrid(5, 30, (_h, i) => (i === 9 ? { landcover: 50 } : i === 14 ? { landcover: 40 } : {}))
  const model = buildModel(cells)
  const scenario: Scenario = {
    seed: 1,
    hours: 72,
    ignitions: [0],
    wind: [],
    tools: [],
    params: { ...DEFAULT_PARAMS, p0: 0.12 },
  }

  it('stays within the budget and only makes valid placements', () => {
    const out = optimizePlan(model, scenario, seeds, 10)
    expect(planCost(out.plan)).toBeLessThanOrEqual(10)
    expect(out.plan.length).toBeGreaterThan(0)
    expect(new Set(out.plan.map((p) => p.cell)).size).toBe(out.plan.length)
    out.plan.forEach((p, k) => {
      expect(placementProblem(model, out.plan.slice(0, k), scenario.ignitions, p.kind, p.cell)).toBeNull()
    })
  })

  it('improves the outcome on its scoring seeds and reports what it measured', () => {
    const out = optimizePlan(model, scenario, seeds, 10)
    expect(compareOutcome(out.after, out.before)).toBeLessThan(0)
    const check = runEnsemble(model, { ...scenario, tools: out.plan }, seeds)
    expect(check.mean).toEqual(out.after)
    expect(runEnsemble(model, scenario, seeds).mean).toEqual(out.before)
    expect(out.simulatedRuns).toBeGreaterThan(seeds.length)
  })

  it('is repeatable and reports progress', () => {
    const steps: number[] = []
    const a = optimizePlan(model, scenario, seeds, 8, (p) => steps.push(p.costUsed))
    const b = optimizePlan(model, scenario, seeds, 8)
    expect(a.plan).toEqual(b.plan)
    expect(steps).toHaveLength(a.plan.length)
    expect(steps[steps.length - 1]).toBe(planCost(a.plan))
  })

  it('places nothing with no budget or no fire', () => {
    expect(optimizePlan(model, scenario, seeds, 0).plan).toEqual([])
    expect(optimizePlan(model, { ...scenario, ignitions: [] }, seeds, 10).plan).toEqual([])
  })

  it('finishes on a full mock grid in reasonable time', () => {
    const grid = JSON.parse(readFileSync('public/data/rio_negro/sandbox_grid.json', 'utf8')) as SandboxGrid
    const full = buildModel(grid.cells)
    const ignition = grid.cells.findIndex((c) => c.landcover === 10 && c.years_since_last_fire === null)
    const real: Scenario = { seed: 1, hours: 72, ignitions: [ignition], wind: [windVector(270, 20)], tools: [] }
    const started = performance.now()
    const out = optimizePlan(full, real, ensembleSeeds(1), BUDGET_UNITS)
    const seconds = (performance.now() - started) / 1000
    expect(planCost(out.plan)).toBeLessThanOrEqual(BUDGET_UNITS)
    expect(compareOutcome(out.after, out.before)).toBeLessThanOrEqual(0)
    expect(seconds).toBeLessThan(60)
  }, 90_000)
})
