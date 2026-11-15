import { useState } from 'react'
import type { Calendar, Calibration } from '../../types/contracts.ts'
import { AnomalyCards } from './AnomalyCards.tsx'
import { CalendarHeatmap } from './CalendarHeatmap.tsx'
import { CalendarTable } from './CalendarTable.tsx'
import { CalibrationPanel } from './CalibrationPanel.tsx'
import { ModeToggle, PaletteSwitcher, Segmented } from './Controls.tsx'
import { TimeSeriesChart } from './TimeSeriesChart.tsx'
import { MODE_LABEL, UNIT_LABEL, lastMonthProgress, monthKey } from './model.ts'
import type { Mode } from './model.ts'
import type { PaletteId } from './palettes.ts'

interface Props {
  calendar: Calendar
  calibration: Calibration | null
  /** Human name of what the calendar covers (region name or drawn-area label). */
  areaName: string
  /** True when `calendar` is for a drawn area rather than the whole region. */
  isArea: boolean
  /** Rows default to July→June fire seasons for southern-hemisphere regions. */
  southern: boolean
  /** Dim while a new calendar is loading, instead of flashing a skeleton. */
  stale: boolean
  /** Rendered at the end of the controls row (CSV exports). */
  actions?: React.ReactNode
}

export function CalendarPanel({ calendar, calibration, areaName, isArea, southern, stale, actions }: Props) {
  const [mode, setMode] = useState<Mode>('harmonized')
  const [palette, setPalette] = useState<PaletteId>('cividis')
  const [startMonth, setStartMonth] = useState<1 | 7>(1)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  // The selection is a month key, so it carries over when the region or area changes.
  const selected = selectedKey ? (calendar.months.find((m) => monthKey(m) === selectedKey) ?? null) : null
  const years = new Set(calendar.months.map((m) => m.year)).size
  const lastProgress = lastMonthProgress(calendar, calibration)

  return (
    <div className={`space-y-4 transition-opacity ${stale ? 'opacity-50' : ''}`} aria-busy={stale}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ModeToggle mode={mode} onChange={setMode} />
        <PaletteSwitcher palette={palette} onChange={setPalette} />
        <Segmented
          label="Calendar rows"
          value={startMonth === 1 ? 'year' : 'season'}
          onChange={(v) => setStartMonth(v === 'year' ? 1 : 7)}
          options={[
            { value: 'year', label: 'Rows: Jan–Dec' },
            { value: 'season', label: southern ? 'Rows: Jul–Jun fire season' : 'Rows: Jul–Jun' },
          ]}
        />
        {actions && <div className="ml-auto">{actions}</div>}
      </div>

      <AnomalyCards
        calendar={calendar}
        calibration={calibration}
        selected={selected}
        isArea={isArea}
        lastProgress={lastProgress}
        startMonth={startMonth}
      />

      <section className="rounded-lg border border-hairline bg-surface p-4">
        <header className="mb-3">
          <h2 className="text-sm font-semibold">
            Burning Activity Calendar: {areaName} · {MODE_LABEL[mode]}
          </h2>
          <p className="text-xs text-ink-2">
            {UNIT_LABEL} per month, {calendar.first_month} to {calendar.last_month} ({years} calendar years).{' '}
            {mode === 'raw'
              ? 'Raw view: the VIIRS count where VIIRS exists, otherwise the MODIS count, with no conversion.'
              : 'Every month converted to the S-NPP VIIRS scale.'}
          </p>
        </header>
        <CalendarHeatmap
          calendar={calendar}
          mode={mode}
          palette={palette}
          startMonth={startMonth}
          lastProgress={lastProgress}
          selectedKey={selectedKey}
          onSelect={(m) => setSelectedKey((prev) => (prev === monthKey(m) ? null : monthKey(m)))}
        />
        <CalendarTable calendar={calendar} />
      </section>

      <section className="rounded-lg border border-hairline bg-surface p-4">
        <header className="mb-3">
          <h2 className="text-sm font-semibold">Raw vs. harmonized over time: {areaName}</h2>
          <p className="text-xs text-ink-2">
            The raw series steps up when the record switches from MODIS to VIIRS. The harmonized series is on one scale
            throughout.
          </p>
        </header>
        <TimeSeriesChart calendar={calendar} mode={mode} />
      </section>

      {calibration && <CalibrationPanel calibration={calibration} isArea={isArea} />}
    </div>
  )
}
