import { useState } from 'react'
import { explain, exportCsv } from '../../app/api.ts'
import type { AreaQuery, Calendar } from '../../types/contracts.ts'
import { calendarToCsv, downloadBlob, exportFilename } from './csv.ts'

interface Props {
  /** Region, polygon (drawn area or the region box) and month range to export. */
  query: AreaQuery
  /** The calendar currently on screen: the fallback source for the calendar CSV. */
  calendar: Calendar
  /** True when `calendar` is for the drawn polygon rather than the whole region. */
  calendarIsArea: boolean
}

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'note'; text: string } | { kind: 'error'; text: string }

const button =
  'rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-raised disabled:opacity-50'

export function ExportButtons({ query, calendar, calendarIsArea }: Props) {
  const [points, setPoints] = useState<Status>({ kind: 'idle' })
  const [cal, setCal] = useState<Status>({ kind: 'idle' })
  const { region_id, start, end } = query

  const exportPoints = async () => {
    setPoints({ kind: 'busy' })
    try {
      const { blob, filename } = await exportCsv('points', query)
      downloadBlob(blob, filename ?? exportFilename('hotspots', region_id, start, end))
      setPoints({ kind: 'note', text: 'Hotspot CSV downloaded.' })
    } catch (err) {
      setPoints({ kind: 'error', text: `Hotspot export is unavailable: ${explain(err)}.` })
    }
  }

  const exportCalendar = async () => {
    setCal({ kind: 'busy' })
    try {
      const { blob, filename } = await exportCsv('calendar', query)
      downloadBlob(blob, filename ?? exportFilename('calendar', region_id, start, end))
      setCal({ kind: 'note', text: 'Calendar CSV downloaded.' })
    } catch (err) {
      // Same rows and columns as the backend export, built from the calendar already on screen.
      const blob = new Blob([calendarToCsv(calendar)], { type: 'text/csv;charset=utf-8' })
      downloadBlob(blob, exportFilename('calendar', region_id, calendar.first_month, calendar.last_month))
      setCal({
        kind: 'note',
        text: `Calendar CSV built in the browser from the ${calendarIsArea ? 'drawn-area' : 'whole-region'} calendar on screen, because ${explain(err)}.`,
      })
    }
  }

  const notes = [points, cal].filter((s): s is Extract<Status, { text: string }> => 'text' in s)

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={points.kind === 'busy'} onClick={() => void exportPoints()}>
          {points.kind === 'busy' ? 'Exporting…' : 'Export hotspots (CSV)'}
        </button>
        <button type="button" className={button} disabled={cal.kind === 'busy'} onClick={() => void exportCalendar()}>
          {cal.kind === 'busy' ? 'Exporting…' : 'Export calendar (CSV)'}
        </button>
      </div>
      {notes.map((n) => (
        <p
          key={n.text}
          role={n.kind === 'error' ? 'alert' : 'status'}
          className={`text-[11px] ${n.kind === 'error' ? 'text-serious' : 'text-ink-2'}`}
        >
          {n.text}
        </p>
      ))}
    </div>
  )
}
