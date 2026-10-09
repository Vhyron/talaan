import { useParams } from 'react-router-dom'
import type { Folder } from '../api/types'

// C1 placeholder. C2 adds the file list, viewer and the right-hand tabs.
export default function FolderPage({ folders }: { folders: Folder[] }) {
  const { id } = useParams()
  const folder = folders.find((f) => f.id === id)

  return (
    <div className="px-10 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight">{folder?.name ?? id}</h1>
      <p className="mt-1 text-muted">Folder view coming in C2.</p>
    </div>
  )
}
