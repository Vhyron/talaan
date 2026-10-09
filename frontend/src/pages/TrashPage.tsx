import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Folder as FolderIcon, FolderOpen, RotateCcw, Trash2 } from 'lucide-react'
import { api } from '../api/client'
import type { Folder, TrashItem } from '../api/types'
import Sidebar from '../components/Sidebar'
import ConfirmDialog from '../components/ConfirmDialog'
import Mascot from '../components/Mascot'
import { ago, fileLabel } from '../lib/format'
import { useTree } from '../lib/tree'

const KIND = { file: 'File', dir: 'Subfolder', folder: 'Folder' } as const

/** Deleted files, subfolders and folders: restore them, or delete them for good. */
export default function TrashPage({ folders, error }: { folders: Folder[]; error: string | null }) {
  const tree = useTree()
  const [items, setItems] = useState<TrashItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [note, setNote] = useState<{ text: string; error?: boolean; folderId?: string } | null>(null)
  const [purging, setPurging] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const purgeItem = items?.find((i) => i.id === purging)

  const load = useCallback(() => {
    api.trash().then((t) => { setItems(t); setLoadError(null) }).catch((e) => setLoadError(e.message))
  }, [])
  useEffect(load, [load, tree.version])

  async function restore(item: TrashItem) {
    setBusy(item.id)
    try {
      await api.restore(item.id)
      setNote({ text: `Restored ${item.kind === 'folder' ? item.name : item.path} to ${item.folder_name}.`, folderId: item.folder_id })
      tree.changed()
    } catch (e) {
      setNote({ text: (e as Error).message, error: true })
    } finally {
      setBusy(null)
    }
  }

  async function purge(item: TrashItem) {
    setBusy(item.id)
    try {
      await api.purge(item.id)
      setPurging(null)
      setNote({ text: `Deleted ${item.kind === 'folder' ? item.name : item.path} permanently. The audit log keeps the record.` })
      load()
    } catch (e) {
      setNote({ text: (e as Error).message, error: true })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      <Sidebar folders={folders} error={error} />
      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-10 sm:py-8">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight sm:text-3xl"><Trash2 size={24} /> Trash</h1>
        <p className="mt-1 text-muted">
          Deleted files and folders wait here, outside every folder: the AI can't read them. Restore puts them back where they were.
        </p>

        {note && (
          <p role="status" className={`mt-4 rounded-lg px-3 py-2 text-sm ${note.error ? 'bg-red-50 text-red-800' : 'bg-brand-soft text-brand-text'}`}>
            {note.text}{' '}
            {note.folderId && <Link className="font-semibold underline" to={`/folders/${encodeURIComponent(note.folderId)}`}>Open folder</Link>}
          </p>
        )}
        {loadError && <p className="mt-4 text-red-700">{loadError}</p>}
        {items && !items.length && (
          <div className="mt-8 flex flex-col items-center text-center text-muted">
            <Mascot pose="sealed" className="h-28 w-28" />
            <p className="mt-3">The Trash is empty.</p>
          </div>
        )}

        <ul className="mt-6 space-y-2">
          {items?.map((item) => {
            const Icon = item.kind === 'file' ? FileText : item.kind === 'dir' ? FolderOpen : FolderIcon
            return (
              <li key={item.id} className="rounded-xl border border-line p-3 sm:p-4">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                  <Icon size={18} className="mt-0.5 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold break-words">{item.kind === 'file' ? fileLabel(item.path) : item.name}</p>
                    <p className="text-xs break-words text-muted">
                      {KIND[item.kind]}{item.kind === 'folder' ? '' : ` in ${item.folder_name} · ${item.path}`} · deleted {ago(item.deleted_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => restore(item)} disabled={busy === item.id} className="btn-ghost inline-flex items-center gap-1.5 !px-3 !py-1.5 text-sm disabled:opacity-50">
                      <RotateCcw size={14} /> Restore
                    </button>
                    <button onClick={() => setPurging(item.id)} disabled={busy === item.id} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50" aria-label={`Delete ${item.name} forever`}>
                      <Trash2 size={14} /> Delete forever
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </main>
      {purgeItem && (
        <ConfirmDialog
          title="Delete forever?"
          confirmLabel="Delete forever"
          busyLabel="Deleting…"
          busy={busy === purgeItem.id}
          onConfirm={() => purge(purgeItem)}
          onClose={() => setPurging(null)}
        >
          <p><span className="font-semibold break-words text-ink">{purgeItem.kind === 'folder' ? purgeItem.name : purgeItem.path}</span> will be deleted permanently. This can't be undone.</p>
          <p>The audit log keeps the record that it existed.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}
