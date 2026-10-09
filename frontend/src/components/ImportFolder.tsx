import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { FolderInput, X } from 'lucide-react'
import { api } from '../api/client'
import type { Mode } from '../api/types'
import { fromDataTransfer, fromFileList, splitImportable, stripTopFolder, type Upload } from '../lib/upload'

/**
 * Dialog: create a new Case or Chart from a folder on this computer. Its .md/.txt/.pdf
 * files are imported with their subfolders. `initial` is set when a folder was dropped.
 */
export default function ImportFolder({ initial, onDone, onClose }: {
  initial: Upload[] | null
  onDone: () => void
  onClose: () => void
}) {
  const [uploads, setUploads] = useState<Upload[] | null>(null)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<Mode>('case')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
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
    if (initial?.length) take(initial)
  }, [initial])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const split = uploads ? splitImportable(uploads) : null
  const dirs = split ? new Set(split.accepted.filter((u) => u.path.includes('/')).map((u) => u.path.slice(0, u.path.lastIndexOf('/')))) : null

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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center" onClick={() => !busy && onClose()}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Import a folder"
        className="max-h-[90dvh] w-full space-y-4 overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-sm shadow-xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Import a folder</h2>
            <p className="mt-0.5 text-xs text-muted">Creates a new Case or Chart. Only .md, .txt and .pdf files are imported; subfolders are kept.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-panel" aria-label="Close import">
            <X size={16} />
          </button>
        </div>

        <div
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true) } }}
          onDragLeave={() => setOver(false)}
          onDrop={async (e) => { e.preventDefault(); setOver(false); take(await fromDataTransfer(e.dataTransfer)) }}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-5 text-center ${over ? 'border-brand bg-brand-soft' : 'border-line bg-panel/50'}`}
        >
          <FolderInput size={22} className="text-brand-text" />
          <p className="text-muted">Drag a folder from File Explorer here, or</p>
          <button type="button" className="btn-ghost text-sm" onClick={() => dirInput.current?.click()}>
            {uploads ? 'Choose another folder' : 'Choose folder'}
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

        {split && (
          <div className="space-y-3">
            <p>
              <b>{split.accepted.length}</b> file{split.accepted.length === 1 ? '' : 's'} to import
              {dirs && dirs.size > 0 && <> in <b>{dirs.size}</b> subfolder{dirs.size === 1 ? '' : 's'}</>}
              {split.skipped.length > 0 && <span className="text-muted"> · {split.skipped.length} skipped (not .md, .txt or .pdf, or hidden)</span>}
            </p>
            {split.accepted.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <div role="radiogroup" aria-label="Folder type" className="flex rounded-full bg-panel p-1">
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
                  className="min-w-0 flex-1 basis-48 rounded-full border border-line bg-white px-4 py-2 outline-none focus:border-brand"
                />
              </div>
            )}
            {!split.accepted.length && <p className="rounded-lg bg-warn-soft px-3 py-2 text-warn-text">That folder has no .md, .txt or .pdf files, so there is nothing to import.</p>}
          </div>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy || !split?.accepted.length || !name.trim()}>
            {busy ? 'Importing…' : `Create ${mode === 'case' ? 'Case' : 'Chart'} and import`}
          </button>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
