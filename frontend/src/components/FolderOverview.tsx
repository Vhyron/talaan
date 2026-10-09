import { useEffect, useState } from 'react'
import { FileText, Folder as FolderIcon, Lock } from 'lucide-react'
import { api } from '../api/client'
import type { FileEntry } from '../api/types'
import { fileLabel } from '../lib/format'
import { noun, useFolder } from '../lib/folderContext'
import { useTree } from '../lib/tree'

const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`)
const ext = (p: string) => p.split('.').pop()?.toUpperCase() ?? ''
const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')

/** What you see when a folder opens: its subfolders and files as cards, like the home page. */
export default function FolderOverview({ onOpen }: { onOpen: (path: string) => void }) {
  const { folder, files } = useFolder()
  const tree = useTree()
  const [dirs, setDirs] = useState<string[]>([])

  useEffect(() => {
    api.dirs(folder.id).then(setDirs).catch(() => setDirs([]))
  }, [folder.id, tree.version])

  // Group files by their subfolder; empty subfolders still get a section.
  const groups = new Map<string, FileEntry[]>([['', []], ...dirs.map((d) => [d, []] as [string, FileEntry[]])])
  for (const f of files) {
    const d = dirOf(f.path)
    groups.set(d, [...(groups.get(d) ?? []), f])
  }
  const sections = [...groups].filter(([d, fs]) => d === '' ? fs.length > 0 : true).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight break-words sm:text-3xl">{folder.name}</h1>
        <span className="rounded bg-panel px-1.5 py-0.5 text-[11px] font-semibold uppercase">{folder.mode}</span>
      </div>
      <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted">
        <Lock size={12} /> {files.length} file{files.length === 1 ? '' : 's'}
        {dirs.length > 0 && <> · {dirs.length} subfolder{dirs.length === 1 ? '' : 's'}</>}
        {' '}· sealed: the AI only sees this {noun(folder.mode).toLowerCase()}
      </p>

      {!files.length && !dirs.length && (
        <p className="mt-8 rounded-xl border border-dashed border-line p-6 text-center text-muted">
          This {noun(folder.mode).toLowerCase()} is empty. Drop files here, or hover it in the folder list and use Import here.
        </p>
      )}

      {sections.map(([dir, fs]) => (
        <section key={dir || '(top)'} className="mt-7" aria-label={dir || 'Files'}>
          {dir && (
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
              <FolderIcon size={15} className="shrink-0 text-muted" />
              <span className="break-words">{dir}</span>
              <span className="font-normal text-muted">· {fs.length}</span>
            </h2>
          )}
          {fs.length ? (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {fs.map((f) => (
                <li key={f.path}>
                  <button
                    onClick={() => onOpen(f.path)}
                    title={f.path}
                    className="flex h-full w-full items-start gap-3 rounded-xl border border-line p-4 text-left hover:border-brand hover:bg-brand-soft/40"
                  >
                    <FileText size={18} className="mt-0.5 shrink-0 text-brand-text" />
                    <span className="min-w-0">
                      <span className="line-clamp-2 font-semibold break-words">{fileLabel(f.path)}</span>
                      <span className="mt-1 block text-xs text-muted">
                        <span className="rounded bg-panel px-1 font-semibold">{ext(f.path)}</span> · {kb(f.size)} · {new Date(f.mtime).toLocaleDateString()}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Empty subfolder.</p>
          )}
        </section>
      ))}
    </div>
  )
}
