import { MODE_LABEL } from './model.ts'
import type { Mode } from './model.ts'
import { PALETTES, PALETTE_IDS } from './palettes.ts'
import type { PaletteId } from './palettes.ts'

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  size?: 'md' | 'lg'
}

/** Radio group drawn as a segmented control. */
export function Segmented<T extends string>({ label, value, options, onChange, size = 'md' }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-hairline bg-page p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`rounded-md transition-colors ${size === 'lg' ? 'px-4 py-2 text-sm font-medium' : 'px-2.5 py-1 text-xs'} ${
              active ? 'bg-ink text-page' : 'text-ink-2 hover:bg-raised'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** The centerpiece: [ Raw Unharmonized ] ↔ [ Harmonized (S-NPP Equivalent) ]. */
export function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <Segmented
      label="Series shown"
      size="lg"
      value={mode}
      onChange={onChange}
      options={[
        { value: 'raw', label: MODE_LABEL.raw },
        { value: 'harmonized', label: MODE_LABEL.harmonized },
      ]}
    />
  )
}

export function PaletteSwitcher({ palette, onChange }: { palette: PaletteId; onChange: (p: PaletteId) => void }) {
  return (
    <Segmented
      label="Color palette"
      value={palette}
      onChange={onChange}
      options={PALETTE_IDS.map((id) => ({ value: id, label: PALETTES[id].label }))}
    />
  )
}
