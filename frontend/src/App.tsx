import { useCallback, useEffect, useMemo, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { api } from './api/client'
import type { Folder } from './api/types'
import TopBar from './components/TopBar'
import FoldersPage from './pages/FoldersPage'
import FolderPage from './pages/FolderPage'
import TrashPage from './pages/TrashPage'
import SettingsPage from './pages/SettingsPage'
import { NavContext } from './lib/nav'
import { TreeContext, type TreeCtx } from './lib/tree'
import { ImportDialogContext } from './lib/importDialog'
import type { Upload } from './lib/upload'
import ImportFolder from './components/ImportFolder'

export default function App() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [error, setError] = useState<string | null>(null)
  const [modelVersion, setModelVersion] = useState(0)
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()

  const refresh = useCallback(() => {
    api.folders()
      .then((fs) => { setFolders(fs); setError(null) })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(refresh, [refresh])

  // Close the drawer whenever the route changes.
  useEffect(() => setNavOpen(false), [location.pathname])

  const nav = useMemo(() => ({ open: navOpen, setOpen: setNavOpen }), [navOpen])

  // Sidebar tree: several folders can stay expanded while you move between them.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Subfolders start open; after Collapse all they start closed. `dirFlips` are the ones toggled since.
  const [dirsOpen, setDirsOpen] = useState(true)
  const [dirFlips, setDirFlips] = useState<Set<string>>(new Set())
  const [treeVersion, setTreeVersion] = useState(0)
  const flip = (set: Set<string>, key: string) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  }
  const expand = useCallback((id: string) => setExpanded((s) => (s.has(id) ? s : new Set(s).add(id))), [])
  const changed = useCallback(() => setTreeVersion((v) => v + 1), [])
  // Any change to folders or files (rename, import, new subfolder) also refreshes the folder list.
  useEffect(() => { if (treeVersion) refresh() }, [treeVersion, refresh])
  const tree: TreeCtx = useMemo(() => ({
    expanded,
    toggle: (id) => setExpanded((s) => flip(s, id)),
    expand,
    dirOpen: (key) => dirsOpen !== dirFlips.has(key),
    toggleDir: (key) => setDirFlips((s) => flip(s, key)),
    collapseAll: () => {
      setExpanded(new Set())
      setDirFlips(new Set())
      setDirsOpen(false)
    },
    version: treeVersion,
    changed,
    foldersChanged: refresh,
  }), [expanded, expand, dirsOpen, dirFlips, treeVersion, changed, refresh])

  // App-wide "Import folder" dialog: null = closed, [] = open empty, else dropped files.
  const [importing, setImporting] = useState<Upload[] | null>(null)
  const importDialog = useMemo(() => ({ open: (dropped?: Upload[]) => setImporting(dropped ?? []) }), [])

  return (
    <NavContext.Provider value={nav}>
    <TreeContext.Provider value={tree}>
    <ImportDialogContext.Provider value={importDialog}>
      <div className="flex h-dvh flex-col">
        <TopBar modelVersion={modelVersion} />
        <Routes>
          <Route path="/" element={<FoldersPage folders={folders} error={error} onCreated={() => { refresh(); changed() }} />} />
          <Route path="/folders/:id" element={<FolderPage folders={folders} error={error} />} />
          <Route path="/trash" element={<TrashPage folders={folders} error={error} />} />
          <Route path="/settings" element={<SettingsPage onModelChanged={() => setModelVersion((v) => v + 1)} />} />
        </Routes>
      </div>
      {importing && (
        <ImportFolder
          initial={importing}
          onDone={() => { setImporting(null); refresh(); changed() }}
          onClose={() => setImporting(null)}
        />
      )}
    </ImportDialogContext.Provider>
    </TreeContext.Provider>
    </NavContext.Provider>
  )
}
