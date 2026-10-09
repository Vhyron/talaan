import { api } from '../api/client'

/**
 * A file or subfolder was renamed. Open tabs and cached chat sources listen for this so
 * they follow the new name (the server already updated saved chats and pending approvals).
 */
export type Renamed = { folderId: string; from: string; to: string }

const listeners = new Set<(r: Renamed) => void>()

export function onRenamed(l: (r: Renamed) => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** `path` itself, or a path inside it, moved from `from` to `to`; else unchanged. */
export function movedPath(path: string, from: string, to: string): string {
  if (path === from) return to
  return path.startsWith(`${from}/`) ? to + path.slice(from.length) : path
}

/** Rename a file or subfolder (by the user) and tell everyone that shows its path. */
export async function renamePath(folderId: string, from: string, name: string): Promise<string> {
  const { path: to } = await api.renamePath(folderId, from, name)
  if (to !== from) listeners.forEach((l) => l({ folderId, from, to }))
  return to
}
