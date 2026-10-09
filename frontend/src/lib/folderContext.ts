import { createContext, useContext } from 'react'
import type { FileEntry, Folder } from '../api/types'

export type FolderCtx = {
  folder: Folder
  files: FileEntry[]
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

/** "Case 2026-014" for cases, "Chart M. Reyes" for charts: used in refusals and labels. */
export function noun(mode: Folder['mode']): string {
  return mode === 'chart' ? 'Chart' : 'Case'
}
