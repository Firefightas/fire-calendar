// Protocol step 7: asset triage scoreboard. Every number is read from finished simulation runs.
import type { EnsembleOutput, RunOutput } from '../engine/service.ts'
import type { Placement } from '../engine/tools.ts'
import { planCost } from '../engine/tools.ts'
import { Panel } from './parts.tsx'

/** One plan's results: the run shown on the map and the ensemble of seeded runs. */
export interface Outcome {
  plan: Placement[]
  run: RunOutput
  ensemble: EnsembleOutput
}

export interface ScoreColumn {
  key: string
  title: string
  subtitle?: string
  outcome: Outcome
}

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

interface Props {
  columns: ScoreColumn[]
  seed: number
  shown: string
  onShow: (key: string) => void
}

export function Scoreboard({ columns, seed, shown, onShow }: Props) {
  if (columns.length === 0) return null
  const runs = columns[0].outcome.ensemble.seeds.length
  const rows: { label: string; hint?: string; cell: (o: Outcome) => [string, string] }[] = [
    {
      label: 'Villages protected',
      cell: (o) => [
        `${o.run.score.villagesProtected} of ${o.run.score.villagesTotal}`,
        `${nf1.format(o.ensemble.mean.villagesProtected)}`,
      ],
    },
    {
      label: 'Farms protected',
      cell: (o) => [
        `${o.run.score.farmsProtected} of ${o.run.score.farmsTotal}`,
        `${nf1.format(o.ensemble.mean.farmsProtected)}`,
      ],
    },
    {
      label: 'Hectares burned',
      cell: (o) => [`${nf0.format(o.run.score.hectaresBurned)} ha`, `${nf0.format(o.ensemble.mean.hectaresBurned)} ha`],
    },
    {
      label: 'Containment',
      hint: 'Share of the fire edge that can no longer advance at hour 72.',
      cell: (o) => [`${nf0.format(o.run.score.containmentPct)} %`, `${nf0.format(o.ensemble.mean.containmentPct)} %`],
    },
    {
      label: 'Budget used',
      cell: (o) => [`${planCost(o.plan)} units`, ''],
    },
  ]

  return (
    <Panel title="Scoreboard · at hour 72">
      <div className="overflow-x-auto">
        <table className="tabular w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="py-1 pr-2 text-left text-xs font-normal text-muted">Triage order: villages, farms, hectares</th>
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-1 text-right align-bottom text-xs font-semibold text-ink">
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
                  const [main, mean] = row.cell(c.outcome)
                  return (
                    <td key={c.key} className="px-2 py-1.5 text-right align-top text-ink">
                      {main}
                      {mean && <span className="block text-xs text-muted">mean {mean}</span>}
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
                <td key={c.key} className="px-2 py-1.5 text-right">
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
                    {shown === c.key ? 'Showing' : 'Show'}
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Large numbers: the run on the map (seed {seed}). “Mean”: average over {runs} simulated runs with seeds {seed}–
        {seed + runs - 1}. Every column uses the same seeds, wind and ignition points.
      </p>
    </Panel>
  )
}
