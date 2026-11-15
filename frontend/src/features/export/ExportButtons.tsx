import { useState } from 'react'
import { explain, exportCsv } from '../../app/api.ts'
import type { AreaQuery, Calendar } from '../../types/contracts.ts'
import { calendarToCsv, downloadBlob, exportFilename, labelMockFile } from './csv.ts'

interface Props {
  /** Region, polygon (drawn area or the region box) and month range to export. */
  query: AreaQuery
  /** The calendar currently on screen. */
  calendar: Calendar
  /** True when `calendar` is the backend's calendar for the drawn polygon. */
  calendarIsArea: boolean
}

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'note'; text: string } | { kind: 'error'; text: string }

const button =
  'inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs text-ink transition-colors hover:border-ink-2/40 hover:bg-raised disabled:opacity-50'

const mockTag = (isMock: boolean) => (isMock ? ' (MOCK DATA)' : '')

export function ExportButtons({ query, calendar, calendarIsArea }: Props) {
  const [points, setPoints] = useState<Status>({ kind: 'idle' })
  const [cal, setCal] = useState<Status>({ kind: 'idle' })
  const { region_id, start, end } = query
  const shownAs = calendarIsArea ? 'drawn-area' : 'whole-region'

  const exportPoints = async () => {
    setPoints({ kind: 'busy' })
    try {
      const { blob, filename, isMock } = await exportCsv('points', query)
      downloadBlob(blob, labelMockFile(filename ?? exportFilename('hotspots', region_id, start, end), isMock))
      setPoints({ kind: 'note', text: `Hotspot CSV downloaded${mockTag(isMock)}.` })
    } catch (err) {
      setPoints({ kind: 'error', text: `Hotspot export is unavailable: ${explain(err)}.` })
    }
  }

  /** The calendar on screen as CSV: same columns as the backend export, exactly the numbers shown. */
  const downloadShown = (why: string) => {
    const blob = new Blob([calendarToCsv(calendar)], { type: 'text/csv;charset=utf-8' })
    const name = exportFilename('calendar', region_id, calendar.first_month, calendar.last_month)
    downloadBlob(blob, labelMockFile(name, calendar.is_mock))
    setCal({ kind: 'note', text: `Calendar CSV${mockTag(calendar.is_mock)}: the ${shownAs} calendar on screen${why}.` })
  }

  const exportCalendar = async () => {
    // The backend export aggregates the polygon it is given. Only a drawn-area calendar came
    // from that same computation; the whole-region calendar is P3's file, so export what is shown.
    if (!calendarIsArea) {
      downloadShown('')
      return
    }
    setCal({ kind: 'busy' })
    try {
      const { blob, filename, isMock } = await exportCsv('calendar', query)
      downloadBlob(blob, labelMockFile(filename ?? exportFilename('calendar', region_id, start, end), isMock))
      setCal({ kind: 'note', text: `Calendar CSV downloaded for the drawn area${mockTag(isMock)}.` })
    } catch (err) {
      downloadShown(`, built in the browser because ${explain(err)}`)
    }
  }

  const notes = [points, cal].filter((s): s is Extract<Status, { text: string }> => 'text' in s)

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={button} disabled={points.kind === 'busy'} onClick={() => void exportPoints()}>
          <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 text-ink-2"><path d="M8 2.5v7.5M4.75 7 8 10.25 11.25 7M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {points.kind === 'busy' ? 'Exporting…' : 'Export hotspots (CSV)'}
        </button>
        <button type="button" className={button} disabled={cal.kind === 'busy'} onClick={() => void exportCalendar()}>
          <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 text-ink-2"><path d="M8 2.5v7.5M4.75 7 8 10.25 11.25 7M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {cal.kind === 'busy' ? 'Exporting…' : 'Export calendar (CSV)'}
        </button>
      </div>
      {notes.map((n) => (
        <p
          key={n.text}
          role={n.kind === 'error' ? 'alert' : 'status'}
          className={`text-xs ${n.kind === 'error' ? 'text-serious' : 'text-ink-2'}`}
        >
          {n.text}
        </p>
      ))}
    </div>
  )
}
