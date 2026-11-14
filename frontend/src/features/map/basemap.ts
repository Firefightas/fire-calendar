import type { StyleSpecification } from 'maplibre-gl'

/** Free vector basemap, no token (TEAM_PLAN §1). */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'

/** Used when the basemap cannot be reached: region outlines and hex layers still render on it. */
const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#141413' } }],
}

export interface Basemap {
  style: StyleSpecification
  online: boolean
}

export async function loadBasemap(timeoutMs = 6000): Promise<Basemap> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(STYLE_URL, { signal: controller.signal })
    if (!res.ok) throw new Error(String(res.status))
    return { style: (await res.json()) as StyleSpecification, online: true }
  } catch {
    return { style: BLANK_STYLE, online: false }
  } finally {
    clearTimeout(timer)
  }
}
