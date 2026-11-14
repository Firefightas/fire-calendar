import { describe, expect, it } from 'vitest'
import type { Calendar, CalendarMonth, Calibration } from '../../types/contracts.ts'
import { fmtDay, lastMonthProgress, progressNote, progressOf } from './model.ts'

const month = (year: number, m: number): CalendarMonth => ({
  year,
  month: m,
  modis_raw: 10,
  viirs_raw: 40,
  harmonized: 40,
  is_estimated: false,
  is_nrt: true,
  median_m: 30,
  iqr_m: 10,
  anomaly_z: 1,
  unc_low: 30,
  unc_high: 50,
  source: 'viirs_noaa20',
})

const calendar: Calendar = {
  region_id: 'rio_negro',
  unit: 'active_fire_cell_days',
  scale: 'SNPP_VIIRS_EQ',
  is_mock: false,
  generated_at: '2026-11-14T00:00:00+00:00',
  first_month: '2026-10',
  last_month: '2026-11',
  baseline_years: [2001, 2025],
  months: [month(2026, 10), month(2026, 11)],
}

const calibration = (diagnostics?: Record<string, unknown>, region_id = 'rio_negro'): Calibration => ({
  region_id,
  is_mock: false,
  generated_at: '2026-11-14T00:00:00+00:00',
  method: 'overlap median ratio per calendar month',
  target_scale: 'SNPP_VIIRS_EQ',
  fit_years: [2012, 2020],
  test_years: [2021, 2025],
  test_mae: 5,
  terra_only_factor: 1.8,
  noaa20_factor: 1.03,
  noaa21_factor: 1.01,
  monthly_factors: [],
  ...(diagnostics ? { diagnostics } : {}),
})

const MID_NOV = new Date(Date.UTC(2026, 10, 14))
const DECEMBER = new Date(Date.UTC(2026, 11, 20))

describe('lastMonthProgress', () => {
  it('reports month-to-date when the file says the last month is incomplete', () => {
    const c = calibration({ last_month_complete: false, last_data_date: '2026-11-13' })
    expect(lastMonthProgress(calendar, c, false, MID_NOV)).toEqual({ kind: 'month_to_date', through: '2026-11-13' })
    // The file wins over the clock: still month-to-date when viewed a month later.
    expect(lastMonthProgress(calendar, c, false, DECEMBER)).toEqual({ kind: 'month_to_date', through: '2026-11-13' })
  })

  it('drops a date that is missing, malformed or outside the last month', () => {
    for (const last_data_date of [undefined, 20261113, '2026-10-31']) {
      const c = calibration({ last_month_complete: false, last_data_date })
      expect(lastMonthProgress(calendar, c, false, MID_NOV)).toEqual({ kind: 'month_to_date', through: null })
    }
  })

  it('trusts the file when it says the month is complete, whatever the clock says', () => {
    const c = calibration({ last_month_complete: true, last_data_date: '2026-11-30' })
    expect(lastMonthProgress(calendar, c, false, MID_NOV)).toEqual({ kind: 'complete' })
  })

  it('falls back to the clock when the file does not say', () => {
    for (const c of [null, calibration(), calibration({ note: 'mock values' }), calibration({ last_month_complete: 'no' })]) {
      expect(lastMonthProgress(calendar, c, false, MID_NOV)).toEqual({ kind: 'in_progress' })
      expect(lastMonthProgress(calendar, c, false, DECEMBER)).toEqual({ kind: 'complete' })
    }
  })

  it('does not apply regional diagnostics to a drawn area or to another region', () => {
    const c = calibration({ last_month_complete: false, last_data_date: '2026-11-13' })
    expect(lastMonthProgress(calendar, c, true, MID_NOV)).toEqual({ kind: 'in_progress' })
    const other = calibration({ last_month_complete: false, last_data_date: '2026-11-13' }, 'romania')
    expect(lastMonthProgress(calendar, other, false, DECEMBER)).toEqual({ kind: 'complete' })
  })

  it('is complete for an empty calendar', () => {
    expect(lastMonthProgress({ ...calendar, months: [] }, null, false, MID_NOV)).toEqual({ kind: 'complete' })
  })
})

describe('progressOf', () => {
  it('applies the status to the newest month only', () => {
    const last = { kind: 'month_to_date', through: '2026-11-13' } as const
    expect(progressOf(calendar.months[1], calendar, last)).toBe(last)
    expect(progressOf(calendar.months[0], calendar, last)).toEqual({ kind: 'complete' })
  })
})

describe('progress wording', () => {
  it('formats ISO days and leaves anything else alone', () => {
    expect(fmtDay('2026-11-03')).toBe('3 Nov 2026')
    expect(fmtDay('2026-13-03')).toBe('2026-13-03')
    expect(fmtDay('yesterday')).toBe('yesterday')
  })

  it('says how a month-to-date row was scored, and nothing about scoring otherwise', () => {
    expect(progressNote({ kind: 'month_to_date', through: '2026-11-13' })).toBe(
      'Month to date, through 13 Nov 2026: median, IQR and score use the same days in the baseline years',
    )
    expect(progressNote({ kind: 'month_to_date', through: null })).toMatch(/^Month to date: median/)
    expect(progressNote({ kind: 'in_progress' })).toBe('Month in progress: count still accumulating')
    expect(progressNote({ kind: 'complete' })).toBeNull()
  })
})
