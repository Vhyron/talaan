import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderInput } from 'lucide-react'
import { api } from '../api/client'
import type { Mode } from '../api/types'
import { fromFileList, splitImportable, stripTopFolder, type Upload } from '../lib/upload'

/**
 * Create a new Case or Chart from a folder on this computer: its .md/.txt/.pdf files
 * are imported with their subfolders. `initial` is set when a folder was dropped.
 */
export default function ImportFolder({ initial, onDone, onCancel }: {
  initial: Upload[] | null
  onDone: () => void
  onCancel: () => void
}) {
  const [uploads, setUploads] = useState<Upload[] | null>(null)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<Mode>('case')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirInput = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // `webkitdirectory` lets the picker choose a whole folder; React has no typed prop for it.
  useEffect(() => {
    dirInput.current?.setAttribute('webkitdirectory', '')
  }, [])

  function take(all: Upload[]) {
    const { name: top, uploads: inside } = stripTopFolder(all)
    setUploads(inside)
    setError(null)
    if (top) {
      setName(top)
      if (/^chart\b/i.test(top)) setMode('chart')
      else if (/^case\b/i.test(top)) setMode('case')
    }
  }

  useEffect(() => {
    if (initial) take(initial)
  }, [initial])

  const split = uploads ? splitImportable(uploads) : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!split?.accepted.length) return
    setBusy(true)
    setError(null)
    try {
      const folder = await api.createFolder({ name: name.trim(), mode })
      await api.importFiles(folder.id, split.accepted, { keepPaths: true })
      await api.reindex(folder.id).catch(() => undefined)
      onDone()
      navigate(`/folders/${encodeURIComponent(folder.id)}`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const dirs = split ? new Set(split.accepted.filter((u) => u.path.includes('/')).map((u) => u.path.slice(0, u.path.lastIndexOf('/')))) : null

  return (
    <form onSubmit={submit} className="mt-5 space-y-3 rounded-xl border border-line bg-panel p-4" aria-label="Import a folder">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-semibold">Import a folder as a new Case or Chart</p>
        <button type="button" className="btn-ghost inline-flex items-center gap-1.5 text-sm" onClick={() => dirInput.current?.click()}>
          <FolderInput size={15} /> {uploads ? 'Choose another folder' : 'Choose folder'}
        </button>
        <input
          ref={dirInput}
          type="file"
          multiple
          className="hidden"
          aria-label="Choose a folder to import"
          onChange={(e) => { if (e.target.files?.length) take(fromFileList(e.target.files)); e.target.value = '' }}
        />
      </div>
      <p className="text-xs text-muted">Or drag a folder from File Explorer onto this page. Only .md, .txt and .pdf files are imported; subfolders are kept.</p>

      {split && (
        <>
          <p className="text-sm">
            <b>{split.accepted.length}</b> file{split.accepted.length === 1 ? '' : 's'} to import
            {dirs && dirs.size > 0 && <> in <b>{dirs.size}</b> subfolder{dirs.size === 1 ? '' : 's'}</>}
            {split.skipped.length > 0 && <span className="text-muted"> · {split.skipped.length} skipped (not .md, .txt or .pdf)</span>}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <div role="radiogroup" aria-label="Folder type" className="flex rounded-full bg-white p-1 text-sm">
              {(['case', 'chart'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-full px-3 py-1 font-semibold ${mode === m ? 'bg-brand text-white' : 'text-muted'}`}
                >
                  {m === 'case' ? 'Case' : 'Chart'}
                </button>
              ))}
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Name"
              placeholder={mode === 'case' ? 'e.g. Case 2026-021 Santos' : 'e.g. Chart J. Cruz'}
              className="w-full min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2 text-sm outline-none focus:border-brand sm:w-auto sm:min-w-64"
            />
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy || !split?.accepted.length || !name.trim()}>
          {busy ? 'Importing…' : `Create ${mode === 'case' ? 'Case' : 'Chart'} and import`}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
      {split && !split.accepted.length && <p className="text-sm text-warn-text">That folder has no .md, .txt or .pdf files.</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  )
}
