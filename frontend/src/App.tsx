import { useCallback, useEffect, useMemo, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { api } from './api/client'
import type { Folder } from './api/types'
import TopBar from './components/TopBar'
import FoldersPage from './pages/FoldersPage'
import FolderPage from './pages/FolderPage'
import SettingsPage from './pages/SettingsPage'
import { NavContext } from './lib/nav'

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

  return (
    <NavContext.Provider value={nav}>
      <div className="flex h-dvh flex-col">
        <TopBar modelVersion={modelVersion} />
        <Routes>
          <Route path="/" element={<FoldersPage folders={folders} error={error} onCreated={refresh} />} />
          <Route path="/folders/:id" element={<FolderPage folders={folders} error={error} />} />
          <Route path="/settings" element={<SettingsPage onModelChanged={() => setModelVersion((v) => v + 1)} />} />
        </Routes>
      </div>
    </NavContext.Provider>
  )
}
