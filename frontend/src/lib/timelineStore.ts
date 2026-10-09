import { useSyncExternalStore } from 'react'
import { api } from '../api/client'
import type { TimelineResponse } from '../api/types'

/**
 * Timelines per Space and subfolder scope ("" = the whole Space), kept outside the panel. Building one takes a minute or two on a
 * laptop; switching to another tool or folder unmounts the panel, so the build and its
 * result live here and are still there when you come back.
 */
export type TimelineState = { data: TimelineResponse | null; busy: boolean; since: number; error: string | null }

const EMPTY: TimelineState = { data: null, busy: false, since: 0, error: null }
const byFolder = new Map<string, TimelineState>()
const listeners = new Set<() => void>()

const keyOf = (folderId: string, dir: string) => `${folderId}::${dir}`
const get = (key: string) => byFolder.get(key) ?? EMPTY

function set(key: string, change: Partial<TimelineState>) {
  byFolder.set(key, { ...get(key), ...change })
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Build (or rebuild) the timeline of a Space or one of its subfolders. Keeps running if the panel unmounts. */
export async function buildTimeline(folderId: string, dir = '') {
  const key = keyOf(folderId, dir)
  if (get(key).busy) return
  set(key, { busy: true, since: Date.now(), error: null })
  try {
    set(key, { data: await api.timeline(folderId, dir || undefined) })
  } catch (e) {
    set(key, { error: (e as Error).message })
  } finally {
    set(key, { busy: false })
  }
}

export function useTimeline(folderId: string, dir = ''): TimelineState {
  return useSyncExternalStore(subscribe, () => get(keyOf(folderId, dir)))
}
