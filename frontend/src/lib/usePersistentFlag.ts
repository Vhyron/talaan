import { useCallback, useEffect, useState } from 'react'

const read = (key: string, fallback: boolean): boolean => {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback // storage blocked (private window, policy): just use the default
  }
}

/**
 * A yes/no UI preference remembered in this browser (e.g. a collapsed panel).
 * Every component using the same key stays in sync, also across pages.
 */
export function usePersistentFlag(key: string, fallback = false): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => read(key, fallback))

  useEffect(() => {
    const sync = (e: Event) => {
      if ((e as CustomEvent<string>).detail === key) setValue(read(key, fallback))
    }
    window.addEventListener('talaan-flag', sync)
    return () => window.removeEventListener('talaan-flag', sync)
  }, [key, fallback])

  const set = useCallback((v: boolean) => {
    setValue(v)
    try {
      localStorage.setItem(key, v ? '1' : '0')
    } catch {
      // not persisted; still applies for this page view
    }
    window.dispatchEvent(new CustomEvent('talaan-flag', { detail: key }))
  }, [key])

  return [value, set]
}
