// Tactical Containment Sandbox: public entry (owner: P6). Mounted by app/SandboxHost.tsx,
// which already shows the title, the back button and the required banner.
import { loadSandboxGrid } from '../../app/api.ts'
import { MockBadge } from '../../app/badges.tsx'
import type { SandboxProps } from '../../app/SandboxHost.tsx'
import { useAsync } from '../../app/useAsync.ts'

export default function Sandbox({ regionId }: SandboxProps) {
  const grid = useAsync(() => loadSandboxGrid(regionId), regionId)

  if (grid.status === 'loading') {
    return <p className="text-sm text-muted">Loading the hex grid for this region…</p>
  }
  if (grid.status === 'error') {
    return (
      <section role="alert" className="rounded-lg border border-critical/60 bg-critical/10 p-4 text-sm text-ink">
        <p className="font-medium">The hex grid for this region could not be loaded.</p>
        <p className="mt-1 text-ink-2">{grid.error.message}</p>
        <p className="mt-1 text-ink-2">No simulation has been run, so there are no readouts to show.</p>
      </section>
    )
  }

  const { data, origin } = grid.data
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
        {data.is_mock && <MockBadge />}
        <span>
          {data.cells.length.toLocaleString('en-US')} H3 res-{data.h3_resolution} cells ·{' '}
          {origin === 'api' ? 'grid from the backend' : 'grid from the offline bundle'}
        </span>
      </div>
    </section>
  )
}
