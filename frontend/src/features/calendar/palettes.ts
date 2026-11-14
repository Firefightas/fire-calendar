import { scaleSequentialSqrt } from 'd3-scale'
import { interpolateCividis, interpolateInferno, interpolateViridis } from 'd3-scale-chromatic'

export type PaletteId = 'cividis' | 'viridis' | 'inferno'

/** Colorblind-safe, perceptually ordered ramps. Cividis is the default (TEAM_PLAN §1). */
export const PALETTES: Record<PaletteId, { label: string; interpolate: (t: number) => string }> = {
  cividis: { label: 'Cividis', interpolate: interpolateCividis },
  viridis: { label: 'Viridis', interpolate: interpolateViridis },
  inferno: { label: 'Inferno', interpolate: interpolateInferno },
}

export const PALETTE_IDS = Object.keys(PALETTES) as PaletteId[]

/**
 * Square-root color scale from 0 to `max`. Fire counts are heavy-tailed: a linear scale
 * would leave every ordinary month in the bottom few shades.
 */
export function colorScale(palette: PaletteId, max: number): (v: number) => string {
  const scale = scaleSequentialSqrt(PALETTES[palette].interpolate).domain([0, Math.max(max, 1)]).clamp(true)
  return (v) => scale(v)
}

/** CSS gradient that matches `colorScale` when laid out linearly in value. */
export function legendGradient(palette: PaletteId, stops = 24): string {
  const { interpolate } = PALETTES[palette]
  const parts = Array.from({ length: stops + 1 }, (_, i) => {
    const frac = i / stops
    return `${interpolate(Math.sqrt(frac))} ${(frac * 100).toFixed(1)}%`
  })
  return `linear-gradient(to right, ${parts.join(', ')})`
}

/** Relative luminance (0..1) of a "#rrggbb" or "rgb(r, g, b)" string, to pick marker ink. */
export function luminance(color: string): number {
  let r = 0
  let g = 0
  let b = 0
  if (color.startsWith('#')) {
    r = parseInt(color.slice(1, 3), 16)
    g = parseInt(color.slice(3, 5), 16)
    b = parseInt(color.slice(5, 7), 16)
  } else {
    const nums = color.match(/[\d.]+/g)
    if (nums && nums.length >= 3) [r, g, b] = nums.slice(0, 3).map(Number)
  }
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Near-black on light fills, white on dark fills. */
export const inkOn = (fill: string): string => (luminance(fill) > 0.35 ? '#0b0b0b' : '#ffffff')
