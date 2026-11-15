// Protocol step 7: asset triage scoreboard. Every number is read from finished simulation runs.
import type { ReactNode } from 'react'
import { planCost } from '../engine/tools.ts'
import { InfoTip } from './InfoTip.tsx'
import { Panel } from './parts.tsx'
import { bestColumns, columnName } from './scoreModel.ts'
import type { Outcome, ScoreColumn } from './scoreModel.ts'

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

interface Props {
  columns: ScoreColumn[]
  seed: number
  shown: string
  onShow: (key: string) => void
  /** Buttons under the table. */
  actions?: ReactNode
  /** Sentences on how the optimizers reached their plans, shown in the collapsible note. */
  notes?: string[]
}

export function Scoreboard({ columns, seed, shown, onShow, actions, notes = [] }: Props) {
  if (columns.length === 0) return null
  const runs = columns[0].outcome.ensemble.seeds.length
  const best = bestColumns(columns)
  const rows: { label: string; hint?: string; cell: (o: Outcome, c: ScoreColumn) => [string, string] }[] = [
    {
      label: '⌂ Villages protected',
      cell: (o) => [
        `${o.run.score.villagesProtected}/${o.run.score.villagesTotal}`,
        nf1.format(o.ensemble.mean.villagesProtected),
      ],
    },
    {
      label: 'Farms protected',
      cell: (o) => [`${o.run.score.farmsProtected}/${o.run.score.farmsTotal}`, nf1.format(o.ensemble.mean.farmsProtected)],
    },
    {
      label: 'Hectares burned',
      cell: (o) => [nf0.format(o.run.score.hectaresBurned), nf0.format(o.ensemble.mean.hectaresBurned)],
    },
    {
      label: 'Containment',
      hint: 'Share of the fire edge that can no longer advance at hour 72.',
      cell: (o) => [`${nf0.format(o.run.score.containmentPct)}%`, `${nf0.format(o.ensemble.mean.containmentPct)}%`],
    },
    {
      label: 'Crew exits clear',
      hint: 'Ground crews (trench, clearing, backfire) that can reach a river or bare-ground hex without crossing burning hexes, in the run on the map.',
      cell: (_o, c) => [c.exit.total === 0 ? '–' : `${c.exit.clear}/${c.exit.total}`, ''],
    },
    {
      label: 'Budget used',
      cell: (o) => [`${planCost(o.plan)}u`, ''],
    },
  ]
  const tint = (c: ScoreColumn) => (best.has(c.key) ? 'bg-good/10' : '')

  return (
    <Panel
      title="Scoreboard · hour 72"
      aside={
        <InfoTip label="How to read the scoreboard">
          Big number: the run on the map (seed {seed}). Small number: mean over {runs} runs, seeds {seed}–{seed + runs - 1}.
          Every column uses the same seeds, wind and ignition points. ★ Best: best mean in triage order, villages first, then
          farms, then hectares.
        </InfoTip>
      }
    >
      <div className="overflow-x-auto">
        <table className="tabular w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="py-1 pr-2 text-left align-bottom text-xs font-normal text-muted">Big: seed {seed} · small: mean</th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  title={columnName(c)}
                  className={`rounded-t-md px-2 py-1 text-right align-bottom text-xs font-semibold text-ink ${tint(c)}`}
                >
                  {best.has(c.key) && <span className="block text-[11px] font-semibold text-good">★ Best</span>}
                  {c.title}
                  {c.subtitle && <span className="block font-normal text-muted">{c.subtitle}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-hairline">
                <th scope="row" className="py-1.5 pr-2 text-left text-xs font-normal text-ink-2" title={row.hint}>
                  {row.label}
                </th>
                {columns.map((c) => {
                  const [main, mean] = row.cell(c.outcome, c)
                  return (
                    <td key={c.key} className={`px-2 py-1.5 text-right align-top ${tint(c)}`}>
                      <span className="font-medium text-ink">{main}</span>
                      {mean && <span className="block text-[11px] text-muted">{mean}</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr className="border-t border-hairline">
              <th scope="row" className="py-1.5 pr-2 text-left text-xs font-normal text-ink-2">
                On the map
              </th>
              {columns.map((c) => (
                <td key={c.key} className={`rounded-b-md px-2 py-1.5 text-right ${tint(c)}`}>
                  <button
                    type="button"
                    aria-pressed={shown === c.key}
                    onClick={() => onShow(c.key)}
                    className={`rounded-md border px-2 py-0.5 text-xs ${
                      shown === c.key
                        ? 'border-series-harmonized bg-series-harmonized/20 text-ink'
                        : 'border-hairline text-ink-2 hover:bg-raised'
                    }`}
                  >
                    {shown === c.key ? '● Showing' : 'Show'}
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {actions && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">{actions}</div>}
      <details className="mt-2 text-xs text-ink-2">
        <summary className="cursor-pointer select-none hover:text-ink">ⓘ How the optimizers scored this</summary>
        <div className="mt-1.5 space-y-1.5 leading-snug">
          <p>
            Big numbers come from the run on the map (seed {seed}); small numbers are the mean over {runs} simulated runs
            with seeds {seed}–{seed + runs - 1}. Every column uses the same seeds, wind, ignition points and budget.
          </p>
          {notes.length > 0 ? (
            notes.map((n) => <p key={n}>{n}</p>)
          ) : (
            <p>
              The optimizers have not run on this scenario yet. Both are algorithms scored by simulation: a greedy one that
              adds one resource at a time, and a min-cut one that first draws an anchor line between the fire and the
              villages.
            </p>
          )}
        </div>
      </details>
    </Panel>
  )
}
