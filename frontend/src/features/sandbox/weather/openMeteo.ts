// Current wind from the Open-Meteo forecast API (no key), called from the browser.

export interface LiveWind {
  /** Direction the wind comes from, degrees (0 = north, 90 = east). */
  fromDeg: number
  speedKmh: number
  gustKmh: number
  /** Observation time as Open-Meteo reports it (ISO, UTC). */
  time: string
  lat: number
  lon: number
}

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const TIMEOUT_MS = 8000

/** Reads the `current` block of an Open-Meteo response. Throws if a wind field is missing. */
export function parseCurrentWind(body: unknown, lat: number, lon: number): LiveWind {
  const current = (body as { current?: Record<string, unknown> } | null)?.current
  const speedKmh = Number(current?.wind_speed_10m)
  const fromDeg = Number(current?.wind_direction_10m)
  const gust = Number(current?.wind_gusts_10m)
  if (!current || !Number.isFinite(speedKmh) || !Number.isFinite(fromDeg)) {
    throw new Error('Open-Meteo answered without current wind values')
  }
  return {
    fromDeg: ((fromDeg % 360) + 360) % 360,
    speedKmh: Math.max(0, speedKmh),
    gustKmh: Number.isFinite(gust) ? Math.max(0, gust) : 0,
    time: typeof current.time === 'string' ? current.time : '',
    lat,
    lon,
  }
}

export async function fetchCurrentWind(lat: number, lon: number): Promise<LiveWind> {
  const url =
    `${ENDPOINT}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    '&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kmh&timezone=UTC'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`)
    return parseCurrentWind(await res.json(), lat, lon)
  } finally {
    clearTimeout(timer)
  }
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

/** 16-point compass name of a bearing in degrees. */
export const compassPoint = (deg: number): string => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]

/** Centre of the drawn area if there is one, else of the grid cells. Returns [lat, lon]. */
export function scenarioCentre(
  area: GeoJSON.Polygon | null,
  cells: readonly { lat: number; lon: number }[],
): [number, number] {
  const ring = area?.coordinates[0]
  if (ring && ring.length > 1) {
    // A closed ring repeats its first vertex: leave the repeat out of the mean.
    const pts = ring.slice(0, -1)
    return [pts.reduce((s, p) => s + p[1], 0) / pts.length, pts.reduce((s, p) => s + p[0], 0) / pts.length]
  }
  if (cells.length === 0) return [0, 0]
  return [cells.reduce((s, c) => s + c.lat, 0) / cells.length, cells.reduce((s, c) => s + c.lon, 0) / cells.length]
}
