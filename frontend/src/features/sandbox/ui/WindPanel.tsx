// Protocol step 4: weather. Live wind from Open-Meteo, plus gust and wind-shift sliders.
import type { WindHour, WindSettings } from '../engine/wind.ts'
import { GUST_HOUR_SHARE } from '../engine/wind.ts'
import { compassPoint } from '../weather/openMeteo.ts'
import type { LiveWind } from '../weather/openMeteo.ts'
import { InfoTip } from './InfoTip.tsx'
import { Panel } from './parts.tsx'

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

  const sourceTag =
    source.status === 'live' ? (matchesLive ? 'Live Open-Meteo' : 'Adjusted from live') : source.status === 'failed' ? 'Manual' : 'Loading…'

  return (
    <Panel
      title="Weather · wind"
      aside={
        <InfoTip label="About the wind">
          {live ? (
            <>
              Open-Meteo, {live.time ? `${live.time.replace('T', ' ')} UTC` : 'current'}, at {nf2.format(live.lat)}°,{' '}
              {nf2.format(live.lon)}°: {nf0.format(live.speedKmh)} km/h from {nf0.format(live.fromDeg)}° (
              {compassPoint(live.fromDeg)}), gusts {nf0.format(live.gustKmh)} km/h.
              {!matchesLive && ' The sliders have been moved away from it.'}
            </>
          ) : source.status === 'failed' ? (
            <>Live wind unavailable ({source.reason}). The wind is set manually with the sliders, not measured.</>
          ) : (
            <>Asking Open-Meteo for the current wind at the centre of the area.</>
          )}{' '}
          Gusts blow in about {nf0.format(GUST_HOUR_SHARE * 100)} % of the hours; the seed decides which.
        </InfoTip>
      }
    >
      <div className="flex items-center gap-3">
        <Compass fromDeg={shown.fromDeg} speedKmh={shown.speedKmh} />
        <div className="min-w-0">
          <p className="tabular text-lg font-semibold leading-tight text-ink">
            {shown.speedKmh > 0 ? `${nf0.format(shown.speedKmh)} km/h` : 'Calm'}
            {shown.speedKmh > 0 && (
              <span className="text-sm font-normal text-ink-2">
                {' '}
                from {nf0.format(shown.fromDeg)}° {compassPoint(shown.fromDeg)}
              </span>
            )}
            {shown.gust && <span className="text-sm font-normal text-warning"> · gust</span>}
          </p>
          <p className="mt-0.5 text-xs text-ink-2">
            {current ? 'This hour · ' : ''}
            <span className={source.status === 'failed' ? 'text-warning' : undefined}>
              {source.status === 'failed' ? '▲ ' : source.status === 'live' ? '● ' : ''}
              {sourceTag}
            </span>
            {live && !matchesLive && (
              <>
                {' · '}
                <button
                  type="button"
                  className="underline-offset-2 hover:text-ink hover:underline"
                  onClick={() =>
                    set({
                      fromDeg: Math.round(live.fromDeg),
                      speedKmh: Math.round(live.speedKmh),
                      gustKmh: Math.round(live.gustKmh),
                    })
                  }
                >
                  reset to live
                </button>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-2 space-y-1.5">
        <Slider
          label={`Direction ${nf0.format(settings.fromDeg)}° ${compassPoint(settings.fromDeg)}`}
          value={settings.fromDeg}
          min={0}
          max={359}
          onChange={(v) => set({ fromDeg: v })}
        />
        <Slider
          label={`Speed ${nf0.format(settings.speedKmh)} km/h`}
          value={settings.speedKmh}
          min={0}
          max={80}
          onChange={(v) => set({ speedKmh: v })}
        />
      </div>

      <details className="mt-2 text-xs text-ink-2">
        <summary className="cursor-pointer select-none hover:text-ink">
          Gusts &amp; wind shift
          <span className="tabular text-muted">
            {' '}
            · {settings.gustKmh > settings.speedKmh ? `gusts ${nf0.format(settings.gustKmh)}` : 'no gusts'} ·{' '}
            {settings.shiftDeg === 0 ? 'no shift' : `${settings.shiftDeg > 0 ? '+' : ''}${settings.shiftDeg}° at ${settings.shiftHour}h`}
          </span>
        </summary>
        <div className="mt-1.5 space-y-1.5">
          <Slider
            label={
              settings.gustKmh > settings.speedKmh
                ? `Gusts ${nf0.format(settings.gustKmh)} km/h`
                : `Gusts ${nf0.format(settings.gustKmh)} km/h (not above speed: off)`
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
                : `Wind shift ${nf0.format(Math.abs(settings.shiftDeg))}° ${settings.shiftDeg > 0 ? 'clockwise' : 'anticlockwise'}`
            }
            value={settings.shiftDeg}
            min={-180}
            max={180}
            step={15}
            onChange={(v) => set({ shiftDeg: v })}
          />
          <Slider
            label={`Shift at hour ${settings.shiftHour}`}
            value={settings.shiftHour}
            min={0}
            max={hours}
            disabled={settings.shiftDeg === 0}
            onChange={(v) => set({ shiftHour: v })}
          />
        </div>
      </details>
    </Panel>
  )
}
