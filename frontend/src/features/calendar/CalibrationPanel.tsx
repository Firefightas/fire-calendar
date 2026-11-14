import { useEffect, useMemo, useState } from 'react'
import type { Calibration } from '../../types/contracts.ts'
import { FloatingTip } from './FloatingTip.tsx'
import { chainFactors, factorAxis, factorExtremes, monthlyRows } from './calibration.ts'
import type { FactorRow } from './calibration.ts'
import { MONTH_NAMES, fmtFactor } from './model.ts'

const SERIES = 'var(--color-series-harmonized)'
const pct = (t: number) => `${(t * 100).toFixed(2)}%`
const cvPct = (cv: number) => `${(cv * 100).toFixed(1)}%`

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded border border-hairline px-1.5 py-0.5 text-[11px] text-ink-2">{children}</span>
}

function FactorTip({ row, fitYears }: { row: FactorRow; fitYears: [number, number] }) {
  return (
    <div className="space-y-2 text-xs">
      <div>
        <div className="text-[11px] tracking-wide text-muted uppercase">{MONTH_NAMES[row.month - 1]} factor</div>
        <div className="text-lg leading-tight font-semibold text-ink">{fmtFactor(row.factor)}</div>
        <div className="text-ink-2">S-NPP VIIRS cell-days per MODIS cell-day</div>
      </div>
      <dl className="space-y-0.5 border-t border-hairline pt-2">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Range (±1 CV)</dt>
          <dd className="tabular text-ink">
            {fmtFactor(row.low)} – {fmtFactor(row.high)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Coefficient of variation</dt>
          <dd className="tabular text-ink">{cvPct(row.cv)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">
            Usable years, {fitYears[0]}–{fitYears[1]}
          </dt>
          <dd className="tabular text-ink">{row.nYears}</dd>
        </div>
      </dl>
      {row.fallback && (
        <div className="border-t border-hairline pt-2 text-ink-2">
          Pooled fallback: too few usable years for this month.
        </div>
      )}
    </div>
  )
}

/** Dot = factor, line = ±1 CV, one column per calendar month. */
function MonthlyFactorChart({ rows, fitYears }: { rows: FactorRow[]; fitYears: [number, number] }) {
  const axis = useMemo(() => factorAxis(rows), [rows])
  const [hover, setHover] = useState<{ row: FactorRow; anchor: DOMRect } | null>(null)

  useEffect(() => {
    if (!hover) return
    const hide = () => setHover(null)
    window.addEventListener('scroll', hide, { passive: true, capture: true })
    window.addEventListener('resize', hide)
    return () => {
      window.removeEventListener('scroll', hide, { capture: true })
      window.removeEventListener('resize', hide)
    }
  }, [hover])

  const show = (row: FactorRow, el: HTMLElement) => setHover({ row, anchor: el.getBoundingClientRect() })

  return (
    <div>
      <div className="flex">
        <div className="relative h-44 w-10 shrink-0" aria-hidden="true">
          {axis.ticks.map((t) => (
            <span
              key={t}
              className="tabular absolute right-2 translate-y-1/2 text-[11px] text-muted"
              style={{ bottom: pct(axis.position(t)) }}
            >
              ×{t}
            </span>
          ))}
        </div>
        <div className="relative h-44 flex-1" onMouseLeave={() => setHover(null)}>
          {axis.ticks.map((t) => (
            <span
              key={t}
              aria-hidden="true"
              className={`absolute inset-x-0 border-t ${t === 1 ? 'border-axis' : 'border-grid'}`}
              style={{ bottom: pct(axis.position(t)) }}
            />
          ))}
          <div className="absolute inset-0 flex">
            {rows.map((row) => (
              <button
                key={row.month}
                type="button"
                aria-label={`${MONTH_NAMES[row.month - 1]}: factor ${fmtFactor(row.factor)}, range ${fmtFactor(row.low)} to ${fmtFactor(row.high)}, ${row.nYears} usable years${row.fallback ? ', pooled fallback' : ''}`}
                onMouseEnter={(e) => show(row, e.currentTarget)}
                onFocus={(e) => show(row, e.currentTarget)}
                onBlur={() => setHover(null)}
                className="relative flex-1 rounded-sm hover:bg-white/5"
              >
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 w-[2px] -translate-x-1/2 rounded-full opacity-45"
                  style={{
                    background: SERIES,
                    bottom: pct(axis.position(row.low)),
                    height: pct(axis.position(row.high) - axis.position(row.low)),
                  }}
                />
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 size-[10px] -translate-x-1/2 translate-y-1/2 rounded-full"
                  style={{
                    bottom: pct(axis.position(row.factor)),
                    background: row.fallback ? 'var(--color-surface)' : SERIES,
                    border: row.fallback ? `2px solid ${SERIES}` : undefined,
                    boxShadow: '0 0 0 2px var(--color-surface)',
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex pl-10" aria-hidden="true">
        {rows.map((row) => (
          <span key={row.month} className="flex-1 pt-1 text-center text-[11px] text-muted">
            {MONTH_NAMES[row.month - 1]}
          </span>
        ))}
      </div>
      {hover && (
        <FloatingTip anchor={hover.anchor}>
          <FactorTip row={hover.row} fitYears={fitYears} />
        </FloatingTip>
      )}
    </div>
  )
}

function FactorTable({ rows }: { rows: FactorRow[] }) {
  return (
    <details className="mt-4 text-xs">
      <summary className="cursor-pointer text-ink-2 hover:text-ink">Table view (12 monthly factors)</summary>
      <div className="mt-2 overflow-auto rounded-md border border-hairline">
        <table className="tabular w-full border-collapse text-right">
          <thead className="bg-raised text-muted">
            <tr>
              <th scope="col" className="px-2 py-1.5 text-left font-medium">Month</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Factor</th>
              <th scope="col" className="px-2 py-1.5 font-medium">CV</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Range (±1 CV)</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Usable years</th>
              <th scope="col" className="px-2 py-1.5 text-left font-medium">Pooled fallback</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="border-t border-grid">
                <th scope="row" className="px-2 py-1 text-left font-normal text-ink-2">{MONTH_NAMES[r.month - 1]}</th>
                <td className="px-2 py-1 text-ink">{fmtFactor(r.factor)}</td>
                <td className="px-2 py-1">{cvPct(r.cv)}</td>
                <td className="px-2 py-1 text-ink-2">
                  {fmtFactor(r.low)} – {fmtFactor(r.high)}
                </td>
                <td className="px-2 py-1">{r.nYears}</td>
                <td className="px-2 py-1 text-left text-ink-2">{r.fallback ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

interface Props {
  calibration: Calibration
  /** True when the calendar above is for a drawn area: these factors are still the region's. */
  isArea: boolean
}

/** How raw counts become S-NPP-equivalent: the factors behind the harmonized series. */
export function CalibrationPanel({ calibration, isArea }: Props) {
  const rows = useMemo(() => monthlyRows(calibration), [calibration])
  const extremes = useMemo(() => factorExtremes(rows), [rows])
  const chain = useMemo(() => chainFactors(calibration), [calibration])
  const [f0, f1] = calibration.fit_years
  const anyFallback = rows.some((r) => r.fallback)

  return (
    <section className="rounded-lg border border-hairline bg-surface p-4">
      <header className="mb-3">
        <h2 className="text-sm font-semibold">How the conversion works: calibration factors</h2>
        <p className="text-xs text-ink-2">
          MODIS cell-days × the factor for that calendar month = S-NPP-VIIRS-equivalent cell-days. Factors are learned
          on {f0}–{f1} only. Method: {calibration.method}.
        </p>
        {(isArea || calibration.is_mock) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {isArea && <Chip>Whole-region calibration, not this drawn area</Chip>}
            {calibration.is_mock && <Chip>MOCK DATA</Chip>}
          </div>
        )}
      </header>

      <h3 className="mb-2 text-xs text-muted">MODIS → S-NPP VIIRS factor by calendar month</h3>
      <MonthlyFactorChart rows={rows} fitYears={calibration.fit_years} />

      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-ink-2">
        <li className="flex items-center gap-2">
          <span className="size-[10px] rounded-full" style={{ background: SERIES }} />
          Factor: median of S-NPP ÷ MODIS over the fit years
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3 w-[2px] rounded-full opacity-45" style={{ background: SERIES }} />
          ±1 coefficient of variation across years
        </li>
        {anyFallback && (
          <li className="flex items-center gap-2">
            <span className="size-[10px] rounded-full" style={{ border: `2px solid ${SERIES}` }} />
            Pooled fallback (too few usable years)
          </li>
        )}
        <li className="flex items-center gap-2">
          <span className="w-4 border-t border-axis" />
          ×1 = no conversion
        </li>
      </ul>

      {extremes && (
        <p className="mt-3 text-xs text-ink-2">
          One MODIS cell-day counts as between <span className="text-ink">{fmtFactor(extremes.smallest.factor)}</span> (
          {MONTH_NAMES[extremes.smallest.month - 1]}) and{' '}
          <span className="text-ink">{fmtFactor(extremes.largest.factor)}</span> (
          {MONTH_NAMES[extremes.largest.month - 1]}) S-NPP-equivalent cell-days, depending on the month.
        </p>
      )}

      <FactorTable rows={rows} />

      <h3 className="mt-5 mb-2 text-xs text-muted">The rest of the chain</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {chain.map((c) => (
          <div key={c.key} className="rounded-md border border-hairline p-3">
            <div className="text-xs text-muted">{c.title}</div>
            <div className="mt-1 text-xl font-semibold">{fmtFactor(c.value)}</div>
            <p className="mt-1 text-xs text-ink-2">{c.meaning}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.window && (
                <Chip>
                  Fitted on {c.window[0]} to {c.window[1]}
                </Chip>
              )}
              {c.measured === false && <Chip>Not measured: no overlap data, neutral ×1 used</Chip>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
