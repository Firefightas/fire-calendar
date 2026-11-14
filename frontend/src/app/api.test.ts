import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AreaQuery } from '../types/contracts.ts'

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>

/** A fresh copy of the module (it keeps "backend is down" state), with `fetch` replaced. */
async function apiWith(handler: Handler) {
  vi.resetModules()
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init))),
  )
  return import('./api.ts')
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const QUERY: AreaQuery = {
  region_id: 'rio_negro',
  polygon: { type: 'Polygon', coordinates: [[[-66, -39.5], [-65, -39.5], [-65, -39], [-66, -39.5]]] },
  start: '2000-11',
  end: '2026-11',
}

const HEALTH = { status: 'ok', using_mocks: ['rio_negro'], firms_key_configured: true }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('exportCsv', () => {
  it('returns the server filename and the MOCK DATA provenance header', async () => {
    const api = await apiWith(
      () =>
        new Response('date,time\r\n', {
          headers: {
            'Content-Disposition': 'attachment; filename="hotspots_rio_negro_2000-11_2026-11.csv"',
            'X-Data-Source': 'MOCK DATA',
          },
        }),
    )
    const out = await api.exportCsv('points', QUERY)
    expect(out.filename).toBe('hotspots_rio_negro_2000-11_2026-11.csv')
    expect(out.isMock).toBe(true)
    expect(await out.blob.text()).toBe('date,time\r\n')
  })

  it('is not mock for processed data, and tolerates missing headers', async () => {
    const processed = await apiWith(() => new Response('a\r\n', { headers: { 'X-Data-Source': 'processed' } }))
    expect((await processed.exportCsv('calendar', QUERY)).isMock).toBe(false)
    const bare = await apiWith(() => new Response('a\r\n'))
    expect(await bare.exportCsv('calendar', QUERY)).toMatchObject({ filename: null, isMock: false })
  })

  it('surfaces the backend detail string and status on an error', async () => {
    const api = await apiWith(() => json({ detail: 'polygon must be inside the selected region bbox' }, 422))
    const err: unknown = await api.exportCsv('points', QUERY).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(api.ApiError)
    expect(api.explain(err)).toBe('polygon must be inside the selected region bbox')
  })
})

describe('fallback and wake-up', () => {
  it('serves the bundled copy while the backend is down, then reports the recovery', async () => {
    let backendUp = false
    const api = await apiWith((url) => {
      if (url.includes('/api/')) {
        if (!backendUp) throw new TypeError('Failed to fetch')
        return json(url.endsWith('/api/health') ? HEALTH : { from: 'api' })
      }
      return json({ from: 'bundle' })
    })

    expect(await api.loadCalendar('rio_negro')).toEqual({ data: { from: 'bundle' }, origin: 'static' })

    backendUp = true
    // Still inside the back-off window: the bundle is used without waiting on the backend.
    expect((await api.loadCalendar('rio_negro')).origin).toBe('static')

    expect(await api.waitForBackend()).toEqual({ health: HEALTH, afterFallback: true })
    // A successful health check re-enables backend-first loading at once.
    expect(await api.loadCalendar('rio_negro')).toEqual({ data: { from: 'api' }, origin: 'api' })
  })

  it('reports no fallback when the backend was up from the start', async () => {
    const api = await apiWith((url) => json(url.endsWith('/api/health') ? HEALTH : { from: 'api' }))
    expect((await api.loadRegions()).origin).toBe('api')
    expect(await api.waitForBackend()).toEqual({ health: HEALTH, afterFallback: false })
  })

  it('explains an unreachable backend in plain words', async () => {
    const api = await apiWith(() => {
      throw new TypeError('Failed to fetch')
    })
    const err: unknown = await api.loadAreaCalendar(QUERY).catch((e: unknown) => e)
    expect(api.explain(err)).toBe('the backend is unreachable')
  })
})
