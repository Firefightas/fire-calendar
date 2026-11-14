const WIDTH = 264

/**
 * Fixed-position tooltip anchored to an element's on-screen box. Sits above the anchor and
 * flips below when there is no room. The caller hides it on scroll (the box goes stale).
 */
export function FloatingTip({ anchor, children }: { anchor: DOMRect; children: React.ReactNode }) {
  const center = anchor.left + anchor.width / 2
  const left = Math.min(Math.max(center - WIDTH / 2, 8), window.innerWidth - WIDTH - 8)
  const above = anchor.top > 300
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 rounded-lg border border-hairline bg-raised p-3 shadow-xl shadow-black/50"
      style={{
        width: WIDTH,
        left,
        ...(above ? { bottom: window.innerHeight - anchor.top + 8 } : { top: anchor.bottom + 8 }),
      }}
    >
      {children}
    </div>
  )
}
