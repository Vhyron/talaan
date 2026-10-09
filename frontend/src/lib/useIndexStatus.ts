import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { IndexStatus } from '../api/types'
import { useFolder } from './folderContext'

export type IndexState = { state: 'indexing' } | { state: 'ready'; status: IndexStatus } | { state: 'error'; message: string }

/**
 * Build or refresh the open folder's index when it opens and whenever its files change
 * (imports, approved edits). Incremental on the backend, so cheap when nothing changed.
 */
export function useIndexStatus(): IndexState & { retry: () => void } {
  const { folder, files } = useFolder()
  const [index, setIndex] = useState<IndexState>({ state: 'indexing' })
  const [attempt, setAttempt] = useState(0)
  const filesKey = files.map((f) => `${f.path}@${f.mtime}`).join('|')

  useEffect(() => {
    let cancelled = false
    setIndex({ state: 'indexing' })
    api.reindex(folder.id)
      .then((status) => { if (!cancelled) setIndex({ state: 'ready', status }) })
      .catch((e: Error) => { if (!cancelled) setIndex({ state: 'error', message: e.message }) })
    return () => { cancelled = true }
  }, [folder.id, filesKey, attempt])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])
  return { ...index, retry }
}
