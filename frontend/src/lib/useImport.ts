import { useState } from 'react'
import { api } from '../api/client'
import { useFolder } from './folderContext'

export const ACCEPT = ['.md', '.txt', '.pdf']
const ok = (f: File) => ACCEPT.some((ext) => f.name.toLowerCase().endsWith(ext))

/** Import files into the open folder, then re-index it. */
export function useImport() {
  const { folder, refreshFiles, bump } = useFolder()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function importFiles(list: FileList | File[]) {
    const files = Array.from(list)
    const accepted = files.filter(ok)
    const skipped = files.length - accepted.length
    if (!accepted.length) return setMessage('Only .md, .txt and .pdf files can be imported.')
    setBusy(true)
    setMessage(null)
    try {
      const saved = await api.importFiles(folder.id, accepted)
      await api.reindex(folder.id).catch(() => undefined) // index may not exist yet (B3)
      refreshFiles()
      bump()
      setMessage(`Imported ${saved.length} file${saved.length === 1 ? '' : 's'}${skipped ? `, skipped ${skipped}` : ''}.`)
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return { importFiles, busy, message, clear: () => setMessage(null) }
}
