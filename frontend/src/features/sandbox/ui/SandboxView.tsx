// The sandbox screen for one loaded grid.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SandboxGrid } from '../../../types/contracts.ts'
import { draftAdvisory } from '../advisory/draft.ts'
import type { DraftAdvisory } from '../advisory/draft.ts'
import { crewExitRoutes } from '../advisory/exitRoute.ts'
import { SimClient } from '../engine/client.ts'
import { buildModel } from '../engine/model.ts'
import { ensembleSeeds } from '../engine/service.ts'
import type { OptimizeResult, SimProgress } from '../engine/service.ts'
import { BURNED, BURNING, frameAt, RUN_HOURS } from '../engine/simulate.ts'
import type { Scenario } from '../engine/simulate.ts'
import { BUDGET_UNITS, dropUnanchored, placementProblem, planCost, TOOLS } from '../engine/tools.ts'
import type { Placement, ToolKind } from '../engine/tools.ts'
import { windSchedule } from '../engine/wind.ts'
import type { WindSettings } from '../engine/wind.ts'
import { fetchCurrentWind, scenarioCentre } from '../weather/openMeteo.ts'
import { AdvisoryModal } from './AdvisoryModal.tsx'
import { buildGeometry } from './geometry.ts'
import { HexMap } from './HexMap.tsx'
import type { HexMark } from './HexMap.tsx'
import { CellReadout, Legend } from './Legend.tsx'
import { layerView, MAP_LAYERS, TOOL_MARK } from './palette.ts'
import type { MapLayer } from './palette.ts'
import { Button } from './parts.tsx'
import { highestRiskCell } from './quickstart.ts'
import { RunPanel } from './RunPanel.tsx'
import type { OptimizerPhase } from './RunPanel.tsx'
import { Scoreboard } from './Scoreboard.tsx'
import { columnName } from './scoreModel.ts'
import type { Outcome, ScoreColumn } from './scoreModel.ts'
import { ToolsPanel } from './ToolsPanel.tsx'
import type { ClickMode } from './ToolsPanel.tsx'
import { usePlayback } from './usePlayback.ts'
import { useRecon } from './useRecon.ts'
import { WindPanel } from './WindPanel.tsx'
import type { WindSource } from './WindPanel.tsx'

interface Props {
  grid: SandboxGrid
  area: GeoJSON.Polygon | null
  regionId: string
}

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

const CALM: WindSettings = { fromDeg: 0, speedKmh: 0, gustKmh: 0, shiftDeg: 0, shiftHour: 24 }

/** Results of the last Run: the same scenario without resources and with the user's plan. */
interface Results {
  /** The scenario all columns share (no resources). */
  base: Scenario
  baseline: Outcome
  human: Outcome
  optimizer: OptimizeResult | null
  mincut: OptimizeResult | null
}

/** How each optimizer reached its plan, in sentences computed from its result. */
function optimizerNotes(results: Results): string[] {
  const notes: string[] = []
  if (results.optimizer) {
    notes.push(
      `Greedy optimizer: ${results.optimizer.plan.length} resources chosen from ${nf0.format(results.optimizer.simulatedRuns)} simulated runs, one at a time where the mean outcome over the same seeds improves most (villages, then farms, then hectares). It does not search combinations.`,
    )
  }
  const m = results.mincut
  if (m?.anchor) {
    const a = m.anchor
    const how =
      a.cutCost === null
        ? 'no line can be in place before the fire usually reaches the villages, so it fell back to greedy steps only'
        : a.hexes === 0
          ? 'the villages are already separated from the fire by hexes that cannot burn, so the budget went to greedy steps'
          : `an anchor line of ${a.hexes} hexes between the fire and the villages (full line ${a.cutCost} units${a.complete ? '' : ', more than the budget, so only part was placed'}), then greedy steps with what was left`
    const lost =
      a.cutCost !== null && a.villagesOutOfReach > 0
        ? ` ${a.villagesOutOfReach} village hexes are usually reached before a line could be ready and were left out of the line.`
        : ''
    notes.push(`Min-cut optimizer: ${how}; ${nf0.format(m.simulatedRuns)} simulated runs.${lost}`)
  }
  return notes
}

export function SandboxView({ grid, area, regionId }: Props) {
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
  const [optimizing, setOptimizing] = useState<OptimizerPhase>(null)
  /** Bumped on every scenario change so a late answer for an old scenario is dropped. */
  const generation = useRef(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [advisory, setAdvisory] = useState<DraftAdvisory | null>(null)
  const playback = usePlayback(RUN_HOURS)

  /** Any change to the scenario makes the finished runs stale. */
  const invalidate = () => {
    generation.current++
    setOptimizing(null)
    setBusy(false)
    setResults(null)
    setError(null)
    setShown('human')
    playback.reset()
  }

  /** New fire at t = 0. A backfire cannot sit on a hex that is now burning. */
  const igniteCells = (found: number[]) => {
    invalidate()
    setIgnitions(found)
    setPlan((prev) => dropUnanchored(model, prev.filter((p) => !(p.kind === 'backfire' && found.includes(p.cell)))))
  }

  const recon = useRecon({
    area,
    cells,
    indexOf: geo.indexOf,
    burnable: model.burnable,
    resolution: grid.h3_resolution,
    onIgnitions: igniteCells,
  })

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

  const quickIgnite = () => {
    const i = highestRiskCell(model, cells, area)
    if (i < 0) {
      setNotice('No hex in this grid can burn.')
      return
    }
    setNotice(null)
    igniteCells([i])
  }

  /** Baseline and the user's plan under the same seeds. Returns null if it failed or went stale. */
  const runScenario = async (): Promise<Results | null> => {
    if (!client || ignitions.length === 0) return null
    const mine = generation.current
    const base: Scenario = { seed, hours: RUN_HOURS, ignitions, wind: schedule, tools: [] }
    const withPlan: Scenario = { ...base, tools: plan }
    const seeds = ensembleSeeds(seed)
    setBusy(true)
    setError(null)
    try {
      const [baseRun, baseEnsemble, myRun, myEnsemble] = await Promise.all([
        client.request({ type: 'run', scenario: base }),
        client.request({ type: 'ensemble', scenario: base, seeds }),
        client.request({ type: 'run', scenario: withPlan }),
        client.request({ type: 'ensemble', scenario: withPlan, seeds }),
      ])
      if (generation.current !== mine) return null
      const fresh: Results = {
        base,
        baseline: { plan: [], run: baseRun, ensemble: baseEnsemble },
        human: { plan, run: myRun, ensemble: myEnsemble },
        optimizer: null,
        mincut: null,
      }
      setResults(fresh)
      setShown('human')
      playback.start()
      return fresh
    } catch (err) {
      if (generation.current === mine) {
        setResults(null)
        setError(err instanceof Error ? err.message : String(err))
      }
      return null
    } finally {
      if (generation.current === mine) setBusy(false)
    }
  }

  /** Both optimizers on the same scenario, seeds and budget as the user's plan. */
  const runOptimizers = async (from: Results) => {
    if (!client) return
    const mine = generation.current
    setError(null)
    const request = { type: 'optimize', scenario: from.base, seeds: from.human.ensemble.seeds, budget: BUDGET_UNITS } as const
    const progress = (phase: 'greedy' | 'mincut') => (p: SimProgress) => {
      if (generation.current === mine) setOptimizing({ phase, ...p })
    }
    try {
      setOptimizing({ phase: 'greedy', placed: 0, costUsed: 0, budget: BUDGET_UNITS, simulatedRuns: 0 })
      const greedy = await client.request({ ...request, method: 'greedy' }, progress('greedy'))
      if (generation.current !== mine) return
      setResults((prev) => (prev ? { ...prev, optimizer: greedy } : prev))
      setOptimizing({ phase: 'mincut', placed: 0, costUsed: 0, budget: BUDGET_UNITS, simulatedRuns: 0 })
      const mincut = await client.request({ ...request, method: 'mincut' }, progress('mincut'))
      if (generation.current !== mine) return
      setResults((prev) => (prev ? { ...prev, mincut } : prev))
      setShown('optimizer')
      playback.start()
    } catch (err) {
      if (generation.current === mine) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (generation.current === mine) setOptimizing(null)
    }
  }

  const runWithOptimizers = async () => {
    const from = results ?? (await runScenario())
    if (from) await runOptimizers(from)
  }

  const columns: ScoreColumn[] = useMemo(() => {
    if (!results) return []
    const column = (key: string, title: string, subtitle: string | undefined, outcome: Outcome): ScoreColumn => ({
      key,
      title,
      subtitle,
      outcome,
      exit: crewExitRoutes(model, outcome.run.result, outcome.plan),
    })
    const out = [
      column('baseline', 'No intervention', undefined, results.baseline),
      column('human', 'Your plan', undefined, results.human),
    ]
    if (results.optimizer) out.push(column('optimizer', 'Greedy optimizer', 'algorithmic, simulation-scored', results.optimizer))
    if (results.mincut) out.push(column('mincut', 'Min-cut optimizer', 'anchor line + greedy fill', results.mincut))
    return out
  }, [results, model])
  const shownColumn = columns.find((c) => c.key === shown) ?? null
  const shownOutcome = shownColumn?.outcome ?? null

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
  const routes = useMemo(
    () =>
      shownColumn
        ? shownColumn.exit.crews.filter((c) => c.status === 'clear').map((c) => ({ path: c.path, colour: '#7ef0a0' }))
        : undefined,
    [shownColumn],
  )
  const blocked = useMemo(
    () => (shownColumn ? shownColumn.exit.crews.filter((c) => c.status !== 'clear').map((c) => c.cell) : undefined),
    [shownColumn],
  )

  const openAdvisory = () => {
    if (!shownColumn) return
    setAdvisory(
      draftAdvisory({
        regionId,
        isMock: grid.is_mock,
        cells,
        planTitle: columnName(shownColumn),
        plan: shownColumn.outcome.plan,
        run: shownColumn.outcome.run,
        ensemble: shownColumn.outcome.ensemble,
        exit: shownColumn.exit,
        seed,
        hours: RUN_HOURS,
        ignitions,
        wind,
        schedule,
        generatedAt: new Date().toISOString(),
      }),
    )
  }

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
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-3">
        <div className="rounded-lg border border-hairline bg-surface p-3">
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <div role="group" aria-label="Map layer" className="inline-flex overflow-hidden rounded-md border border-hairline">
              {MAP_LAYERS.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  aria-pressed={layer === l.key}
                  onClick={() => setLayer(l.key)}
                  className={`border-l border-hairline px-2 py-0.5 text-xs first:border-l-0 ${
                    layer === l.key ? 'bg-series-harmonized/25 text-ink' : 'text-ink-2 hover:bg-raised'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <CellReadout cell={hovered >= 0 ? cells[hovered] : null} classes={grid.landcover_classes} />
          </div>
          <HexMap
            cells={cells}
            geo={geo}
            colours={view.colours}
            villageInk={layer === 'landcover' ? undefined : '#ffffff'}
            fire={frame}
            ignitions={results ? undefined : ignitionSet}
            marks={marks}
            routes={routes}
            blocked={blocked}
            area={area}
            onCellClick={onCellClick}
            onHover={setHovered}
            ariaLabel="Hex map of the sandbox area, coloured by the chosen layer, with the simulated fire and deployed resources"
          />
          <Legend ramp={view.legend} />
        </div>
        {results && (
          <Scoreboard
            columns={columns}
            seed={seed}
            shown={shown}
            onShow={setShown}
            notes={optimizerNotes(results)}
            actions={
              <>
                {!results.optimizer && (
                  <Button onClick={() => void runOptimizers(results)} disabled={optimizing !== null || busy}>
                    ✦ Add AI optimizers (greedy + min-cut)
                  </Button>
                )}
                <Button onClick={openAdvisory} title="Builds a draft from the plan shown on the map. Never an official alert.">
                  Draft advisory for the plan on the map
                </Button>
              </>
            }
          />
        )}
        {advisory && <AdvisoryModal draft={advisory} isMock={grid.is_mock} onClose={() => setAdvisory(null)} />}
      </div>

      <div className="min-w-0 space-y-3">
        <RunPanel
          ignitionCount={ignitions.length}
          canRun={client !== null && ignitions.length > 0}
          busy={busy}
          optimizing={optimizing}
          hasResults={results !== null}
          hasOptimizers={results?.optimizer != null}
          onRun={() => void runScenario()}
          onRunWithOptimizers={() => void runWithOptimizers()}
          onQuickIgnite={quickIgnite}
          onClearIgnitions={() => {
            invalidate()
            setIgnitions([])
          }}
          onBackToPlanning={invalidate}
          recon={recon}
          isMock={grid.is_mock}
          playback={playback}
          live={live}
          shownTitle={shownColumn?.title ?? null}
          error={error}
          seed={seed}
          onSeed={(next) => {
            invalidate()
            setSeed(next)
          }}
          inWorker={client?.inWorker ?? true}
        />

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
      </div>
    </div>
  )
}
