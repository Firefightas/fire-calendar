// The top control panel: start the fire, run the simulation (with or without the optimizers),
// and replay the 72 hours.
import { RUN_HOURS } from '../engine/simulate.ts'
import { InfoTip } from './InfoTip.tsx'
import { ReconButton, ReconStatus } from './ReconPanel.tsx'
import type { Recon } from './useRecon.ts'
import { Panel } from './parts.tsx'

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** What the optimizers are doing right now, or null. */
export type OptimizerPhase = {
  phase: 'greedy' | 'mincut'
  placed: number
  costUsed: number
  budget: number
  simulatedRuns: number
} | null

interface Props {
  ignitionCount: number
  canRun: boolean
  busy: boolean
  optimizing: OptimizerPhase
  hasResults: boolean
  hasOptimizers: boolean
  onRun: () => void
  onRunWithOptimizers: () => void
  onQuickIgnite: () => void
  onClearIgnitions: () => void
  onBackToPlanning: () => void
  recon: Recon
  isMock: boolean
  playback: { hour: number; playing: boolean; toggle: () => void; seek: (h: number) => void }
  live: { burning: number; burned: number } | null
  shownTitle: string | null
  error: string | null
  seed: number
  onSeed: (seed: number) => void
  inWorker: boolean
}

export function RunPanel(p: Props) {
  const working = p.busy || p.optimizing !== null
  return (
    <Panel
      title="Run simulation & optimizer predictions"
      aside={
        <InfoTip label="About the run">
          A run simulates 72 hours from the fire at t = 0, with and without your plan. “Run with AI optimizers” also lets two
          algorithmic optimizers (greedy, and min-cut anchor line + greedy fill) plan with the same budget, seeds and wind;
          they are scored by simulation, not trained models.
          {!p.inWorker && ' This browser could not start a Web Worker, so the simulation runs on the page thread.'}
        </InfoTip>
      }
    >
      {/* Fire at t = 0 */}
      {p.ignitionCount === 0 ? (
        <div className="mb-3 rounded-md border border-dashed border-[#ff5a1f]/60 bg-[#ff5a1f]/5 p-2">
          <p className="mb-1.5 text-xs font-medium text-ink">Start a fire</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={p.onQuickIgnite}
              className="rounded-md border border-hairline px-2.5 py-1.5 text-sm text-ink hover:bg-raised"
              title="Ignites the burnable hex with the most fuel around it (its own fuel plus its neighbours'), inside the drawn area when there is one."
            >
              🔥 Ignite highest-risk hex
            </button>
            <ReconButton recon={p.recon} isMock={p.isMock} />
            <span className="text-xs text-muted">or click any hex on the map</span>
          </div>
        </div>
      ) : (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-2">
          <span className="inline-flex items-center gap-1.5 text-sm text-ink">
            <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full border-2 border-white bg-[#ff2d2d]" />
            <span className="tabular">
              {p.ignitionCount} ignition {p.ignitionCount === 1 ? 'hex' : 'hexes'}
            </span>
          </span>
          <button type="button" onClick={p.onClearIgnitions} className="underline-offset-2 hover:text-ink hover:underline">
            clear
          </button>
          <span className="ml-auto">
            <ReconButton recon={p.recon} isMock={p.isMock} />
          </span>
        </div>
      )}
      <div className="-mt-1 mb-2">
        <ReconStatus recon={p.recon} />
      </div>

      {/* The two actions */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={p.onRun}
          disabled={!p.canRun || working}
          className="rounded-md bg-series-harmonized px-3 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {p.busy && p.optimizing === null ? 'Simulating…' : '▶ Run 72h simulation'}
        </button>
        <button
          type="button"
          onClick={p.onRunWithOptimizers}
          disabled={!p.canRun || working}
          title="Your plan plus two algorithmic optimizers (greedy, and min-cut anchor line + greedy fill), all scored on the same seeds."
          className="rounded-md border border-series-harmonized bg-series-harmonized/15 px-3 py-2 text-sm font-semibold text-ink hover:bg-series-harmonized/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {p.optimizing ? 'Optimizing…' : p.hasOptimizers ? '✦ Re-run AI optimizers' : '✦ Run with AI optimizers'}
          <span className="block text-[11px] font-normal text-ink-2">greedy + min-cut, simulation-scored</span>
        </button>
      </div>
      {p.optimizing && (
        <p className="tabular mt-2 text-xs text-ink-2" role="status">
          {p.optimizing.phase === 'greedy' ? 'Greedy' : 'Min-cut'} optimizer · {p.optimizing.placed} placed ·{' '}
          {p.optimizing.costUsed}/{p.optimizing.budget}u · {nf0.format(p.optimizing.simulatedRuns)} runs
        </p>
      )}
      {!p.canRun && p.ignitionCount === 0 && <p className="mt-2 text-xs text-muted">Set a fire first.</p>}

      {/* Playback */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={p.playback.toggle}
          disabled={!p.hasResults}
          aria-label={p.playback.playing ? 'Pause' : 'Play'}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-hairline text-xs text-ink hover:bg-raised disabled:opacity-40"
        >
          {p.playback.playing ? '❚❚' : '▶'}
        </button>
        <input
          type="range"
          min={0}
          max={RUN_HOURS}
          step={1}
          value={p.playback.hour}
          disabled={!p.hasResults}
          aria-label="Simulated hour"
          onChange={(e) => p.playback.seek(Number(e.target.value))}
          className="min-w-0 flex-1 accent-[#3987e5]"
        />
        <span className="tabular w-14 shrink-0 text-right text-xs text-ink-2">
          {p.playback.hour}/{RUN_HOURS}h
        </span>
      </div>
      <div className="tabular mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {p.live ? (
          <>
            <span className="inline-flex items-center gap-1 text-ink">
              <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-[#ff5a1f]" />
              {nf0.format(p.live.burning)} burning
            </span>
            <span className="inline-flex items-center gap-1 text-ink">
              <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm border border-[#7a2e1c] bg-[#1c1512]" />
              {nf0.format(p.live.burned)} burned
            </span>
            {p.shownTitle && <span className="truncate text-ink-2">· {p.shownTitle}</span>}
          </>
        ) : (
          <span className="text-muted">No run yet: no readouts until you run.</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {p.hasResults && (
            <button type="button" onClick={p.onBackToPlanning} className="text-ink-2 underline-offset-2 hover:text-ink hover:underline">
              Back to planning
            </button>
          )}
          <details className="relative">
            <summary className="cursor-pointer select-none list-none rounded-md border border-hairline px-1.5 py-0.5 text-ink-2 hover:bg-raised">
              Seed #{p.seed} ▾
            </summary>
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-hairline bg-raised p-2 shadow-lg">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={999999}
                  value={p.seed}
                  aria-label="Random seed"
                  onChange={(e) => p.onSeed(Math.max(0, Math.min(999999, Math.floor(Number(e.target.value) || 0))))}
                  className="tabular w-24 rounded-md border border-hairline bg-surface px-2 py-1 text-ink"
                />
                <button
                  type="button"
                  onClick={() => p.onSeed((p.seed + 1) % 1000000)}
                  className="rounded-md border border-hairline px-2 py-1 text-ink hover:bg-surface"
                >
                  Next
                </button>
              </div>
              <p className="mt-1.5 text-muted">Same seed, same run, including which hours gust.</p>
            </div>
          </details>
        </span>
      </div>
      {p.error && (
        <p role="alert" className="mt-2 text-xs text-critical">
          ✕ The simulation failed: {p.error}
        </p>
      )}
    </Panel>
  )
}
