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
  /** Whether a subfolder ("folderId/sub/dir") is open. Open by default until Collapse all. */
  dirOpen: (key: string) => boolean
  toggleDir: (key: string) => void
  /** Collapse every Space and subfolder. */
  collapseAll: () => void
  version: number
  changed: () => void
  /** Re-fetch the list of Spaces (after a rename). */
  foldersChanged: () => void
}

export const TreeContext = createContext<TreeCtx>({
  expanded: new Set(),
  toggle: () => {},
  expand: () => {},
  dirOpen: () => true,
  toggleDir: () => {},
  collapseAll: () => {},
  version: 0,
  changed: () => {},
  foldersChanged: () => {},
})

export const useTree = () => useContext(TreeContext)
