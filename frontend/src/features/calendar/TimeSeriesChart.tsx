import { useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { rawValue } from '../../types/contracts.ts'
import type { Calendar } from '../../types/contracts.ts'
import { Segmented } from './Controls.tsx'
import { InfoTip } from './InfoTip.tsx'
import { MODE_LABEL, UNIT_LABEL, annualTotals, firstViirsMonth, fmtCount, fmtInt, monthTitle } from './model.ts'
import type { Mode } from './model.ts'

type Resolution = 'annual' | 'monthly'

interface Point {
  x: number
  title: string
  harmonized: number
  raw: number | null
  /** [unc_low, unc_high], monthly only. */
  band?: [number, number]
}

const COLOR: Record<Mode, string> = {
  harmonized: 'var(--color-series-harmonized)',
  raw: 'var(--color-series-raw)',
}

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const axisTick = (v: number) => (Math.abs(v) >= 10_000 ? compact.format(v) : fmtInt(v))

function ChartTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: Point }> }) {
  const p = payload?.[0]?.payload
  if (!active || !p) return null
  const rows: [Mode, number | null][] = [
    ['harmonized', p.harmonized],
    ['raw', p.raw],
  ]
  return (
    <div className="rounded-lg border border-hairline bg-raised p-3 text-xs shadow-xl shadow-black/50">
      <div className="mb-1 text-[11px] tracking-wide text-muted uppercase">{p.title}</div>
      {rows.map(([mode, v]) => (
        <div key={mode} className="flex items-center gap-2">
          <span className="h-0.5 w-3 rounded-full" style={{ background: COLOR[mode] }} />
          <span className="tabular font-semibold text-ink">{fmtCount(v)}</span>
          <span className="text-ink-2">{MODE_LABEL[mode]}</span>
        </div>
      ))}
      {p.band && (
        <div className="mt-1 text-muted">
          Harmonized uncertainty range {fmtCount(p.band[0])} – {fmtCount(p.band[1])}
        </div>
      )}
    </div>
  )
}

export function TimeSeriesChart({ calendar, mode }: { calendar: Calendar; mode: Mode }) {
  const [resolution, setResolution] = useState<Resolution>('annual')
  const { months } = calendar

  const data = useMemo<Point[]>(() => {
    if (resolution === 'annual') {
      return annualTotals(months).map((a) => ({ x: a.year, title: String(a.year), harmonized: a.harmonized, raw: a.raw }))
    }
    return months.map((m) => ({
      x: m.year + (m.month - 1) / 12,
      title: monthTitle(m),
      harmonized: m.harmonized,
      raw: rawValue(m),
      band: [m.unc_low, m.unc_high],
    }))
  }, [months, resolution])

  const switchMonth = useMemo(() => firstViirsMonth(months), [months])
  const switchX = switchMonth
    ? resolution === 'annual'
      ? switchMonth.year
      : switchMonth.year + (switchMonth.month - 1) / 12
    : null

  if (data.length < 2) {
    return <p className="text-sm text-muted">Not enough complete years in this range for a time series.</p>
  }

  const x0 = data[0].x
  const x1 = data[data.length - 1].x
  const ticks: number[] = []
  for (let y = Math.ceil(x0 / 5) * 5; y <= x1; y += 5) ticks.push(y)

  const series: Mode[] = ['harmonized', 'raw']

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
          {(['harmonized', 'raw'] as const).map((m) => (
            <li key={m} className="flex items-center gap-2">
              <span className="h-0.5 w-4 rounded-full" style={{ background: COLOR[m] }} />
              {MODE_LABEL[m]}
            </li>
          ))}
        </ul>
        <div className="ml-auto">
          <Segmented
            label="Time resolution"
            value={resolution}
            onChange={setResolution}
            options={[
              { value: 'annual', label: 'Annual totals' },
              { value: 'monthly', label: 'Monthly' },
            ]}
          />
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 18, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-grid)" />
            <XAxis
              dataKey="x"
              type="number"
              domain={[x0, x1]}
              ticks={ticks}
              tickFormatter={(v: number) => String(v)}
              tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-axis)' }}
            />
            <YAxis
              width={44}
              tickFormatter={axisTick}
              tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: 'var(--color-axis)', strokeWidth: 1 }}
              isAnimationActive={false}
            />
            {resolution === 'monthly' && (
              <Area
                dataKey="band"
                stroke="none"
                fill={COLOR.harmonized}
                fillOpacity={0.14}
                isAnimationActive={false}
                activeDot={false}
              />
            )}
            {switchX !== null && switchMonth && (
              <ReferenceLine
                x={switchX}
                stroke="var(--color-muted)"
                strokeWidth={1}
                label={{
                  value: `VIIRS begins (${monthTitle(switchMonth)})`,
                  position: 'insideTopRight',
                  fill: 'var(--color-ink-2)',
                  fontSize: 11,
                  dy: -16,
                }}
              />
            )}
            {series.map((m) => (
              <Line
                key={m}
                dataKey={m}
                // The series picked in the toggle sits on top at full strength. Recharts layers
                // by zIndex, not by element order.
                zIndex={m === mode ? 410 : 400}
                type="linear"
                stroke={COLOR[m]}
                strokeWidth={2}
                strokeOpacity={m === mode ? 1 : 0.45}
                strokeLinejoin="round"
                strokeLinecap="round"
                dot={false}
                activeDot={{ r: 4, stroke: 'var(--color-surface)', strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center gap-1 text-[11px] text-muted">
        {resolution === 'annual' ? `${UNIT_LABEL} per year` : `${UNIT_LABEL} per month`}
        <InfoTip label="About the chart">
          <p>
            {resolution === 'annual'
              ? 'Only years with all 12 months are plotted.'
              : 'The band is the harmonized uncertainty range.'}
          </p>
          <p>The vertical line marks where VIIRS begins. After it the two series coincide wherever S-NPP itself is the source.</p>
        </InfoTip>
      </div>
    </div>
  )
}
