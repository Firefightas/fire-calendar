// Promise wrapper around the simulation worker. If a Worker cannot be started, the same
// service runs in-thread so the sandbox still works (slower UI, same numbers).
import type { SandboxCell } from '../../../types/contracts.ts'
import { SimService } from './service.ts'
import type { SimRequest, SimResponses } from './service.ts'

interface Reply {
  id: number
  ok: boolean
  value?: unknown
  error?: string
}

export class SimClient {
  /** False when the engine had to fall back to the UI thread. */
  readonly inWorker: boolean
  private worker: Worker | null = null
  private local: SimService | null = null
  private nextId = 1
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (err: Error) => void }>()
  private ready: Promise<unknown>

  constructor(cells: SandboxCell[]) {
    try {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (event: MessageEvent<Reply>) => {
        const { id, ok, value, error } = event.data
        const waiting = this.pending.get(id)
        if (!waiting) return
        this.pending.delete(id)
        if (ok) waiting.resolve(value)
        else waiting.reject(new Error(error ?? 'The simulation failed.'))
      }
      this.worker.onerror = (event) => {
        const err = new Error(event.message || 'The simulation worker stopped.')
        for (const waiting of this.pending.values()) waiting.reject(err)
        this.pending.clear()
      }
    } catch {
      this.worker = null
      this.local = new SimService()
    }
    this.inWorker = this.worker !== null
    this.ready = this.send({ type: 'init', cells })
    this.ready.catch(() => {})
  }

  private send<T extends SimRequest>(request: T): Promise<SimResponses[T['type']]> {
    type Out = SimResponses[T['type']]
    if (this.local) {
      const local = this.local
      return new Promise<Out>((resolve, reject) => {
        try {
          resolve(local.handle(request) as Out)
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      })
    }
    const worker = this.worker
    if (!worker) return Promise.reject(new Error('The simulation was closed.'))
    const id = this.nextId++
    return new Promise<Out>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      worker.postMessage({ id, request })
    })
  }

  async request<T extends Exclude<SimRequest, { type: 'init' }>>(request: T): Promise<SimResponses[T['type']]> {
    await this.ready
    return this.send(request)
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    this.local = null
    for (const waiting of this.pending.values()) waiting.reject(new Error('The simulation was closed.'))
    this.pending.clear()
  }
}
