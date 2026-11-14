import { Suspense, lazy } from 'react'
import type { ComponentType } from 'react'
import { polygonAreaKm2 } from '../features/map/geo.ts'
import { SANDBOX_BANNER } from '../types/contracts.ts'
import type { Region } from '../types/contracts.ts'

/** What the app hands to P6's sandbox entry (`features/sandbox/index.ts(x)`, default export). */
export interface SandboxProps {
  regionId: Region['id']
  /** The drawn area of interest, or null for the whole region. */
  area: GeoJSON.Polygon | null
  onClose: () => void
}

// The sandbox is P6's module. A glob keeps this build green before it exists and
// code-splits it once it does.
const entries = import.meta.glob<{ default: ComponentType<SandboxProps> }>('../features/sandbox/index.{ts,tsx}')
const load = Object.values(entries)[0]
const Sandbox = load ? lazy(load) : null

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function SandboxHost({ region, area, onClose }: { region: Region; area: GeoJSON.Polygon | null; onClose: () => void }) {
  return (
    <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-hairline px-3 py-1.5 text-sm text-ink hover:bg-raised"
        >
          ← Back to the calendar
        </button>
        <h2 className="text-base font-semibold">Tactical Containment Sandbox</h2>
        <span className="text-xs text-ink-2">
          {region.name} ·{' '}
          {area ? `drawn area, about ${nf.format(polygonAreaKm2(area))} km²` : 'whole region'}
        </span>
      </div>

      {/* Always visible on this screen (AGENTS.md §6). */}
      <p role="note" className="rounded-lg border border-warning/60 bg-warning/10 px-3 py-2 text-xs font-medium text-ink">
        {SANDBOX_BANNER}
      </p>

      {Sandbox ? (
        <Suspense fallback={<p className="text-sm text-muted">Loading the sandbox…</p>}>
          <Sandbox regionId={region.id} area={area} onClose={onClose} />
        </Suspense>
      ) : (
        <section className="rounded-lg border border-hairline bg-surface p-4 text-sm text-ink-2">
          <p className="text-ink">The sandbox module is not part of this build yet.</p>
          <p className="mt-1">
            It opens here for the region and area shown above once <code>frontend/src/features/sandbox/index.tsx</code>{' '}
            exists. No simulation has been run, so there are no readouts to show.
          </p>
        </section>
      )}
    </div>
  )
}
