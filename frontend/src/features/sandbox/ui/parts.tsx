import type { ReactNode } from 'react'

export function Panel({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-lg border border-hairline bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function Button({
  children,
  onClick,
  disabled,
  primary,
  pressed,
  title,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  pressed?: boolean
  title?: string
}) {
  const tone = primary
    ? 'border-transparent bg-series-harmonized text-white hover:brightness-110'
    : pressed
      ? 'border-series-harmonized bg-series-harmonized/20 text-ink'
      : 'border-hairline text-ink hover:bg-raised'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      title={title}
      className={`rounded-md border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${tone}`}
    >
      {children}
    </button>
  )
}
