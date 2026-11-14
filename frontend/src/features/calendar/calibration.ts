// Pure logic for the calibration panel (no React). Everything comes from contracts `Calibration`.
import { scaleLinear } from 'd3-scale'
import type { Calibration } from '../../types/contracts.ts'

export interface FactorRow {
  month: number
  factor: number
  cv: number
  nYears: number
  /** True when the pooled factor was used because that month had too few usable years. */
  fallback: boolean
  /** factor × (1 − cv), floored at 0. */
  low: number
  /** factor × (1 + cv). */
  high: number
}

/** The 12 monthly MODIS → S-NPP factors in month order, with a ±1 CV range. */
export function monthlyRows(c: Calibration): FactorRow[] {
  return [...c.monthly_factors]
    .sort((a, b) => a.month - b.month)
    .map((f) => ({
      month: f.month,
      factor: f.factor,
      cv: f.cv,
      nYears: f.n_years,
      fallback: f.fallback === true,
      low: Math.max(0, f.factor * (1 - f.cv)),
      high: f.factor * (1 + f.cv),
    }))
}

export interface FactorAxis {
  min: number
  max: number
  ticks: number[]
  /** Position of a value on the axis, 0 (bottom) to 1 (top). */
  position: (v: number) => number
}

/** A rounded axis that covers every range and always includes ×1 ("no conversion"). */
export function factorAxis(rows: FactorRow[]): FactorAxis {
  const lo = Math.min(1, ...rows.map((r) => r.low))
  const hi = Math.max(1, ...rows.map((r) => r.high))
  const scale = scaleLinear().domain([lo, hi]).nice(5)
  const [min, max] = scale.domain()
  return { min, max, ticks: scale.ticks(5), position: (v) => (max === min ? 0 : (v - min) / (max - min)) }
}

/** The months with the smallest and largest factor. */
export function factorExtremes(rows: FactorRow[]): { smallest: FactorRow; largest: FactorRow } | null {
  if (rows.length === 0) return null
  let smallest = rows[0]
  let largest = rows[0]
  for (const r of rows) {
    if (r.factor < smallest.factor) smallest = r
    if (r.factor > largest.factor) largest = r
  }
  return { smallest, largest }
}

export interface ChainFactor {
  key: 'terra_only_factor' | 'noaa20_factor' | 'noaa21_factor'
  title: string
  /** What the factor converts, in words. */
  meaning: string
  value: number
  /** false = no overlap data, the value is a neutral placeholder; null = the file does not say. */
  measured: boolean | null
  /** ["YYYY-MM", "YYYY-MM"] the factor was fitted on, when the file says. */
  window: [string, string] | null
}

const CHAIN: { key: ChainFactor['key']; diag: string; title: string; meaning: string }[] = [
  {
    key: 'terra_only_factor',
    diag: 'terra_only',
    title: 'Terra-only era',
    meaning: 'Terra-only MODIS cell-days × this = Terra + Aqua equivalent. Applied before Aqua joined in mid-2002.',
  },
  {
    key: 'noaa20_factor',
    diag: 'noaa20',
    title: 'NOAA-20 VIIRS',
    meaning: 'NOAA-20 cell-days × this = S-NPP equivalent. Carries the record on once the S-NPP data ends.',
  },
  {
    key: 'noaa21_factor',
    diag: 'noaa21',
    title: 'NOAA-21 VIIRS',
    meaning: 'NOAA-21 cell-days × this = S-NPP equivalent.',
  },
]

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

function asWindow(v: unknown): [string, string] | null {
  return Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'string') ? [v[0], v[1]] : null
}

/**
 * The three single factors of the chain. `diagnostics` is free-form in the contract, so its
 * `measured` flags and `fit_windows` are read only if present and well-formed.
 */
export function chainFactors(c: Calibration): ChainFactor[] {
  const diagnostics = asRecord(c.diagnostics)
  const windows = asRecord(diagnostics?.fit_windows)
  return CHAIN.map(({ key, diag, title, meaning }) => {
    const measured = asRecord(diagnostics?.[diag])?.measured
    return {
      key,
      title,
      meaning,
      value: c[key],
      measured: typeof measured === 'boolean' ? measured : null,
      window: asWindow(windows?.[key]),
    }
  })
}

/**
 * Last month ("YYYY-MM") for which S-NPP itself is the reference, when `diagnostics` says so
 * (`snpp_reference_until`). After it, NOAA-20 × `noaa20_factor` supplies the value.
 */
export function snppReferenceUntil(c: Calibration): string | null {
  const v = asRecord(c.diagnostics)?.snpp_reference_until
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null
}

/**
 * The 2012 step of MODIS alone over the same years as `raw_step_ratio`, when `diagnostics`
 * records it (`modis_only_step_ratio`): how much fire activity itself changed, sensor held fixed.
 */
export function modisOnlyStepRatio(c: Calibration): number | null {
  const v = asRecord(c.diagnostics)?.modis_only_step_ratio
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}
