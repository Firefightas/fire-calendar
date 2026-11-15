// The four interventions of protocol step 6. Each sets Rtool on the hex it covers.
// The numbers here are illustrative modelling choices (DECISIONS.md), not field data.
import type { SpreadModel } from './model.ts'

export type ToolKind = 'water' | 'clearing' | 'trench' | 'backfire'

export interface ToolSpec {
  kind: ToolKind
  label: string
  labelRo: string
  /** Budget units for one hex. */
  cost: number
  /** Hours after t = 0 before the resource is in place. */
  readyHour: number
  /** Hours the effect lasts; null = until the end of the run. */
  durationHours: number | null
  summary: string
}

export const TOOLS: Record<ToolKind, ToolSpec> = {
  water: {
    kind: 'water',
    label: 'Aerial / water drop',
    labelRo: 'Apă',
    cost: 1,
    readyHour: 2,
    durationHours: 6,
    summary: 'Puts out the hex if it is burning when the drop arrives, then Rtool 0.9 for 6 h.',
  },
  clearing: {
    kind: 'clearing',
    label: 'Controlled timber clearing',
    labelRo: 'Defrișare controlată',
    cost: 3,
    readyHour: 10,
    durationHours: null,
    summary: 'Forest hexes only. Removes canopy fuel: Rtool 0.9 from hour 10 on.',
  },
  trench: {
    kind: 'trench',
    label: 'Bulldozer mineral trench',
    labelRo: 'Șanț / rupere strat biologic',
    cost: 2,
    readyHour: 6,
    durationHours: null,
    summary: 'Blocks surface fire: Rtool 1.0 on shrub, grass, farm and village hexes, 0.5 under forest canopy.',
  },
  backfire: {
    kind: 'backfire',
    label: 'Strategic backfire',
    labelRo: 'Foc tactic',
    cost: 2,
    readyHour: 4,
    durationHours: null,
    summary:
      'Burns the hex out at hour 4 so the front finds no fuel (Rtool 1.0). Counts as burned. Must touch a river, bare ground, a trench, a clearing or another backfire.',
  },
}

export const TOOL_KINDS: ToolKind[] = ['water', 'clearing', 'trench', 'backfire']

/** Budget units available to each side (human and optimizer). */
export const BUDGET_UNITS = 24

export interface Placement {
  cell: number
  kind: ToolKind
}

export const planCost = (plan: readonly Placement[]): number => plan.reduce((sum, p) => sum + TOOLS[p.kind].cost, 0)

/** Rtool of a tool on a given land cover while it is in effect. */
export function toolStrength(kind: ToolKind, landcover: number): number {
  switch (kind) {
    case 'water':
      return 0.9
    case 'clearing':
      return landcover === 10 ? 0.9 : 0
    case 'trench':
      return landcover === 10 ? 0.5 : 1
    case 'backfire':
      return 1
  }
}

/**
 * Why a tool cannot go on a hex, or null if it can. `plan` is what is already placed;
 * `ignitions` are the t = 0 fire hexes.
 */
export function placementProblem(
  model: SpreadModel,
  plan: readonly Placement[],
  ignitions: readonly number[],
  kind: ToolKind,
  cell: number,
): string | null {
  if (!model.burnable[cell]) return 'This hex does not burn, so it is already a barrier.'
  if (plan.some((p) => p.cell === cell)) return 'This hex already has a resource on it.'
  if (kind === 'clearing' && model.landcover[cell] !== 10) return 'Timber clearing only applies to forest hexes.'
  if (kind === 'backfire') {
    if (model.asset[cell] !== 0) return 'A backfire cannot be lit on a village or farm hex.'
    if (ignitions.includes(cell)) return 'This hex is already on fire at t = 0.'
    let anchored = false
    for (let k = model.nbrStart[cell]; k < model.nbrStart[cell + 1]; k++) {
      const j = model.nbrIndex[k]
      if (!model.burnable[j] || plan.some((p) => p.cell === j && p.kind !== 'water')) {
        anchored = true
        break
      }
    }
    if (!anchored) return 'A backfire must be anchored: next to a river, bare ground, a trench, a clearing or another backfire.'
  }
  return null
}

/**
 * A backfire is only valid while its anchor exists. Returns the plan without backfires
 * that lost their anchor (for example after the trench they leaned on was removed).
 */
export function dropUnanchored(model: SpreadModel, plan: readonly Placement[]): Placement[] {
  return plan.filter((p) => p.kind !== 'backfire' || isAnchoredToGround(model, plan, p))
}

/** True if a chain of backfires from `start` reaches a river/bare hex, trench or clearing. */
function isAnchoredToGround(model: SpreadModel, plan: readonly Placement[], start: Placement): boolean {
  const kindAt = new Map(plan.map((p) => [p.cell, p.kind]))
  const seen = new Set<number>([start.cell])
  const queue = [start.cell]
  while (queue.length > 0) {
    const cell = queue.pop() as number
    for (let k = model.nbrStart[cell]; k < model.nbrStart[cell + 1]; k++) {
      const j = model.nbrIndex[k]
      if (!model.burnable[j]) return true
      const kind = kindAt.get(j)
      if (kind === 'trench' || kind === 'clearing') return true
      if (kind === 'backfire' && !seen.has(j)) {
        seen.add(j)
        queue.push(j)
      }
    }
  }
  return false
}
