import { useEffect, useState } from 'react'

/** Seconds since `running` became true (or since `since`, a Date.now() value, if given).
 * Local models are slow; show it's working. */
export function useElapsed(running: boolean, since?: number): number {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!running) return
    const start = since ?? Date.now()
    const tick = () => setSeconds(Math.floor((Date.now() - start) / 1000))
    tick()
    const t = setInterval(tick, 250)
    return () => clearInterval(t)
  }, [running, since])
  return seconds
}
