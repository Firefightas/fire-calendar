import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SandboxGrid } from '../../../types/contracts.ts'
import { ASSET_VILLAGE, buildModel, DEFAULT_PARAMS } from '../engine/model.ts'
import type { SpreadModel } from '../engine/model.ts'
import { ensembleSeeds } from '../engine/service.ts'
import type { Scenario } from '../engine/simulate.ts'
import { diskGrid } from '../engine/testGrid.ts'
import { BUDGET_UNITS, placementProblem, planCost } from '../engine/tools.ts'
import { windVector } from '../engine/wind.ts'
import { optimizePlan } from './greedy.ts'
import { cutTool, minCutPlan } from './mincut.ts'

const seeds = [1, 2, 3, 4]

/** True if fire could still walk from an ignition hex to a village without crossing the plan. */
function connected(model: SpreadModel, ignitions: number[], blocked: number[]): boolean {
  const seen = new Set<number>([...ignitions, ...blocked])
  const queue = [...ignitions]
  while (queue.length > 0) {
    const i = queue.pop() as number
    if (model.asset[i] === ASSET_VILLAGE) return true
    for (let k = model.nbrStart[i]; k < model.nbrStart[i + 1]; k++) {
      const j = model.nbrIndex[k]
      if (model.burnable[j] && !seen.has(j)) {
        seen.add(j)
        queue.push(j)
      }
    }
  }
  return false
}
/** No spread, so every hex can still be reached by a resource in time. */
const STILL = { ...DEFAULT_PARAMS, p0: 0 }

describe('min-cut anchor line', () => {
  // Fire at the centre, a village on ring 4, and a ring of water (ring 2) with a two-hex gap.
  const gap = [9, 14]
  const cells = diskGrid(4, 30, (_h, i) => {
    if (i >= 7 && i < 19 && !gap.includes(i)) return { landcover: 80 }
    if (i === 40) return { landcover: 50 }
    return {}
  })
  const model = buildModel(cells)
  const scenario: Scenario = { seed: 1, hours: 72, ignitions: [0], wind: [], tools: [], params: STILL }

  it('separates the fire from the village with the cheapest line: two trenches, one per gap', () => {
    expect(connected(model, [0], [])).toBe(true)
    const out = minCutPlan(model, scenario, seeds, 24)
    expect(out.plan).toHaveLength(2)
    expect(connected(model, [0], out.plan.map((p) => p.cell))).toBe(false)
    expect(out.plan.every((p) => p.kind === 'trench' && model.asset[p.cell] !== ASSET_VILLAGE)).toBe(true)
    expect(out.cutCost).toBe(4)
    expect(out.complete).toBe(true)
    out.plan.forEach((p, k) => expect(placementProblem(model, out.plan.slice(0, k), [0], p.kind, p.cell)).toBeNull())
  })

  it('uses timber clearing under canopy', () => {
    expect(cutTool(10)).toBe('clearing')
    expect(cutTool(30)).toBe('trench')
    const forest = buildModel(
      diskGrid(4, 10, (_h, i) => {
        if (i >= 7 && i < 19 && !gap.includes(i)) return { landcover: 80 }
        if (i === 40) return { landcover: 50 }
        return {}
      }),
    )
    const out = minCutPlan(forest, scenario, seeds, 24)
    expect(out.plan).toHaveLength(2)
    expect(connected(forest, [0], out.plan.map((p) => p.cell))).toBe(false)
    expect(out.plan.every((p) => p.kind === 'clearing')).toBe(true)
    expect(out.cutCost).toBe(6)
  })

  it('places only part of the line when the budget is too small, and says so', () => {
    const out = minCutPlan(model, scenario, seeds, 2)
    expect(out.plan).toHaveLength(1)
    expect(planCost(out.plan)).toBe(2)
    expect(out.cutCost).toBe(4)
    expect(out.complete).toBe(false)
  })

  it('reports no finite cut when the fire starts on a village, and nothing to do without villages', () => {
    expect(minCutPlan(model, { ...scenario, ignitions: [40] }, seeds, 24)).toMatchObject({
      plan: [],
      cutCost: null,
      villagesOutOfReach: 1,
      complete: false,
    })
    const plain = buildModel(diskGrid(2))
    expect(minCutPlan(plain, scenario, seeds, 24)).toMatchObject({ plan: [], cutCost: 0, complete: true })
  })

  it('leaves out a village the line cannot get ahead of and still protects the other', () => {
    // A second village touches the ignition hex: no line (which never sits on a village) can separate it.
    const two = buildModel(
      diskGrid(4, 30, (_h, i) => {
        if (i >= 7 && i < 19 && !gap.includes(i)) return { landcover: 80 }
        if (i === 40 || i === 1) return { landcover: 50 }
        return {}
      }),
    )
    const out = minCutPlan(two, scenario, seeds, 24)
    expect(out.villagesOutOfReach).toBe(1)
    expect(out.cutCost).not.toBeNull()
    const blocked = out.plan.map((p) => p.cell)
    expect(blocked.length).toBeGreaterThan(0)
    expect(blocked).not.toContain(40)
    expect(blocked).not.toContain(1)
    // Ignoring the lost village, the far one is cut off from the fire.
    const reachFar = (cut: number[]) => {
      const seen = new Set<number>([0, ...cut])
      const queue = [0]
      while (queue.length > 0) {
        const i = queue.pop() as number
        if (i === 40) return true
        for (let k = two.nbrStart[i]; k < two.nbrStart[i + 1]; k++) {
          const j = two.nbrIndex[k]
          if (two.burnable[j] && !seen.has(j)) {
            seen.add(j)
            queue.push(j)
          }
        }
      }
      return false
    }
    expect(reachFar([])).toBe(true)
    expect(reachFar(blocked)).toBe(false)
  })

  it('greedy fill starts from the anchor line and stays within the budget', () => {
    const brisk: Scenario = { ...scenario, params: { ...DEFAULT_PARAMS, p0: 0.1 } }
    const line = minCutPlan(model, brisk, seeds, 10)
    const filled = optimizePlan(model, brisk, seeds, 10, undefined, line.plan)
    expect(filled.plan.slice(0, line.plan.length)).toEqual(line.plan)
    expect(planCost(filled.plan)).toBeLessThanOrEqual(10)
  })

  it('finds a line on a full mock grid within the budget', () => {
    const grid = JSON.parse(readFileSync('public/data/rio_negro/sandbox_grid.json', 'utf8')) as SandboxGrid
    const full = buildModel(grid.cells)
    const ignition = grid.cells.findIndex((c) => c.landcover === 10 && c.years_since_last_fire === null)
    const real: Scenario = { seed: 1, hours: 72, ignitions: [ignition], wind: [windVector(270, 20)], tools: [] }
    const out = minCutPlan(full, real, ensembleSeeds(1), BUDGET_UNITS)
    expect(planCost(out.plan)).toBeLessThanOrEqual(BUDGET_UNITS)
    expect(new Set(out.plan.map((p) => p.cell)).size).toBe(out.plan.length)
    out.plan.forEach((p, k) => expect(placementProblem(full, out.plan.slice(0, k), [ignition], p.kind, p.cell)).toBeNull())
  })
})
