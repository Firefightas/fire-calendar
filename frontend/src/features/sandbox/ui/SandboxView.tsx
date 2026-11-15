// The sandbox screen for one loaded grid.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SandboxGrid } from '../../../types/contracts.ts'
import { SimClient } from '../engine/client.ts'
import { buildModel } from '../engine/model.ts'
import { ensembleSeeds } from '../engine/service.ts'
import type { SimProgress } from '../engine/service.ts'
import { BURNED, BURNING, frameAt, RUN_HOURS } from '../engine/simulate.ts'
import type { Scenario } from '../engine/simulate.ts'
import { BUDGET_UNITS, dropUnanchored, placementProblem, planCost, TOOLS } from '../engine/tools.ts'
import type { Placement, ToolKind } from '../engine/tools.ts'
import { windSchedule } from '../engine/wind.ts'
import type { WindSettings } from '../engine/wind.ts'
import { OPTIMIZER_LABEL } from '../optimizer/greedy.ts'
import { fetchCurrentWind, scenarioCentre } from '../weather/openMeteo.ts'
import { buildGeometry } from './geometry.ts'
import { HexMap } from './HexMap.tsx'
import type { HexMark } from './HexMap.tsx'
import { CellReadout, Legend } from './Legend.tsx'
import { layerView, MAP_LAYERS, TOOL_MARK } from './palette.ts'
import type { MapLayer } from './palette.ts'
import { Button, Panel } from './parts.tsx'
import { Scoreboard } from './Scoreboard.tsx'
import type { Outcome, ScoreColumn } from './Scoreboard.tsx'
import { ToolsPanel } from './ToolsPanel.tsx'
import type { ClickMode } from './ToolsPanel.tsx'
import { usePlayback } from './usePlayback.ts'
import { WindPanel } from './WindPanel.tsx'
import type { WindSource } from './WindPanel.tsx'

interface Props {
  grid: SandboxGrid
  area: GeoJSON.Polygon | null
}

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

const CALM: WindSettings = { fromDeg: 0, speedKmh: 0, gustKmh: 0, shiftDeg: 0, shiftHour: 24 }

/** Results of the last Run: the same scenario without resources and with the user's plan. */
interface Results {
  /** The scenario all columns share (no resources). */
  base: Scenario
  baseline: Outcome
  human: Outcome
  optimizer: (Outcome & { simulatedRuns: number }) | null
}

export function SandboxView({ grid, area }: Props) {
  const cells = grid.cells
  const geo = useMemo(() => buildGeometry(cells, grid.h3_resolution), [cells, grid.h3_resolution])
  const model = useMemo(() => buildModel(cells), [cells])
  const [layer, setLayer] = useState<MapLayer>('landcover')
  const view = useMemo(() => layerView(layer, cells, model.fuel), [layer, cells, model])
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
  const [plan, setPlan] = useState<Placement[]>([])
  const [mode, setMode] = useState<ClickMode>('ignite')
  const [seed, setSeed] = useState(1)
  const [results, setResults] = useState<Results | null>(null)
  const [shown, setShown] = useState('human')
  const [busy, setBusy] = useState(false)
  const [optimizing, setOptimizing] = useState<SimProgress | 'starting' | null>(null)
  /** Bumped on every scenario change so a late optimizer answer for an old scenario is dropped. */
  const generation = useRef(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const playback = usePlayback(RUN_HOURS)

  /** Any change to the scenario makes the finished runs stale. */
  const invalidate = () => {
    generation.current++
    setOptimizing(null)
    setResults(null)
    setError(null)
    setShown('human')
    playback.reset()
  }

  // Protocol step 4: current wind at the centre of the area, from Open-Meteo.
  const [windSource, setWindSource] = useState<WindSource>({ status: 'loading' })
  const [wind, setWind] = useState<WindSettings>(CALM)
  const windTouched = useRef(false)
  const [centreLat, centreLon] = useMemo(() => scenarioCentre(area, cells), [area, cells])
  useEffect(() => {
    let cancelled = false
    fetchCurrentWind(centreLat, centreLon).then(
      (live) => {
        if (cancelled) return
        setWindSource({ status: 'live', live })
        // Do not overwrite sliders the user has already moved.
        if (windTouched.current) return
        setWind((w) => ({
          ...w,
          fromDeg: Math.round(live.fromDeg),
          speedKmh: Math.round(live.speedKmh),
          gustKmh: Math.round(live.gustKmh),
        }))
        setResults(null)
      },
      (err: unknown) => {
        if (cancelled) return
        const aborted = err instanceof DOMException && err.name === 'AbortError'
        setWindSource({
          status: 'failed',
          reason: aborted ? 'Open-Meteo did not answer in time' : err instanceof Error ? err.message : String(err),
        })
      },
    )
    return () => {
      cancelled = true
    }
  }, [centreLat, centreLon])
  const schedule = useMemo(() => windSchedule(wind, RUN_HOURS, seed), [wind, seed])

  const used = planCost(plan)
  const counts = useMemo(() => {
    const out: Record<ToolKind, number> = { water: 0, clearing: 0, trench: 0, backfire: 0 }
    for (const p of plan) out[p.kind]++
    return out
  }, [plan])

  const onCellClick = (i: number) => {
    setNotice(null)
    if (mode === 'ignite') {
      if (!model.burnable[i]) {
        setNotice('That hex does not burn (water or bare ground), so it cannot be an ignition point.')
        return
      }
      if (plan.some((p) => p.cell === i && p.kind === 'backfire')) {
        setNotice('That hex has a backfire planned. Remove it before setting an ignition point there.')
        return
      }
      invalidate()
      setIgnitions((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))
      return
    }
    const existing = plan.find((p) => p.cell === i)
    if (existing) {
      // A click on a placed resource removes it; backfires that leaned on it go too.
      const kept = dropUnanchored(
        model,
        plan.filter((p) => p !== existing),
      )
      if (kept.length < plan.length - 1) setNotice('Backfires that were anchored on the removed resource were removed too.')
      invalidate()
      setPlan(kept)
      return
    }
    const problem = placementProblem(model, plan, ignitions, mode, i)
    if (problem) {
      setNotice(problem)
      return
    }
    if (used + TOOLS[mode].cost > BUDGET_UNITS) {
      setNotice(`Not enough budget: ${TOOLS[mode].label.toLowerCase()} costs ${TOOLS[mode].cost}, ${BUDGET_UNITS - used} left.`)
      return
    }
    invalidate()
    setPlan([...plan, { cell: i, kind: mode }])
  }

  const startRun = async () => {
    if (!client || ignitions.length === 0) return
    const base: Scenario = { seed, hours: RUN_HOURS, ignitions, wind: schedule, tools: [] }
    const mine: Scenario = { ...base, tools: plan }
    const seeds = ensembleSeeds(seed)
    setBusy(true)
    setError(null)
    try {
      const [baseRun, baseEnsemble, myRun, myEnsemble] = await Promise.all([
        client.request({ type: 'run', scenario: base }),
        client.request({ type: 'ensemble', scenario: base, seeds }),
        client.request({ type: 'run', scenario: mine }),
        client.request({ type: 'ensemble', scenario: mine, seeds }),
      ])
      setResults({
        base,
        baseline: { plan: [], run: baseRun, ensemble: baseEnsemble },
        human: { plan, run: myRun, ensemble: myEnsemble },
        optimizer: null,
      })
      setShown('human')
      playback.start()
    } catch (err) {
      setResults(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  /** Same scenario, seeds and budget as the human plan; only the placements differ. */
  const startOptimizer = async () => {
    if (!client || !results) return
    const mine = generation.current
    setOptimizing('starting')
    setError(null)
    try {
      const out = await client.request(
        { type: 'optimize', scenario: results.base, seeds: results.human.ensemble.seeds, budget: BUDGET_UNITS },
        (progress) => {
          if (generation.current === mine) setOptimizing(progress)
        },
      )
      if (generation.current !== mine) return
      setResults((prev) => (prev ? { ...prev, optimizer: out } : prev))
      setShown('optimizer')
      playback.start()
    } catch (err) {
      if (generation.current === mine) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (generation.current === mine) setOptimizing(null)
    }
  }

  const columns: ScoreColumn[] = useMemo(() => {
    if (!results) return []
    const out: ScoreColumn[] = [
      { key: 'baseline', title: 'No intervention', outcome: results.baseline },
      { key: 'human', title: 'Your plan', outcome: results.human },
    ]
    if (results.optimizer) out.push({ key: 'optimizer', title: OPTIMIZER_LABEL, outcome: results.optimizer })
    return out
  }, [results])
  const shownColumn = columns.find((c) => c.key === shown) ?? null
  const shownOutcome = shownColumn?.outcome ?? null
  const shownTitle = shownColumn?.title ?? null

  const frame = useMemo(
    () => (shownOutcome ? frameAt(shownOutcome.run.result, playback.hour) : null),
    [shownOutcome, playback.hour],
  )
  const ignitionSet = useMemo(() => new Set(ignitions), [ignitions])
  const marks = useMemo(() => {
    const out = new Map<number, HexMark>()
    for (const p of shownOutcome ? shownOutcome.plan : plan) out.set(p.cell, TOOL_MARK[p.kind])
    return out
  }, [shownOutcome, plan])
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
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-3">
        <div className="rounded-lg border border-hairline bg-surface p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-2">Map layer</span>
            {MAP_LAYERS.map((l) => (
              <button
                key={l.key}
                type="button"
                aria-pressed={layer === l.key}
                onClick={() => setLayer(l.key)}
                className={`rounded-md border px-2 py-0.5 text-xs ${
                  layer === l.key
                    ? 'border-series-harmonized bg-series-harmonized/20 text-ink'
                    : 'border-hairline text-ink-2 hover:bg-raised'
                }`}
              >
                {l.label}
              </button>
            ))}
            <span className="ml-auto text-xs text-ink-2" role="status">
              {shownTitle ? `On the map: ${shownTitle}` : 'Planning: no run yet'}
            </span>
          </div>
          <HexMap
            cells={cells}
            geo={geo}
            colours={view.colours}
            villageInk={layer === 'landcover' ? undefined : '#ffffff'}
            fire={frame}
            ignitions={results ? undefined : ignitionSet}
            marks={marks}
            area={area}
            onCellClick={onCellClick}
            onHover={setHovered}
            ariaLabel="Hex map of the sandbox area, coloured by land cover, with the simulated fire and deployed resources"
          />
          <CellReadout cell={hovered >= 0 ? cells[hovered] : null} classes={grid.landcover_classes} />
          <Legend ramp={view.legend} />
        </div>
        {results && (
          <Scoreboard columns={columns} seed={seed} shown={shown} onShow={setShown}>
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-hairline pt-3">
              <Button onClick={startOptimizer} disabled={optimizing !== null || busy}>
                {results.optimizer ? 'Run the optimizer again' : 'Run the optimizer on the same scenario'}
              </Button>
              <p className="tabular min-w-0 flex-1 text-xs text-ink-2" role="status">
                {optimizing === 'starting' && 'Optimizer: scoring the first candidates…'}
                {optimizing !== null &&
                  optimizing !== 'starting' &&
                  `Optimizer: ${optimizing.placed} placed, ${optimizing.costUsed} of ${optimizing.budget} units, ${nf0.format(optimizing.simulatedRuns)} simulated runs so far…`}
                {optimizing === null &&
                  results.optimizer &&
                  `${OPTIMIZER_LABEL}: ${results.optimizer.plan.length} resources chosen from ${nf0.format(results.optimizer.simulatedRuns)} simulated runs. It adds one resource at a time where the mean outcome over the same seeds improves most (villages, then farms, then hectares); it does not search combinations.`}
                {optimizing === null &&
                  !results.optimizer &&
                  `${OPTIMIZER_LABEL}: same ignition points, wind, seeds and ${BUDGET_UNITS}-unit budget as your plan.`}
              </p>
            </div>
          </Scoreboard>
        )}
      </div>

      <div className="space-y-3">
        <ToolsPanel
          mode={mode}
          onMode={(m) => {
            setNotice(null)
            setMode(m)
          }}
          ignitionCount={ignitions.length}
          used={used}
          counts={counts}
          notice={notice}
          onClearIgnitions={() => {
            invalidate()
            setIgnitions([])
          }}
          onClearPlan={() => {
            invalidate()
            setPlan([])
          }}
        />

        <WindPanel
          source={windSource}
          settings={wind}
          onChange={(next) => {
            invalidate()
            windTouched.current = true
            setWind(next)
          }}
          current={results ? schedule[Math.min(playback.hour, RUN_HOURS - 1)] : null}
          hours={RUN_HOURS}
        />

        <Panel title="Run · 72 simulated hours">
          <div className="flex flex-wrap items-center gap-2">
            <Button primary onClick={startRun} disabled={!client || busy || ignitions.length === 0}>
              {busy ? 'Simulating…' : results ? 'Run again' : 'Run 72 h'}
            </Button>
            <Button onClick={playback.toggle} disabled={!results}>
              {playback.playing ? 'Pause' : playback.hour >= RUN_HOURS ? 'Replay' : 'Play'}
            </Button>
            <Button onClick={invalidate} disabled={!results}>
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
              disabled={!results}
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
            The same seed always gives the same run, including which hours gust.
            {client && !client.inWorker && ' Running on the main thread: this browser could not start a Web Worker.'}
          </p>
        </Panel>
      </div>
    </div>
  )
}
