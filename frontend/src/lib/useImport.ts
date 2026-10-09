import { useState } from 'react'
import { api } from '../api/client'
import { useFolder } from './folderContext'
import { useTree } from './tree'
import { splitImportable, type Upload } from './upload'

/** Import into the open folder (optionally a subfolder), then re-index it. */
export function useImport() {
  const { folder, refreshFiles, bump } = useFolder()
  const tree = useTree()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  /** `keepPaths`: recreate dropped folders' subfolders (used for drag-and-drop). */
  async function importUploads(uploads: Upload[], opts: { dest?: string; keepPaths?: boolean } = {}) {
    const { accepted, skipped } = splitImportable(uploads)
    if (!accepted.length) return setMessage('Only .md, .txt and .pdf files can be imported.')
    setBusy(true)
    setMessage(null)
    try {
      const saved = await api.importFiles(folder.id, accepted, opts)
      await api.reindex(folder.id).catch(() => undefined) // index may not exist yet (B3)
      refreshFiles()
      tree.changed()
      bump()
      const where = opts.dest ? ` into ${opts.dest}` : ''
      setMessage(`Imported ${saved.length} file${saved.length === 1 ? '' : 's'}${where}${skipped.length ? `, skipped ${skipped.length}` : ''}.`)
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return { importUploads, busy, message, clear: () => setMessage(null) }
}
