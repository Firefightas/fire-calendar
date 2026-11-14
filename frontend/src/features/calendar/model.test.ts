import { describe, expect, it } from 'vitest'
import type { CalendarMonth } from '../../types/contracts.ts'
import {
  annualTotals,
  anomalyBand,
  buildGrid,
  colorDomain,
  firstViirsMonth,
  isMonthInProgress,
  peakAnomaly,
  quantile,
  sharedMax,
  valueOf,
} from './model.ts'

function month(year: number, m: number, over: Partial<CalendarMonth> = {}): CalendarMonth {
  return {
    year,
    month: m,
    modis_raw: 10,
    viirs_raw: null,
    harmonized: 40,
    is_estimated: true,
    is_nrt: false,
    median_m: 30,
    iqr_m: 10,
    anomaly_z: 1,
    unc_low: 30,
    unc_high: 50,
    source: 'modis_terra_aqua',
    ...over,
  }
}

const fullYear = (year: number, over: Partial<CalendarMonth> = {}) =>
  Array.from({ length: 12 }, (_, i) => month(year, i + 1, over))

describe('valueOf', () => {
  it('shows the harmonized value in harmonized mode', () => {
    expect(valueOf(month(2005, 3), 'harmonized')).toBe(40)
  })
  it('raw mode is the naive switch: VIIRS when present, else MODIS, never their sum', () => {
    expect(valueOf(month(2005, 3), 'raw')).toBe(10)
    expect(valueOf(month(2015, 3, { viirs_raw: 44 }), 'raw')).toBe(44)
    expect(valueOf(month(2030, 3, { modis_raw: null, viirs_raw: null }), 'raw')).toBeNull()
  })
})

describe('sharedMax', () => {
  it('covers both modes so the toggle does not rescale colors', () => {
    expect(sharedMax([month(2005, 1, { harmonized: 40 }), month(2015, 1, { viirs_raw: 90, harmonized: 60 })])).toBe(90)
  })
})

describe('buildGrid', () => {
  const months = [month(2000, 11), month(2000, 12), ...fullYear(2001), month(2002, 1)]

  it('lays out calendar years with gaps where the record has no month', () => {
    const grid = buildGrid(months, 1)
    expect(grid.columns).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(grid.rows.map((r) => r.label)).toEqual(['2000', '2001', '2002'])
    expect(grid.rows[0].cells.slice(0, 10).every((c) => c === null)).toBe(true)
    expect(grid.rows[0].cells[10]?.month).toBe(11)
    expect(grid.rows[2].cells[0]?.year).toBe(2002)
  })

  it('lays out July→June seasons', () => {
    const grid = buildGrid(months, 7)
    expect(grid.columns[0]).toBe(7)
    expect(grid.rows.map((r) => r.label)).toEqual(['2000/01', '2001/02'])
    // Nov 2000 is the 5th column of the 2000/01 season; Jan 2002 the 7th of 2001/02.
    expect(grid.rows[0].cells[4]).toMatchObject({ year: 2000, month: 11 })
    expect(grid.rows[1].cells[6]).toMatchObject({ year: 2002, month: 1 })
  })
})

describe('annualTotals', () => {
  it('skips partial years and sums the naive raw series', () => {
    const months = [
      month(2000, 12),
      ...fullYear(2011),
      ...fullYear(2013, { viirs_raw: 50, harmonized: 50, is_estimated: false }),
      month(2026, 1),
    ]
    expect(annualTotals(months)).toEqual([
      { year: 2011, harmonized: 480, raw: 120 },
      { year: 2013, harmonized: 600, raw: 600 },
    ])
  })
  it('reports a null raw total when a month has no raw value', () => {
    const year = fullYear(2014)
    year[3] = month(2014, 4, { modis_raw: null })
    expect(annualTotals(year)[0].raw).toBeNull()
  })
})

describe('anomaly helpers', () => {
  it('finds the first VIIRS month and the peak anomaly', () => {
    const months = [month(2011, 12), month(2012, 1), month(2012, 2, { viirs_raw: 5, anomaly_z: 3.2 })]
    expect(firstViirsMonth(months)).toMatchObject({ year: 2012, month: 2 })
    expect(peakAnomaly(months)).toMatchObject({ year: 2012, month: 2 })
    expect(firstViirsMonth([month(2005, 1)])).toBeNull()
  })
  it('bands the score symmetrically', () => {
    expect([2, 0.7, 0, -0.7, -2].map(anomalyBand)).toEqual(['well_above', 'above', 'near', 'below', 'well_below'])
  })
  it('flags only the calendar month we are in', () => {
    const now = new Date(Date.UTC(2026, 10, 14))
    expect(isMonthInProgress({ year: 2026, month: 11 }, now)).toBe(true)
    expect(isMonthInProgress({ year: 2026, month: 10 }, now)).toBe(false)
  })
})

describe('quantile', () => {
  it('interpolates between ranks and ignores input order', () => {
    expect(quantile([40, 10, 30, 20], 0.5)).toBe(25)
    expect(quantile([10, 20, 30, 40], 0)).toBe(10)
    expect(quantile([10, 20, 30, 40], 1)).toBe(40)
    expect(quantile([], 0.98)).toBe(0)
  })
})

describe('colorDomain', () => {
  const ordinary = Array.from({ length: 100 }, (_, i) => month(2013 + Math.floor(i / 12), (i % 12) + 1, { viirs_raw: 100 + i, harmonized: 100 + i }))

  it('uses the full range when no month is far above the rest', () => {
    expect(colorDomain(ordinary)).toEqual({ top: 199, max: 199, capped: false })
  })

  it('stops at the 98th percentile when one month dwarfs the others', () => {
    const withOutlier = [...ordinary, month(2001, 1, { modis_raw: 2402, harmonized: 11490 })]
    const d = colorDomain(withOutlier)
    expect(d.capped).toBe(true)
    expect(d.max).toBe(11490)
    // The raw MODIS count of the outlier month (2,402) is above the cap too; ordinary months are not.
    expect(d.top).toBeGreaterThan(190)
    expect(d.top).toBeLessThan(2402)
  })

  it('counts raw and harmonized values together, so both modes share one scale', () => {
    const d = colorDomain([month(2005, 1, { modis_raw: 40, harmonized: 60 }), month(2015, 1, { viirs_raw: 90, harmonized: 90 })])
    expect(d).toEqual({ top: 90, max: 90, capped: false })
  })

  it('copes with an empty or all-zero calendar', () => {
    expect(colorDomain([])).toEqual({ top: 0, max: 0, capped: false })
    expect(colorDomain([month(2020, 1, { viirs_raw: 0, harmonized: 0 })])).toEqual({ top: 0, max: 0, capped: false })
  })
})
