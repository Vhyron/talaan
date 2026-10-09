import { createContext, useContext } from 'react'
import type { FileEntry, Folder } from '../api/types'

export type FolderCtx = {
  folder: Folder
  files: FileEntry[]
  /** The file in the active viewer tab, if any: the chat focuses on it. */
  currentPath: string | undefined
  /** The subfolder whose overview is open ("" = the whole Space): the chat's scope when no file is open. */
  dir: string
  /** Show the overview of a subfolder ("" = the whole Space). */
  openDir: (dir: string) => void
  /** Open a file in a tab and highlight lines start..end (1-based). */
  openSource: (path: string, start?: number, end?: number) => void
  /** Re-fetch the file list (after imports or approvals). */
  refreshFiles: () => void
  /** Bumped whenever something in the folder changed (approvals, imports). */
  version: number
  bump: () => void
}

export const FolderContext = createContext<FolderCtx | null>(null)

export function useFolder(): FolderCtx {
  const ctx = useContext(FolderContext)
  if (!ctx) throw new Error('useFolder must be used inside a folder view')
  return ctx
}

/** Case/chart labelling (badges, grouping, the type toggle). Off: every folder is just a Space. */
export const SHOW_MODE = false

/** "Case" or "Chart" while SHOW_MODE is on, else "Space": used in labels. */
export function noun(mode: Folder['mode']): string {
  if (!SHOW_MODE || !mode) return 'Space'
  return mode === 'chart' ? 'Chart' : 'Case'
}

/** What the chat answers from right now, keyed so each scope keeps its own chat. */
export function chatScope(currentPath: string | undefined, dir: string): { key: string; label: string } {
  if (currentPath) return { key: `file:${currentPath}`, label: `this file only (${currentPath.split('/').pop()})` }
  return dir ? { key: `dir:${dir}`, label: dir } : { key: 'space', label: 'whole Space' }
}
