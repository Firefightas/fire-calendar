// Protocol steps 5–6: the attack plan. Pick what a map click does and watch the budget.
import { BUDGET_UNITS, TOOL_KINDS, TOOLS } from '../engine/tools.ts'
import type { ToolKind } from '../engine/tools.ts'
import { TOOL_MARK } from './palette.ts'
import { Button, Panel } from './parts.tsx'

/** What a click on the map does. */
export type ClickMode = 'ignite' | ToolKind

interface Props {
  mode: ClickMode
  onMode: (mode: ClickMode) => void
  ignitionCount: number
  used: number
  counts: Record<ToolKind, number>
  notice: string | null
  onClearIgnitions: () => void
  onClearPlan: () => void
}

export function ToolsPanel({ mode, onMode, ignitionCount, used, counts, notice, onClearIgnitions, onClearPlan }: Props) {
  const left = BUDGET_UNITS - used
  return (
    <Panel
      title="Attack plan"
      aside={
        <span className="tabular text-xs text-ink-2">
          Budget: <span className="font-semibold text-ink">{used}</span> of {BUDGET_UNITS} units used
        </span>
      }
    >
      <div
        className="h-1.5 overflow-hidden rounded-full bg-raised"
        role="meter"
        aria-label="Budget used"
        aria-valuemin={0}
        aria-valuemax={BUDGET_UNITS}
        aria-valuenow={used}
      >
        <div className="h-full bg-series-harmonized" style={{ width: `${(100 * used) / BUDGET_UNITS}%` }} />
      </div>

      <p className="mt-2 text-xs text-ink-2">Choose what a click on the map does. Click a placed item again to remove it.</p>
      <div className="mt-2 space-y-1.5">
        <ModeRow
          active={mode === 'ignite'}
          onClick={() => onMode('ignite')}
          swatch={<span className="inline-block h-4 w-4 rounded-full border-2 border-white bg-[#ff2d2d]" />}
          title="Fire at t = 0"
          detail={
            ignitionCount === 0
              ? 'Click burnable hexes to set where the fire is burning.'
              : `${ignitionCount} ignition ${ignitionCount === 1 ? 'hex' : 'hexes'} set.`
          }
        />
        {TOOL_KINDS.map((kind) => {
          const spec = TOOLS[kind]
          const mark = TOOL_MARK[kind]
          return (
            <ModeRow
              key={kind}
              active={mode === kind}
              onClick={() => onMode(kind)}
              swatch={
                <span
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-page"
                  style={{ background: mark.colour }}
                >
                  {mark.glyph}
                </span>
              }
              title={`${mark.emoji} ${spec.label}`}
              titleNote={spec.labelRo}
              detail={`${spec.cost} ${spec.cost === 1 ? 'unit' : 'units'} per hex · in place at hour ${spec.readyHour} · ${counts[kind]} placed`}
              more={mode === kind ? spec.summary : undefined}
              disabled={left < spec.cost && counts[kind] === 0}
            />
          )
        })}
      </div>
      {notice && (
        <p role="status" className="mt-2 text-xs text-warning">
          {notice}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={onClearPlan} disabled={used === 0}>
          Remove all resources
        </Button>
        <Button onClick={onClearIgnitions} disabled={ignitionCount === 0}>
          Clear ignition points
        </Button>
      </div>
    </Panel>
  )
}

function ModeRow({
  active,
  onClick,
  swatch,
  title,
  titleNote,
  detail,
  more,
  disabled,
}: {
  active: boolean
  onClick: () => void
  swatch: React.ReactNode
  title: string
  titleNote?: string
  detail: string
  more?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      className={`block w-full rounded-md border px-2.5 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'border-series-harmonized bg-series-harmonized/15' : 'border-hairline hover:bg-raised'
      }`}
    >
      <span className="flex items-center gap-2 text-sm text-ink">
        {swatch}
        <span className="font-medium">{title}</span>
        {titleNote && <span className="text-xs italic text-muted">{titleNote}</span>}
      </span>
      <span className="tabular mt-0.5 block text-xs text-ink-2">{detail}</span>
      {more && <span className="mt-1 block text-xs text-ink-2">{more}</span>}
    </button>
  )
}
