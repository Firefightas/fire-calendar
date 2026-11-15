import { describe, expect, it } from 'vitest'
import { buildModel } from '../engine/model.ts'
import { diskGrid } from '../engine/testGrid.ts'
import { highestRiskCell } from './quickstart.ts'

describe('highest-risk ignition hex', () => {
  it('picks the interior hex with the most fuel around it, never a village, farm or water', () => {
    // Grass everywhere; ring-1 hex 2 is forest (more fuel); the centre is a village.
    const cells = diskGrid(2, 30, (_h, i) => (i === 0 ? { landcover: 50 } : i === 2 ? { landcover: 10 } : {}))
    const model = buildModel(cells)
    const i = highestRiskCell(model, cells, null)
    expect(i).toBeGreaterThan(0)
    expect(model.missingNeighbours[i]).toBe(0)
    expect(cells[i].landcover).not.toBe(50)
    // Ring 1 is the only interior ring of a radius-2 disk. The forest hex (2) and its two ring-1
    // neighbours (1, 3) each have it in their neighbourhood and tie; the lowest index wins.
    expect(i).toBe(1)
  })

  it('stays inside the drawn area when it can, and is repeatable', () => {
    const cells = diskGrid(3)
    const model = buildModel(cells)
    const target = cells[25]
    const d = 0.003
    const area: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [target.lon - d, target.lat - d],
          [target.lon + d, target.lat - d],
          [target.lon + d, target.lat + d],
          [target.lon - d, target.lat + d],
          [target.lon - d, target.lat - d],
        ],
      ],
    }
    expect(highestRiskCell(model, cells, area)).toBe(25)
    expect(highestRiskCell(model, cells, null)).toBe(highestRiskCell(model, cells, null))
  })

  it('breaks ties on burn count and returns -1 when nothing can burn', () => {
    const cells = diskGrid(2, 30, (_h, i) => (i === 4 ? { burn_count: 5 } : {}))
    expect(highestRiskCell(buildModel(cells), cells, null)).toBe(4)
    const wet = diskGrid(1, 80)
    expect(highestRiskCell(buildModel(wet), wet, null)).toBe(-1)
  })
})
