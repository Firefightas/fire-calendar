import { useEffect, useId, useState } from 'react'
import { FloatingTip } from './FloatingTip.tsx'

/**
 * A small "i" button that shows technical detail on hover or keyboard focus, so cards keep only
 * their headline. The text stays in the DOM for screen readers through aria-describedby.
 */
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const id = useId()

  // The anchor box goes stale when the page scrolls.
  useEffect(() => {
    if (!anchor) return
    const hide = () => setAnchor(null)
    window.addEventListener('scroll', hide, { passive: true, capture: true })
    return () => window.removeEventListener('scroll', hide, { capture: true })
  }, [anchor])

  const show = (e: React.SyntheticEvent<HTMLButtonElement>) => setAnchor(e.currentTarget.getBoundingClientRect())
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        onMouseEnter={show}
        onMouseLeave={() => setAnchor(null)}
        onFocus={show}
        onBlur={() => setAnchor(null)}
        onKeyDown={(e) => e.key === 'Escape' && setAnchor(null)}
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted hover:text-ink focus-visible:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink-2"
      >
        <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="8" cy="5" r="0.9" fill="currentColor" />
          <path d="M8 7.3v4.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      <span id={id} className="sr-only">
        {children}
      </span>
      {anchor && (
        <FloatingTip anchor={anchor}>
          <div className="space-y-1.5 text-xs leading-relaxed text-ink-2">{children}</div>
        </FloatingTip>
      )}
    </>
  )
}
