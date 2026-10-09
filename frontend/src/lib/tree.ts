import { createContext, useContext } from 'react'

/**
 * Sidebar tree state that outlives a page: which folders are expanded (several at
 * once), which subfolders are collapsed, and a version that bumps whenever files or
 * subfolders change so every open tree refetches.
 */
export type TreeCtx = {
  expanded: Set<string>
  toggle: (folderId: string) => void
  expand: (folderId: string) => void
  collapsedDirs: Set<string> // "folderId/sub/dir"
  toggleDir: (key: string) => void
  version: number
  changed: () => void
}

export const TreeContext = createContext<TreeCtx>({
  expanded: new Set(),
  toggle: () => {},
  expand: () => {},
  collapsedDirs: new Set(),
  toggleDir: () => {},
  version: 0,
  changed: () => {},
})

export const useTree = () => useContext(TreeContext)
