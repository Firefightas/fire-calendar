import { H3HexagonLayer } from '@deck.gl/geo-layers'
import { ScatterplotLayer } from '@deck.gl/layers'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { Map as MlMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import type { GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useMemo, useRef, useState } from 'react'
import { TerraDraw, TerraDrawPolygonMode, TerraDrawRectangleMode } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import { explain, loadNrt } from '../../app/api.ts'
import type { NrtCollection } from '../../app/api.ts'
import type { NrtHotspotProps, Region, SandboxCell, SandboxGrid } from '../../types/contracts.ts'
import { loadBasemap } from './basemap.ts'
import {
  boxAround,
  bboxPolygon,
  clampBbox,
  cleanPolygon,
  isValidLatLon,
  polygonAreaKm2,
  polygonInBbox,
} from './geo.ts'
import { binHotspots } from './hexbin.ts'
import type { HexBin } from './hexbin.ts'

// MapLibre 6 looks for its worker next to its own module file, which a bundler moves.
// Hand it the worker as an emitted asset instead.
setWorkerUrl(maplibreWorkerUrl)

type DrawMode = 'static' | 'polygon' | 'rectangle'
type Rgba = [number, number, number, number]

type NrtState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: NrtCollection; days: number }
  | { status: 'error'; message: string }

interface Props {
  regions: Region[]
  region: Region
  /** The committed area of interest, or null for the whole region. */
  polygon: GeoJSON.Polygon | null
  onPolygonChange: (p: GeoJSON.Polygon | null) => void
  /** Sandbox grid of the region: its harmonized burn history is shown as H3 hexes. */
  grid: SandboxGrid | null
  /** Buttons rendered under the map (exports, sandbox launch). */
  actions?: React.ReactNode
}

// One-hue ramps, light = more on the dark map. Blue: fire history. Red: live hotspots.
const HISTORY_RAMP: [Rgba, Rgba] = [
  [28, 92, 171, 150],
  [205, 226, 251, 235],
]
const NRT_RAMP: [Rgba, Rgba] = [
  [230, 103, 103, 110],
  [255, 214, 214, 230],
]
const NRT_DOT: Rgba = [230, 103, 103, 255]
const SURFACE: Rgba = [13, 13, 13, 255]
const AREA_COLOR = '#86b6ef'
const BOX_HALF_KM = 10

function ramp([a, b]: [Rgba, Rgba], t: number): Rgba {
  const k = Math.sqrt(Math.min(Math.max(t, 0), 1))
  return [0, 1, 2, 3].map((i) => Math.round(a[i] + (b[i] - a[i]) * k)) as Rgba
}

const css = ([r, g, b]: Rgba) => `rgb(${r}, ${g}, ${b})`
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

const TOOLTIP_STYLE = {
  background: '#232322',
  color: '#f0efec',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  padding: '8px 10px',
  fontSize: '12px',
  lineHeight: '1.4',
  whiteSpace: 'pre-line',
}

function tooltipText(layerId: string | undefined, object: unknown): string | null {
  if (!object) return null
  if (layerId === 'fire-history') {
    const c = object as SandboxCell
    const since = c.years_since_last_fire === null ? 'never in the record' : `${nf.format(c.years_since_last_fire)} yr ago`
    return `Burn count: ${nf.format(c.burn_count)}\nLast fire: ${since}\nLand cover: ${c.asset_type}\nHex ${c.h3}`
  }
  if (layerId === 'nrt-hex') {
    const b = object as HexBin
    return `${b.count} live detection${b.count === 1 ? '' : 's'}\nFRP sum: ${nf.format(b.frpSum)} MW\nSatellites: ${b.satellites.join(', ')}\nHex ${b.h3}`
  }
  if (layerId === 'nrt-points') {
    const p = (object as GeoJSON.Feature<GeoJSON.Point, NrtHotspotProps>).properties
    return `${p.date} ${p.time} UTC\n${p.satellite}, ${p.daynight === 'D' ? 'day' : 'night'}\nFRP ${nf.format(p.frp)} MW\nConfidence: ${p.confidence_class}`
  }
  return null
}

const toolButton = (active: boolean) =>
  `rounded-md border px-2.5 py-1.5 text-xs shadow-md shadow-black/40 transition-colors ${
    active ? 'border-ink bg-ink text-page' : 'border-hairline bg-raised text-ink hover:bg-axis'
  }`

export function MapPanel({ regions, region, polygon, onPolygonChange, grid, actions }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const overlayRef = useRef<MapboxOverlay | null>(null)
  const drawRef = useRef<TerraDraw | null>(null)
  const markerRef = useRef<Marker | null>(null)

  // Map event handlers outlive renders; they read the latest props through refs.
  const regionRef = useRef(region)
  const regionsRef = useRef(regions)
  const onPolygonChangeRef = useRef(onPolygonChange)
  useEffect(() => {
    regionRef.current = region
    regionsRef.current = regions
    onPolygonChangeRef.current = onPolygonChange
  })

  const [ready, setReady] = useState(false)
  const [basemapOnline, setBasemapOnline] = useState(true)
  const [drawMode, setDrawMode] = useState<DrawMode>('static')
  // A notice belongs to the region it was raised in; switching region drops it.
  const [noticeFor, setNoticeFor] = useState<{ regionId: string; text: string } | null>(null)
  const notice = noticeFor?.regionId === region.id ? noticeFor.text : null
  const setNotice = (text: string | null) =>
    setNoticeFor(text === null ? null : { regionId: regionRef.current.id, text })
  const [showHistory, setShowHistory] = useState(true)
  const [nrtDays, setNrtDays] = useState(1)
  const [nrt, setNrt] = useState<NrtState>({ status: 'idle' })
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')

  const commitArea = (poly: GeoJSON.Polygon) => {
    const r = regionRef.current
    if (!polygonInBbox(poly, r.bbox)) {
      setNotice(
        `That area is not fully inside ${r.name}. The 26-year calendar is precomputed only inside the three regions (dashed boxes).`,
      )
      return
    }
    setNotice(null)
    onPolygonChangeRef.current(poly)
  }
  const commitAreaRef = useRef(commitArea)
  useEffect(() => {
    commitAreaRef.current = commitArea
  })

  // Create the map once.
  useEffect(() => {
    let cancelled = false
    let map: MlMap | null = null

    void loadBasemap().then(({ style, online }) => {
      if (cancelled || !containerRef.current) return
      setBasemapOnline(online)
      const r = regionRef.current
      map = new MlMap({
        container: containerRef.current,
        style,
        center: r.center,
        zoom: r.default_zoom,
        attributionControl: { compact: true },
      })
      const m = map
      mapRef.current = m
      m.addControl(new NavigationControl({ showCompass: false }), 'top-right')

      m.on('load', () => {
        if (cancelled) return
        m.addSource('regions', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: regionsRef.current.map((reg) => ({
              type: 'Feature',
              properties: { id: reg.id },
              geometry: bboxPolygon(reg.bbox),
            })),
          },
        })
        m.addLayer({
          id: 'regions-line',
          type: 'line',
          source: 'regions',
          paint: { 'line-color': '#c3c2b7', 'line-width': 1.25, 'line-dasharray': [3, 2] },
        })
        m.addSource('area', { type: 'geojson', data: EMPTY })
        m.addLayer({
          id: 'area-fill',
          type: 'fill',
          source: 'area',
          paint: { 'fill-color': AREA_COLOR, 'fill-opacity': 0.12 },
        })
        m.addLayer({
          id: 'area-line',
          type: 'line',
          source: 'area',
          paint: { 'line-color': AREA_COLOR, 'line-width': 2 },
        })

        const overlay = new MapboxOverlay({
          interleaved: false,
          layers: [],
          getTooltip: ({ object, layer }) => {
            const text = tooltipText(layer?.id, object)
            return text ? { text, style: TOOLTIP_STYLE } : null
          },
        })
        m.addControl(overlay)
        overlayRef.current = overlay

        const draw = new TerraDraw({
          adapter: new TerraDrawMapLibreGLAdapter({ map: m }),
          modes: [new TerraDrawPolygonMode(), new TerraDrawRectangleMode()],
        })
        draw.start()
        draw.on('finish', (id, context) => {
          if (context.action !== 'draw') return
          const feature = draw.getSnapshotFeature(id)
          // terra-draw is only the pen: the committed area is drawn by our own "area" layer.
          setTimeout(() => {
            draw.clear()
            draw.setMode('static')
            setDrawMode('static')
          }, 0)
          if (feature?.geometry.type === 'Polygon') {
            commitAreaRef.current(cleanPolygon(feature.geometry as GeoJSON.Polygon))
          }
        })
        drawRef.current = draw
        setReady(true)
      })
    })

    return () => {
      cancelled = true
      try {
        drawRef.current?.stop()
      } catch {
        // the map may already be gone
      }
      drawRef.current = null
      overlayRef.current = null
      markerRef.current = null
      mapRef.current = null
      map?.remove()
      setReady(false)
    }
  }, [])

  // Region preset: frame the region.
  useEffect(() => {
    if (!ready) return
    const [w, s, e, n] = region.bbox
    mapRef.current?.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: 28, duration: 700 },
    )
  }, [ready, region.id, region.bbox])

  // The committed area.
  useEffect(() => {
    if (!ready) return
    const source = mapRef.current?.getSource<GeoJSONSource>('area')
    source?.setData(polygon ? { type: 'Feature', properties: {}, geometry: polygon } : EMPTY)
  }, [ready, polygon])

  const historyCells = useMemo(() => grid?.cells.filter((c) => c.burn_count > 0) ?? [], [grid])
  const historyMax = useMemo(() => historyCells.reduce((mx, c) => Math.max(mx, c.burn_count), 0), [historyCells])
  const nrtData = nrt.status === 'ready' ? nrt.data : null
  const nrtBins = useMemo(() => (nrtData ? binHotspots(nrtData) : []), [nrtData])
  const nrtMax = useMemo(() => nrtBins.reduce((mx, b) => Math.max(mx, b.count), 0), [nrtBins])

  // deck.gl layers.
  useEffect(() => {
    if (!ready) return
    const layers = []
    if (showHistory && historyCells.length > 0) {
      layers.push(
        new H3HexagonLayer<SandboxCell>({
          id: 'fire-history',
          data: historyCells,
          getHexagon: (d) => d.h3,
          getFillColor: (d) => ramp(HISTORY_RAMP, d.burn_count / historyMax),
          extruded: false,
          stroked: false,
          pickable: true,
        }),
      )
    }
    if (nrtData) {
      layers.push(
        new H3HexagonLayer<HexBin>({
          id: 'nrt-hex',
          data: nrtBins,
          getHexagon: (d) => d.h3,
          getFillColor: (d) => ramp(NRT_RAMP, d.count / nrtMax),
          extruded: false,
          stroked: false,
          pickable: true,
        }),
        new ScatterplotLayer<GeoJSON.Feature<GeoJSON.Point, NrtHotspotProps>>({
          id: 'nrt-points',
          data: nrtData.features,
          getPosition: (d) => d.geometry.coordinates as [number, number],
          getFillColor: NRT_DOT,
          getLineColor: SURFACE,
          stroked: true,
          lineWidthMinPixels: 1,
          radiusUnits: 'pixels',
          getRadius: 4,
          pickable: true,
        }),
      )
    }
    overlayRef.current?.setProps({ layers })
  }, [ready, showHistory, historyCells, historyMax, nrtData, nrtBins, nrtMax])

  const startDrawing = (mode: Exclude<DrawMode, 'static'>) => {
    const draw = drawRef.current
    if (!draw) return
    const next: DrawMode = drawMode === mode ? 'static' : mode
    draw.clear()
    draw.setMode(next)
    setDrawMode(next)
    setNotice(null)
  }

  const fetchNrt = async () => {
    const map = mapRef.current
    if (!map) return
    const b = map.getBounds()
    setNrt({ status: 'loading' })
    try {
      const data = await loadNrt({ bbox: clampBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]) }, nrtDays)
      setNrt({ status: 'ready', data, days: nrtDays })
    } catch (err) {
      setNrt({ status: 'error', message: explain(err) })
    }
  }

  const point = { lat: Number(lat), lon: Number(lon) }
  const pointValid = lat.trim() !== '' && lon.trim() !== '' && isValidLatLon(point.lat, point.lon)

  const goToPoint = (e: React.FormEvent) => {
    e.preventDefault()
    const map = mapRef.current
    if (!map || !pointValid) return
    markerRef.current?.remove()
    markerRef.current = new Marker({ color: '#f0efec' }).setLngLat([point.lon, point.lat]).addTo(map)
    map.flyTo({ center: [point.lon, point.lat], zoom: Math.max(map.getZoom(), 9), duration: 700 })
  }

  const zoomToHistory = () => {
    const map = mapRef.current
    if (!map || historyCells.length === 0) return
    let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const c of historyCells) {
      w = Math.min(w, c.lon)
      e = Math.max(e, c.lon)
      s = Math.min(s, c.lat)
      n = Math.max(n, c.lat)
    }
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: 60, duration: 700 },
    )
  }

  return (
    <section className="rounded-lg border border-hairline bg-surface p-4">
      <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">Area of interest</h2>
        <p className="text-xs text-ink-2">
          {polygon
            ? `Drawn area, about ${nf.format(Math.round(polygonAreaKm2(polygon)))} km², inside ${region.name}`
            : `Whole region: ${region.name}. Draw an area to get its own calendar.`}
        </p>
      </header>

      <div className="relative h-[420px] overflow-hidden rounded-md border border-hairline xl:h-[520px]">
        {/* MapLibre's stylesheet sets `position: relative` on its container, so size it by height, not inset. */}
        <div ref={containerRef} className="h-full w-full" />

        <div className="absolute top-2 left-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={!ready}
            aria-pressed={drawMode === 'polygon'}
            onClick={() => startDrawing('polygon')}
            className={toolButton(drawMode === 'polygon')}
          >
            Draw polygon
          </button>
          <button
            type="button"
            disabled={!ready}
            aria-pressed={drawMode === 'rectangle'}
            onClick={() => startDrawing('rectangle')}
            className={toolButton(drawMode === 'rectangle')}
          >
            Draw rectangle
          </button>
          {polygon && (
            <button type="button" onClick={() => onPolygonChange(null)} className={toolButton(false)}>
              Clear area
            </button>
          )}
        </div>

        {drawMode !== 'static' && (
          <p className="absolute top-12 left-2 max-w-64 rounded-md bg-raised/95 px-2.5 py-1.5 text-[11px] text-ink-2">
            {drawMode === 'polygon'
              ? 'Click to add corners. Click the first corner again to finish.'
              : 'Click one corner, then the opposite corner.'}
          </p>
        )}

      </div>

      <div className="mt-3 grid gap-x-6 gap-y-2 text-[11px] text-ink-2 sm:grid-cols-2">
        <div className="flex items-center gap-2 sm:col-span-2">
          <span className="w-5 border-t border-dashed border-ink-2" />
          Precomputed regions (26-year calendars exist only inside these boxes)
          {!basemapOnline && <span className="text-muted">· Basemap unreachable: outlines only.</span>}
        </div>
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showHistory}
              onChange={(e) => setShowHistory(e.target.checked)}
              disabled={historyCells.length === 0}
            />
            Fire history per H3 hex (burn count)
            {grid?.is_mock && <span className="rounded border border-warning/60 px-1 text-[10px] text-ink">MOCK</span>}
          </label>
          {historyCells.length > 0 ? (
            <div className="mt-1 flex items-center gap-2 pl-5">
              <span>1</span>
              <span
                className="h-2 w-16 rounded-sm"
                style={{
                  background: `linear-gradient(to right, ${css(HISTORY_RAMP[0])}, ${css(HISTORY_RAMP[1])})`,
                }}
              />
              <span>{nf.format(historyMax)}</span>
              <button type="button" onClick={zoomToHistory} className="ml-1 underline hover:text-ink">
                Zoom to hexes
              </button>
            </div>
          ) : (
            <div className="pl-5 text-muted">No sandbox grid loaded for this region.</div>
          )}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: css(NRT_DOT) }} />
            Live hotspots, last
            <select
              aria-label="Days of live hotspots"
              value={nrtDays}
              onChange={(e) => setNrtDays(Number(e.target.value))}
              className="rounded border border-hairline bg-page px-1 py-0.5 text-ink"
            >
              {[1, 2, 3, 5, 7].map((d) => (
                <option key={d} value={d}>
                  {d} d
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!ready || nrt.status === 'loading'}
              onClick={() => void fetchNrt()}
              className="rounded border border-hairline px-1.5 py-0.5 text-ink hover:bg-axis disabled:opacity-50"
            >
              {nrt.status === 'loading' ? 'Loading…' : 'Load for this view'}
            </button>
          </div>
          <div className="mt-1 pl-3.5" role="status">
            {nrt.status === 'idle' && 'NOAA-20, NOAA-21 and MODIS near-real-time, anywhere on Earth.'}
            {nrt.status === 'ready' &&
              `${nrt.data.features.length} detections in ${nrtBins.length} hexes (last ${nrt.days} d).`}
            {nrt.status === 'error' && <span className="text-serious">Unavailable: {nrt.message}.</span>}
          </div>
        </div>
      </div>

      {notice && (
        <p role="alert" className="mt-2 text-xs text-serious">
          {notice}
        </p>
      )}

      <form onSubmit={goToPoint} className="mt-3 flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-1 text-muted">
          Latitude
          <input
            inputMode="decimal"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder={region.center[1].toFixed(2)}
            className="tabular w-24 rounded-md border border-hairline bg-page px-2 py-1.5 text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-muted">
          Longitude
          <input
            inputMode="decimal"
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            placeholder={region.center[0].toFixed(2)}
            className="tabular w-24 rounded-md border border-hairline bg-page px-2 py-1.5 text-ink"
          />
        </label>
        <button
          type="submit"
          disabled={!ready || !pointValid}
          className="rounded-md border border-hairline px-3 py-1.5 text-ink hover:bg-raised disabled:opacity-50"
        >
          Go to point
        </button>
        <button
          type="button"
          disabled={!ready || !pointValid}
          onClick={() => commitArea(boxAround(point.lat, point.lon, BOX_HALF_KM))}
          className="rounded-md border border-hairline px-3 py-1.5 text-ink hover:bg-raised disabled:opacity-50"
        >
          Use a {BOX_HALF_KM * 2} km box here as the area
        </button>
        {actions && <div className="ml-auto flex flex-wrap gap-2">{actions}</div>}
      </form>
    </section>
  )
}
