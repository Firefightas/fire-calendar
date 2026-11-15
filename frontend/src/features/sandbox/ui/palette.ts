// Colours and labels for the hex map. Dark UI; rivers and villages are the brightest marks.
import { interpolateCividis, interpolateInferno, interpolateViridis } from 'd3-scale-chromatic'
import type { SandboxCell } from '../../../types/contracts.ts'
import type { ToolKind } from '../engine/tools.ts'

/** ESA WorldCover code → fill colour. */
const LANDCOVER_COLOUR: Record<number, string> = {
  10: '#2a6e45', // tree cover
  20: '#7d8f45', // shrubland
  30: '#b9bd68', // grassland
  40: '#cf9c4c', // cropland (farms)
  50: '#f4f1ea', // built-up (villages)
  60: '#5d5952', // bare
  80: '#3987e5', // permanent water (rivers)
  90: '#3f9c98', // wetland
}
const OTHER_COLOUR = '#45433f'

export const LANDCOVER_LEGEND: { code: number; label: string; colour: string }[] = [
  { code: 10, label: 'Forest', colour: LANDCOVER_COLOUR[10] },
  { code: 20, label: 'Shrubland', colour: LANDCOVER_COLOUR[20] },
  { code: 30, label: 'Grassland', colour: LANDCOVER_COLOUR[30] },
  { code: 40, label: 'Farms (cropland)', colour: LANDCOVER_COLOUR[40] },
  { code: 50, label: 'Villages (built-up)', colour: LANDCOVER_COLOUR[50] },
  { code: 80, label: 'Rivers / water (never burns)', colour: LANDCOVER_COLOUR[80] },
  { code: 60, label: 'Bare ground (never burns)', colour: LANDCOVER_COLOUR[60] },
]

export const landcoverColour = (code: number): string => LANDCOVER_COLOUR[code] ?? OTHER_COLOUR

export const landcoverColours = (cells: SandboxCell[]): string[] => cells.map((c) => landcoverColour(c.landcover))

export function landcoverLabel(cell: SandboxCell, classes?: Record<string, string>): string {
  switch (cell.landcover) {
    case 10:
      return 'Forest'
    case 20:
      return 'Shrubland'
    case 30:
      return 'Grassland'
    case 40:
      return 'Farm (cropland)'
    case 50:
      return 'Village (built-up)'
    case 60:
      return 'Bare ground'
    case 80:
      return 'River / water'
    default:
      return classes?.[String(cell.landcover)] ?? `Land cover ${cell.landcover}`
  }
}

export const FIRE_COLOURS = {
  burning: '#ff5a1f',
  burningCore: '#ffd23a',
  burned: '#1c1512',
  burnedEdge: '#7a2e1c',
  ignition: '#ff2d2d',
}

/** How each intervention is marked on the map and in the palette. */
export const TOOL_MARK: Record<ToolKind, { glyph: string; colour: string; emoji: string }> = {
  water: { glyph: 'W', colour: '#7cc8ff', emoji: '💧' },
  clearing: { glyph: 'C', colour: '#f3d36b', emoji: '🪓' },
  trench: { glyph: 'T', colour: '#d7b08a', emoji: '🚜' },
  backfire: { glyph: 'B', colour: '#ff9f6b', emoji: '🔥' },
}

/** Map layers: land cover, plus the layers of protocol steps 2 (terrain) and 3 (fuel). */
export type MapLayer = 'landcover' | 'fuel' | 'history' | 'elevation' | 'slope'

export const MAP_LAYERS: { key: MapLayer; label: string }[] = [
  { key: 'landcover', label: 'Land cover' },
  { key: 'fuel', label: 'Fuel' },
  { key: 'history', label: 'Burn history' },
  { key: 'elevation', label: 'Elevation' },
  { key: 'slope', label: 'Slope' },
]

export interface RampLegend {
  title: string
  low: string
  high: string
  /** Colours from low to high, for a CSS gradient. */
  stops: string[]
  note?: string
}

export interface LayerView {
  colours: string[]
  /** Null for the land-cover layer, which has a categorical legend. */
  legend: RampLegend | null
}

const NO_FUEL = '#2b2a28'
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const stops = (ramp: (t: number) => string): string[] => [0, 0.25, 0.5, 0.75, 1].map(ramp)

function rampView(
  values: number[],
  ramp: (t: number) => string,
  legend: (min: number, max: number) => Omit<RampLegend, 'stops'>,
  fixedMin?: number,
): LayerView {
  let min = fixedMin ?? Infinity
  let max = -Infinity
  for (const v of values) {
    if (fixedMin === undefined) min = Math.min(min, v)
    max = Math.max(max, v)
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0
    max = 1
  }
  const span = max - min || 1
  return { colours: values.map((v) => ramp((v - min) / span)), legend: { ...legend(min, max), stops: stops(ramp) } }
}

/**
 * Fill colours and legend for a layer. `fuel` is the engine's fuel factor per cell
 * (base flammability × fuel age), so the layer shows exactly what the simulation uses.
 */
export function layerView(layer: MapLayer, cells: SandboxCell[], fuel: Float32Array): LayerView {
  if (layer === 'fuel') {
    const view = rampView(
      Array.from(fuel),
      interpolateViridis,
      (_min, max) => ({
        title: 'Fuel factor used by the simulation (land-cover flammability × years since last fire)',
        low: '0',
        high: nf.format(max),
        note: 'Dark grey: does not burn. Recent burns are low, long-unburned forest is high.',
      }),
      0,
    )
    cells.forEach((c, i) => {
      if (fuel[i] <= 0) view.colours[i] = c.landcover === 80 ? landcoverColour(80) : NO_FUEL
    })
    return view
  }
  if (layer === 'history') {
    const view = rampView(
      cells.map((c) => c.burn_count),
      interpolateInferno,
      (_min, max) => ({
        title: 'Burn history: burn_count per hex from the harmonized fire record (grid file)',
        low: '0',
        high: nf.format(max),
        note: 'Water keeps its colour. Recently burned hexes carry less fuel in the simulation.',
      }),
      0,
    )
    cells.forEach((c, i) => {
      if (c.landcover === 80) view.colours[i] = landcoverColour(80)
    })
    return view
  }
  if (layer === 'elevation') {
    return rampView(
      cells.map((c) => c.elevation_m),
      interpolateCividis,
      (min, max) => ({
        title: 'Elevation',
        low: `${nf.format(min)} m`,
        high: `${nf.format(max)} m`,
        note: 'Fire spreads faster uphill; the simulation uses the height difference between neighbouring hexes.',
      }),
    )
  }
  if (layer === 'slope') {
    return rampView(
      cells.map((c) => c.slope_deg),
      interpolateCividis,
      (min, max) => ({
        title: 'Slope (per-hex summary from the grid file)',
        low: `${nf.format(min)}°`,
        high: `${nf.format(max)}°`,
      }),
    )
  }
  return { colours: landcoverColours(cells), legend: null }
}
