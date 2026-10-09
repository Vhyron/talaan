import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Folder as FolderIcon, FolderOpen, RotateCcw, Trash2 } from 'lucide-react'
import { api } from '../api/client'
import type { Folder, TrashItem } from '../api/types'
import Sidebar from '../components/Sidebar'
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
        {items && !items.length && <p className="mt-6 text-muted">The Trash is empty.</p>}

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
                {purging === item.id && (
                  <div role="alertdialog" aria-label="Delete forever?" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                    <p>Delete <span className="font-semibold">{item.name}</span> permanently? This can't be undone. The audit log keeps the record that it existed.</p>
                    <div className="mt-2 flex gap-2">
                      <button autoFocus onClick={() => purge(item)} disabled={busy === item.id} className="rounded-full bg-red-700 px-3 py-1.5 font-semibold text-white disabled:opacity-50">Delete forever</button>
                      <button onClick={() => setPurging(null)} className="rounded-full px-3 py-1.5 hover:bg-white">Cancel</button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </main>
    </div>
  )
}
