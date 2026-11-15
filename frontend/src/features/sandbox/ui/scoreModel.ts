// Scoreboard data shapes and pure helpers.
import type { ExitSummary } from '../advisory/exitRoute.ts'
import { compareOutcome } from '../engine/score.ts'
import type { EnsembleOutput, RunOutput } from '../engine/service.ts'
import type { Placement } from '../engine/tools.ts'

/** One plan's results: the run shown on the map and the ensemble of seeded runs. */
export interface Outcome {
  plan: Placement[]
  run: RunOutput
  ensemble: EnsembleOutput
}

export interface ScoreColumn {
  key: string
  /** Short header. */
  title: string
  /** Second header line; together with the title it says exactly what the column is. */
  subtitle?: string
  outcome: Outcome
  /** Crew exit route check for the run on the map. */
  exit: ExitSummary
}

/** Full name of a column, for the advisory and tooltips. */
export const columnName = (c: Pick<ScoreColumn, 'title' | 'subtitle'>): string =>
  c.subtitle ? `${c.title} (${c.subtitle})` : c.title

/**
 * Keys of the columns with the best mean outcome in triage order (villages, farms, hectares).
 * Empty when every column ties, since then there is nothing to point at.
 */
export function bestColumns(columns: readonly ScoreColumn[]): Set<string> {
  if (columns.length < 2) return new Set()
  let best = columns[0]
  for (const c of columns) if (compareOutcome(c.outcome.ensemble.mean, best.outcome.ensemble.mean) < 0) best = c
  const winners = columns.filter((c) => compareOutcome(c.outcome.ensemble.mean, best.outcome.ensemble.mean) === 0)
  return winners.length === columns.length ? new Set() : new Set(winners.map((c) => c.key))
}
