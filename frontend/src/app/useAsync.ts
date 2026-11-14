import { useEffect, useState } from 'react'

/**
 * `data` is only guaranteed to belong to the current key when status is "ready".
 * While loading, and after an error, it holds the last successful result (possibly for
 * an earlier key) so views can dim it instead of flashing empty.
 */
export type AsyncState<T> =
  | { status: 'loading'; data: T | null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: T | null; error: Error }

interface Settled<T> {
  key: string | null
  data: T | null
  error: Error | null
}

/** Runs `load` whenever `key` changes. Callers put every input of `load` into `key`. */
export function useAsync<T>(load: () => Promise<T>, key: string): AsyncState<T> {
  const [settled, setSettled] = useState<Settled<T>>({ key: null, data: null, error: null })

  useEffect(() => {
    let cancelled = false
    load().then(
      (data) => {
        if (!cancelled) setSettled({ key, data, error: null })
      },
      (err: unknown) => {
        if (cancelled) return
        const error = err instanceof Error ? err : new Error(String(err))
        setSettled((prev) => ({ key, data: prev.data, error }))
      },
    )
    return () => {
      cancelled = true
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- `key` stands in for `load`'s inputs
  }, [key])

  if (settled.key !== key) return { status: 'loading', data: settled.data, error: null }
  if (settled.error) return { status: 'error', data: settled.data, error: settled.error }
  return { status: 'ready', data: settled.data as T, error: null }
}
