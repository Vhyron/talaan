import { useCallback, useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { api } from './api/client'
import type { Folder } from './api/types'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
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
      <div className="flex min-h-0 flex-1">
        <Sidebar folders={folders} error={error} />
        <main className="flex min-w-0 flex-1 flex-col">
          <Routes>
            <Route path="/" element={<FoldersPage folders={folders} />} />
            <Route path="/folders/:id" element={<FolderPage folders={folders} />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
