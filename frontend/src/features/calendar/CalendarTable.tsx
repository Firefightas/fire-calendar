import { ANOMALY_LABEL } from '../../types/contracts.ts'
import type { Calendar } from '../../types/contracts.ts'
import { SOURCE_LABEL, fmtCount, fmtSigned, monthKey, monthTitle } from './model.ts'

/** Table twin of the heatmap: every value readable without color or hover. */
export function CalendarTable({ calendar }: { calendar: Calendar }) {
  return (
    <details className="mt-4 border-t border-hairline pt-3 text-xs">
      <summary className="cursor-pointer text-ink-2 hover:text-ink">Table view ({calendar.months.length} months)</summary>
      <div className="mt-2 max-h-80 overflow-auto rounded-md border border-hairline">
        <table className="tabular w-full border-collapse text-right">
          <thead className="sticky top-0 bg-raised text-muted">
            <tr>
              <th scope="col" className="px-2 py-1.5 text-left font-medium">Month</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Raw MODIS</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Raw VIIRS</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Harmonized</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Range</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Median</th>
              <th scope="col" className="px-2 py-1.5 font-medium">{ANOMALY_LABEL}</th>
              <th scope="col" className="px-2 py-1.5 text-left font-medium">Source</th>
              <th scope="col" className="px-2 py-1.5 text-left font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {calendar.months.map((m) => (
              <tr key={monthKey(m)} className="border-t border-grid">
                <th scope="row" className="px-2 py-1 text-left font-normal text-ink-2">{monthTitle(m)}</th>
                <td className="px-2 py-1">{fmtCount(m.modis_raw)}</td>
                <td className="px-2 py-1">{fmtCount(m.viirs_raw)}</td>
                <td className="px-2 py-1 text-ink">{fmtCount(m.harmonized)}</td>
                <td className="px-2 py-1 text-ink-2">
                  {fmtCount(m.unc_low)} – {fmtCount(m.unc_high)}
                </td>
                <td className="px-2 py-1">{fmtCount(m.median_m)}</td>
                <td className="px-2 py-1">{fmtSigned(m.anomaly_z)}</td>
                <td className="px-2 py-1 text-left text-ink-2">{SOURCE_LABEL[m.source]}</td>
                <td className="px-2 py-1 text-left text-ink-2">
                  {[m.is_estimated && 'estimated', m.is_nrt && 'NRT'].filter(Boolean).join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
