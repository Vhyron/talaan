import { useCallback, useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { api } from './api/client'
import type { Folder } from './api/types'
import TopBar from './components/TopBar'
import FoldersPage from './pages/FoldersPage'
import FolderPage from './pages/FolderPage'

export default function App() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    api.folders()
      .then((fs) => { setFolders(fs); setError(null) })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(refresh, [refresh])

  return (
    <div className="flex h-screen flex-col">
      <TopBar />
      <Routes>
        <Route path="/" element={<FoldersPage folders={folders} error={error} onCreated={refresh} />} />
        <Route path="/folders/:id" element={<FolderPage folders={folders} error={error} />} />
      </Routes>
    </div>
  )
}
