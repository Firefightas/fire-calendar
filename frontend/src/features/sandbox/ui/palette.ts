// Colours and labels for the hex map. Dark UI; rivers and villages are the brightest marks.
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
