import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FolderInput, Lock, Plus } from 'lucide-react'
import { api } from '../api/client'
import type { Folder, Mode } from '../api/types'
import Sidebar from '../components/Sidebar'
import HomeChat from '../components/HomeChat'
import { DropZone } from '../components/ImportDrop'
import { useImportDialog } from '../lib/importDialog'

export default function FoldersPage({ folders, error, onCreated }: {
  folders: Folder[]
  error: string | null
  onCreated: () => void
}) {
  const [creating, setCreating] = useState<Mode | null>(null)
  const importDialog = useImportDialog()

  return (
    <div className="flex min-h-0 flex-1">
      <Sidebar folders={folders} error={error} />
      <DropZone onFiles={(u) => { setCreating(null); importDialog.open(u) }}>
      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-10 sm:py-8">
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto w-full sm:w-auto">
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Your folders</h1>
            <p className="mt-1 text-muted">Each folder is sealed. The AI only sees the one you open.</p>
          </div>
          <button className="btn-ghost inline-flex items-center gap-1.5" onClick={() => setCreating('case')}>
            <Plus size={16} /> New Case
          </button>
          <button className="btn-ghost inline-flex items-center gap-1.5" onClick={() => setCreating('chart')}>
            <Plus size={16} /> New Chart
          </button>
          <button className="btn-ghost inline-flex items-center gap-1.5" onClick={() => { setCreating(null); importDialog.open() }}>
            <FolderInput size={16} /> Import folder
          </button>
        </div>

        {creating && <NewFolder mode={creating} onDone={() => { setCreating(null); onCreated() }} onCancel={() => setCreating(null)} />}

        <HomeChat folders={folders} />


        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {folders.map((f) => (
            <li key={f.id}>
              <Link
                to={`/folders/${encodeURIComponent(f.id)}`}
                className="block rounded-xl border border-line p-4 hover:border-brand hover:bg-brand-soft/40"
              >
                <span className="rounded bg-panel px-1.5 py-0.5 text-[11px] font-semibold uppercase">{f.mode}</span>
                <p className="mt-2 font-bold">{f.name}</p>
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted">
                  <Lock size={11} /> Opened {new Date(f.created_at).toLocaleDateString()}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      </DropZone>
    </div>
  )
}

function NewFolder({ mode, onDone, onCancel }: { mode: Mode; onDone: () => void; onCancel: () => void }) {
  const noun = mode === 'case' ? 'Case' : 'Chart'
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      const folder = await api.createFolder({ name: name.trim(), mode })
      onDone()
      navigate(`/folders/${encodeURIComponent(folder.id)}`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel p-4">
      <label className="text-sm font-semibold" htmlFor="folder-name">New {noun}</label>
      <input
        id="folder-name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={mode === 'case' ? 'e.g. Case 2026-021 Santos' : 'e.g. Chart J. Cruz'}
        className="w-full min-w-0 flex-1 rounded-full sm:w-auto sm:min-w-64 border border-line bg-white px-4 py-2 text-sm outline-none focus:border-brand"
      />
      <button className="btn-primary" disabled={!name.trim()}>Create {noun}</button>
      <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
      {error && <p className="w-full text-sm text-red-700">{error}</p>}
    </form>
  )
}
