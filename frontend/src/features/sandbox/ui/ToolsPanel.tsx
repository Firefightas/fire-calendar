// Protocol steps 5–6: the attack plan. A grid of tool cards; details live in hover tooltips.
import { BUDGET_UNITS, TOOL_KINDS, TOOLS } from '../engine/tools.ts'
import type { ToolKind } from '../engine/tools.ts'
import { InfoTip, Pill } from './InfoTip.tsx'
import { TOOL_MARK } from './palette.ts'
import { Panel } from './parts.tsx'

/** What a click on the map does. */
export type ClickMode = 'ignite' | ToolKind

const SHORT_NAME: Record<ToolKind, string> = {
  water: 'Water drop',
  clearing: 'Clearing',
  trench: 'Trench',
  backfire: 'Backfire',
}

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
        <span className="flex items-center gap-1.5">
          <span className="tabular text-xs text-ink-2">
            <span className="font-semibold text-ink">{used}</span>/{BUDGET_UNITS}u
          </span>
          <InfoTip label="How to place resources">
            Pick a card, then click hexes on the map. Click a placed item again to remove it. Both you and the
            optimizers get the same {BUDGET_UNITS}-unit budget. Hover a card for what the tool does.
          </InfoTip>
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

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Card
          active={mode === 'ignite'}
          onClick={() => onMode('ignite')}
          swatch={<span className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-white bg-[#ff2d2d]" />}
          name="Fire at t=0"
          tip="Click burnable hexes to set where the fire is burning when the simulation starts."
          pills={ignitionCount > 0 ? [{ text: `×${ignitionCount}`, accent: true }] : []}
        />
        {TOOL_KINDS.map((kind) => {
          const spec = TOOLS[kind]
          const mark = TOOL_MARK[kind]
          return (
            <Card
              key={kind}
              active={mode === kind}
              onClick={() => onMode(kind)}
              disabled={left < spec.cost && counts[kind] === 0}
              swatch={
                <span
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-page"
                  style={{ background: mark.colour }}
                >
                  {mark.glyph}
                </span>
              }
              name={`${mark.emoji} ${SHORT_NAME[kind]}`}
              tip={`${spec.label} (${spec.labelRo}). ${spec.cost} ${spec.cost === 1 ? 'unit' : 'units'} per hex, in place at hour ${spec.readyHour}. ${spec.summary}`}
              pills={[
                { text: `${spec.cost}u` },
                { text: `${spec.readyHour}h` },
                ...(counts[kind] > 0 ? [{ text: `×${counts[kind]}`, accent: true }] : []),
              ]}
            />
          )
        })}
      </div>

      {notice && (
        <p role="status" className="mt-2 text-xs text-warning">
          ▲ {notice}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        <button
          type="button"
          onClick={onClearPlan}
          disabled={used === 0}
          className="text-ink-2 underline-offset-2 hover:text-ink hover:underline disabled:opacity-40"
        >
          Clear resources
        </button>
        <button
          type="button"
          onClick={onClearIgnitions}
          disabled={ignitionCount === 0}
          className="text-ink-2 underline-offset-2 hover:text-ink hover:underline disabled:opacity-40"
        >
          Clear fire
        </button>
      </div>
    </Panel>
  )
}

function Card({
  active,
  onClick,
  swatch,
  name,
  tip,
  pills,
  disabled,
}: {
  active: boolean
  onClick: () => void
  swatch: React.ReactNode
  name: string
  tip: string
  pills: { text: string; accent?: boolean }[]
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      title={tip}
      className={`flex min-w-0 flex-col gap-1 rounded-md border px-2 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'border-series-harmonized bg-series-harmonized/15' : 'border-hairline hover:bg-raised'
      }`}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink">
        {swatch}
        <span className="truncate font-medium">{name}</span>
      </span>
      <span className="flex min-h-4 flex-wrap gap-1">
        {pills.map((p) => (
          <Pill key={p.text} tone={p.accent ? 'accent' : 'muted'}>
            {p.text}
          </Pill>
        ))}
      </span>
    </button>
  )
}
