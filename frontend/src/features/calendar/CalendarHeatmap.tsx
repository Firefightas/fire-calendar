import { useEffect, useMemo, useRef, useState } from 'react'
import type { Calendar, CalendarMonth } from '../../types/contracts.ts'
import { MonthTooltip } from './MonthTooltip.tsx'
import {
  MODE_LABEL,
  MONTH_NAMES,
  UNIT_LABEL,
  buildGrid,
  colorDomain,
  firstViirsMonth,
  fmtCount,
  fmtInt,
  monthKey,
  monthTitle,
  progressOf,
  valueOf,
} from './model.ts'
import type { Mode, MonthProgress } from './model.ts'
import { InfoTip } from './InfoTip.tsx'
import { colorScale, inkOn, legendGradient } from './palettes.ts'
import type { PaletteId } from './palettes.ts'

interface Props {
  calendar: Calendar
  mode: Mode
  palette: PaletteId
  /** First column: 1 for Jan–Dec rows (the default, and the only order the app shows). */
  startMonth?: 1 | 7
  /** Status of the calendar's newest month. */
  lastProgress: MonthProgress
  selectedKey: string | null
  onSelect: (m: CalendarMonth) => void
}

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
}

export function CalendarHeatmap({
  calendar,
  mode,
  palette,
  startMonth = 1,
  lastProgress,
  selectedKey,
  onSelect,
}: Props) {
  const { months } = calendar
  const grid = useMemo(() => buildGrid(months, startMonth), [months, startMonth])
  const domain = useMemo(() => colorDomain(months), [months])
  const color = useMemo(() => colorScale(palette, domain.top), [palette, domain.top])
  // Months above the colour scale in the mode on screen (only when the scale is capped).
  const offScale = useMemo(() => {
    const values = domain.capped ? months.map((m) => valueOf(m, mode) ?? 0).filter((v) => v > domain.top) : []
    return { count: values.length, max: values.reduce((a, b) => Math.max(a, b), 0) }
  }, [months, mode, domain])
  const switchMonth = useMemo(() => firstViirsMonth(months), [months])
  const switchKey = switchMonth ? monthKey(switchMonth) : null

  const gridRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ m: CalendarMonth; anchor: DOMRect } | null>(null)
  // Roving tabindex: one cell is in the tab order; arrow keys move between cells.
  const lastKey = months.length ? monthKey(months[months.length - 1]) : null
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const tabKey = focusKey ?? selectedKey ?? lastKey

  // The tooltip is anchored to a cell's on-screen box, which goes stale as soon as the page moves.
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

  const show = (m: CalendarMonth, el: HTMLElement) => setHover({ m, anchor: el.getBoundingClientRect() })

  const onKeyDown = (e: React.KeyboardEvent, r: number, c: number) => {
    const step = ARROWS[e.key]
    if (!step) return
    e.preventDefault()
    let [nr, nc] = [r + step[0], c + step[1]]
    while (nr >= 0 && nr < grid.rows.length && nc >= 0 && nc < 12) {
      if (grid.rows[nr].cells[nc]) {
        gridRef.current?.querySelector<HTMLElement>(`[data-rc="${nr}-${nc}"]`)?.focus()
        return
      }
      nr += step[0]
      nc += step[1]
    }
  }

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * domain.top)

  return (
    <div>
      <div
        ref={gridRef}
        role="grid"
        aria-label={`Monthly ${UNIT_LABEL}, ${MODE_LABEL[mode]}. Rows are years, columns are months.`}
        className="grid gap-[2px]"
        style={{ gridTemplateColumns: 'max-content repeat(12, minmax(0, 1fr))' }}
        onMouseLeave={() => setHover(null)}
      >
        <div role="row" className="contents">
          <span />
          {grid.columns.map((month) => (
            <span key={month} role="columnheader" className="pb-1 text-center text-xs text-muted">
              {MONTH_NAMES[month - 1]}
            </span>
          ))}
        </div>

        {grid.rows.map((row, r) => (
          <div key={row.label} role="row" className="contents">
            <span role="rowheader" className="tabular pr-2 text-right text-xs leading-5 text-muted">
              {row.label}
            </span>
            {row.cells.map((m, c) => {
              if (!m) return <span key={c} role="gridcell" aria-hidden="true" />
              const key = monthKey(m)
              const v = valueOf(m, mode)
              const fill = v === null ? 'transparent' : color(v)
              const ink = v === null ? '#898781' : inkOn(fill)
              const estimated = mode === 'harmonized' && m.is_estimated
              const above = domain.capped && v !== null && v > domain.top
              const selected = key === selectedKey
              const progress = progressOf(m, calendar, lastProgress)
              const notes = [
                estimated && 'estimated from MODIS',
                m.is_nrt && 'near-real-time',
                progress.kind === 'month_to_date' && 'month to date',
                progress.kind === 'in_progress' && 'month in progress',
              ]
                .filter(Boolean)
                .join(', ')
              return (
                <button
                  key={c}
                  type="button"
                  role="gridcell"
                  data-rc={`${r}-${c}`}
                  tabIndex={key === tabKey ? 0 : -1}
                  aria-selected={selected}
                  aria-label={`${monthTitle(m)}: ${fmtCount(v)} ${UNIT_LABEL}${notes ? `, ${notes}` : ''}`}
                  onClick={() => onSelect(m)}
                  onMouseEnter={(e) => show(m, e.currentTarget)}
                  onFocus={(e) => {
                    setFocusKey(key)
                    show(m, e.currentTarget)
                  }}
                  onBlur={() => setHover(null)}
                  onKeyDown={(e) => onKeyDown(e, r, c)}
                  className="relative h-5 cursor-pointer rounded-[3px] hover:brightness-125"
                  style={{
                    background: fill,
                    boxShadow: [
                      m.is_nrt ? `inset 0 0 0 1.5px ${ink}` : 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                      selected ? '0 0 0 2px #0d0d0d, 0 0 0 4px #86b6ef' : '',
                    ]
                      .filter(Boolean)
                      .join(', '),
                    zIndex: selected ? 1 : undefined,
                  }}
                >
                  {estimated && (
                    <span
                      aria-hidden="true"
                      className="absolute top-[3px] right-[3px] size-[4px] rounded-full"
                      style={{ background: ink }}
                    />
                  )}
                  {above && (
                    <span
                      aria-hidden="true"
                      data-off-scale=""
                      className="absolute bottom-[3px] left-[3px] text-[7px] leading-none"
                      style={{ color: ink }}
                    >
                      ▲
                    </span>
                  )}
                  {mode === 'raw' && key === switchKey && (
                    <span
                      aria-hidden="true"
                      className="absolute -top-[3px] -bottom-[3px] -left-[2px] w-[2px] rounded-full bg-ink"
                    />
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 text-xs text-ink-2">
        <div className="w-64 shrink-0">
          <div className="h-2.5 rounded-sm" style={{ background: legendGradient(palette) }} />
          <div className="tabular mt-1 flex justify-between text-muted">
            {ticks.map((t, i) => (
              <span key={t}>
                {domain.capped && i === ticks.length - 1 && '≥ '}
                {fmtInt(t)}
              </span>
            ))}
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            {UNIT_LABEL} per month
            <InfoTip label="About the colour scale">
              <p>The same colour scale is used in the raw and harmonized views, so the two compare directly.</p>
              {offScale.count > 0 && (
                <p>
                  {offScale.count} {offScale.count === 1 ? 'month is' : 'months are'} above the scale in this view, up to{' '}
                  {fmtInt(offScale.max)}; they are marked ▲. Exact values are in the tooltip and table.
                </p>
              )}
              {mode === 'raw' && switchMonth && (
                <p>The raw series switches from MODIS to VIIRS in {monthTitle(switchMonth)}.</p>
              )}
            </InfoTip>
          </div>
        </div>
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {mode === 'harmonized' && (
            <li className="flex items-center gap-2">
              <span className="relative inline-block h-4 w-6 rounded-[3px] bg-axis">
                <span className="absolute top-[3px] right-[3px] size-[4px] rounded-full bg-white" />
              </span>
              Estimated from MODIS
            </li>
          )}
          <li className="flex items-center gap-2">
            <span
              className="inline-block h-4 w-6 rounded-[3px] bg-axis"
              style={{ boxShadow: 'inset 0 0 0 1.5px #ffffff' }}
            />
            Near-real-time
          </li>
          {offScale.count > 0 && (
            <li className="flex items-center gap-2">
              <span className="relative inline-block h-4 w-6 shrink-0 rounded-[3px] bg-axis">
                <span className="absolute bottom-[3px] left-[3px] text-[7px] leading-none text-white">▲</span>
              </span>
              <span>Above the scale ({offScale.count})</span>
            </li>
          )}
          {mode === 'raw' && switchMonth && (
            <li className="flex items-center gap-2">
              <span className="inline-flex h-4 w-6 items-center">
                <span className="h-full w-[2px] rounded-full bg-ink" />
              </span>
              MODIS → VIIRS, {monthTitle(switchMonth)}
            </li>
          )}
        </ul>
      </div>

      {hover && (
        <MonthTooltip
          m={hover.m}
          calendar={calendar}
          mode={mode}
          progress={progressOf(hover.m, calendar, lastProgress)}
          anchor={hover.anchor}
        />
      )}
    </div>
  )
}
