import { useEffect, useState } from 'react'

export type AsyncState<T> =
  | { status: 'loading'; data: T | null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: T | null; error: Error }

/**
 * Runs `load` whenever `key` changes. While a new key loads, the previous data stays
 * available (`data` non-null, status "loading") so views can dim instead of flashing.
 */
export function useAsync<T>(load: () => Promise<T>, key: string): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading', data: null, error: null })

  useEffect(() => {
    let cancelled = false
    setState((prev) => ({ status: 'loading', data: prev.data, error: null }))
    load().then(
      (data) => {
        if (!cancelled) setState({ status: 'ready', data, error: null })
      },
      (err: unknown) => {
        if (cancelled) return
        const error = err instanceof Error ? err : new Error(String(err))
        setState((prev) => ({ status: 'error', data: prev.data, error }))
      },
    )
    return () => {
      cancelled = true
    }
    // `load` is intentionally not a dependency: callers describe its inputs with `key`.
  }, [key])

  return state
}
