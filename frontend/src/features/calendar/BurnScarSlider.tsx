import { useRef, useState } from 'react'
import type { CalendarMonth, Region } from '../../types/contracts.ts'
import { Segmented } from './Controls.tsx'
import {
  GIBS_LAYERS,
  SENSOR_LABEL,
  SPECTRAL_LABEL,
  buildGibsWmsUrl,
  clampIsoDate,
  defaultDates,
  eventFor,
  sensorForDate,
  shiftIsoDate,
  targetBbox,
  viewBbox,
} from './gibs.ts'
import type { BboxOrigin, Spectral } from './gibs.ts'
import { fmtDay, monthTitle } from './model.ts'

type Side = 'before' | 'after'

const BBOX_ORIGIN_NOTE: Record<BboxOrigin, string> = {
  drawn_area: 'framed on the drawn area',
  event: "framed on the month's largest hotspot cluster",
  region_center: 'framed on the region centre, draw an area on the map to look elsewhere',
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded border border-hairline px-1.5 py-0.5 text-[11px] text-ink-2">{children}</span>
}

/** One GIBS image with its own loading and error state. A new URL starts loading again. */
function GibsImage({ url, alt, onState }: { url: string; alt: string; onState: (url: string, ok: boolean) => void }) {
  return (
    <img
      key={url}
      src={url}
      alt={alt}
      draggable={false}
      onLoad={() => onState(url, true)}
      onError={() => onState(url, false)}
      className="absolute inset-0 h-full w-full select-none object-cover"
    />
  )
}

interface StepperProps {
  side: Side
  date: string
  min: string
  max: string
  onStep: (days: number) => void
}

function DateStepper({ side, date, min, max, onStep }: StepperProps) {
  const name = side === 'before' ? 'Before' : 'After'
  const step = (days: number, label: string) => {
    const target = clampIsoDate(shiftIsoDate(date, days), min, max)
    return (
      <button
        type="button"
        onClick={() => onStep(days)}
        disabled={target === date}
        aria-label={`${name} image: ${days > 0 ? 'forward' : 'back'} ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`}
        className="rounded border border-hairline px-1.5 py-0.5 text-[11px] text-ink hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
      >
        {label}
      </button>
    )
  }
  return (
    <div role="group" aria-label={`${name} image date`} className="flex items-center gap-1">
      <span className="w-12 text-xs text-ink-2">{name}</span>
      {step(-7, '−7d')}
      {step(-1, '−1d')}
      <span className="tabular min-w-[5.5rem] text-center text-xs text-ink" aria-live="polite">
        {date}
      </span>
      {step(1, '+1d')}
      {step(7, '+7d')}
    </div>
  )
}

interface Props {
  /** The month to inspect: the selected one, or the peak anomaly month. */
  month: CalendarMonth
  /** True when `month` is the peak anomaly default, not a month the user clicked. */
  isDefault: boolean
  region: Region
  /** The drawn area the calendar is for, or null for the whole region. */
  polygon: GeoJSON.Polygon | null
  /** Last day that can have imagery (the last data day, or today). */
  maxDate: string
}

/**
 * Before / after NASA GIBS imagery of a calendar month, with a draggable divider. The images
 * come straight from NASA's public WMS endpoint; nothing here is computed from the calendar
 * numbers, it is a look at the ground for the same month.
 */
export function BurnScarSlider({ month, isDefault, region, polygon, maxDate }: Props) {
  const [spectral, setSpectral] = useState<Spectral>('swir')
  const [shift, setShift] = useState<Record<Side, number>>({ before: 0, after: 0 })
  const [split, setSplit] = useState(50)
  const [loaded, setLoaded] = useState<Record<string, boolean>>({})
  const [attempt, setAttempt] = useState(0)
  const frame = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const { event, origin: eventOrigin } = eventFor(region.id, month)
  const defaults = defaultDates(month, event, maxDate)
  const dateOf = (side: Side) => clampIsoDate(shiftIsoDate(defaults[side], shift[side]), defaults.min, defaults.max)
  const dates = { before: dateOf('before'), after: dateOf('after') }
  const stepped = dates.before !== defaults.before || dates.after !== defaults.after
  const target = targetBbox(polygon, event, region)
  const bbox = viewBbox(target.bbox)

  const sensors = { before: sensorForDate(dates.before, month.source), after: sensorForDate(dates.after, month.source) }
  const urlOf = (side: Side) =>
    buildGibsWmsUrl(GIBS_LAYERS[sensors[side]][spectral], bbox, dates[side]) + (attempt ? `&RETRY=${attempt}` : '')
  const urls = { before: urlOf('before'), after: urlOf('after') }
  const failed = (['before', 'after'] as const).filter((side) => loaded[urls[side]] === false)
  const loading = (['before', 'after'] as const).some((side) => loaded[urls[side]] === undefined)
  const onState = (url: string, ok: boolean) => setLoaded((prev) => ({ ...prev, [url]: ok }))

  const step = (side: Side, days: number) => {
    // Step from the clamped date, so a press at the edge never builds up hidden offset.
    const next = clampIsoDate(shiftIsoDate(dates[side], days), defaults.min, defaults.max)
    const offset = Math.round((Date.parse(next) - Date.parse(defaults[side])) / 86_400_000)
    setShift((prev) => ({ ...prev, [side]: offset }))
  }

  const moveTo = (clientX: number) => {
    const box = frame.current?.getBoundingClientRect()
    if (!box || box.width === 0) return
    setSplit(Math.round(Math.min(Math.max(((clientX - box.left) / box.width) * 100, 0), 100)))
  }

  const sensorNames = [...new Set([sensors.before, sensors.after])].map((s) => SENSOR_LABEL[s])
  const badge = 'absolute top-2 rounded bg-page/85 px-2 py-1 text-[11px] font-medium text-ink'

  return (
    <section className="rounded-lg border border-hairline bg-surface p-4">
      <header className="mb-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="text-sm font-semibold">
            Before / after satellite imagery: {monthTitle(month)}
            {event?.label ? ` · ${event.label}` : ''}
          </h2>
          {sensorNames.map((name) => (
            <Chip key={name}>{name}</Chip>
          ))}
          {/* The dates were checked for the fire cluster's box, so a drawn area elsewhere does not get the chip. */}
          {defaults.verified && !stepped && target.origin === 'event' && <Chip>Cloud-free verified dates</Chip>}
        </div>
        <p className="mt-1 text-xs text-ink-2">
          NASA GIBS corrected-reflectance imagery, {BBOX_ORIGIN_NOTE[target.origin]}.{' '}
          {isDefault && 'Showing peak anomaly month — click any month in the calendar to inspect its burn scar. '}
          {eventOrigin === 'none' &&
            `No fire dates are recorded for this month, so the images default to ${fmtDay(defaults.before)} and ${fmtDay(defaults.after)} (20 days before the month, 10 days after it).`}
        </p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented
          label="Imagery bands"
          value={spectral}
          onChange={setSpectral}
          options={[
            { value: 'swir', label: SPECTRAL_LABEL.swir },
            { value: 'true_color', label: SPECTRAL_LABEL.true_color },
          ]}
        />
        <DateStepper side="before" date={dates.before} min={defaults.min} max={defaults.max} onStep={(d) => step('before', d)} />
        <DateStepper side="after" date={dates.after} min={defaults.min} max={defaults.max} onStep={(d) => step('after', d)} />
        {stepped && (
          <button
            type="button"
            onClick={() => setShift({ before: 0, after: 0 })}
            className="rounded border border-hairline px-2 py-0.5 text-[11px] text-ink hover:bg-raised"
          >
            Reset dates
          </button>
        )}
      </div>

      <div
        ref={frame}
        className="relative aspect-[16/9] w-full cursor-ew-resize touch-none overflow-hidden rounded-md border border-hairline bg-page"
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          moveTo(e.clientX)
        }}
        onPointerMove={(e) => dragging.current && moveTo(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <GibsImage
          url={urls.after}
          alt={`After: ${SPECTRAL_LABEL[spectral]} imagery of ${fmtDay(dates.after)}, ${SENSOR_LABEL[sensors.after]}`}
          onState={onState}
        />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
          <GibsImage
            url={urls.before}
            alt={`Before: ${SPECTRAL_LABEL[spectral]} imagery of ${fmtDay(dates.before)}, ${SENSOR_LABEL[sensors.before]}`}
            onState={onState}
          />
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-ink shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
          style={{ left: `${split}%` }}
        >
          <span className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-page bg-ink text-xs text-page">
            ◂▸
          </span>
        </div>
        <span className={`${badge} left-2`}>
          BEFORE · {fmtDay(dates.before)} · {SENSOR_LABEL[sensors.before]}
        </span>
        <span className={`${badge} right-2`}>
          AFTER · {fmtDay(dates.after)} · {SENSOR_LABEL[sensors.after]}
        </span>
        {loading && failed.length === 0 && (
          <div role="status" className="absolute inset-x-0 bottom-2 flex justify-center">
            <span className="flex items-center gap-2 rounded bg-page/85 px-2 py-1 text-[11px] text-ink">
              <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-ink-2 border-t-transparent" />
              Loading imagery from NASA GIBS…
            </span>
          </div>
        )}
        {failed.length > 0 && (
          <div role="alert" className="absolute inset-0 flex items-center justify-center bg-page/80 p-4">
            <div className="max-w-sm text-center text-xs text-ink">
              <p>
                The {failed.join(' and ')} image could not be loaded from NASA GIBS. Check the connection, or step to
                another day.
              </p>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setAttempt((n) => n + 1)}
                className="mt-2 rounded border border-hairline px-2 py-1 text-ink hover:bg-raised"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </div>

      <label className="mt-2 flex items-center gap-2 text-[11px] text-ink-2">
        <span>Before</span>
        <input
          type="range"
          min={0}
          max={100}
          value={split}
          onChange={(e) => setSplit(Number(e.target.value))}
          aria-label="Before and after imagery comparison slider"
          className="flex-1 accent-ink"
        />
        <span>After</span>
      </label>

      <p className="tabular mt-2 text-[11px] text-muted">
        Box [minLon, minLat, maxLon, maxLat]: [{bbox.join(', ')}]
      </p>
      <p className="mt-1 text-[11px] text-muted">
        Cloudy or black orbital swath gap? Step ±1d / ±7d to inspect an adjacent satellite overpass. In SWIR mode,
        fresh burn scars appear deep red/magenta and unburned vegetation appears bright green.
      </p>
    </section>
  )
}
