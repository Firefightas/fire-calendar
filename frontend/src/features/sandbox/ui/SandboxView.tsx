// The sandbox screen for one loaded grid.
import { useEffect, useMemo, useState } from 'react'
import type { SandboxGrid } from '../../../types/contracts.ts'
import { SimClient } from '../engine/client.ts'
import type { RunOutput } from '../engine/service.ts'
import { BURNED, BURNING, frameAt, RUN_HOURS } from '../engine/simulate.ts'
import type { Scenario } from '../engine/simulate.ts'
import { buildGeometry } from './geometry.ts'
import { HexMap } from './HexMap.tsx'
import { CellReadout, Legend } from './Legend.tsx'
import { landcoverColours } from './palette.ts'
import { Button, Panel } from './parts.tsx'
import { usePlayback } from './usePlayback.ts'

interface Props {
  grid: SandboxGrid
  area: GeoJSON.Polygon | null
}

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function SandboxView({ grid, area }: Props) {
  const cells = grid.cells
  const geo = useMemo(() => buildGeometry(cells, grid.h3_resolution), [cells, grid.h3_resolution])
  const colours = useMemo(() => landcoverColours(cells), [cells])
  const [hovered, setHovered] = useState(-1)

  // The engine lives in a Web Worker for as long as this grid is on screen.
  const [client, setClient] = useState<SimClient | null>(null)
  useEffect(() => {
    const c = new SimClient(cells)
    // oxlint-disable-next-line react/set-state-in-effect -- the worker is an external resource owned by this effect
    setClient(c)
    return () => c.dispose()
  }, [cells])

  const [ignitions, setIgnitions] = useState<number[]>([])
  const [seed, setSeed] = useState(1)
  const [run, setRun] = useState<RunOutput | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const playback = usePlayback(RUN_HOURS)

  /** Any change to the scenario makes the finished run stale. */
  const invalidate = () => {
    setRun(null)
    setError(null)
    playback.reset()
  }

  const toggleIgnition = (i: number) => {
    if (!cells[i].burnable) {
      setNotice('That hex does not burn (water or bare ground), so it cannot be an ignition point.')
      return
    }
    setNotice(null)
    invalidate()
    setIgnitions((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))
  }

  const startRun = async () => {
    if (!client || ignitions.length === 0) return
    const scenario: Scenario = { seed, hours: RUN_HOURS, ignitions, wind: [], tools: [] }
    setBusy(true)
    setError(null)
    try {
      setRun(await client.request({ type: 'run', scenario }))
      playback.start()
    } catch (err) {
      setRun(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const frame = useMemo(() => (run ? frameAt(run.result, playback.hour) : null), [run, playback.hour])
  const ignitionSet = useMemo(() => new Set(ignitions), [ignitions])
  const live = useMemo(() => {
    if (!frame) return null
    let burning = 0
    let burned = 0
    for (const state of frame) {
      if (state === BURNING) burning++
      else if (state === BURNED) burned++
    }
    return { burning, burned }
  }, [frame])

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="rounded-lg border border-hairline bg-surface p-3">
        <HexMap
          cells={cells}
          geo={geo}
          colours={colours}
          fire={frame}
          ignitions={run ? undefined : ignitionSet}
          area={area}
          onCellClick={toggleIgnition}
          onHover={setHovered}
          ariaLabel="Hex map of the sandbox area, coloured by land cover, with the simulated fire"
        />
        <CellReadout cell={hovered >= 0 ? cells[hovered] : null} classes={grid.landcover_classes} />
        <Legend />
      </div>

      <div className="space-y-3">
        <Panel title="1 · Fire at t = 0">
          <p className="text-xs text-ink-2">
            Click burnable hexes on the map to set where the fire is burning at t = 0. Click again to remove one.
          </p>
          <p className="tabular mt-2 text-sm text-ink">
            {ignitions.length === 0
              ? 'No ignition point yet.'
              : `${ignitions.length} ignition ${ignitions.length === 1 ? 'hex' : 'hexes'} set.`}
          </p>
          {notice && <p className="mt-1 text-xs text-warning">{notice}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              onClick={() => {
                invalidate()
                setIgnitions([])
              }}
              disabled={ignitions.length === 0}
            >
              Clear ignition points
            </Button>
          </div>
        </Panel>

        <Panel title="Run · 72 simulated hours">
          <div className="flex flex-wrap items-center gap-2">
            <Button primary onClick={startRun} disabled={!client || busy || ignitions.length === 0}>
              {busy ? 'Simulating…' : run ? 'Run again' : 'Run 72 h'}
            </Button>
            <Button onClick={playback.toggle} disabled={!run}>
              {playback.playing ? 'Pause' : playback.hour >= RUN_HOURS ? 'Replay' : 'Play'}
            </Button>
            <Button onClick={invalidate} disabled={!run}>
              Back to planning
            </Button>
          </div>
          <label className="mt-3 block text-xs text-ink-2">
            <span className="tabular">
              Hour {playback.hour} of {RUN_HOURS}
            </span>
            <input
              type="range"
              min={0}
              max={RUN_HOURS}
              step={1}
              value={playback.hour}
              disabled={!run}
              onChange={(e) => playback.seek(Number(e.target.value))}
              className="mt-1 block w-full accent-[#3987e5]"
            />
          </label>
          {live ? (
            <p className="tabular mt-2 text-sm text-ink">
              {nf0.format(live.burning)} hexes burning · {nf0.format(live.burned)} burned out
            </p>
          ) : (
            <p className="mt-2 text-xs text-ink-2">
              {ignitions.length === 0
                ? 'Set at least one ignition point, then run.'
                : 'No run yet: there are no readouts to show until you press Run.'}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-xs text-critical">
              The simulation failed: {error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3 text-xs text-ink-2">
            <label className="inline-flex items-center gap-2">
              Random seed
              <input
                type="number"
                min={0}
                max={999999}
                value={seed}
                onChange={(e) => {
                  invalidate()
                  setSeed(Math.max(0, Math.min(999999, Math.floor(Number(e.target.value) || 0))))
                }}
                className="tabular w-20 rounded-md border border-hairline bg-raised px-2 py-1 text-ink"
              />
            </label>
            <Button
              onClick={() => {
                invalidate()
                setSeed((s) => (s + 1) % 1000000)
              }}
            >
              Next seed
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">
            The same seed always gives the same run. Calm wind in this version; wind controls come next.
            {client && !client.inWorker && ' Running on the main thread: this browser could not start a Web Worker.'}
          </p>
        </Panel>
      </div>
    </div>
  )
}
