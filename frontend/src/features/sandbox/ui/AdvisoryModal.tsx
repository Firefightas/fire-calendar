// Draft advisory dialog (protocol step 8). A draft for civil protection, never an official alert.
import { useEffect, useMemo, useState } from 'react'
import { DRAFT_STATUS } from '../advisory/draft.ts'
import type { DraftAdvisory } from '../advisory/draft.ts'
import { Button } from './parts.tsx'

export function AdvisoryModal({ draft, isMock, onClose }: { draft: DraftAdvisory; isMock: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null)
  const jsonText = useMemo(() => JSON.stringify(draft.json, null, 2), [draft])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(`${what} copied.`)
    } catch {
      setCopied('Copy failed: select the text and copy it by hand.')
    }
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([jsonText], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${isMock ? 'MOCK_DATA_' : ''}draft_advisory.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Draft advisory"
        className="my-6 w-full max-w-3xl rounded-lg border border-hairline bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-ink">Draft advisory (RO-ALERT style)</h3>
            <p className="mt-1 rounded-md border border-warning/60 bg-warning/10 px-2 py-1 text-xs font-semibold text-ink">
              {DRAFT_STATUS}. For civil protection review only; an open-source module.
              {isMock && ' MOCK DATA: synthetic terrain and fuel.'}
            </p>
          </div>
          <Button onClick={onClose}>Close</Button>
        </div>

        <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Text</h4>
        <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-page p-3 text-xs text-ink">{draft.text}</pre>

        <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">JSON</h4>
        <pre className="tabular mt-1 max-h-72 overflow-auto rounded-md bg-page p-3 text-xs text-ink-2">{jsonText}</pre>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={() => copy('Text', draft.text)}>Copy text</Button>
          <Button onClick={() => copy('JSON', jsonText)}>Copy JSON</Button>
          <Button onClick={download}>Download JSON</Button>
          {copied && (
            <span role="status" className="text-xs text-ink-2">
              {copied}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
