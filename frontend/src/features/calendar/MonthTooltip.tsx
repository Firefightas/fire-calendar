import { ANOMALY_LABEL } from '../../types/contracts.ts'
import type { Calendar, CalendarMonth } from '../../types/contracts.ts'
import { FloatingTip } from './FloatingTip.tsx'
import {
  ANOMALY_BAND_LABEL,
  MODE_LABEL,
  MONTH_NAMES,
  SOURCE_LABEL,
  UNIT_LABEL,
  anomalyBand,
  fmtCount,
  fmtSigned,
  isMonthInProgress,
  monthTitle,
  valueOf,
} from './model.ts'
import type { Mode } from './model.ts'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular text-right text-ink">{children}</dd>
    </div>
  )
}

/** Everything known about one month. Used by the heatmap tooltip and the selected-month card. */
export function MonthDetails({ m, calendar, mode }: { m: CalendarMonth; calendar: Calendar; mode: Mode }) {
  const [b0, b1] = calendar.baseline_years
  const flags: string[] = []
  if (m.is_estimated) flags.push('Estimated: converted from MODIS')
  if (m.is_nrt) flags.push('Near-real-time data, may still change')
  if (isMonthInProgress(m)) flags.push('Month in progress: count still accumulating')

  return (
    <div className="space-y-2 text-xs">
      <div>
        <div className="text-[11px] tracking-wide text-muted uppercase">{monthTitle(m)}</div>
        <div className="text-lg leading-tight font-semibold text-ink">{fmtCount(valueOf(m, mode))}</div>
        <div className="text-ink-2">
          {UNIT_LABEL} · {MODE_LABEL[mode]}
        </div>
      </div>
      <dl className="space-y-0.5 border-t border-hairline pt-2">
        <Row label="Harmonized">{fmtCount(m.harmonized)}</Row>
        <Row label="Uncertainty range">
          {fmtCount(m.unc_low)} – {fmtCount(m.unc_high)}
        </Row>
        <Row label="Raw MODIS">{fmtCount(m.modis_raw)}</Row>
        <Row label="Raw VIIRS">{fmtCount(m.viirs_raw)}</Row>
        <Row label={`${MONTH_NAMES[m.month - 1]} median, ${b0}–${b1}`}>{fmtCount(m.median_m)}</Row>
        <Row label={`${MONTH_NAMES[m.month - 1]} IQR`}>{fmtCount(m.iqr_m)}</Row>
        <Row label={ANOMALY_LABEL}>{fmtSigned(m.anomaly_z)}</Row>
      </dl>
      <div className="border-t border-hairline pt-2 text-ink-2">
        <div>{ANOMALY_BAND_LABEL[anomalyBand(m.anomaly_z)]} (harmonized)</div>
        <div>Source: {SOURCE_LABEL[m.source]}</div>
        {flags.map((f) => (
          <div key={f}>{f}</div>
        ))}
      </div>
    </div>
  )
}

/** Tooltip for one heatmap cell. */
export function MonthTooltip(props: { m: CalendarMonth; calendar: Calendar; mode: Mode; anchor: DOMRect }) {
  return (
    <FloatingTip anchor={props.anchor}>
      <MonthDetails m={props.m} calendar={props.calendar} mode={props.mode} />
    </FloatingTip>
  )
}
