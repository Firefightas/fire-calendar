import { useCallback, useEffect, useState } from 'react'

/** Milliseconds of wall time per simulated hour. */
const TICK_MS = 110

/** A clock over 0 … `hours` for replaying a finished run. */
export function usePlayback(hours: number) {
  const [hour, setHour] = useState(0)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      setHour((h) => Math.min(h + 1, hours))
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [playing, hours])

  // Stop at the end.
  if (playing && hour >= hours) setPlaying(false)

  const start = useCallback(() => {
    setHour(0)
    setPlaying(true)
  }, [])
  const toggle = useCallback(() => {
    setHour((h) => (h >= hours ? 0 : h))
    setPlaying((p) => !p)
  }, [hours])
  const seek = useCallback((h: number) => {
    setPlaying(false)
    setHour(h)
  }, [])
  const reset = useCallback(() => {
    setPlaying(false)
    setHour(0)
  }, [])

  return { hour, playing, start, toggle, seek, reset }
}
