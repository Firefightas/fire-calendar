import { useState } from 'react'
import { CalendarPanel } from '../features/calendar/CalendarPanel.tsx'
import { sameSeries } from '../features/calendar/model.ts'
import { MapPanel } from '../features/map/MapPanel.tsx'
import type { RegionId } from '../types/contracts.ts'
import { ApiError, loadAreaCalendar, loadCalendar, loadCalibration, loadRegions, loadSandboxGrid } from './api.ts'
import { MockBadge, OriginChip } from './badges.tsx'
import { useAsync } from './useAsync.ts'

const DEFAULT_REGION: RegionId = 'rio_negro'
const AREA_LABEL = 'Drawn area'

function Banner({ tone, children }: { tone: 'info' | 'warning'; children: React.ReactNode }) {
  return (
    <p
      role={tone === 'warning' ? 'alert' : 'status'}
      className="flex gap-2 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs text-ink-2"
    >
      <span aria-hidden="true" className={tone === 'warning' ? 'text-warning' : 'text-muted'}>
        {tone === 'warning' ? '▲' : '●'}
      </span>
      <span>{children}</span>
    </p>
  )
}

export default function App() {
  const [regionId, setRegionId] = useState<RegionId>(DEFAULT_REGION)
  const [polygon, setPolygon] = useState<GeoJSON.Polygon | null>(null)

  const regions = useAsync(loadRegions, 'regions')
  const calendar = useAsync(() => loadCalendar(regionId), `calendar:${regionId}`)
  const calibration = useAsync(() => loadCalibration(regionId), `calibration:${regionId}`)
  const grid = useAsync(() => loadSandboxGrid(regionId), `grid:${regionId}`)

  const region = regions.data?.data.regions.find((r) => r.id === regionId)
  const regionCal = calendar.status === 'ready' ? calendar.data.data : null

  // Calendar for the drawn polygon. Backend only: there is no offline version of an arbitrary area.
  const range = regionCal ? `${regionCal.first_month}:${regionCal.last_month}` : 'pending'
  const area = useAsync(
    async () =>
      polygon && regionCal
        ? loadAreaCalendar({
            region_id: regionId,
            polygon,
            start: regionCal.first_month,
            end: regionCal.last_month,
            area_label: AREA_LABEL,
          })
        : null,
    `area:${regionId}:${range}:${polygon ? JSON.stringify(polygon.coordinates) : 'none'}`,
  )
  const areaCal = polygon && area.status === 'ready' ? area.data : null
  const areaLoading = Boolean(polygon) && area.status === 'loading'

  const shown = areaCal ?? regionCal ?? calendar.data?.data ?? null
  const calib = calibration.status === 'ready' ? calibration.data.data : null
  const isMock = Boolean(shown?.is_mock || calib?.is_mock)

  const selectRegion = (id: RegionId) => {
    setRegionId(id)
    setPolygon(null)
  }

  return (
    <div className="min-h-full">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="mr-auto">
            <h1 className="text-lg font-semibold tracking-tight">Burning Activity Calendar</h1>
            <p className="text-xs text-muted">
              MODIS + VIIRS hotspots on one scale: S-NPP-VIIRS-equivalent active fire cell-days
            </p>
          </div>
          {isMock && <MockBadge />}
          {calendar.data && <OriginChip origin={areaCal ? 'api' : calendar.data.origin} />}
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-4">
        <nav aria-label="Region" className="flex flex-wrap items-center gap-2">
          {regions.data?.data.regions.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={r.id === regionId}
              onClick={() => selectRegion(r.id)}
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

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="xl:sticky xl:top-4">
            {region && regions.data && (
              <MapPanel
                regions={regions.data.data.regions}
                region={region}
                polygon={polygon}
                onPolygonChange={setPolygon}
                grid={grid.status === 'ready' ? grid.data.data : null}
              />
            )}
          </div>

          <div className="space-y-4">
            {calendar.status === 'error' && (
              <Banner tone="warning">Could not load the calendar: {calendar.error.message}</Banner>
            )}
            {areaLoading && <Banner tone="info">Computing the calendar for the drawn area…</Banner>}
            {polygon && area.status === 'error' && (
              <Banner tone="warning">
                {area.error instanceof ApiError && area.error.status === null
                  ? 'A calendar for a drawn area needs the backend, which is unreachable.'
                  : `The backend could not compute a calendar for the drawn area: ${area.error.message}.`}{' '}
                The numbers below are for the whole region.
              </Banner>
            )}
            {areaCal && regionCal && sameSeries(areaCal, regionCal) && (
              <Banner tone="warning">
                The backend returned exactly the whole-region series for this area, so the numbers below are not specific
                to the polygon.
              </Banner>
            )}
            {!shown && calendar.status === 'loading' && <p className="text-sm text-muted">Loading…</p>}
            {shown && (
              <CalendarPanel
                calendar={shown}
                calibration={calib}
                areaName={areaCal ? `${AREA_LABEL} in ${region?.name ?? regionId}` : (region?.name ?? shown.region_id)}
                isArea={Boolean(areaCal)}
                southern={region?.hemisphere === 'south'}
                stale={calendar.status === 'loading' || areaLoading}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
