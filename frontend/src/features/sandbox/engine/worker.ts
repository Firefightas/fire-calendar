// Web Worker entry: runs the spread engine off the UI thread.
import { SimService } from './service.ts'
import type { SimRequest } from './service.ts'

const service = new SimService()

interface Envelope {
  id: number
  request: SimRequest
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Envelope>) => void) | null
  postMessage: (message: unknown) => void
}

scope.onmessage = (event) => {
  const { id, request } = event.data
  try {
    scope.postMessage({ id, ok: true, value: service.handle(request) })
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
