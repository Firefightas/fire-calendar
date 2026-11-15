import type { SandboxCell } from '../../../types/contracts.ts'
import { FIRE_COLOURS, LANDCOVER_LEGEND, landcoverLabel } from './palette.ts'
import type { RampLegend } from './palette.ts'

function Swatch({ colour, ring }: { colour: string; ring?: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 rounded-sm"
      style={{ background: colour, boxShadow: ring ? `0 0 0 1.5px ${ring}` : undefined }}
    />
  )
}

/** `ramp` replaces the land-cover swatches when a continuous layer is shown. */
export function Legend({ ramp = null }: { ramp?: RampLegend | null }) {
  const showLandcover = ramp === null
  return (
    <>
      {ramp && (
        <div className="mt-2 text-xs text-ink-2">
          <p>{ramp.title}</p>
          <div className="tabular mt-1 flex items-center gap-2">
            <span>{ramp.low}</span>
            <span
              aria-hidden="true"
              className="h-2.5 w-40 rounded-sm"
              style={{ background: `linear-gradient(to right, ${ramp.stops.join(', ')})` }}
            />
            <span>{ramp.high}</span>
          </div>
          {ramp.note && <p className="mt-1 text-muted">{ramp.note}</p>}
        </div>
      )}
      <LegendItems showLandcover={showLandcover} />
    </>
  )
}

function LegendItems({ showLandcover }: { showLandcover: boolean }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {showLandcover &&
        LANDCOVER_LEGEND.map((item) => (
          <li key={item.code} className="inline-flex items-center gap-1.5">
            <Swatch colour={item.colour} ring={item.code === 50 ? '#ffffff' : item.code === 80 ? '#a9d0ff' : undefined} />
            {item.code === 50 ? `⌂ ${item.label}` : item.label}
          </li>
        ))}
      {!showLandcover && (
        <>
          <li className="inline-flex items-center gap-1.5">
            <Swatch colour="transparent" ring="#ffffff" />⌂ Villages
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Swatch colour="transparent" ring="#a9d0ff" />
            Rivers / water
          </li>
        </>
      )}
      <li className="inline-flex items-center gap-1.5">
        <Swatch colour={FIRE_COLOURS.ignition} ring="#ffffff" />
        Ignition point
      </li>
      <li className="inline-flex items-center gap-1.5">
        <Swatch colour={FIRE_COLOURS.burning} />
        Burning
      </li>
      <li className="inline-flex items-center gap-1.5">
        <Swatch colour={FIRE_COLOURS.burned} ring={FIRE_COLOURS.burnedEdge} />
        Burned
      </li>
    </ul>
  )
}

const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

/** One line describing the hex under the pointer, straight from the grid file. */
export function CellReadout({ cell, classes }: { cell: SandboxCell | null; classes?: Record<string, string> }) {
  return (
    <p className="tabular mt-2 min-h-[1.25rem] text-xs text-ink-2" aria-live="off">
      {cell ? (
        <>
          <span className="font-medium text-ink">{landcoverLabel(cell, classes)}</span> · elevation{' '}
          {nf1.format(cell.elevation_m)} m · slope {nf1.format(cell.slope_deg)}° ·{' '}
          {cell.years_since_last_fire === null
            ? 'no fire on record'
            : `last fire ${nf1.format(cell.years_since_last_fire)} yr ago`}{' '}
          · burn count {nf1.format(cell.burn_count)}
          {!cell.burnable && ' · does not burn'}
        </>
      ) : (
        'Point at a hex to read its land cover, terrain and fire history.'
      )}
    </p>
  )
}
