// Protocol step 4: weather. Live wind from Open-Meteo, plus gust and wind-shift sliders.
import type { WindHour, WindSettings } from '../engine/wind.ts'
import { GUST_HOUR_SHARE } from '../engine/wind.ts'
import { compassPoint } from '../weather/openMeteo.ts'
import type { LiveWind } from '../weather/openMeteo.ts'
import { Button, Panel } from './parts.tsx'

export type WindSource =
  | { status: 'loading' }
  | { status: 'live'; live: LiveWind }
  | { status: 'failed'; reason: string }

interface Props {
  source: WindSource
  settings: WindSettings
  onChange: (next: WindSettings) => void
  /** Wind of the hour on screen during playback, or null while planning. */
  current: WindHour | null
  hours: number
}

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const nf2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  disabled?: boolean
}) {
  return (
    <label className="block text-xs text-ink-2">
      <span className="tabular">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-0.5 block w-full accent-[#3987e5]"
      />
    </label>
  )
}

/** Arrow pointing where the wind blows to. */
function Compass({ fromDeg, speedKmh }: { fromDeg: number; speedKmh: number }) {
  return (
    <svg viewBox="-24 -24 48 48" className="h-14 w-14 shrink-0" role="img" aria-label={`Wind blowing from ${nf0.format(fromDeg)} degrees`}>
      <circle r="22" fill="none" stroke="currentColor" className="text-axis" strokeWidth="1.5" />
      <text y="-13" textAnchor="middle" fontSize="7" fill="currentColor" className="text-muted">
        N
      </text>
      {speedKmh > 0 ? (
        <g transform={`rotate(${fromDeg + 180})`}>
          <line x1="0" y1="12" x2="0" y2="-10" stroke="#f0efec" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M0,-17 L5.5,-7 L-5.5,-7 Z" fill="#f0efec" />
        </g>
      ) : (
        <circle r="3" fill="#f0efec" />
      )}
    </svg>
  )
}

export function WindPanel({ source, settings, onChange, current, hours }: Props) {
  const set = (patch: Partial<WindSettings>) => onChange({ ...settings, ...patch })
  const live = source.status === 'live' ? source.live : null
  const matchesLive =
    live !== null &&
    settings.fromDeg === Math.round(live.fromDeg) &&
    settings.speedKmh === Math.round(live.speedKmh) &&
    settings.gustKmh === Math.round(live.gustKmh)
  const shown = current ?? { fromDeg: settings.fromDeg, speedKmh: settings.speedKmh, gust: false }

  return (
    <Panel title="Weather · wind">
      {source.status === 'loading' && <p className="text-xs text-ink-2">Asking Open-Meteo for the current wind…</p>}
      {live && (
        <p className="tabular text-xs text-ink-2">
          Open-Meteo, {live.time ? `${live.time.replace('T', ' ')} UTC` : 'current'}, at {nf2.format(live.lat)}°,{' '}
          {nf2.format(live.lon)}°: {nf0.format(live.speedKmh)} km/h from {nf0.format(live.fromDeg)}° (
          {compassPoint(live.fromDeg)}), gusts {nf0.format(live.gustKmh)} km/h.
          {!matchesLive && ' The sliders have been moved away from it.'}
        </p>
      )}
      {source.status === 'failed' && (
        <p role="status" className="rounded-md border border-warning/60 bg-warning/10 px-2 py-1.5 text-xs text-ink">
          Live wind unavailable ({source.reason}). The wind below is set manually with the sliders, not measured.
        </p>
      )}

      <div className="mt-2 flex items-center gap-3">
        <Compass fromDeg={shown.fromDeg} speedKmh={shown.speedKmh} />
        <p className="tabular text-sm text-ink">
          {current ? 'This hour: ' : ''}
          {shown.speedKmh > 0
            ? `${nf0.format(shown.speedKmh)} km/h from ${nf0.format(shown.fromDeg)}° (${compassPoint(shown.fromDeg)})`
            : 'Calm'}
          {shown.gust && <span className="text-warning"> · gust</span>}
        </p>
      </div>

      <div className="mt-2 space-y-2">
        <Slider
          label={`Wind from ${nf0.format(settings.fromDeg)}° (${compassPoint(settings.fromDeg)})`}
          value={settings.fromDeg}
          min={0}
          max={359}
          onChange={(v) => set({ fromDeg: v })}
        />
        <Slider
          label={`Mean speed ${nf0.format(settings.speedKmh)} km/h`}
          value={settings.speedKmh}
          min={0}
          max={80}
          onChange={(v) => set({ speedKmh: v })}
        />
        <Slider
          label={
            settings.gustKmh > settings.speedKmh
              ? `Gusts ${nf0.format(settings.gustKmh)} km/h in about ${nf0.format(GUST_HOUR_SHARE * 100)} % of the hours`
              : `Gusts ${nf0.format(settings.gustKmh)} km/h (not above the mean speed: no gusts)`
          }
          value={settings.gustKmh}
          min={0}
          max={120}
          onChange={(v) => set({ gustKmh: v })}
        />
        <Slider
          label={
            settings.shiftDeg === 0
              ? 'Wind shift: none'
              : `Wind shift: turns ${nf0.format(Math.abs(settings.shiftDeg))}° ${settings.shiftDeg > 0 ? 'clockwise' : 'anticlockwise'}`
          }
          value={settings.shiftDeg}
          min={-180}
          max={180}
          step={15}
          onChange={(v) => set({ shiftDeg: v })}
        />
        <Slider
          label={`Shift arrives at hour ${settings.shiftHour}`}
          value={settings.shiftHour}
          min={0}
          max={hours}
          disabled={settings.shiftDeg === 0}
          onChange={(v) => set({ shiftHour: v })}
        />
      </div>
      {live && !matchesLive && (
        <div className="mt-2">
          <Button
            onClick={() =>
              set({
                fromDeg: Math.round(live.fromDeg),
                speedKmh: Math.round(live.speedKmh),
                gustKmh: Math.round(live.gustKmh),
              })
            }
          >
            Back to the live wind
          </Button>
        </div>
      )}
    </Panel>
  )
}
