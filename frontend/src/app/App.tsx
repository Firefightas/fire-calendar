import { Suspense, lazy, useState } from 'react'
import { CalendarPanel } from '../features/calendar/CalendarPanel.tsx'
import { sameSeries } from '../features/calendar/model.ts'
import { ExportButtons } from '../features/export/ExportButtons.tsx'
import { bboxPolygon } from '../features/map/geo.ts'
import type { RegionId } from '../types/contracts.ts'
import {
  explain,
  loadAreaCalendar,
  loadCalendar,
  loadCalibration,
  loadRegions,
  loadSandboxGrid,
  waitForBackend,
} from './api.ts'
import { MockBadge, OriginChip } from './badges.tsx'
import { SandboxHost } from './SandboxHost.tsx'
import { useAsync } from './useAsync.ts'

// MapLibre + deck.gl are most of the bundle: load them after the calendar is on screen.
const MapPanel = lazy(() => import('../features/map/MapPanel.tsx').then((m) => ({ default: m.MapPanel })))

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
  const [sandboxOpen, setSandboxOpen] = useState(false)

  // The hosted backend sleeps when idle. The page paints from the bundled JSON meanwhile;
  // once the backend answers, everything taken from the bundle is loaded again from the API.
  const backend = useAsync(waitForBackend, 'backend')
  const waking = backend.status === 'loading'
  const live = backend.status === 'ready' && backend.data.afterFallback ? 'live' : 'first'

  const regions = useAsync(loadRegions, `regions:${live}`)
  const calendar = useAsync(() => loadCalendar(regionId), `calendar:${regionId}:${live}`)
  const calibration = useAsync(() => loadCalibration(regionId), `calibration:${regionId}:${live}`)
  const grid = useAsync(() => loadSandboxGrid(regionId), `grid:${regionId}:${live}`)

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
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-page"
      >
        Skip to the calendar
      </a>
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4">
          <div className="mr-auto flex items-center gap-3">
            <svg viewBox="0 0 32 32" aria-hidden="true" className="size-9 shrink-0">
              <path
                d="M16 1.5 28.6 8.75v14.5L16 30.5 3.4 23.25V8.75Z"
                fill="var(--color-raised)"
                stroke="var(--color-hairline)"
                strokeWidth="1"
              />
              <path
                d="M16.4 7.5c.6 3.3 4.9 5.6 4.9 10.3a5.3 5.3 0 0 1-10.6 0c0-2.5 1.5-4 2.6-5.2.2 1.6 1 2.6 2 3.1-.5-3 .4-5.9 1.1-8.2Z"
                fill="var(--color-warning)"
              />
              <path d="M16.1 16.6c.3 1.5 2.2 2.4 2.2 4.3a2.3 2.3 0 0 1-4.6 0c0-1.4 1-2.4 2.4-4.3Z" fill="var(--color-page)" opacity="0.55" />
            </svg>
            <div>
              <h1 className="text-xl leading-tight font-semibold tracking-tight">Burning Activity Calendar</h1>
              <p className="text-xs text-muted">
                MODIS + VIIRS hotspots on one scale: S-NPP-VIIRS-equivalent active fire cell-days
              </p>
            </div>
          </div>
          {isMock && <MockBadge />}
          {calendar.data && <OriginChip origin={areaCal ? 'api' : calendar.data.origin} waking={waking} />}
        </div>
      </header>

      {sandboxOpen && region && <SandboxHost region={region} area={polygon} onClose={() => setSandboxOpen(false)} />}

      <main id="main" className="mx-auto max-w-[1600px] space-y-4 px-4 py-4" hidden={sandboxOpen}>
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
          {region && (
            <button
              type="button"
              onClick={() => setSandboxOpen(true)}
              className="ml-auto inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-page shadow-md shadow-black/40 transition-colors hover:bg-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Launch Tactical Containment Sandbox
              <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5">
                <path d="M3 8h9M8.5 4 12.5 8l-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </nav>

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="xl:sticky xl:top-4">
            {region && regions.data && (
              <Suspense
                fallback={
                  <div className="rounded-lg border border-hairline bg-surface p-4 text-sm text-muted">
                    Loading the map…
                  </div>
                }
              >
                <MapPanel
                  regions={regions.data.data.regions}
                  region={region}
                  polygon={polygon}
                  onPolygonChange={setPolygon}
                  grid={grid.status === 'ready' ? grid.data.data : null}
                />
              </Suspense>
            )}
          </div>

          <div className="space-y-4">
            {calendar.status === 'error' && (
              <Banner tone="warning">Could not load the calendar: {calendar.error.message}</Banner>
            )}
            {areaLoading && (
              <Banner tone="info">
                Computing the calendar for the drawn area…
                {waking && ' The backend is waking up, which can take up to a minute.'}
              </Banner>
            )}
            {polygon && area.status === 'error' && (
              <Banner tone="warning">
                No calendar for the drawn area: {explain(area.error)}. The numbers below are for the whole region.
              </Banner>
            )}
            {areaCal && regionCal && sameSeries(areaCal, regionCal) && (
              <Banner tone="warning">
                The backend returned exactly the whole-region series for this area, so the numbers below are not specific
                to the polygon.
              </Banner>
            )}
            {areaCal?.is_mock && (
              <Banner tone="info">
                MOCK DATA: the backend computed this drawn-area calendar from its sample hotspot table or mock
                calibration, so its counts are not comparable with the {regionCal?.is_mock ? 'mock' : 'real'}{' '}
                whole-region calendar.
              </Banner>
            )}
            {!shown && calendar.status === 'loading' && <p className="text-sm text-muted">Loading…</p>}
            {shown && (
              <CalendarPanel
                calendar={shown}
                calibration={calib}
                areaName={areaCal ? `${AREA_LABEL} in ${region?.name ?? regionId}` : (region?.name ?? shown.region_id)}
                isArea={Boolean(areaCal)}
                region={region ?? null}
                polygon={polygon}
                stale={calendar.status === 'loading' || areaLoading}
                actions={
                  region && (
                    <ExportButtons
                      // A fresh instance per region and area, so an old "downloaded" note never outlives its data.
                      key={`${regionId}:${polygon ? JSON.stringify(polygon.coordinates) : 'region'}`}
                      query={{
                        region_id: regionId,
                        polygon: polygon ?? bboxPolygon(region.bbox),
                        start: shown.first_month,
                        end: shown.last_month,
                      }}
                      calendar={shown}
                      calendarIsArea={Boolean(areaCal)}
                    />
                  )
                }
              />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
