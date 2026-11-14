// Data loading for the whole app (owner: P5). Contract: contracts/api.md.
// Every whole-region read tries the backend first and falls back to the static JSON
// bundled in public/data/ (TEAM_PLAN §1), so the demo works with the backend down.
import type {
  AreaQuery,
  Calendar,
  Calibration,
  NrtHotspotProps,
  RegionId,
  RegionsFile,
  SandboxGrid,
} from '../types/contracts.ts'

export const API_URL: string = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/+$/, '')

/** Where a payload came from: the live backend, or the JSON bundled with the frontend. */
export type DataOrigin = 'api' | 'static'

export interface Loaded<T> {
  data: T
  origin: DataOrigin
}

export class ApiError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** A short reason for the UI: why a backend-only feature is not available right now. */
export function explain(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === null) return 'the backend is unreachable'
    if (err.status === 501) return 'this endpoint is not implemented in the backend yet'
    return err.message
  }
  return err instanceof Error ? err.message : String(err)
}

/** Reads that have a bundled copy give up quickly, so the page paints from the fallback. */
const FAST_TIMEOUT_MS = 4000
/**
 * Backend-only calls wait much longer: the hosted backend sleeps when idle and takes up to
 * about a minute to wake, and a 7-day live overlay is several upstream requests.
 */
const SLOW_TIMEOUT_MS = 90_000
const RETRY_API_AFTER_MS = 30_000
/** After a network failure, skip the backend for a while so the UI doesn't wait on every read. */
let apiDownUntil = 0
/** True once any whole-region read was served from the bundled copy. */
let servedFallback = false

async function request(path: string, init?: RequestInit, timeoutMs: number = FAST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal })
  } catch {
    apiDownUntil = Date.now() + RETRY_API_AFTER_MS
    throw new ApiError(`Backend unreachable at ${API_URL}`, null)
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body: unknown = await res.json()
      if (body && typeof body === 'object' && 'detail' in body) detail = String(body.detail)
    } catch {
      // non-JSON error body: keep the status text
    }
    throw new ApiError(detail, res.status)
  }
  return res
}

const postJson = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

async function staticJson<T>(path: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${path}`)
  if (!res.ok) throw new ApiError(`Static fallback data/${path} is missing`, res.status)
  return (await res.json()) as T
}

async function withFallback<T>(apiPath: string, staticPath: string): Promise<Loaded<T>> {
  if (Date.now() >= apiDownUntil) {
    try {
      const res = await request(apiPath)
      return { data: (await res.json()) as T, origin: 'api' }
    } catch {
      // fall through to the bundled copy
    }
  }
  const data = await staticJson<T>(staticPath)
  servedFallback = true
  return { data, origin: 'static' }
}

/** `GET /api/health` (contracts/api.md). */
export interface Health {
  status: string
  using_mocks: string[]
  firms_key_configured: boolean
}

export interface BackendUp {
  health: Health
  /** True when the page had already fallen back to bundled data before the backend answered. */
  afterFallback: boolean
}

/**
 * Waits for the backend to answer, however long a cold start takes. Resolving re-enables
 * backend-first loading, so callers can reload what they took from the bundle.
 */
export async function waitForBackend(): Promise<BackendUp> {
  const res = await request('/api/health', undefined, SLOW_TIMEOUT_MS)
  const health = (await res.json()) as Health
  apiDownUntil = 0
  return { health, afterFallback: servedFallback }
}

export const loadRegions = () => withFallback<RegionsFile>('/api/regions', 'regions.json')

export const loadCalendar = (id: RegionId) =>
  withFallback<Calendar>(`/api/regions/${id}/calendar`, `${id}/calendar.json`)

export const loadCalibration = (id: RegionId) =>
  withFallback<Calibration>(`/api/regions/${id}/calibration`, `${id}/calibration.json`)

export const loadSandboxGrid = (id: RegionId) =>
  withFallback<SandboxGrid>(`/api/regions/${id}/sandbox-grid`, `${id}/sandbox_grid.json`)

/** Calendar for a drawn polygon. Backend only: there is no static fallback for arbitrary areas. */
export async function loadAreaCalendar(query: AreaQuery): Promise<Calendar> {
  const res = await request('/api/calendar', postJson(query), SLOW_TIMEOUT_MS)
  return (await res.json()) as Calendar
}

export type NrtCollection = GeoJSON.FeatureCollection<GeoJSON.Point, NrtHotspotProps>

/** Live hotspots (NOAA-20/21 + MODIS NRT). Backend only: it holds the FIRMS key. */
export async function loadNrt(
  area: { region_id: RegionId } | { bbox: [number, number, number, number] },
  days: number,
): Promise<NrtCollection> {
  const where = 'region_id' in area ? `region_id=${area.region_id}` : `bbox=${area.bbox.join(',')}`
  const res = await request(`/api/nrt?${where}&days=${days}`, undefined, SLOW_TIMEOUT_MS)
  return (await res.json()) as NrtCollection
}

export interface CsvDownload {
  blob: Blob
  /** The server's filename, if it sent one. */
  filename: string | null
  /** True when the backend marks the rows as mock/sample data (`X-Data-Source: MOCK DATA`). */
  isMock: boolean
}

/** POST an export endpoint and hand back the CSV blob with its filename and provenance. */
export async function exportCsv(kind: 'points' | 'calendar', query: AreaQuery): Promise<CsvDownload> {
  const res = await request(`/api/export/${kind}`, postJson(query), SLOW_TIMEOUT_MS)
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const match = /filename="?([^";]+)"?/.exec(disposition)
  const isMock = (res.headers.get('X-Data-Source') ?? '').trim().toUpperCase() === 'MOCK DATA'
  return { blob: await res.blob(), filename: match ? match[1] : null, isMock }
}
