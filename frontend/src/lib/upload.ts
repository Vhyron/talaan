/** Files picked or dropped by the user, with their path relative to what was chosen. */
export type Upload = { file: File; path: string }

export const ACCEPT = ['.md', '.txt', '.pdf']
export const isImportable = (name: string) => ACCEPT.some((ext) => name.toLowerCase().endsWith(ext))

/** From an <input type="file"> (with or without `webkitdirectory`). */
export function fromFileList(list: FileList | File[]): Upload[] {
  return Array.from(list).map((file) => ({ file, path: file.webkitRelativePath || file.name }))
}

async function walk(entry: FileSystemEntry, prefix: string): Promise<Upload[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))
    return [{ file, path: prefix + entry.name }]
  }
  if (!entry.isDirectory) return []
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  const children: FileSystemEntry[] = []
  // readEntries returns results in batches; keep reading until it returns none.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
    if (!batch.length) break
    children.push(...batch)
  }
  const nested = await Promise.all(children.map((c) => walk(c, `${prefix}${entry.name}/`)))
  return nested.flat()
}

/** From a drag-and-drop: walks dropped folders so subfolders keep their paths. */
export async function fromDataTransfer(dt: DataTransfer): Promise<Upload[]> {
  const entries = Array.from(dt.items)
    .filter((i) => i.kind === 'file')
    .map((i) => i.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => Boolean(e))
  if (!entries.length) return fromFileList(dt.files)
  return (await Promise.all(entries.map((e) => walk(e, '')))).flat()
}

/**
 * Split off the chosen folder's own name: "Case files/Interviews/a.md" becomes
 * "Interviews/a.md" with name "Case files". Returns name null when the uploads
 * aren't all inside one top folder (e.g. loose files were picked).
 */
export function stripTopFolder(uploads: Upload[]): { name: string | null; uploads: Upload[] } {
  const tops = new Set(uploads.map((u) => (u.path.includes('/') ? u.path.split('/')[0] : null)))
  if (tops.size !== 1 || tops.has(null)) return { name: null, uploads }
  const [name] = tops as Set<string>
  return { name, uploads: uploads.map((u) => ({ ...u, path: u.path.slice(name.length + 1) })) }
}

/** Split into importable files and skipped ones (also hidden files like .DS_Store). */
export function splitImportable(uploads: Upload[]): { accepted: Upload[]; skipped: Upload[] } {
  const accepted: Upload[] = []
  const skipped: Upload[] = []
  for (const u of uploads) {
    const hidden = u.path.split('/').some((seg) => seg.startsWith('.'))
    ;(isImportable(u.path) && !hidden ? accepted : skipped).push(u)
  }
  return { accepted, skipped }
}
