import { useState } from 'react'
import type { Calendar, Calibration, Region } from '../../types/contracts.ts'
import { AnomalyCards } from './AnomalyCards.tsx'
import { BurnScarSlider } from './BurnScarSlider.tsx'
import { CalendarHeatmap } from './CalendarHeatmap.tsx'
import { CalendarTable } from './CalendarTable.tsx'
import { CalibrationPanel } from './CalibrationPanel.tsx'
import { ModeToggle, PaletteSwitcher } from './Controls.tsx'
import { InfoTip } from './InfoTip.tsx'
import { TimeSeriesChart } from './TimeSeriesChart.tsx'
import { todayIso } from './gibs.ts'
import { MODE_LABEL, UNIT_LABEL, lastMonthProgress, monthKey, monthTitle, peakAnomaly } from './model.ts'
import type { Mode } from './model.ts'
import type { PaletteId } from './palettes.ts'

interface Props {
  calendar: Calendar
  calibration: Calibration | null
  /** Human name of what the calendar covers (region name or drawn-area label). */
  areaName: string
  /** True when `calendar` is for a drawn area rather than the whole region. */
  isArea: boolean
  /** The region on screen; the satellite imagery card needs its id and centre. */
  region?: Region | null
  /** The drawn area the calendar is for, or null for the whole region. */
  polygon?: GeoJSON.Polygon | null
  /** Dim while a new calendar is loading, instead of flashing a skeleton. */
  stale: boolean
  /** Rendered at the end of the controls row (CSV exports). */
  actions?: React.ReactNode
}

export function CalendarPanel({
  calendar,
  calibration,
  areaName,
  isArea,
  region = null,
  polygon = null,
  stale,
  actions,
}: Props) {
  const [mode, setMode] = useState<Mode>('harmonized')
  const [palette, setPalette] = useState<PaletteId>('cividis')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  // The selection is a month key, so it carries over when the region or area changes.
  const selected = selectedKey ? (calendar.months.find((m) => monthKey(m) === selectedKey) ?? null) : null
  const years = new Set(calendar.months.map((m) => m.year)).size
  const lastProgress = lastMonthProgress(calendar, calibration)
  // Imagery card: the clicked month, else the month with the highest anomaly.
  const imageryMonth = selected ?? peakAnomaly(calendar.months)
  const area = isArea ? polygon : null
  const lastDataDate = calibration?.region_id === calendar.region_id ? calibration.diagnostics?.last_data_date : null
  const maxImageryDate = typeof lastDataDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(lastDataDate) ? lastDataDate : todayIso()

  return (
    <div className={`space-y-4 transition-opacity ${stale ? 'opacity-50' : ''}`} aria-busy={stale}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <ModeToggle mode={mode} onChange={setMode} />
          <PaletteSwitcher palette={palette} onChange={setPalette} />
        </div>
        {actions && <div className="ml-auto flex justify-end">{actions}</div>}
      </div>

      <AnomalyCards
        calendar={calendar}
        calibration={calibration}
        selected={selected}
        isArea={isArea}
        lastProgress={lastProgress}
      />

      <section className="rounded-lg border border-hairline bg-page p-4">
        <header className="mb-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            Burning Activity Calendar: {areaName} · {MODE_LABEL[mode]}
            <InfoTip label="About the calendar">
              <p>
                {UNIT_LABEL} per month, {calendar.first_month} to {calendar.last_month} ({years} calendar years).
              </p>
              <p>
                {mode === 'raw'
                  ? 'Raw view: the VIIRS count where VIIRS exists, otherwise the MODIS count, with no conversion.'
                  : 'Every month converted to the S-NPP VIIRS scale.'}
              </p>
              <p>Click a month to pin its numbers above the calendar.</p>
            </InfoTip>
          </h2>
          <p className="text-xs text-muted">
            {years} years × 12 months · {selected ? `${monthTitle(selected)} pinned` : 'click a month to pin it'}
          </p>
        </header>
        <CalendarHeatmap
          calendar={calendar}
          mode={mode}
          palette={palette}
          lastProgress={lastProgress}
          selectedKey={selectedKey}
          onSelect={(m) => setSelectedKey((prev) => (prev === monthKey(m) ? null : monthKey(m)))}
        />
        <CalendarTable calendar={calendar} />
      </section>

      {region && imageryMonth && (
        <BurnScarSlider
          // Date steps and the divider start over for another month or area.
          key={`${region.id}:${monthKey(imageryMonth)}:${area ? JSON.stringify(area.coordinates) : 'region'}`}
          month={imageryMonth}
          isDefault={!selected}
          region={region}
          polygon={area}
          maxDate={maxImageryDate}
        />
      )}

      <section className="rounded-lg border border-hairline bg-surface p-4">
        <header className="mb-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            Raw vs. harmonized over time: {areaName}
            <InfoTip label="About the time series">
              <p>
                The raw series steps up when the record switches from MODIS to VIIRS. The harmonized series is on one
                scale throughout.
              </p>
            </InfoTip>
          </h2>
        </header>
        <TimeSeriesChart calendar={calendar} mode={mode} />
      </section>

      {calibration && <CalibrationPanel calibration={calibration} isArea={isArea} />}
    </div>
  )
}
