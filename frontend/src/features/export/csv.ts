import type { Calendar, CalendarMonth } from '../../types/contracts.ts'

/** Column order of `months[]` in contracts/calendar.schema.json (same as POST /api/export/calendar). */
export const CALENDAR_COLUMNS = [
  'year',
  'month',
  'modis_raw',
  'viirs_raw',
  'harmonized',
  'is_estimated',
  'is_nrt',
  'median_m',
  'iqr_m',
  'anomaly_z',
  'unc_low',
  'unc_high',
  'source',
] as const satisfies readonly (keyof CalendarMonth)[]

function cell(v: string | number | boolean | null): string {
  if (v === null) return ''
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

/** The loaded calendar as CSV, one row per month. Used when the backend export is unavailable. */
export function calendarToCsv(calendar: Calendar): string {
  const lines = [CALENDAR_COLUMNS.join(',')]
  for (const m of calendar.months) {
    lines.push(CALENDAR_COLUMNS.map((c) => cell(m[c])).join(','))
  }
  return `${lines.join('\r\n')}\r\n`
}

/** Filenames from contracts/api.md: `<kind>_<region>_<start>_<end>.csv`. */
export function exportFilename(kind: 'hotspots' | 'calendar', regionId: string, start: string, end: string): string {
  return `${kind}_${regionId}_${start}_${end}.csv`
}

/** Mock exports carry the label in the file name too, so a saved file cannot pass for results. */
export const labelMockFile = (filename: string, isMock: boolean): string =>
  isMock && !filename.startsWith('MOCK_DATA_') ? `MOCK_DATA_${filename}` : filename

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
