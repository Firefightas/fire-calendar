// Wind for the spread formula. ŵ points where the wind blows TO; its length is the speed
// relative to a reference speed, so a stronger wind pushes harder (see DECISIONS.md).
import { hash01 } from './rng.ts'

export interface WindVector {
  east: number
  north: number
}

/** Wind speed at which |ŵ| = 1. */
export const WIND_REFERENCE_KMH = 30
/** |ŵ| is capped here so a storm cannot make every downwind edge certain. */
export const WIND_MAX_MAGNITUDE = 2

/** `fromDeg` is the meteorological direction (where the wind comes from, 0 = north, 90 = east). */
export function windVector(fromDeg: number, speedKmh: number): WindVector {
  const to = ((fromDeg + 180) * Math.PI) / 180
  const magnitude = Math.min(Math.max(speedKmh, 0) / WIND_REFERENCE_KMH, WIND_MAX_MAGNITUDE)
  return { east: Math.sin(to) * magnitude, north: Math.cos(to) * magnitude }
}

export interface WindSettings {
  /** Direction the wind comes from, degrees. */
  fromDeg: number
  speedKmh: number
  /** Gust speed, km/h. Gusts replace the mean speed in some hours. 0 = no gusts. */
  gustKmh: number
  /** Wind-shift: the direction turns by this many degrees (clockwise) ... */
  shiftDeg: number
  /** ... from this hour on. */
  shiftHour: number
}

/** Share of hours that blow at gust speed. */
export const GUST_HOUR_SHARE = 0.3

export interface WindHour extends WindVector {
  fromDeg: number
  speedKmh: number
  gust: boolean
}

/** One wind vector per simulated hour. Gust hours are drawn from the seed, so they repeat. */
export function windSchedule(settings: WindSettings, hours: number, seed: number): WindHour[] {
  const out: WindHour[] = []
  for (let h = 0; h < hours; h++) {
    const fromDeg = (((settings.fromDeg + (h >= settings.shiftHour ? settings.shiftDeg : 0)) % 360) + 360) % 360
    const gust = settings.gustKmh > settings.speedKmh && hash01(seed, h, -7, -11) < GUST_HOUR_SHARE
    const speedKmh = gust ? settings.gustKmh : settings.speedKmh
    out.push({ ...windVector(fromDeg, speedKmh), fromDeg, speedKmh, gust })
  }
  return out
}
