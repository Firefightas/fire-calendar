import { describe, expect, it } from 'vitest'
import type { Calendar, CalendarMonth } from '../../types/contracts.ts'
import {
  annualTotals,
  anomalyBand,
  buildGrid,
  colorDomain,
  firstViirsMonth,
  isMonthInProgress,
  peakAnomaly,
  quantile,
  seasonalProfile,
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

describe('seasonalProfile', () => {
  /** Calendar over `years` where `perMonth[m - 1]` is both the harmonized value and the median of month m. */
  const calendarOf = (perMonth: number[], years: [number, number], extra: CalendarMonth[] = []): Calendar => {
    const months: CalendarMonth[] = []
    for (let y = years[0]; y <= years[1]; y++) {
      for (let m = 1; m <= 12; m++) months.push(month(y, m, { harmonized: perMonth[m - 1], median_m: perMonth[m - 1], iqr_m: m }))
    }
    months.push(...extra)
    const last = months.at(-1)!
    return {
      region_id: 'rio_negro',
      unit: 'active_fire_cell_days',
      scale: 'SNPP_VIIRS_EQ',
      is_mock: false,
      generated_at: '2026-11-15T00:00:00+00:00',
      first_month: `${years[0]}-01`,
      last_month: `${last.year}-${String(last.month).padStart(2, '0')}`,
      baseline_years: [2001, 2002],
      months,
    }
  }
  const southern = [90, 60, 10, 5, 5, 5, 5, 5, 5, 10, 20, 80]
  const northern = [1, 1, 1, 2, 4, 10, 40, 60, 50, 20, 3, 1]

  it('finds a window that wraps over the year end', () => {
    const p = seasonalProfile(calendarOf(southern, [2001, 2002]))!
    expect(p.windowMonths).toEqual([12, 1, 2])
    expect(p.windowLabel).toBe('Dec–Feb')
    expect(p.windowShare).toBeCloseTo(230 / 300)
    expect(p.peakMonth.month).toBe(1)
    expect(p.peakMonth.median_m).toBe(90)
    expect(p.peakMonth.iqr_m).toBe(1)
    expect(p.peakMonth.share).toBeCloseTo(0.3)
    expect(p.rankedByMedian).toBe(true)
  })

  it('finds a mid-year window and the month after the record ends', () => {
    const p = seasonalProfile(calendarOf(northern, [2001, 2002]))!
    expect(p.windowLabel).toBe('Jul–Sep')
    expect(p.nextMonth.month).toBe(1)
    expect(p.nextMonth.entersCriticalWindow).toBe(false)
    expect(p.months.reduce((s, m) => s + m.share, 0)).toBeCloseTo(1)
  })

  it('flags an upcoming month inside the window and ignores a month-to-date newest row', () => {
    // The record ends in a partial Nov 2003 whose median is month-to-date (7, not the full-month 20).
    const partial = Array.from({ length: 11 }, (_, i) =>
      month(2003, i + 1, { harmonized: 999, median_m: i === 10 ? 7 : southern[i], iqr_m: i === 10 ? 99 : i + 1 }),
    )
    const p = seasonalProfile(calendarOf(southern, [2001, 2002], partial))!
    expect(p.nextMonth.month).toBe(12)
    expect(p.nextMonth.median_m).toBe(80)
    expect(p.nextMonth.entersCriticalWindow).toBe(true)
    const nov = p.months.find((m) => m.month === 11)!
    expect(nov.median_m).toBe(20)
    expect(nov.iqr_m).toBe(11)
    // 2003 is outside the baseline years, so its 999s change no share.
    expect(p.windowShare).toBeCloseTo(230 / 300)
  })

  it('uses the newest row when it is the only row of its month', () => {
    const cal = calendarOf(northern, [2001, 2001])
    const p = seasonalProfile(cal)!
    expect(p.months.find((m) => m.month === 12)!.median_m).toBe(1)
  })

  it('orders the 12 months by the start month', () => {
    const p = seasonalProfile(calendarOf(southern, [2001, 2002]), 7)!
    expect(p.months.map((m) => m.month)).toEqual([7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6])
    expect(p.windowMonths).toEqual([12, 1, 2])
  })

  it('falls back to baseline totals when every median is 0', () => {
    const cal = calendarOf([0, 0, 0, 0, 0, 0, 0, 3, 5, 0, 0, 0], [2001, 2002])
    for (const m of cal.months) m.median_m = 0
    const p = seasonalProfile(cal)!
    expect(p.rankedByMedian).toBe(false)
    expect(p.windowMonths).toEqual([7, 8, 9])
    expect(p.windowShare).toBe(1)
    expect(p.peakMonth.month).toBe(9)
  })

  it('returns null when there is no burning in the baseline years, or no months', () => {
    expect(seasonalProfile(calendarOf(new Array(12).fill(0), [2001, 2002]))).toBeNull()
    expect(seasonalProfile({ ...calendarOf(northern, [2001, 2002]), months: [] })).toBeNull()
  })
})
