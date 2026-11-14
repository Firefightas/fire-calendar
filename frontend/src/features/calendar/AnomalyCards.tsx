import { ANOMALY_LABEL } from '../../types/contracts.ts'
import type { Calendar, CalendarMonth, Calibration } from '../../types/contracts.ts'
import {
  ANOMALY_BAND_LABEL,
  MONTH_NAMES,
  UNIT_LABEL,
  anomalyBand,
  fmtCount,
  fmtFactor,
  fmtSigned,
  isMonthInProgress,
  latestMonth,
  monthTitle,
  peakAnomaly,
} from './model.ts'

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-hairline bg-surface p-4">
      <h3 className="text-xs text-muted">{label}</h3>
      {children}
    </section>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded border border-hairline px-1.5 py-0.5 text-[11px] text-ink-2">{children}</span>
}

function AnomalyTile({ label, m, calendar }: { label: string; m: CalendarMonth; calendar: Calendar }) {
  const band = anomalyBand(m.anomaly_z)
  const arrow = m.anomaly_z >= 0.5 ? '▲' : m.anomaly_z <= -0.5 ? '▼' : '●'
  const [b0, b1] = calendar.baseline_years
  return (
    <Tile label={label}>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold">{fmtSigned(m.anomaly_z)}</span>
        <span className="text-xs text-ink-2">{ANOMALY_LABEL}</span>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-ink">
        <span aria-hidden="true" className={band === 'well_above' ? 'text-serious' : 'text-muted'}>
          {arrow}
        </span>
        {ANOMALY_BAND_LABEL[band]}
      </p>
      <p className="mt-2 text-xs text-ink-2">
        {monthTitle(m)}: <span className="text-ink">{fmtCount(m.harmonized)}</span> harmonized {UNIT_LABEL}, against a{' '}
        {MONTH_NAMES[m.month - 1]} median of <span className="text-ink">{fmtCount(m.median_m)}</span> (IQR{' '}
        {fmtCount(m.iqr_m)}, {b0}–{b1}).
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {m.is_estimated && <Chip>Estimated from MODIS</Chip>}
        {m.is_nrt && <Chip>Near-real-time</Chip>}
        {isMonthInProgress(m) && <Chip>Month in progress: reads low until it ends</Chip>}
      </div>
    </Tile>
  )
}

/** Held-out validation from calibration.json. Regional numbers, also when a drawn area is shown. */
function ValidationTile({ calibration, regional }: { calibration: Calibration; regional: boolean }) {
  const [f0, f1] = calibration.fit_years
  const [t0, t1] = calibration.test_years
  return (
    <Tile label={`Held-out validation, ${t0}–${t1}`}>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold">{fmtCount(calibration.test_mae)}</span>
        <span className="text-xs text-ink-2">cell-days mean absolute error</span>
      </div>
      <p className="mt-2 text-xs text-ink-2">
        Factors learned on {f0}–{f1} only, then used to predict S-NPP VIIRS from MODIS in {t0}–{t1}.
        {calibration.test_mape !== undefined && (
          <>
            {' '}
            Mean absolute percentage error:{' '}
            <span className="text-ink">{(calibration.test_mape * 100).toFixed(1)}%</span>.
          </>
        )}
      </p>
      {calibration.raw_step_ratio !== undefined && calibration.harmonized_step_ratio !== undefined && (
        <p className="mt-2 text-xs text-ink-2">
          2012 step (mean 2013–2015 ÷ mean 2009–2011): raw{' '}
          <span className="text-ink">{fmtFactor(calibration.raw_step_ratio)}</span>, harmonized{' '}
          <span className="text-ink">{fmtFactor(calibration.harmonized_step_ratio)}</span>.
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {regional && <Chip>Whole-region calibration, not this drawn area</Chip>}
        {calibration.is_mock && <Chip>MOCK DATA</Chip>}
      </div>
    </Tile>
  )
}

interface Props {
  calendar: Calendar
  calibration: Calibration | null
  selected: CalendarMonth | null
  /** True when the calendar is for a drawn area, so the calibration tile is flagged as regional. */
  isArea: boolean
}

export function AnomalyCards({ calendar, calibration, selected, isArea }: Props) {
  const latest = latestMonth(calendar)
  const peak = peakAnomaly(calendar.months)
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {latest && <AnomalyTile label="Latest month vs. historical median" m={latest} calendar={calendar} />}
      {selected ? (
        <AnomalyTile label="Selected month" m={selected} calendar={calendar} />
      ) : (
        <Tile label="Selected month">
          <p className="mt-2 text-xs text-ink-2">Click a month in the calendar to pin its numbers here.</p>
        </Tile>
      )}
      {peak && <AnomalyTile label="Highest anomaly in the record" m={peak} calendar={calendar} />}
      {calibration && <ValidationTile calibration={calibration} regional={isArea} />}
    </div>
  )
}
