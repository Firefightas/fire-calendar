// A small ⓘ that shows its text on hover or keyboard focus. Replaces paragraphs of help text.
import { useId } from 'react'
import type { ReactNode } from 'react'

export function InfoTip({
  children,
  label = 'More information',
  align = 'right',
}: {
  children: ReactNode
  /** Accessible name of the ⓘ button. */
  label?: string
  /** Which edge of the ⓘ the popover lines up with. */
  align?: 'left' | 'right'
}) {
  const id = useId()
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[12px] leading-none text-muted hover:text-ink focus-visible:text-ink"
      >
        ⓘ
      </button>
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute top-full z-30 mt-1 hidden w-64 max-w-[80vw] rounded-md border border-hairline bg-raised p-2 text-left text-xs font-normal leading-snug text-ink-2 shadow-lg group-focus-within:block group-hover:block ${
          align === 'right' ? 'right-0' : 'left-0'
        }`}
      >
        {children}
      </span>
    </span>
  )
}

/** A small rounded label: `2u`, `6h`, `×3`. */
export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' }) {
  return (
    <span
      className={`tabular inline-flex items-center rounded-full px-1.5 py-px text-[11px] leading-4 ${
        tone === 'accent' ? 'bg-series-harmonized/25 text-ink' : 'bg-page text-ink-2'
      }`}
    >
      {children}
    </span>
  )
}
