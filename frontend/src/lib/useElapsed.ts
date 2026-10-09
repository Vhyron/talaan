import { useEffect, useState } from 'react'

/** Seconds since `running` became true. Local models are slow; show it's working. */
export function useElapsed(running: boolean): number {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!running) return
    setSeconds(0)
    const start = Date.now()
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 250)
    return () => clearInterval(t)
  }, [running])
  return seconds
}
