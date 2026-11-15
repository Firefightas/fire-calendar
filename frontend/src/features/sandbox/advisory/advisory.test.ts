import { describe, expect, it } from 'vitest'
import { buildModel, DEFAULT_PARAMS } from '../engine/model.ts'
import { ensembleSeeds, runEnsemble, runOnce } from '../engine/service.ts'
import type { Scenario } from '../engine/simulate.ts'
import { diskGrid } from '../engine/testGrid.ts'
import type { Placement } from '../engine/tools.ts'
import { windSchedule } from '../engine/wind.ts'
import { hotspotIgnitions, pointInPolygon, reconBbox } from '../recon/hotspots.ts'
import { DRAFT_STATUS, draftAdvisory, evacuationBearing } from './draft.ts'
import { crewExitRoutes } from './exitRoute.ts'

const CERTAIN = { ...DEFAULT_PARAMS, p0: 10 }
const NONE = { ...DEFAULT_PARAMS, p0: 0 }

describe('crew exit routes', () => {
  // Grass disk; hex 1 (ring 1) is water. Ring 2 starts at index 7.
  const cells = diskGrid(3, 30, (_h, i) => (i === 1 ? { landcover: 80 } : {}))
  const model = buildModel(cells)
  const far = 25 // a ring-3 hex
  const base: Scenario = { seed: 1, hours: 72, ignitions: [far], wind: [], tools: [], params: NONE }

  it('water drops have no ground crew', () => {
    const plan: Placement[] = [{ cell: 0, kind: 'water' }]
    expect(crewExitRoutes(model, runOnce(model, { ...base, tools: plan }).result, plan)).toEqual({ crews: [], clear: 0, total: 0 })
  })

  it('a crew next to water is clear in one hour', () => {
    const plan: Placement[] = [{ cell: 0, kind: 'trench' }]
    const exit = crewExitRoutes(model, runOnce(model, { ...base, tools: plan }).result, plan)
    expect(exit.total).toBe(1)
    expect(exit.clear).toBe(1)
    expect(exit.crews[0]).toMatchObject({ status: 'clear', leaveHour: 6, hoursToSafety: 1, path: [0, 1] })
  })

  it('a crew whose hex is burning when it must leave is overrun', () => {
    // Certain spread from the centre: every hex of the disk burns from hour 1–3 on.
    const plan: Placement[] = [{ cell: 9, kind: 'trench' }]
    const run = runOnce(model, { ...base, ignitions: [0], tools: plan, params: CERTAIN })
    const exit = crewExitRoutes(model, run.result, plan)
    // Fire reaches ring 1 (a neighbour of ring-2 hex 9) at hour 1, so the crew leaves at hour 1.
    expect(exit.crews[0].leaveHour).toBe(1)
    expect(exit.clear + exit.crews.filter((c) => c.status !== 'clear').length).toBe(1)
  })

  it('a crew with no water or bare ground anywhere is cut off', () => {
    const dry = buildModel(diskGrid(2))
    const plan: Placement[] = [{ cell: 0, kind: 'trench' }]
    const run = runOnce(dry, { ...base, ignitions: [], tools: plan })
    expect(crewExitRoutes(dry, run.result, plan).crews[0].status).toBe('cut_off')
  })
})

describe('evacuation direction', () => {
  const fire = { lat: 45, lon: 25 }
  it('is across the wind, on the side away from the fire', () => {
    // Wind blowing east; village north-east of the fire → go north.
    expect(evacuationBearing({ lat: 45.1, lon: 25.2 }, fire, { east: 1, north: 0 })).toBeCloseTo(0)
    // Village south-east of the fire → go south.
    expect(evacuationBearing({ lat: 44.9, lon: 25.2 }, fire, { east: 1, north: 0 })).toBeCloseTo(180)
  })
  it('is straight away from the fire in calm air', () => {
    expect(evacuationBearing({ lat: 45, lon: 25.2 }, fire, { east: 0, north: 0 })).toBeCloseTo(90)
    expect(evacuationBearing({ lat: 44.8, lon: 25 }, fire, { east: 0, north: 0 })).toBeCloseTo(180)
  })
})

describe('draft advisory', () => {
  const cells = diskGrid(3, 30, (_h, i) => (i === 8 ? { landcover: 50 } : i === 30 ? { landcover: 80 } : {}))
  const model = buildModel(cells)
  const wind = { fromDeg: 270, speedKmh: 20, gustKmh: 0, shiftDeg: 0, shiftHour: 24 }
  const schedule = windSchedule(wind, 72, 1)
  const build = (params: typeof CERTAIN, isMock: boolean) => {
    const scenario: Scenario = { seed: 1, hours: 72, ignitions: [0], wind: schedule, tools: [], params }
    const run = runOnce(model, scenario)
    const ensemble = runEnsemble(model, scenario, ensembleSeeds(1, 5))
    return draftAdvisory({
      regionId: 'romania',
      isMock,
      cells,
      planTitle: 'No intervention',
      plan: [],
      run,
      ensemble,
      exit: crewExitRoutes(model, run.result, []),
      seed: 1,
      hours: 72,
      ignitions: [0],
      wind,
      schedule,
      generatedAt: '2026-11-15T10:00:00Z',
    })
  }

  it('lists a reached village with its arrival window and is always marked as a draft', () => {
    const { json, text } = build(CERTAIN, true)
    expect(text.startsWith(DRAFT_STATUS)).toBe(true)
    expect(text).toContain('MOCK DATA')
    expect(text).not.toMatch(/official alert issued/i)
    expect(json.status).toBe(DRAFT_STATUS)
    expect(json.is_mock_data).toBe(true)
    const villages = json.threatened_villages as { h3: string; runs_reached: number; earliest_arrival_hour: number; latest_arrival_hour: number }[]
    expect(villages).toHaveLength(1)
    // Certain spread: ring 2 burns at hour 2 in all 5 runs.
    expect(villages[0]).toMatchObject({ h3: cells[8].h3, runs_reached: 5, earliest_arrival_hour: 2, latest_arrival_hour: 2 })
    expect(text).toContain('reached in 5 of 5 runs, simulated arrival around hour 2')
  })

  it('says so when no village is reached, without a mock note on real data', () => {
    const { json, text } = build(NONE, false)
    expect(json.threatened_villages).toEqual([])
    expect(text).toContain('No village hex was reached by fire in any of the 5 simulated runs')
    expect(text).not.toContain('MOCK DATA')
    expect(text).toContain('no ground crews')
  })
})

describe('recon hotspots', () => {
  const square: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
      [
        [4, 4],
        [6, 4],
        [6, 6],
        [4, 6],
        [4, 4],
      ],
    ],
  }
  it('point in polygon respects holes', () => {
    expect(pointInPolygon(2, 2, square)).toBe(true)
    expect(pointInPolygon(5, 5, square)).toBe(false)
    expect(pointInPolygon(12, 2, square)).toBe(false)
  })

  it('maps hotspots to distinct burnable grid hexes inside the area', () => {
    const cells = diskGrid(2, 30, (_h, i) => (i === 1 ? { landcover: 80 } : {}))
    const model = buildModel(cells)
    const indexOf = new Map(cells.map((c, i) => [c.h3, i]))
    const points = [
      { lat: cells[0].lat, lon: cells[0].lon },
      { lat: cells[0].lat + 0.0005, lon: cells[0].lon }, // same hex
      { lat: cells[1].lat, lon: cells[1].lon }, // water: not burnable
      { lat: cells[5].lat, lon: cells[5].lon },
      { lat: 10, lon: 10 }, // far outside the grid
    ]
    expect(hotspotIgnitions(points, null, indexOf, model.burnable, 7)).toEqual({ total: 5, inArea: 5, cells: [0, 5] })
    const around0: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [cells[0].lon - 0.004, cells[0].lat - 0.004],
          [cells[0].lon + 0.004, cells[0].lat - 0.004],
          [cells[0].lon + 0.004, cells[0].lat + 0.004],
          [cells[0].lon - 0.004, cells[0].lat + 0.004],
          [cells[0].lon - 0.004, cells[0].lat - 0.004],
        ],
      ],
    }
    expect(hotspotIgnitions(points, around0, indexOf, model.burnable, 7)).toEqual({ total: 5, inArea: 2, cells: [0] })
    expect(reconBbox(square, [])).toEqual([0, 0, 10, 10])
    const box = reconBbox(null, cells)
    expect(box[0]).toBeLessThan(box[2])
    expect(box[1]).toBeLessThan(box[3])
  })
})
