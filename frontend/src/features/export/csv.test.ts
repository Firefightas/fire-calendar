import { describe, expect, it } from 'vitest'
import type { Calendar } from '../../types/contracts.ts'
import { CALENDAR_COLUMNS, calendarToCsv, exportFilename, labelMockFile } from './csv.ts'

const calendar: Calendar = {
  region_id: 'rio_negro',
  unit: 'active_fire_cell_days',
  scale: 'SNPP_VIIRS_EQ',
  is_mock: true,
  generated_at: '2026-11-14T00:00:00+00:00',
  first_month: '2011-12',
  last_month: '2012-02',
  baseline_years: [2001, 2025],
  months: [
    {
      year: 2011,
      month: 12,
      modis_raw: 14.3,
      viirs_raw: null,
      harmonized: 81.3,
      is_estimated: true,
      is_nrt: false,
      median_m: 112.5,
      iqr_m: 55.1,
      anomaly_z: -0.57,
      unc_low: 57.1,
      unc_high: 105.5,
      source: 'modis_terra_aqua',
    },
    {
      year: 2012,
      month: 2,
      modis_raw: 20,
      viirs_raw: 70,
      harmonized: 70,
      is_estimated: false,
      is_nrt: false,
      median_m: 60,
      iqr_m: 10,
      anomaly_z: 1,
      unc_low: 55,
      unc_high: 85,
      source: 'viirs_snpp',
    },
  ],
}

describe('calendarToCsv', () => {
  it('writes the contract columns, one row per month, with empty cells for null', () => {
    const lines = calendarToCsv(calendar).trimEnd().split('\r\n')
    expect(lines[0]).toBe(CALENDAR_COLUMNS.join(','))
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe('2011,12,14.3,,81.3,true,false,112.5,55.1,-0.57,57.1,105.5,modis_terra_aqua')
    expect(lines[2]).toBe('2012,2,20,70,70,false,false,60,10,1,55,85,viirs_snpp')
  })
})

describe('exportFilename', () => {
  it('follows contracts/api.md', () => {
    expect(exportFilename('calendar', 'rio_negro', '2001-01', '2026-11')).toBe('calendar_rio_negro_2001-01_2026-11.csv')
    expect(exportFilename('hotspots', 'romania', '2001-01', '2026-11')).toBe('hotspots_romania_2001-01_2026-11.csv')
  })
})

describe('labelMockFile', () => {
  it('prefixes mock exports once and leaves real ones alone', () => {
    expect(labelMockFile('hotspots_rio_negro_2000-11_2026-11.csv', true)).toBe(
      'MOCK_DATA_hotspots_rio_negro_2000-11_2026-11.csv',
    )
    expect(labelMockFile('MOCK_DATA_calendar.csv', true)).toBe('MOCK_DATA_calendar.csv')
    expect(labelMockFile('calendar_romania_2000-11_2026-11.csv', false)).toBe('calendar_romania_2000-11_2026-11.csv')
  })
})
