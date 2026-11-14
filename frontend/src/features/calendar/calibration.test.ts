import { describe, expect, it } from 'vitest'
import type { Calibration } from '../../types/contracts.ts'
import { chainFactors, factorAxis, factorExtremes, monthlyRows } from './calibration.ts'

function calibration(over: Partial<Calibration> = {}): Calibration {
  return {
    region_id: 'rio_negro',
    is_mock: true,
    generated_at: '2026-11-14T00:00:00+00:00',
    method: 'overlap median ratio per calendar month',
    target_scale: 'SNPP_VIIRS_EQ',
    fit_years: [2012, 2020],
    test_years: [2021, 2025],
    test_mae: 5,
    terra_only_factor: 1.8,
    noaa20_factor: 1.03,
    noaa21_factor: 1,
    // Deliberately out of order, with one fallback month.
    monthly_factors: Array.from({ length: 12 }, (_, i) => {
      const month = 12 - i
      return { month, factor: 2 + month / 4, cv: 0.1, n_years: 9, ...(month === 6 ? { fallback: true } : {}) }
    }),
    ...over,
  }
}

describe('monthlyRows', () => {
  it('sorts by month and derives the ±1 CV range', () => {
    const rows = monthlyRows(calibration())
    expect(rows.map((r) => r.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(rows[3]).toMatchObject({ month: 4, factor: 3, cv: 0.1, nYears: 9, fallback: false })
    expect(rows[3].low).toBeCloseTo(2.7)
    expect(rows[3].high).toBeCloseTo(3.3)
    expect(rows[5].fallback).toBe(true)
  })

  it('never lets the low end go below zero', () => {
    const c = calibration()
    c.monthly_factors[0].cv = 1.4
    expect(monthlyRows(c).every((r) => r.low >= 0)).toBe(true)
  })
})

describe('factorAxis', () => {
  it('covers every range, includes ×1 and maps values to 0..1', () => {
    const rows = monthlyRows(calibration())
    const axis = factorAxis(rows)
    expect(axis.min).toBeLessThanOrEqual(1)
    expect(axis.max).toBeGreaterThanOrEqual(Math.max(...rows.map((r) => r.high)))
    expect(axis.ticks).toContain(1)
    expect(axis.position(axis.min)).toBe(0)
    expect(axis.position(axis.max)).toBe(1)
    expect(axis.position(rows[0].factor)).toBeGreaterThan(axis.position(1))
  })

  it('extends below ×1 when a factor range does', () => {
    const c = calibration()
    c.monthly_factors = c.monthly_factors.map((f) => ({ ...f, factor: 0.8 }))
    expect(factorAxis(monthlyRows(c)).min).toBeLessThanOrEqual(0.72)
  })
})

describe('factorExtremes', () => {
  it('finds the smallest and largest monthly factor', () => {
    const e = factorExtremes(monthlyRows(calibration()))
    expect(e?.smallest.month).toBe(1)
    expect(e?.largest.month).toBe(12)
    expect(factorExtremes([])).toBeNull()
  })
})

describe('chainFactors', () => {
  it('reads the three factors and says nothing about measurement when the file does not', () => {
    const chain = chainFactors(calibration({ diagnostics: { note: 'mock values' } }))
    expect(chain.map((c) => [c.key, c.value])).toEqual([
      ['terra_only_factor', 1.8],
      ['noaa20_factor', 1.03],
      ['noaa21_factor', 1],
    ])
    expect(chain.every((c) => c.measured === null && c.window === null)).toBe(true)
  })

  it('picks up measured flags and fit windows from diagnostics when present', () => {
    const chain = chainFactors(
      calibration({
        diagnostics: {
          noaa20: { factor: 1.03, measured: true },
          noaa21: { factor: 1.0, measured: false },
          fit_windows: { noaa20_factor: ['2018-04', '2020-12'], noaa21_factor: 'bad shape' },
        },
      }),
    )
    expect(chain[0]).toMatchObject({ measured: null, window: null })
    expect(chain[1]).toMatchObject({ measured: true, window: ['2018-04', '2020-12'] })
    expect(chain[2]).toMatchObject({ measured: false, window: null })
  })

  it('tolerates missing or malformed diagnostics', () => {
    expect(chainFactors(calibration()).every((c) => c.measured === null)).toBe(true)
    const odd = calibration({ diagnostics: { noaa20: 'n/a', fit_windows: [1, 2] } as Record<string, unknown> })
    expect(chainFactors(odd).every((c) => c.measured === null && c.window === null)).toBe(true)
  })
})
