import { cellArea } from 'h3-js'
import { describe, expect, it } from 'vitest'
import { buildModel, DEFAULT_PARAMS, fuelAgeFactor, fuelFactor } from './model.ts'
import type { SpreadParams } from './model.ts'
import { hash01 } from './rng.ts'
import { compareOutcome, meanScore, scoreRun } from './score.ts'
import { BURNED, BURNING, edgeBetween, frameAt, NEVER, simulate, spreadProbability, UNBURNED } from './simulate.ts'
import type { Scenario } from './simulate.ts'
import { diskGrid, makeCell } from './testGrid.ts'
import { dropUnanchored, placementProblem } from './tools.ts'
import { windSchedule, windVector } from './wind.ts'

const CALM = { east: 0, north: 0 }
/** P0 high enough that every burnable neighbour ignites: runs become hand-checkable. */
const CERTAIN: SpreadParams = { ...DEFAULT_PARAMS, p0: 10 }

const scenario = (over: Partial<Scenario>): Scenario => ({
  seed: 1,
  hours: 72,
  ignitions: [0],
  wind: [],
  tools: [],
  ...over,
})

describe('random numbers', () => {
  it('are repeatable and roughly uniform', () => {
    expect(hash01(7, 1, 2, 3)).toBe(hash01(7, 1, 2, 3))
    expect(hash01(7, 1, 2, 3)).not.toBe(hash01(8, 1, 2, 3))
    let sum = 0
    for (let k = 0; k < 20000; k++) {
      const u = hash01(42, k, k * 3, 5)
      expect(u).toBeGreaterThanOrEqual(0)
      expect(u).toBeLessThan(1)
      sum += u
    }
    expect(sum / 20000).toBeCloseTo(0.5, 1)
  })
})

describe('fuel', () => {
  it('follows the README: base flammability × min(1.5, 0.25 + 0.08·years)', () => {
    expect(fuelAgeFactor(null)).toBe(1.5)
    expect(fuelAgeFactor(2)).toBeCloseTo(0.41)
    expect(fuelAgeFactor(40)).toBe(1.5)
    const h3 = diskGrid(0)[0].h3
    expect(fuelFactor(makeCell(h3, 10, { years_since_last_fire: 5 }))).toBeCloseTo(0.65)
    expect(fuelFactor(makeCell(h3, 10, { years_since_last_fire: 5, elevation_m: 900 }))).toBeCloseTo(0.78)
    expect(fuelFactor(makeCell(h3, 30, { years_since_last_fire: 5 }))).toBeCloseTo(0.52)
    expect(fuelFactor(makeCell(h3, 40))).toBeCloseTo(0.75)
    expect(fuelFactor(makeCell(h3, 50))).toBeCloseTo(0.45)
    expect(fuelFactor(makeCell(h3, 80))).toBe(0)
  })
})

describe('simulate', () => {
  it('gives the same run for the same seed and a different one for another seed', () => {
    const model = buildModel(diskGrid(8))
    const params = { ...DEFAULT_PARAMS, p0: 0.2 }
    const a = simulate(model, scenario({ seed: 11, params }))
    const b = simulate(model, scenario({ seed: 11, params }))
    const c = simulate(model, scenario({ seed: 12, params }))
    expect(scoreRun(model, a).cellsBurned).toBeGreaterThan(10)
    expect(Array.from(a.ignitedAt)).toEqual(Array.from(b.ignitedAt))
    expect(Array.from(a.burnedOutAt)).toEqual(Array.from(b.burnedOutAt))
    expect(Array.from(a.ignitedAt)).not.toEqual(Array.from(c.ignitedAt))
  })

  it('never burns non-burnable cells (water), even at certain spread', () => {
    // Ring 2 is water: the fire takes ring 0–1 and stops; ring 3 stays green.
    const cells = diskGrid(3, 30, (_h, i) => (i >= 7 && i < 19 ? { landcover: 80 } : {}))
    const model = buildModel(cells)
    const run = simulate(model, scenario({ params: CERTAIN }))
    cells.forEach((c, i) => {
      if (c.landcover === 80) expect(run.ignitedAt[i]).toBe(NEVER)
    })
    expect(scoreRun(model, run).cellsBurned).toBe(7)
    // Igniting a water cell does nothing.
    expect(scoreRun(model, simulate(model, scenario({ ignitions: [8], params: CERTAIN }))).cellsBurned).toBe(0)
  })

  it('reports frames: unburned, burning, burned', () => {
    const model = buildModel(diskGrid(1))
    const run = simulate(model, scenario({ params: CERTAIN }))
    expect(Array.from(frameAt(run, 0))).toEqual([BURNING, UNBURNED, UNBURNED, UNBURNED, UNBURNED, UNBURNED, UNBURNED])
    expect(frameAt(run, 1).every((v) => v === BURNING)).toBe(true)
    expect(frameAt(run, 72).every((v) => v === BURNED)).toBe(true)
  })
})

describe('spread probability', () => {
  const cells = diskGrid(1)
  const model = buildModel(cells)
  const edge = edgeBetween(model, 0, 1)

  it('matches the formula in calm, flat conditions', () => {
    // grass 0.8 × never-burned 1.5 = 1.2
    expect(spreadProbability(model, edge, CALM, 0)).toBeCloseTo(DEFAULT_PARAMS.p0 * 1.2)
  })

  it('a tool lowers it and Rtool = 1 blocks it', () => {
    const free = spreadProbability(model, edge, CALM, 0)
    expect(spreadProbability(model, edge, CALM, 0.5)).toBeCloseTo(free / 2)
    expect(spreadProbability(model, edge, CALM, 1)).toBe(0)
  })

  it('wind towards the neighbour raises it; wind away does not', () => {
    const towards = { east: model.nbrEast[edge], north: model.nbrNorth[edge] }
    const away = { east: -towards.east, north: -towards.north }
    const free = spreadProbability(model, edge, CALM, 0)
    expect(spreadProbability(model, edge, towards, 0)).toBeCloseTo(free * (1 + DEFAULT_PARAMS.gammaWind))
    expect(spreadProbability(model, edge, away, 0)).toBeCloseTo(free)
  })

  it('uphill raises it, downhill lowers it', () => {
    const hilly = buildModel(diskGrid(1, 30, (_h, i) => (i === 1 ? { elevation_m: 400 } : i === 2 ? { elevation_m: 0 } : {})))
    const flat = spreadProbability(hilly, edgeBetween(hilly, 0, 3), CALM, 0)
    expect(spreadProbability(hilly, edgeBetween(hilly, 0, 1), CALM, 0)).toBeGreaterThan(flat)
    expect(spreadProbability(hilly, edgeBetween(hilly, 0, 2), CALM, 0)).toBeLessThan(flat)
  })

  it('is clamped to 0…1', () => {
    expect(spreadProbability(model, edge, CALM, 0, CERTAIN)).toBe(1)
  })
})

describe('tools in a run', () => {
  it('a trench (Rtool = 1 on grass) is never crossed once it is in place', () => {
    const cells = diskGrid(4)
    const model = buildModel(cells)
    const tools = cells.map((_c, i) => i).filter((i) => i >= 19 && i < 37).map((cell) => ({ cell, kind: 'trench' as const }))
    // Ring 3 is trenched from hour 6: a ring-3 hex can only have caught fire before that.
    for (let seed = 0; seed < 20; seed++) {
      const run = simulate(model, scenario({ seed, tools, params: { ...DEFAULT_PARAMS, p0: 0.3 } }))
      for (let i = 19; i < 37; i++) {
        if (run.ignitedAt[i] !== NEVER) expect(run.ignitedAt[i]).toBeLessThanOrEqual(6)
      }
    }
  })

  it('a trench ring stops a certain-spread fire that arrives after it is ready', () => {
    // Certain spread advances one ring per hour, so ring 8 is reached at hour 8 > ready hour 6.
    const cells = diskGrid(10)
    const model = buildModel(cells)
    const first = 1 + 3 * 7 * 8 // cells in rings 0–7
    const tools = cells.map((_c, i) => i).filter((i) => i >= first && i < first + 48).map((cell) => ({ cell, kind: 'trench' as const }))
    expect(scoreRun(model, simulate(model, scenario({ params: CERTAIN }))).cellsBurned).toBe(model.n)
    const s = scoreRun(model, simulate(model, scenario({ tools, params: CERTAIN })))
    expect(s.cellsBurned).toBe(first)
    expect(s.containmentPct).toBe(100)
  })

  it('a water drop puts out a burning hex when it arrives', () => {
    const model = buildModel(diskGrid(1))
    const run = simulate(model, scenario({ tools: [{ cell: 0, kind: 'water' }], params: { ...DEFAULT_PARAMS, p0: 0 } }))
    expect(run.burnedOutAt[0]).toBe(2)
  })

  it('a backfire burns its hex out and counts as burned', () => {
    const cells = diskGrid(1, 30, (_h, i) => (i === 2 ? { landcover: 80 } : {}))
    const model = buildModel(cells)
    const run = simulate(model, scenario({ ignitions: [], tools: [{ cell: 1, kind: 'backfire' }] }))
    expect(run.ignitedAt[1]).toBe(4)
    expect(run.burnedOutAt[1]).toBe(4)
    expect(scoreRun(model, run).cellsBurned).toBe(1)
  })

  it('placement rules: clearing needs forest, a backfire needs an anchor', () => {
    const cells = diskGrid(2, 30, (_h, i) => (i === 7 ? { landcover: 80 } : i === 3 ? { landcover: 10 } : {}))
    const model = buildModel(cells)
    expect(placementProblem(model, [], [], 'clearing', 0)).toMatch(/forest/)
    expect(placementProblem(model, [], [], 'clearing', 3)).toBeNull()
    expect(placementProblem(model, [], [], 'trench', 7)).toMatch(/does not burn/)
    expect(placementProblem(model, [{ cell: 0, kind: 'water' }], [], 'trench', 0)).toMatch(/already/)
    expect(placementProblem(model, [], [], 'backfire', 0)).toMatch(/anchored/)
    const besideWater = model.nbrIndex[model.nbrStart[7]]
    expect(placementProblem(model, [], [], 'backfire', besideWater)).toBeNull()
    // Anchored on a trench; removing the trench drops the backfire.
    const plan = [
      { cell: 4, kind: 'trench' as const },
      { cell: 0, kind: 'backfire' as const },
    ]
    expect(placementProblem(model, [plan[0]], [], 'backfire', 0)).toBeNull()
    expect(dropUnanchored(model, plan)).toHaveLength(2)
    expect(dropUnanchored(model, [plan[1]])).toHaveLength(0)
  })
})

describe('scoreboard on a hand-checked grid', () => {
  // 7 hexes: centre grass (ignition), ring = village, farm, farm, water, forest, grass.
  const lc = [30, 50, 40, 40, 80, 10, 30]
  const cells = diskGrid(1, 30, (_h, i) => ({ landcover: lc[i] }))
  const model = buildModel(cells)
  const haOf = (indices: number[]) => indices.reduce((sum, i) => sum + cellArea(cells[i].h3, 'km2') * 100, 0)

  it('everything burnable burns: 6 hexes, 1 village, 2 farms, fully contained', () => {
    const s = scoreRun(model, simulate(model, scenario({ params: CERTAIN })))
    expect(s.villagesTotal).toBe(1)
    expect(s.farmsTotal).toBe(2)
    expect(s.villagesBurned).toBe(1)
    expect(s.villagesProtected).toBe(0)
    expect(s.farmsBurned).toBe(2)
    expect(s.farmsProtected).toBe(0)
    expect(s.cellsBurned).toBe(6)
    expect(s.hectaresBurned).toBeCloseTo(haOf([0, 1, 2, 3, 5, 6]), 3)
    expect(s.cellsStillBurning).toBe(0)
    expect(s.containmentPct).toBe(100)
  })

  it('no spread: only the ignition hex burns and assets are protected', () => {
    const s = scoreRun(model, simulate(model, scenario({ params: { ...DEFAULT_PARAMS, p0: 0 } })))
    expect(s.cellsBurned).toBe(1)
    expect(s.hectaresBurned).toBeCloseTo(haOf([0]), 3)
    expect(s.villagesProtected).toBe(1)
    expect(s.farmsProtected).toBe(2)
    expect(s.containmentPct).toBe(100) // burned out after 4 h
  })

  it('containment counts open edges of a still-burning front', () => {
    // After 1 h with no spread the centre still burns: 6 edges, 5 open (water is closed).
    const s = scoreRun(model, simulate(model, scenario({ hours: 1, params: { ...DEFAULT_PARAMS, p0: 0 } })))
    expect(s.cellsStillBurning).toBe(1)
    expect(s.containmentPct).toBeCloseTo((100 * 1) / 6)
    // A trench on the grass hex (index 6) would close one more edge, but it is not ready at hour 1.
    // A ring cell burning at the edge of the modelled area is open towards the outside too.
    const edgeRun = simulate(model, scenario({ hours: 1, ignitions: [6], params: { ...DEFAULT_PARAMS, p0: 0 } }))
    const e = scoreRun(model, edgeRun)
    // hex 6 has 3 neighbours in the grid (centre + 2 ring hexes) and 3 outside.
    expect(model.missingNeighbours[6]).toBe(3)
    const inGridOpen = [...Array(model.nbrStart[7] - model.nbrStart[6]).keys()]
      .map((k) => model.nbrIndex[model.nbrStart[6] + k])
      .filter((j) => model.burnable[j]).length
    expect(e.containmentPct).toBeCloseTo((100 * (6 - inGridOpen - 3)) / 6)
  })

  it('mean score and triage order: villages, then farms, then hectares', () => {
    const all = scoreRun(model, simulate(model, scenario({ params: CERTAIN })))
    const none = scoreRun(model, simulate(model, scenario({ params: { ...DEFAULT_PARAMS, p0: 0 } })))
    const m = meanScore([all, none])
    expect(m.runs).toBe(2)
    expect(m.villagesProtected).toBe(0.5)
    expect(m.farmsProtected).toBe(1)
    expect(m.hectaresBurned).toBeCloseTo((all.hectaresBurned + none.hectaresBurned) / 2)
    expect(compareOutcome(meanScore([none]), meanScore([all]))).toBeLessThan(0)
    const base = meanScore([none])
    expect(compareOutcome({ ...base, villagesProtected: 1, farmsProtected: 0 }, { ...base, villagesProtected: 0, farmsProtected: 2 })).toBeLessThan(0)
    expect(compareOutcome({ ...base, hectaresBurned: 10 }, { ...base, hectaresBurned: 20 })).toBeLessThan(0)
  })
})

describe('wind', () => {
  it('points where the wind blows to, scaled by speed', () => {
    const w = windVector(270, 30) // westerly: blows east
    expect(w.east).toBeCloseTo(1)
    expect(w.north).toBeCloseTo(0)
    const n = windVector(0, 15) // northerly: blows south at half the reference speed
    expect(n.north).toBeCloseTo(-0.5)
    expect(Math.hypot(windVector(90, 500).east, windVector(90, 500).north)).toBeCloseTo(2)
  })

  it('schedule applies the shift from its hour and repeats gusts per seed', () => {
    const settings = { fromDeg: 270, speedKmh: 10, gustKmh: 40, shiftDeg: 90, shiftHour: 24 }
    const a = windSchedule(settings, 72, 5)
    expect(a).toHaveLength(72)
    expect(a[0].fromDeg).toBe(270)
    expect(a[24].fromDeg).toBe(0)
    expect(a).toEqual(windSchedule(settings, 72, 5))
    const gusts = a.filter((h) => h.gust).length
    expect(gusts).toBeGreaterThan(5)
    expect(gusts).toBeLessThan(45)
    expect(windSchedule({ ...settings, gustKmh: 0 }, 72, 5).some((h) => h.gust)).toBe(false)
  })

  it('a strong wind pushes the burned area downwind', () => {
    const cells = diskGrid(10)
    const model = buildModel(cells)
    let east = 0
    let west = 0
    for (let seed = 0; seed < 30; seed++) {
      const run = simulate(model, scenario({ seed, hours: 24, wind: [windVector(270, 45)] }))
      for (let i = 0; i < model.n; i++) {
        if (run.ignitedAt[i] === NEVER) continue
        if (cells[i].lon > cells[0].lon) east++
        else if (cells[i].lon < cells[0].lon) west++
      }
    }
    expect(east).toBeGreaterThan(west * 1.5)
  })
})
