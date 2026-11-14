// Pure calendar logic (no React). Everything shown in the calendar UI is derived here
// from a contracts `Calendar`; nothing is hardcoded.
import { rawValue } from '../../types/contracts.ts'
import type { Calendar, CalendarMonth, CalendarSource } from '../../types/contracts.ts'

export type Mode = 'harmonized' | 'raw'

export const MODE_LABEL: Record<Mode, string> = {
  raw: 'Raw Unharmonized',
  harmonized: 'Harmonized (S-NPP Equivalent)',
}

export const UNIT_LABEL = 'active fire cell-days'

export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

export const SOURCE_LABEL: Record<CalendarSource, string> = {
  modis_terra: 'MODIS Terra only (converted)',
  modis_terra_aqua: 'MODIS Terra + Aqua (converted)',
  viirs_snpp: 'VIIRS S-NPP (reference)',
  viirs_noaa20: 'VIIRS NOAA-20 (cross-calibrated)',
  viirs_noaa21: 'VIIRS NOAA-21 (cross-calibrated)',
}

/** The number a cell shows in the given mode. Raw = naive satellite switch (VIIRS if present, else MODIS). */
export const valueOf = (m: CalendarMonth, mode: Mode): number | null =>
  mode === 'harmonized' ? m.harmonized : rawValue(m)

export const monthKey = (m: { year: number; month: number }): string =>
  `${m.year}-${String(m.month).padStart(2, '0')}`

export const monthTitle = (m: { year: number; month: number }): string =>
  `${MONTH_NAMES[m.month - 1]} ${m.year}`

/**
 * One color domain for both modes, so flipping the toggle never rescales the colors:
 * a cell that changes color changed value.
 */
export function sharedMax(months: CalendarMonth[]): number {
  let max = 0
  for (const m of months) {
    max = Math.max(max, m.harmonized, rawValue(m) ?? 0)
  }
  return max
}

/** True when two calendars carry the same values for the same months (e.g. an area query that was not aggregated). */
export function sameSeries(a: Calendar, b: Calendar): boolean {
  if (a.months.length !== b.months.length) return false
  return a.months.every((m, i) => {
    const o = b.months[i]
    return (
      m.year === o.year &&
      m.month === o.month &&
      m.harmonized === o.harmonized &&
      m.modis_raw === o.modis_raw &&
      m.viirs_raw === o.viirs_raw
    )
  })
}

export interface GridRow {
  /** Row label: "2015", or "2015/16" when rows are July→June fire seasons. */
  label: string
  /** 12 slots in column order; null where the record has no month. */
  cells: (CalendarMonth | null)[]
}

export interface Grid {
  /** Month numbers (1..12) in column order. */
  columns: number[]
  rows: GridRow[]
}

/** Rows = years (or seasons starting in `startMonth`), columns = months. */
export function buildGrid(months: CalendarMonth[], startMonth: 1 | 7 = 1): Grid {
  const columns = Array.from({ length: 12 }, (_, i) => ((startMonth - 1 + i) % 12) + 1)
  const byRow = new Map<number, (CalendarMonth | null)[]>()
  for (const m of months) {
    const rowYear = m.month >= startMonth ? m.year : m.year - 1
    let cells = byRow.get(rowYear)
    if (!cells) {
      cells = Array.from({ length: 12 }, () => null)
      byRow.set(rowYear, cells)
    }
    cells[(m.month - startMonth + 12) % 12] = m
  }
  const rows = [...byRow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, cells]) => ({
      label: startMonth === 1 ? String(year) : `${year}/${String((year + 1) % 100).padStart(2, '0')}`,
      cells,
    }))
  return { columns, rows }
}

/** First month where the raw series switches from MODIS to VIIRS (the source of the jump). */
export function firstViirsMonth(months: CalendarMonth[]): CalendarMonth | null {
  return months.find((m) => m.viirs_raw !== null) ?? null
}

export interface AnnualPoint {
  year: number
  harmonized: number
  /** null when any month of the year has no raw value. */
  raw: number | null
}

/**
 * Annual totals for years with all 12 months in the record. Partial years (the first and
 * the current one) are left out rather than shown as artificial dips.
 * The raw total sums the naive switch series month by month; it never adds MODIS and VIIRS
 * for the same month.
 */
export function annualTotals(months: CalendarMonth[]): AnnualPoint[] {
  const byYear = new Map<number, CalendarMonth[]>()
  for (const m of months) {
    const list = byYear.get(m.year)
    if (list) list.push(m)
    else byYear.set(m.year, [m])
  }
  const out: AnnualPoint[] = []
  for (const [year, list] of [...byYear.entries()].sort(([a], [b]) => a - b)) {
    if (new Set(list.map((m) => m.month)).size !== 12) continue
    const raws = list.map(rawValue)
    out.push({
      year,
      harmonized: list.reduce((s, m) => s + m.harmonized, 0),
      raw: raws.some((v) => v === null) ? null : raws.reduce<number>((s, v) => s + (v ?? 0), 0),
    })
  }
  return out
}

export type AnomalyBand = 'well_below' | 'below' | 'near' | 'above' | 'well_above'

/** Display bands for the IQR Anomaly Score. Presentation thresholds only; the score itself comes from the data. */
export function anomalyBand(z: number): AnomalyBand {
  if (z >= 1.5) return 'well_above'
  if (z >= 0.5) return 'above'
  if (z <= -1.5) return 'well_below'
  if (z <= -0.5) return 'below'
  return 'near'
}

export const ANOMALY_BAND_LABEL: Record<AnomalyBand, string> = {
  well_above: 'Well above the monthly median',
  above: 'Above the monthly median',
  near: 'Near the monthly median',
  below: 'Below the monthly median',
  well_below: 'Well below the monthly median',
}

export const latestMonth = (cal: Calendar): CalendarMonth | null => cal.months.at(-1) ?? null

/** The month with the highest IQR Anomaly Score in the record. */
export function peakAnomaly(months: CalendarMonth[]): CalendarMonth | null {
  let best: CalendarMonth | null = null
  for (const m of months) {
    if (!best || m.anomaly_z > best.anomaly_z) best = m
  }
  return best
}

/** True when `m` is the calendar month we are currently in, so its count is still accumulating. */
export function isMonthInProgress(m: { year: number; month: number }, now: Date = new Date()): boolean {
  return m.year === now.getUTCFullYear() && m.month === now.getUTCMonth() + 1
}

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Cell-day counts: one decimal below 100 (harmonized values are fractional), none above. */
export function fmtCount(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return Math.abs(v) >= 100 ? nf0.format(v) : nf1.format(v)
}

/** Whole numbers for axis and legend ticks. */
export const fmtInt = (v: number): string => nf0.format(v)

export const fmtSigned = (v: number): string => `${v > 0 ? '+' : v < 0 ? '−' : ''}${nf2.format(Math.abs(v))}`
export const fmtFactor = (v: number): string => `×${nf2.format(v)}`
