import { useSyncExternalStore } from 'react'
import { api } from '../api/client'
import type { TimelineResponse } from '../api/types'

/**
 * Timelines per folder, kept outside the panel. Building one takes a minute or two on a
 * laptop; switching to another tool or folder unmounts the panel, so the build and its
 * result live here and are still there when you come back.
 */
export type TimelineState = { data: TimelineResponse | null; busy: boolean; since: number; error: string | null }

const EMPTY: TimelineState = { data: null, busy: false, since: 0, error: null }
const byFolder = new Map<string, TimelineState>()
const listeners = new Set<() => void>()

const get = (folderId: string) => byFolder.get(folderId) ?? EMPTY

function set(folderId: string, change: Partial<TimelineState>) {
  byFolder.set(folderId, { ...get(folderId), ...change })
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Build (or rebuild) this folder's timeline. Keeps running if the panel unmounts. */
export async function buildTimeline(folderId: string) {
  if (get(folderId).busy) return
  set(folderId, { busy: true, since: Date.now(), error: null })
  try {
    set(folderId, { data: await api.timeline(folderId) })
  } catch (e) {
    set(folderId, { error: (e as Error).message })
  } finally {
    set(folderId, { busy: false })
  }
}

export function useTimeline(folderId: string): TimelineState {
  return useSyncExternalStore(subscribe, () => get(folderId))
}
