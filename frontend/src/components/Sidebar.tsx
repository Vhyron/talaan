import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, FileText, Folder as FolderIcon, FolderInput, FolderOpen, FolderPlus, Upload as UploadIcon, X } from 'lucide-react'
import { api } from '../api/client'
import type { Folder, Mode } from '../api/types'
import { fileLabel } from '../lib/format'
import { useNav } from '../lib/nav'
import { useTree } from '../lib/tree'
import { useImportDialog } from '../lib/importDialog'
import { splitImportable, type Upload } from '../lib/upload'
import { useFilePicker } from '../lib/useFilePicker'

// Whether a mouse/touch button is currently held anywhere on the page.
let pointerIsDown = false
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => { pointerIsDown = true }, true)
  document.addEventListener('pointerup', () => { pointerIsDown = false }, true)
  document.addEventListener('pointercancel', () => { pointerIsDown = false }, true)
}

const GROUPS: { mode: Mode; label: string }[] = [
  { mode: 'case', label: 'HR cases' },
  { mode: 'chart', label: 'Clinic charts' },
]

/** Folder tree. Any number of folders can be expanded; the active one is highlighted.
 * Inline from `lg` up; below that it's a drawer opened from the top bar. */
export default function Sidebar({ folders, error, activeId, currentPath, onOpenFile }: {
  folders: Folder[]
  error: string | null
  activeId?: string
  currentPath?: string
  /** Opens a file in the active folder (other folders navigate there first). */
  onOpenFile?: (path: string) => void
}) {
  const nav = useNav()
  const tree = useTree()
  const importDialog = useImportDialog()
  const navigate = useNavigate()

  function openFolder(f: Folder) {
    tree.expand(f.id)
    if (f.id !== activeId) navigate(`/folders/${encodeURIComponent(f.id)}`)
  }

  function openFile(folderId: string, path: string) {
    nav.setOpen(false)
    if (folderId === activeId && onOpenFile) onOpenFile(path)
    else navigate(`/folders/${encodeURIComponent(folderId)}`, { state: { open: path } })
  }

  return (
    <>
    {nav.open && (
      <div className="fixed inset-0 z-30 bg-ink/30 lg:hidden" onClick={() => nav.setOpen(false)} aria-hidden="true" />
    )}
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col border-r border-line bg-white text-sm shadow-xl transition-transform lg:static lg:z-auto lg:w-64 lg:translate-x-0 lg:bg-panel/50 lg:shadow-none ${
        nav.open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4 lg:hidden">
        <span className="font-bold">Folders</span>
        <button onClick={() => nav.setOpen(false)} className="grid h-9 w-9 place-items-center rounded-md hover:bg-panel" aria-label="Close folders">
          <X size={18} />
        </button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto p-3" aria-label="Folders">
        {error && <p className="p-2 text-red-700">Backend unreachable: {error}</p>}
        {GROUPS.map(({ mode, label }) => {
          const group = folders.filter((f) => f.mode === mode)
          if (!group.length) return null
          return (
            <div key={mode} className="mb-4">
              <p className="eyebrow px-2 pb-2">{label}</p>
              {group.map((f) => {
                const expanded = tree.expanded.has(f.id)
                const active = f.id === activeId
                return (
                  <div key={f.id}>
                    <Row depth={0} actions={<DirActions folderId={f.id} dir="" label={f.name} />}>
                      <button
                        onClick={() => tree.toggle(f.id)}
                        className="grid h-6 w-5 shrink-0 place-items-center rounded hover:bg-panel"
                        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${f.name}`}
                        aria-expanded={expanded}
                      >
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <button
                        onClick={() => openFolder(f)}
                        className={`flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left ${active ? 'font-semibold' : ''}`}
                        aria-current={active ? 'page' : undefined}
                      >
                        {expanded ? <FolderOpen size={15} className="shrink-0" /> : <FolderIcon size={15} className="shrink-0" />}
                        <span className="truncate">{f.name}</span>
                      </button>
                    </Row>
                    {expanded && (
                      <FolderTree folderId={f.id} currentPath={active ? currentPath : undefined} onOpenFile={(p) => openFile(f.id, p)} />
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </nav>
      <div className="shrink-0 border-t border-line p-3">
        <button
          onClick={() => { nav.setOpen(false); importDialog.open() }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-medium hover:bg-panel"
          title="Create a new Case or Chart from a folder on this computer"
        >
          <FolderInput size={15} /> Import folder
          <span className="ml-auto text-[11px] font-normal text-muted">new Case/Chart</span>
        </button>
      </div>
    </aside>
    </>
  )
}

function Row({ depth, children, actions, selected }: { depth: number; children: ReactNode; actions?: ReactNode; selected?: boolean }) {
  return (
    <div
      className={`group flex flex-wrap items-center gap-0.5 rounded-md pr-1 ${selected ? 'bg-brand-soft font-semibold' : 'hover:bg-panel'}`}
      style={{ paddingLeft: `${0.25 + depth * 0.9}rem` }}
    >
      {children}
      {actions}
    </div>
  )
}

type Node = { name: string; path: string; dirs: Node[]; files: string[] }

function buildTree(dirs: string[], files: string[]): Node {
  const root: Node = { name: '', path: '', dirs: [], files: [] }
  const ensure = (path: string): Node => {
    let node = root
    for (const part of path.split('/').filter(Boolean)) {
      let next = node.dirs.find((d) => d.name === part)
      if (!next) {
        next = { name: part, path: node.path ? `${node.path}/${part}` : part, dirs: [], files: [] }
        node.dirs.push(next)
      }
      node = next
    }
    return node
  }
  dirs.forEach(ensure)
  for (const f of files) ensure(f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '').files.push(f)
  const sort = (n: Node) => { n.dirs.sort((a, b) => a.name.localeCompare(b.name)); n.dirs.forEach(sort) }
  sort(root)
  return root
}

/** One expanded folder: fetches its files and subfolders, refetching when anything changes. */
function FolderTree({ folderId, currentPath, onOpenFile }: { folderId: string; currentPath?: string; onOpenFile: (path: string) => void }) {
  const tree = useTree()
  const [root, setRoot] = useState<Node | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.files(folderId), api.dirs(folderId)])
      .then(([files, dirs]) => { setRoot(buildTree(dirs, files.map((f) => f.path))); setError(null) })
      .catch((e) => setError(e.message))
  }, [folderId, tree.version])

  if (error) return <p className="py-1 pl-8 text-xs text-red-700">{error}</p>
  if (!root) return <p className="py-1 pl-8 text-xs text-muted">Loading…</p>
  if (!root.dirs.length && !root.files.length) return <p className="py-1 pl-8 text-xs text-muted">Empty: import files or add a subfolder.</p>
  return <Children folderId={folderId} node={root} depth={1} currentPath={currentPath} onOpenFile={onOpenFile} />
}

function Children({ folderId, node, depth, currentPath, onOpenFile }: {
  folderId: string; node: Node; depth: number; currentPath?: string; onOpenFile: (path: string) => void
}) {
  const tree = useTree()
  return (
    <>
      {node.dirs.map((d) => {
        const key = `${folderId}/${d.path}`
        const open = !tree.collapsedDirs.has(key)
        return (
          <div key={d.path}>
            <Row depth={depth} actions={<DirActions folderId={folderId} dir={d.path} />}>
              <button
                onClick={() => tree.toggleDir(key)}
                className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left"
                aria-expanded={open}
                title={d.path}
              >
                {open ? <ChevronDown size={13} className="shrink-0" /> : <ChevronRight size={13} className="shrink-0" />}
                {open ? <FolderOpen size={14} className="shrink-0" /> : <FolderIcon size={14} className="shrink-0" />}
                <span className="truncate">{d.name}</span>
              </button>
            </Row>
            {open && (
              d.dirs.length || d.files.length
                ? <Children folderId={folderId} node={d} depth={depth + 1} currentPath={currentPath} onOpenFile={onOpenFile} />
                : <p className="py-1 text-xs text-muted" style={{ paddingLeft: `${1.6 + (depth + 1) * 0.9}rem` }}>Empty</p>
            )}
          </div>
        )
      })}
      {node.files.map((path) => (
        <Row key={path} depth={depth} selected={path === currentPath}>
          <button
            onClick={() => onOpenFile(path)}
            title={path}
            className={`flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-[1.1rem] text-left ${path === currentPath ? '' : 'text-muted'}`}
          >
            <FileText size={14} className="shrink-0" />
            <span className="truncate">{fileLabel(path)}</span>
          </button>
        </Row>
      ))}
    </>
  )
}

/** "New subfolder" and "Import here" for a folder (dir "") or one of its subfolders. */
function DirActions({ folderId, dir, label }: { folderId: string; dir: string; label?: string }) {
  const tree = useTree()
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const picker = useFilePicker(importHere)
  const where = dir || label || 'this folder'
  const [noteIsError, setNoteIsError] = useState(false)

  useEffect(() => {
    if (!note || noteIsError) return
    const t = setTimeout(() => setNote(null), 4000)
    return () => clearTimeout(t)
  }, [note, noteIsError])

  const say = (text: string, error = false) => { setNote(text); setNoteIsError(error) }

  async function importHere(uploads: Upload[]) {
    const { accepted, skipped } = splitImportable(uploads)
    if (!accepted.length) return say('Only .md, .txt and .pdf can be imported.', true)
    try {
      await api.importFiles(folderId, accepted, { dest: dir })
      tree.expand(folderId)
      tree.changed()
      say(`Imported ${accepted.length} into ${where}${skipped.length ? `, skipped ${skipped.length}` : ''}`)
    } catch (e) {
      say((e as Error).message, true)
    }
  }

  function cancel() {
    setNaming(false)
    setName('')
  }

  // Closing the box moves the rows below it. If that happened on mouse-down, the
  // row you were clicking would jump away before mouse-up and the click would be
  // lost, so wait for the button to come up first. Keyboard blur closes at once.
  function cancelAfterClick() {
    if (!pointerIsDown) return cancel()
    document.addEventListener('pointerup', () => setTimeout(cancel, 0), { once: true })
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    const clean = name.trim()
    if (!clean) return setNaming(false)
    try {
      await api.createDir(folderId, dir ? `${dir}/${clean}` : clean)
      tree.expand(folderId)
      tree.changed()
      setNaming(false)
      setName('')
      setNote(null)
    } catch (err) {
      say((err as Error).message, true)
    }
  }

  const btn = 'grid h-6 w-6 shrink-0 place-items-center rounded text-muted hover:bg-white hover:text-ink lg:hidden lg:group-hover:grid lg:group-focus-within:grid'
  return (
    <>
      <button onClick={() => { setNaming(true); setNote(null) }} className={btn} aria-label={`New subfolder in ${where}`} title="New subfolder">
        <FolderPlus size={14} />
      </button>
      <button onClick={picker.open} className={btn} aria-label={`Import files into ${where}`} title="Import here">
        <UploadIcon size={14} />
      </button>
      {picker.element}
      {(naming || note) && (
        <div className="basis-full px-2 pb-1.5" onClick={(e) => e.stopPropagation()}>
          {naming && (
            <form
              onSubmit={create}
              // Clicking anywhere outside the box cancels it (focus moving to Add or × doesn't).
              onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Element | null)) cancelAfterClick() }}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); cancel() } }}
              className="flex gap-1"
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Subfolder name"
                aria-label={`Name of new subfolder in ${where}`}
                className="min-w-0 flex-1 rounded border border-line bg-white px-2 py-1 text-xs outline-none focus:border-brand"
              />
              <button className="rounded bg-brand px-2 text-xs font-semibold text-white">Add</button>
              <button type="button" onClick={cancel} className="grid w-6 shrink-0 place-items-center rounded text-muted hover:bg-white hover:text-ink" aria-label="Cancel new subfolder">
                <X size={13} />
              </button>
            </form>
          )}
          {note && <p role="status" className={`mt-1 text-xs ${noteIsError ? 'text-red-700' : 'text-brand-text'}`}>{note}</p>}
        </div>
      )}
    </>
  )
}
