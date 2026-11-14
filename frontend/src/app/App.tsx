import { useState } from 'react'
import { CalendarPanel } from '../features/calendar/CalendarPanel.tsx'
import type { RegionId } from '../types/contracts.ts'
import { loadCalendar, loadCalibration, loadRegions } from './api.ts'
import { MockBadge, OriginChip } from './badges.tsx'
import { useAsync } from './useAsync.ts'

const DEFAULT_REGION: RegionId = 'rio_negro'

export default function App() {
  const [regionId, setRegionId] = useState<RegionId>(DEFAULT_REGION)

  const regions = useAsync(loadRegions, 'regions')
  const calendar = useAsync(() => loadCalendar(regionId), `calendar:${regionId}`)
  const calibration = useAsync(() => loadCalibration(regionId), `calibration:${regionId}`)

  const cal = calendar.data?.data ?? null
  const region = regions.data?.data.regions.find((r) => r.id === regionId)
  const isMock = Boolean(cal?.is_mock || calibration.data?.data.is_mock)

  return (
    <div className="min-h-full">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="mr-auto">
            <h1 className="text-lg font-semibold tracking-tight">Burning Activity Calendar</h1>
            <p className="text-xs text-muted">
              MODIS + VIIRS hotspots on one scale: S-NPP-VIIRS-equivalent active fire cell-days
            </p>
          </div>
          {isMock && <MockBadge />}
          {calendar.data && <OriginChip origin={calendar.data.origin} />}
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-4 px-4 py-4">
        <nav aria-label="Region" className="flex flex-wrap items-center gap-2">
          {regions.data?.data.regions.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={r.id === regionId}
              onClick={() => setRegionId(r.id)}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                r.id === regionId
                  ? 'border-ink-2 bg-raised text-ink'
                  : 'border-hairline text-ink-2 hover:bg-raised'
              }`}
            >
              {r.name}
            </button>
          ))}
          {regions.status === 'error' && (
            <span role="alert" className="text-sm text-serious">
              Could not load the region list: {regions.error.message}
            </span>
          )}
        </nav>

        {calendar.status === 'error' && (
          <p role="alert" className="rounded-lg border border-hairline bg-surface p-4 text-sm text-serious">
            Could not load the calendar: {calendar.error.message}
          </p>
        )}
        {!cal && calendar.status === 'loading' && <p className="text-sm text-muted">Loading…</p>}
        {cal && (
          <CalendarPanel
            calendar={cal}
            calibration={calibration.data?.data ?? null}
            areaName={region?.name ?? cal.region_id}
            isArea={false}
            southern={region?.hemisphere === 'south'}
            stale={calendar.status === 'loading' || cal.region_id !== regionId}
          />
        )}
      </main>
    </div>
  )
}
