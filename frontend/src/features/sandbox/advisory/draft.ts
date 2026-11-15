// Protocol step 8: draft civil-protection advisory (RO-ALERT style). Pure TS.
// It is a DRAFT for civil protection review, built from simulation runs: never an official alert.
import { SANDBOX_BANNER } from '../../../types/contracts.ts'
import type { SandboxCell } from '../../../types/contracts.ts'
import type { EnsembleOutput, RunOutput } from '../engine/service.ts'
import { NEVER } from '../engine/simulate.ts'
import type { Placement } from '../engine/tools.ts'
import type { WindHour, WindSettings, WindVector } from '../engine/wind.ts'
import { compassPoint } from '../weather/openMeteo.ts'
import type { ExitSummary } from './exitRoute.ts'

export const DRAFT_STATUS = 'DRAFT ADVISORY — NOT AN OFFICIAL ALERT'

interface LatLon {
  lat: number
  lon: number
}

/**
 * Bearing (degrees, 0 = north) to move away from a fire: perpendicular to the wind, on the
 * side that leads away from the fire. In calm air: straight away from the fire.
 */
export function evacuationBearing(place: LatLon, fire: LatLon, wind: WindVector): number {
  const kx = Math.cos((place.lat * Math.PI) / 180)
  const awayEast = (place.lon - fire.lon) * kx
  const awayNorth = place.lat - fire.lat
  let east = awayEast
  let north = awayNorth
  if (Math.hypot(wind.east, wind.north) > 1e-6) {
    // The two directions across the wind; take the one that points away from the fire.
    east = -wind.north
    north = wind.east
    if (east * awayEast + north * awayNorth < 0) {
      east = -east
      north = -north
    }
  }
  if (east === 0 && north === 0) return 0
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360
}

export interface ThreatenedVillage {
  h3: string
  lat: number
  lon: number
  /** Simulated runs (of `runs_total`) in which fire reached this village hex. */
  runs_reached: number
  runs_total: number
  /** Earliest and latest simulated arrival hour across those runs. */
  earliest_arrival_hour: number
  latest_arrival_hour: number
  /** Arrival hour in the run shown on the map, or null if it did not burn in that run. */
  arrival_hour_shown_run: number | null
  evacuation_bearing_deg: number
  evacuation_direction: string
}

export interface AdvisoryInput {
  regionId: string
  isMock: boolean
  cells: SandboxCell[]
  planTitle: string
  plan: Placement[]
  run: RunOutput
  ensemble: EnsembleOutput
  exit: ExitSummary
  seed: number
  hours: number
  ignitions: number[]
  wind: WindSettings
  schedule: WindHour[]
  generatedAt: string
}

export interface DraftAdvisory {
  json: Record<string, unknown>
  text: string
}

export function draftAdvisory(input: AdvisoryInput): DraftAdvisory {
  const { cells, run, ensemble, wind, schedule, ignitions, exit } = input
  const runs = ensemble.seeds.length
  const fireCells = ignitions.map((i) => cells[i])
  const fire: LatLon =
    fireCells.length > 0
      ? {
          lat: fireCells.reduce((s, c) => s + c.lat, 0) / fireCells.length,
          lon: fireCells.reduce((s, c) => s + c.lon, 0) / fireCells.length,
        }
      : { lat: 0, lon: 0 }

  const villages: ThreatenedVillage[] = []
  cells.forEach((cell, i) => {
    if (cell.asset_type !== 'village') return
    const reached = Math.round(ensemble.burnProbability[i] * runs)
    const shown = run.result.ignitedAt[i]
    if (reached === 0 && shown === NEVER) return
    const earliest = reached > 0 ? ensemble.earliestIgnition[i] : shown
    const latest = reached > 0 ? ensemble.latestIgnition[i] : shown
    // Wind at the earliest simulated arrival decides which way is across the wind.
    const at = schedule.length > 0 ? schedule[Math.min(Math.max(earliest, 0), schedule.length - 1)] : { east: 0, north: 0 }
    const bearing = evacuationBearing(cell, fire, at)
    villages.push({
      h3: cell.h3,
      lat: cell.lat,
      lon: cell.lon,
      runs_reached: reached,
      runs_total: runs,
      earliest_arrival_hour: earliest,
      latest_arrival_hour: latest,
      arrival_hour_shown_run: shown === NEVER ? null : shown,
      evacuation_bearing_deg: Math.round(bearing),
      evacuation_direction: compassPoint(bearing),
    })
  })
  villages.sort((a, b) => a.earliest_arrival_hour - b.earliest_arrival_hour || b.runs_reached - a.runs_reached)

  const blocked = exit.crews.filter((c) => c.status !== 'clear')
  const json: Record<string, unknown> = {
    kind: 'draft_advisory',
    status: DRAFT_STATUS,
    style: 'RO-ALERT-style draft for civil protection review (open-source module)',
    disclaimer: SANDBOX_BANNER,
    is_mock_data: input.isMock,
    generated_at: input.generatedAt,
    region_id: input.regionId,
    scenario: {
      plan: input.planTitle,
      resources_deployed: input.plan.length,
      horizon_hours: input.hours,
      seed_shown: input.seed,
      seeds: ensemble.seeds,
      ignition_hexes: ignitions.map((i) => cells[i].h3),
      wind: {
        from_deg: wind.fromDeg,
        speed_kmh: wind.speedKmh,
        gust_kmh: wind.gustKmh,
        shift_deg: wind.shiftDeg,
        shift_hour: wind.shiftDeg === 0 ? null : wind.shiftHour,
      },
    },
    threatened_villages: villages,
    crew_exit_routes: {
      crews: exit.total,
      clear: exit.clear,
      not_clear: blocked.map((c) => ({ h3: cells[c.cell].h3, resource: c.kind, status: c.status, leave_hour: c.leaveHour })),
    },
  }

  const fmt = (v: number) => v.toFixed(3)
  const lines: string[] = [
    DRAFT_STATUS,
    'RO-ALERT-style draft for civil protection review. Based on an illustrative simulation, not an operational forecast.',
  ]
  if (input.isMock) lines.push('MOCK DATA: the terrain and fuel grid behind this draft is synthetic.')
  lines.push(
    '',
    `Region: ${input.regionId}. Plan: ${input.planTitle} (${input.plan.length} resources). Horizon: ${input.hours} h. Seeds ${ensemble.seeds[0]}–${ensemble.seeds[runs - 1]}.`,
    wind.speedKmh > 0
      ? `Wind: ${wind.speedKmh} km/h from ${wind.fromDeg}° (${compassPoint(wind.fromDeg)})` +
          (wind.gustKmh > wind.speedKmh ? `, gusts ${wind.gustKmh} km/h` : '') +
          (wind.shiftDeg !== 0
            ? `, turning ${Math.abs(wind.shiftDeg)}° ${wind.shiftDeg > 0 ? 'clockwise' : 'anticlockwise'} at hour ${wind.shiftHour}.`
            : '.')
      : 'Wind: calm.',
    '',
  )
  if (villages.length === 0) {
    lines.push(`No village hex was reached by fire in any of the ${runs} simulated runs of this plan.`)
  } else {
    lines.push(`Wildfire scenario: ${villages.length} village ${villages.length === 1 ? 'hex' : 'hexes'} reached by fire in at least one simulated run.`)
    villages.forEach((v, k) => {
      const window =
        v.earliest_arrival_hour === v.latest_arrival_hour
          ? `around hour ${v.earliest_arrival_hour}`
          : `between hour ${v.earliest_arrival_hour} and hour ${v.latest_arrival_hour}`
      lines.push(
        `${k + 1}. Village hex ${v.h3} (${fmt(v.lat)}, ${fmt(v.lon)}): reached in ${v.runs_reached} of ${v.runs_total} runs, simulated arrival ${window}. ` +
          `Suggested evacuation direction: ${v.evacuation_direction} (${v.evacuation_bearing_deg}°), across the wind and away from the fire.`,
      )
    })
  }
  lines.push(
    '',
    exit.total === 0
      ? 'Crew exit routes: no ground crews in this plan.'
      : `Crew exit routes (run with seed ${input.seed}): ${exit.clear} of ${exit.total} clear` +
          (blocked.length > 0
            ? `; not clear at ${blocked.map((c) => `${cells[c.cell].h3} (${c.status === 'overrun' ? 'overrun' : 'cut off'})`).join(', ')}.`
            : '.'),
    '',
    `Source: Tactical Containment Sandbox. ${SANDBOX_BANNER}`,
  )
  return { json, text: lines.join('\n') }
}
