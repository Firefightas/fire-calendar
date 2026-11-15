// Small real-H3 grids for the engine tests.
import { cellToLatLng, gridDiskDistances, latLngToCell } from 'h3-js'
import type { AssetType, SandboxCell } from '../../../types/contracts.ts'

const ASSET: Record<number, AssetType> = { 10: 'forest', 20: 'grassland', 30: 'grassland', 40: 'farm', 50: 'village', 80: 'river' }

export function makeCell(h3: string, landcover: number, extra: Partial<SandboxCell> = {}): SandboxCell {
  const [lat, lon] = cellToLatLng(h3)
  return {
    h3,
    lat,
    lon,
    landcover,
    asset_type: ASSET[landcover] ?? 'none',
    burnable: landcover !== 80 && landcover !== 60,
    elevation_m: 100,
    slope_deg: 0,
    burn_count: 0,
    years_since_last_fire: null,
    ...extra,
  }
}

/**
 * A centre hex (index 0) followed by ring 1 (indices 1–6), ring 2 (7–18), ring 3 (19–36) …,
 * all with the same land cover unless overridden.
 */
export function diskGrid(
  radius: number,
  landcover = 30,
  override: (h3: string, index: number) => Partial<SandboxCell> & { landcover?: number } = () => ({}),
): SandboxCell[] {
  const centre = latLngToCell(45.9, 25.0, 7)
  return gridDiskDistances(centre, radius)
    .flat()
    .map((h3, index) => {
    const o = override(h3, index)
    return makeCell(h3, o.landcover ?? landcover, o)
  })
}
