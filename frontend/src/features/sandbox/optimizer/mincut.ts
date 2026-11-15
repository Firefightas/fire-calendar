// Min-cut anchor line (protocol step 5). Pure TS, runs in the worker.
//
// The spread graph has one node per burnable hex and an edge between neighbours. Cutting a
// hex means putting a blocking resource on it; its capacity is that resource's cost. Hexes
// that cannot burn (rivers, bare ground) are not in the graph at all, so a cut anchors into
// them for free. A minimum cut between the fire and the villages is the cheapest line of
// resources that separates them (the line never sits on a village hex itself). Monte Carlo rollouts then score the line, and the greedy
// optimizer spends what is left of the budget (see service.ts).
import type { SpreadModel } from '../engine/model.ts'
import { ASSET_VILLAGE } from '../engine/model.ts'
import { NEVER, simulate } from '../engine/simulate.ts'
import type { Scenario } from '../engine/simulate.ts'
import { TOOLS } from '../engine/tools.ts'
import type { Placement, ToolKind } from '../engine/tools.ts'

export const MINCUT_LABEL = 'Algorithmic optimizer (min-cut anchor line + greedy fill, simulation-scored)'

const INF = 1e9

/**
 * A hex is unavailable for the line when, with no resources, the fire reaches it before the
 * resource would be in place in more than this share of the runs.
 */
export const TOO_LATE_SHARE = 0.25

/** The resource a cut uses on a hex: timber clearing under canopy, a trench elsewhere. */
export const cutTool = (landcover: number): ToolKind => (landcover === 10 ? 'clearing' : 'trench')

export interface MinCutOutput {
  /** The anchor line, most threatened hexes first. Fits the budget. */
  plan: Placement[]
  /** Cost of the full minimum cut, or null when no village can be separated from the fire in time. */
  cutCost: number | null
  /** Village hexes the fire usually reaches before any line could be in place; the line ignores them. */
  villagesOutOfReach: number
  /** False when the full cut costs more than the budget and only part of it was placed. */
  complete: boolean
  simulatedRuns: number
}

/** Dinic max-flow on a small graph. */
class FlowGraph {
  private head: number[]
  private next: number[] = []
  private to: number[] = []
  private cap: number[] = []
  private level: Int32Array
  private iter: Int32Array
  private nodes: number

  constructor(nodes: number) {
    this.nodes = nodes
    this.head = new Array<number>(nodes).fill(-1)
    this.level = new Int32Array(nodes)
    this.iter = new Int32Array(nodes)
  }

  addEdge(from: number, to: number, capacity: number) {
    this.to.push(to)
    this.cap.push(capacity)
    this.next.push(this.head[from])
    this.head[from] = this.to.length - 1
    this.to.push(from)
    this.cap.push(0)
    this.next.push(this.head[to])
    this.head[to] = this.to.length - 1
  }

  private bfs(source: number): void {
    this.level.fill(-1)
    this.level[source] = 0
    const queue = [source]
    for (let q = 0; q < queue.length; q++) {
      const v = queue[q]
      for (let e = this.head[v]; e !== -1; e = this.next[e]) {
        if (this.cap[e] > 0 && this.level[this.to[e]] < 0) {
          this.level[this.to[e]] = this.level[v] + 1
          queue.push(this.to[e])
        }
      }
    }
  }

  private dfs(v: number, sink: number, pushed: number): number {
    if (v === sink) return pushed
    for (; this.iter[v] !== -1; this.iter[v] = this.next[this.iter[v]]) {
      const e = this.iter[v]
      const w = this.to[e]
      if (this.cap[e] > 0 && this.level[w] === this.level[v] + 1) {
        const got = this.dfs(w, sink, Math.min(pushed, this.cap[e]))
        if (got > 0) {
          this.cap[e] -= got
          this.cap[e ^ 1] += got
          return got
        }
      }
    }
    return 0
  }

  maxFlow(source: number, sink: number): number {
    let flow = 0
    for (;;) {
      this.bfs(source)
      if (this.level[sink] < 0) return flow
      for (let v = 0; v < this.nodes; v++) this.iter[v] = this.head[v]
      for (let got = this.dfs(source, sink, INF); got > 0; got = this.dfs(source, sink, INF)) {
        flow += got
        if (flow >= INF) return flow
      }
    }
  }

  /** Nodes still reachable from the source once the flow is maximal. */
  sourceSide(source: number): Uint8Array {
    const seen = new Uint8Array(this.nodes)
    seen[source] = 1
    const queue = [source]
    for (let q = 0; q < queue.length; q++) {
      for (let e = this.head[queue[q]]; e !== -1; e = this.next[e]) {
        if (this.cap[e] > 0 && !seen[this.to[e]]) {
          seen[this.to[e]] = 1
          queue.push(this.to[e])
        }
      }
    }
    return seen
  }
}

export function minCutPlan(model: SpreadModel, scenario: Scenario, seeds: number[], budget: number): MinCutOutput {
  const { n } = model
  // With no resources: how often does the fire reach each hex, and how often before a line
  // resource on that hex would be in place?
  const reached = new Float32Array(n)
  const early = new Float32Array(n)
  for (const seed of seeds) {
    const result = simulate(model, { ...scenario, seed, tools: [] })
    for (let i = 0; i < n; i++) {
      const at = result.ignitedAt[i]
      if (at === NEVER) continue
      reached[i] += 1
      if (at <= TOOLS[cutTool(model.landcover[i])].readyHour) early[i] += 1
    }
  }
  const simulatedRuns = seeds.length
  const ignition = new Set(scenario.ignitions)
  const allVillages: number[] = []
  for (let i = 0; i < n; i++) if (model.asset[i] === ASSET_VILLAGE && model.burnable[i]) allVillages.push(i)
  if (ignition.size === 0 || allVillages.length === 0) {
    return { plan: [], cutCost: 0, villagesOutOfReach: 0, complete: true, simulatedRuns }
  }

  // Hexes that cannot carry the line: on fire at t = 0, reached too early, or a village
  // (the line has to stand ahead of the villages, not on them).
  const fixed = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (!model.burnable[i]) continue
    const tooLate = seeds.length > 0 && early[i] / seeds.length > TOO_LATE_SHARE
    if (ignition.has(i) || tooLate || model.asset[i] === ASSET_VILLAGE) fixed[i] = 1
  }
  // A village joined to the fire through such hexes only cannot be separated: leave it out.
  const lost = new Uint8Array(n)
  const queue = [...ignition].filter((i) => model.burnable[i])
  for (const i of queue) lost[i] = 1
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]
    for (let k = model.nbrStart[i]; k < model.nbrStart[i + 1]; k++) {
      const j = model.nbrIndex[k]
      if (fixed[j] && !lost[j]) {
        lost[j] = 1
        queue.push(j)
      }
    }
  }
  const villages = allVillages.filter((v) => !lost[v])
  const villagesOutOfReach = allVillages.length - villages.length
  if (villages.length === 0) return { plan: [], cutCost: null, villagesOutOfReach, complete: false, simulatedRuns }

  // Node i is split into in = 2i and out = 2i + 1; the capacity of in→out is the cost of cutting i.
  const source = 2 * n
  const sink = 2 * n + 1
  const graph = new FlowGraph(2 * n + 2)
  for (let i = 0; i < n; i++) {
    if (!model.burnable[i]) continue
    graph.addEdge(2 * i, 2 * i + 1, fixed[i] ? INF : TOOLS[cutTool(model.landcover[i])].cost)
    for (let k = model.nbrStart[i]; k < model.nbrStart[i + 1]; k++) {
      const j = model.nbrIndex[k]
      if (model.burnable[j]) graph.addEdge(2 * i + 1, 2 * j, INF)
    }
  }
  for (const i of ignition) if (model.burnable[i]) graph.addEdge(source, 2 * i, INF)
  for (const v of villages) graph.addEdge(2 * v + 1, sink, INF)

  const flow = graph.maxFlow(source, sink)
  if (flow >= INF) return { plan: [], cutCost: null, villagesOutOfReach, complete: false, simulatedRuns }

  const side = graph.sourceSide(source)
  const cut: number[] = []
  for (let i = 0; i < n; i++) if (model.burnable[i] && side[2 * i] && !side[2 * i + 1]) cut.push(i)
  // If the budget cannot pay for the whole line, keep the hexes the fire reaches most often.
  cut.sort((a, b) => reached[b] - reached[a] || a - b)
  const plan: Placement[] = []
  let spent = 0
  for (const cell of cut) {
    const kind = cutTool(model.landcover[cell])
    if (spent + TOOLS[kind].cost > budget) continue
    spent += TOOLS[kind].cost
    plan.push({ cell, kind })
  }
  return { plan, cutCost: flow, villagesOutOfReach, complete: plan.length === cut.length, simulatedRuns }
}
