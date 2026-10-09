import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { BookOpen, FileText, Folder as FolderIcon, Lock } from 'lucide-react'
import { api } from '../api/client'
import type { FileEntry } from '../api/types'
import { fileLabel } from '../lib/format'
import { noun, SHOW_MODE, useFolder } from '../lib/folderContext'
import { useTree } from '../lib/tree'

const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`)
const ext = (p: string) => p.split('.').pop()?.toUpperCase() ?? ''
const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
/** A Space's (or subfolder's) README.md is shown on its overview, not listed as a file. */
const readmeOf = (dir: string) => (dir ? `${dir}/README.md` : 'README.md')

/** The README rendered on the overview, like a repository's front page. */
function Readme({ path, onOpen }: { path: string; onOpen: (path: string) => void }) {
  const { folder, version } = useFolder()
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    api.file(folder.id, path).then(setText).catch(() => setText(null))
  }, [folder.id, path, version])
  if (!text) return null
  return (
    <section aria-label="README" className="mt-6 rounded-xl border border-line">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-sm">
        <BookOpen size={15} className="text-brand-text" />
        <span className="font-semibold">README</span>
        {path === 'README.md' && <span className="text-muted">· the AI reads this in every chat in this Space</span>}
        <button onClick={() => onOpen(path)} className="ml-auto text-xs font-semibold text-brand-text hover:underline">Open</button>
      </div>
      <div className="prose-talaan px-4 pb-2 sm:px-6">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    </section>
  )
}

/** What you see when a Space (or one of its subfolders) opens: its subfolders and files as cards. */
export default function FolderOverview({ onOpen }: { onOpen: (path: string) => void }) {
  const { folder, files: allFiles, dir, openDir } = useFolder()
  const tree = useTree()
  const [allDirs, setAllDirs] = useState<string[]>([])

  useEffect(() => {
    api.dirs(folder.id).then(setAllDirs).catch(() => setAllDirs([]))
  }, [folder.id, tree.version])

  // A subfolder overview shows only what is under it; paths stay relative to the Space.
  const under = (p: string) => !dir || p.startsWith(`${dir}/`)
  const readme = allFiles.find((f) => f.path === readmeOf(dir))
  const files = allFiles.filter((f) => under(f.path) && f !== readme)
  const dirs = allDirs.filter((d) => d !== dir && under(d))

  // Group files by their subfolder; empty subfolders still get a section.
  const groups = new Map<string, FileEntry[]>([[dir, []], ...dirs.map((d) => [d, []] as [string, FileEntry[]])])
  for (const f of files) {
    const d = dirOf(f.path)
    groups.set(d, [...(groups.get(d) ?? []), f])
  }
  const sections = [...groups].filter(([d, fs]) => d === dir ? fs.length > 0 : true).sort(([a], [b]) => a.localeCompare(b))
  const crumbs = dir ? dir.split('/') : []

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
      {dir && (
        <nav aria-label="Breadcrumb" className="mb-1 flex flex-wrap items-center gap-1 text-sm text-muted">
          <button onClick={() => openDir('')} className="hover:text-ink hover:underline">{folder.name}</button>
          {crumbs.slice(0, -1).map((c, i) => (
            <span key={i} className="contents">
              <span>/</span>
              <button onClick={() => openDir(crumbs.slice(0, i + 1).join('/'))} className="hover:text-ink hover:underline">{c}</button>
            </span>
          ))}
          <span>/</span>
        </nav>
      )}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight break-words sm:text-3xl">{dir ? crumbs[crumbs.length - 1] : folder.name}</h1>
        {SHOW_MODE && !dir && folder.mode && <span className="rounded bg-panel px-1.5 py-0.5 text-[11px] font-semibold uppercase">{folder.mode}</span>}
      </div>
      <p className="mt-1 inline-flex flex-wrap items-center gap-1.5 text-sm text-muted">
        <Lock size={12} /> {files.length} file{files.length === 1 ? '' : 's'}
        {dirs.length > 0 && <> · {dirs.length} subfolder{dirs.length === 1 ? '' : 's'}</>}
        {' '}· sealed: the AI only sees this {noun(folder.mode)}
        {dir && <> · Chat scope: {dir} only</>}
      </p>

      {readme && <Readme path={readme.path} onOpen={onOpen} />}

      {!files.length && !dirs.length && !readme && (
        <p className="mt-8 rounded-xl border border-dashed border-line p-6 text-center text-muted">
          This {dir ? 'folder' : noun(folder.mode)} is empty. Drop files here, or hover it in the folder list and use Import here.
        </p>
      )}

      {sections.map(([d, fs]) => (
        <section key={d || '(top)'} className="mt-7" aria-label={d || 'Files'}>
          {d !== dir && (
            <h2 className="mb-2 text-sm font-bold">
              <button onClick={() => openDir(d)} className="flex items-center gap-1.5 text-left hover:underline" title={`Open ${d}`}>
                <FolderIcon size={15} className="shrink-0 text-muted" />
                <span className="break-words">{dir ? d.slice(dir.length + 1) : d}</span>
                <span className="font-normal text-muted">· {fs.length}</span>
              </button>
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
