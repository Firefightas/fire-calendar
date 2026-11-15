// One-click start: the hex where an ignition is most likely to grow. Pure TS.
import { ASSET_NONE } from '../engine/model.ts'
import type { SpreadModel } from '../engine/model.ts'
import { pointInPolygon } from '../recon/hotspots.ts'

/**
 * The burnable, non-asset hex with the most fuel around it: its own fuel factor plus that of
 * its neighbours (the same Φfuel the simulation uses). Hexes on the edge of the grid are
 * skipped when possible, so the fire has room to spread. Inside the drawn area when one is
 * given and it contains a candidate. Ties go to the higher `burn_count`, then the lower index,
 * so the choice is repeatable. Returns -1 if no hex can burn.
 */
export function highestRiskCell(
  model: SpreadModel,
  cells: readonly { lat: number; lon: number; burn_count: number }[],
  area: GeoJSON.Polygon | null,
): number {
  const pick = (inside: (i: number) => boolean, interiorOnly: boolean): number => {
    let best = -1
    let bestScore = -Infinity
    for (let i = 0; i < model.n; i++) {
      if (!model.burnable[i] || model.asset[i] !== ASSET_NONE || !inside(i)) continue
      if (interiorOnly && model.missingNeighbours[i] > 0) continue
      let score = model.fuel[i]
      for (let k = model.nbrStart[i]; k < model.nbrStart[i + 1]; k++) score += model.fuel[model.nbrIndex[k]]
      const better =
        score > bestScore + 1e-9 ||
        (Math.abs(score - bestScore) <= 1e-9 && best >= 0 && cells[i].burn_count > cells[best].burn_count)
      if (better) {
        best = i
        bestScore = score
      }
    }
    return best
  }
  const everywhere = () => true
  const inArea = area ? (i: number) => pointInPolygon(cells[i].lon, cells[i].lat, area) : everywhere
  for (const inside of area ? [inArea, everywhere] : [everywhere]) {
    for (const interiorOnly of [true, false]) {
      const i = pick(inside, interiorOnly)
      if (i >= 0) return i
    }
  }
  return -1
}
