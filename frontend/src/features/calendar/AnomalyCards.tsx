import { ANOMALY_LABEL } from '../../types/contracts.ts'
import type { Calendar, CalendarMonth, Calibration } from '../../types/contracts.ts'
import { InfoTip } from './InfoTip.tsx'
import {
  ANOMALY_BAND_LABEL,
  MONTH_NAMES,
  UNIT_LABEL,
  anomalyBand,
  fmtCount,
  fmtFactor,
  fmtSigned,
  latestMonth,
  monthTitle,
  peakAnomaly,
  progressNote,
  progressOf,
  seasonalProfile,
} from './model.ts'
import type { MonthProgress, SeasonMonth } from './model.ts'
import { modisOnlyStepRatio } from './calibration.ts'

interface TileFrame {
  label: string
  /** Technical detail shown behind the tile's "i" button. */
  info?: React.ReactNode
  children: React.ReactNode
  wide?: boolean
}

function Tile({ label, info, children, wide }: TileFrame) {
  return (
    <section className={`rounded-lg border border-hairline bg-surface p-4 ${wide ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
      <h3 className="flex items-center gap-1.5 text-xs text-muted">
        {label}
        {info && <InfoTip label={`About: ${label}`}>{info}</InfoTip>}
      </h3>
      {children}
    </section>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded border border-hairline px-1.5 py-0.5 text-[11px] text-ink-2">{children}</span>
}

interface TileProps {
  label: string
  m: CalendarMonth
  calendar: Calendar
  progress: MonthProgress
}

function AnomalyTile({ label, m, calendar, progress }: TileProps) {
  const band = anomalyBand(m.anomaly_z)
  const arrow = m.anomaly_z >= 0.5 ? '▲' : m.anomaly_z <= -0.5 ? '▼' : '●'
  const [b0, b1] = calendar.baseline_years
  const note = progressNote(progress)
  const info = (
    <p>
      {monthTitle(m)}: {fmtCount(m.harmonized)} harmonized {UNIT_LABEL}, against a{' '}
      {progress.kind === 'month_to_date' && 'month-to-date '}
      {MONTH_NAMES[m.month - 1]} median of {fmtCount(m.median_m)} (IQR {fmtCount(m.iqr_m)}, {b0}–{b1}). Score = (value −
      median) ÷ IQR.
    </p>
  )
  return (
    <Tile label={label} info={info}>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="tabular text-2xl font-semibold">{fmtSigned(m.anomaly_z)}</span>
        <span className="text-xs text-ink-2">{ANOMALY_LABEL}</span>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-ink">
        <span aria-hidden="true" className={band === 'well_above' ? 'text-serious' : 'text-muted'}>
          {arrow}
        </span>
        {ANOMALY_BAND_LABEL[band]}
      </p>
      <p className="mt-0.5 text-xs text-muted">
        {monthTitle(m)}: <span className="tabular text-ink-2">{fmtCount(m.harmonized)}</span> cell-days
      </p>
      {(m.is_estimated || m.is_nrt || note) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {m.is_estimated && <Chip>Estimated from MODIS</Chip>}
          {m.is_nrt && <Chip>Near-real-time</Chip>}
          {note && <Chip>{note}</Chip>}
        </div>
      )}
    </Tile>
  )
}

/** Held-out validation from calibration.json. Regional numbers, also when a drawn area is shown. */
function ValidationTile({ calibration, regional }: { calibration: Calibration; regional: boolean }) {
  const [f0, f1] = calibration.fit_years
  const [t0, t1] = calibration.test_years
  const modisOnly = modisOnlyStepRatio(calibration)
  const raw = calibration.raw_step_ratio
  const harmonized = calibration.harmonized_step_ratio
  const info = (
    <>
      <p>
        Factors learned on {f0}–{f1} only, then used to predict S-NPP VIIRS from MODIS in {t0}–{t1}, years the
        calibration never saw.
      </p>
      {raw !== undefined && harmonized !== undefined && (
        <p>
          2012 step (mean 2013–2015 ÷ mean 2009–2011): raw {fmtFactor(raw)}, harmonized {fmtFactor(harmonized)}
          {modisOnly !== null && `; MODIS alone over the same years ${fmtFactor(modisOnly)}`}.
        </p>
      )}
    </>
  )
  return (
    <Tile label={`Held-out validation, ${t0}–${t1}`} info={info}>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="tabular text-2xl font-semibold">{fmtCount(calibration.test_mae)}</span>
        <span className="text-xs text-ink-2">cell-days mean absolute error</span>
      </div>
      {calibration.test_mape !== undefined && (
        <p className="mt-1 text-xs text-ink-2">
          <span className="tabular text-ink">{(calibration.test_mape * 100).toFixed(1)}%</span> mean absolute percentage
          error
        </p>
      )}
      {raw !== undefined && harmonized !== undefined && (
        <p className="mt-0.5 text-xs text-ink-2">
          2012 step raw <span className="tabular text-ink">{fmtFactor(raw)}</span> → harmonized{' '}
          <span className="tabular text-ink">{fmtFactor(harmonized)}</span>
        </p>
      )}
      {(regional || calibration.is_mock) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {regional && <Chip>Whole-region calibration, not this drawn area</Chip>}
          {calibration.is_mock && <Chip>MOCK DATA</Chip>}
        </div>
      )}
    </Tile>
  )
}

const pct = (share: number): string => `${Math.round(share * 100)}%`

/** Critical 3-month window, peak month, next-month outlook and the 12-month baseline, all from the calendar on screen. */
function SeasonTile({ calendar }: { calendar: Calendar }) {
  const [b0, b1] = calendar.baseline_years
  const label = `Critical fire season window (${b0}–${b1} baseline)`
  const profile = seasonalProfile(calendar)
  if (!profile) {
    return (
      <Tile label={label} wide>
        <p className="mt-2 text-xs text-ink-2">
          No burning was recorded here in {b0}–{b1}, so there is no seasonal window to show.
        </p>
      </Tile>
    )
  }
  const { months, windowMonths, peakMonth, nextMonth, rankedByMedian } = profile
  // Bars show the monthly median; where every median is 0 (a small drawn area) they show the baseline totals.
  const barValue = (m: SeasonMonth) => (rankedByMedian ? m.median_m : m.baselineTotal)
  const barMax = Math.max(...months.map(barValue))
  const barName = rankedByMedian ? 'median' : `${b0}–${b1} total`
  const name = (month: number) => MONTH_NAMES[month - 1]
  const info = (
    <>
      <p>
        The three consecutive months with the highest {rankedByMedian ? 'monthly medians' : 'baseline totals'}. They
        hold {pct(profile.windowShare)} of all harmonized {UNIT_LABEL} of {b0}–{b1}.
        {!rankedByMedian && ' Every monthly median here is 0, so the window is ranked by total cell-days.'}
      </p>
      <p>
        Peak month {name(peakMonth.month)}: median {fmtCount(peakMonth.median_m)} (IQR {fmtCount(peakMonth.iqr_m)}).
        Next month {name(nextMonth.month)}: median {fmtCount(nextMonth.median_m)} (IQR {fmtCount(nextMonth.iqr_m)}).
      </p>
      <p>
        Bars: monthly {barName} of harmonized {UNIT_LABEL}, highest {fmtCount(barMax)}.
      </p>
    </>
  )
  return (
    <Tile label={label} info={info} wide>
      <div className="mt-1 grid items-end gap-x-6 gap-y-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-3xl font-semibold tracking-tight">{profile.windowLabel}</span>
            <span className="rounded-full border border-warning/60 bg-warning/10 px-2 py-0.5 text-xs text-ink">
              <span className="tabular">{pct(profile.windowShare)}</span> of annual cell-days
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded border border-hairline px-1.5 py-0.5 text-[11px] text-ink-2">
              Peak <span className="font-semibold text-ink">{name(peakMonth.month)}</span> ·{' '}
              <span className="tabular">{pct(peakMonth.share)}</span>
            </span>
            {nextMonth.entersCriticalWindow ? (
              <span className="rounded border border-warning/70 px-1.5 py-0.5 text-[11px] text-ink">
                <span aria-hidden="true" className="text-warning">
                  ▲
                </span>{' '}
                Upcoming month ({name(nextMonth.month)}) is inside the critical window
              </span>
            ) : (
              <Chip>Upcoming month ({name(nextMonth.month)}) is outside the critical window</Chip>
            )}
          </div>
        </div>
        <div>
          <ol
            className="flex h-20 items-end gap-0.5"
            aria-label={`Monthly ${barName} of harmonized ${UNIT_LABEL}, ${b0}–${b1} baseline`}
          >
            {months.map((m) => {
              const inWindow = windowMonths.includes(m.month)
              const detail = `${name(m.month)}: median ${fmtCount(m.median_m)}, IQR ${fmtCount(m.iqr_m)}, ${pct(m.share)} of annual cell-days${inWindow ? ', in the critical window' : ''}`
              return (
                <li
                  key={m.month}
                  className="flex h-full flex-1 flex-col justify-end"
                  title={detail}
                  aria-label={detail}
                  data-in-window={inWindow}
                >
                  <div
                    className={`min-h-px rounded-t-sm ${inWindow ? 'bg-warning' : 'bg-axis'}`}
                    style={{ height: `${barMax > 0 ? (barValue(m) / barMax) * 100 : 0}%` }}
                  />
                </li>
              )
            })}
          </ol>
          <div className="mt-1 flex gap-0.5 border-t border-axis pt-1" aria-hidden="true">
            {months.map((m) => (
              <span
                key={m.month}
                className={`flex-1 text-center text-[10px] ${windowMonths.includes(m.month) ? 'font-semibold text-ink' : 'text-muted'}`}
              >
                {name(m.month)}
              </span>
            ))}
          </div>
        </div>
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
  /** Status of the calendar's newest month (see `lastMonthProgress`). */
  lastProgress: MonthProgress
}

export function AnomalyCards({ calendar, calibration, selected, isArea, lastProgress }: Props) {
  const latest = latestMonth(calendar)
  const peak = peakAnomaly(calendar.months)
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <SeasonTile calendar={calendar} />
      {latest && (
        <AnomalyTile
          label="Latest month vs. historical median"
          m={latest}
          calendar={calendar}
          progress={lastProgress}
        />
      )}
      {peak && (
        <AnomalyTile
          label="Highest anomaly in the record"
          m={peak}
          calendar={calendar}
          progress={progressOf(peak, calendar, lastProgress)}
        />
      )}
      {calibration && <ValidationTile calibration={calibration} regional={isArea} />}
      {selected && (
        <AnomalyTile
          label="Selected month"
          m={selected}
          calendar={calendar}
          progress={progressOf(selected, calendar, lastProgress)}
        />
      )}
    </div>
  )
}
