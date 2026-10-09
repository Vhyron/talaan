import { useEffect, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, ChevronsDownUp, FileText, Folder as FolderIcon, FolderInput, FolderOpen, FolderPlus, PanelLeftClose, PanelLeftOpen, Pencil, Upload as UploadIcon, X } from 'lucide-react'
import { api } from '../api/client'
import type { Folder, Mode } from '../api/types'
import { fileLabel } from '../lib/format'
import { SHOW_MODE } from '../lib/folderContext'
import { useNav } from '../lib/nav'
import { useTree } from '../lib/tree'
import { useImportDialog } from '../lib/importDialog'
import { usePersistentFlag } from '../lib/usePersistentFlag'
import { splitImportable, type Upload } from '../lib/upload'
import { useFilePicker } from '../lib/useFilePicker'

// Whether a mouse/touch button is currently held anywhere on the page.
let pointerIsDown = false
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => { pointerIsDown = true }, true)
  document.addEventListener('pointerup', () => { pointerIsDown = false }, true)
  document.addEventListener('pointercancel', () => { pointerIsDown = false }, true)
}

const MIN_W = 200
const MAX_W = 480
const WIDTH_KEY = 'talaan.sidebar.width'

/** Sidebar width in px (desktop), dragged from its right edge and remembered. */
function useSidebarWidth(): [number, (e: ReactPointerEvent) => void] {
  const [width, setWidth] = useState(() => {
    try {
      const v = Number(localStorage.getItem(WIDTH_KEY))
      return v >= MIN_W && v <= MAX_W ? v : 256
    } catch {
      return 256
    }
  })
  const start = (e: ReactPointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    let latest = startW
    const move = (ev: PointerEvent) => {
      latest = Math.min(MAX_W, Math.max(MIN_W, startW + ev.clientX - startX))
      setWidth(latest)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      try { localStorage.setItem(WIDTH_KEY, String(latest)) } catch { /* not persisted */ }
    }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return [width, start]
}

const GROUPS: { mode: Mode | null; label: string }[] = SHOW_MODE
  ? [{ mode: 'case', label: 'HR cases' }, { mode: 'chart', label: 'Clinic charts' }, { mode: null, label: 'Spaces' }]
  : [{ mode: null, label: 'Spaces' }]

/** Folder tree. Any number of folders can be expanded; the active one is highlighted.
 * Inline from `lg` up; below that it's a drawer opened from the top bar. */
export default function Sidebar({ folders, error, activeId, activeDir, currentPath, onOpenFile }: {
  folders: Folder[]
  error: string | null
  activeId?: string
  /** The subfolder whose overview is open in the active Space ("" = the Space itself). */
  activeDir?: string
  currentPath?: string
  /** Opens a file in the active folder (other folders navigate there first). */
  onOpenFile?: (path: string) => void
}) {
  const nav = useNav()
  const tree = useTree()
  const importDialog = useImportDialog()
  const navigate = useNavigate()
  // Desktop only: below `lg` the sidebar is already a drawer.
  const [collapsed, setCollapsed] = usePersistentFlag('talaan.sidebar.collapsed')
  const [width, startResize] = useSidebarWidth()
  const [renaming, setRenaming] = useState<string | null>(null)

  function openFolder(f: Folder) {
    tree.expand(f.id)
    nav.setOpen(false)
    // Clicking a folder (even the one you're in) shows its overview of files.
    navigate(`/folders/${encodeURIComponent(f.id)}`, { state: { overview: true } })
  }

  function openDir(folderId: string, dir: string) {
    nav.setOpen(false)
    navigate(`/folders/${encodeURIComponent(folderId)}`, { state: { overview: true, dir } })
  }

  function openFile(folderId: string, path: string) {
    nav.setOpen(false)
    if (folderId === activeId && onOpenFile) onOpenFile(path)
    else navigate(`/folders/${encodeURIComponent(folderId)}`, { state: { open: path } })
  }

  return (
    <>
    {nav.open && (
      <div className="fixed inset-0 z-[45] bg-ink/30 lg:hidden" onClick={() => nav.setOpen(false)} aria-hidden="true" />
    )}
    {collapsed && (
      <aside className="hidden w-11 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel/50 py-2 lg:flex" aria-label="Folders (collapsed)">
        <button
          onClick={() => setCollapsed(false)}
          className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-panel hover:text-ink"
          aria-label="Show folders"
          title="Show folders"
        >
          <PanelLeftOpen size={18} />
        </button>
        <button
          onClick={() => importDialog.open()}
          className="mt-auto grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-panel hover:text-ink"
          aria-label="Import folder"
          title="Import folder (new Space)"
        >
          <FolderInput size={17} />
        </button>
      </aside>
    )}
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-line bg-white text-sm shadow-xl transition-transform lg:static lg:z-auto lg:w-[var(--sidebar-w)] lg:translate-x-0 lg:bg-panel/50 lg:shadow-none ${
        nav.open ? 'translate-x-0' : '-translate-x-full'
      } ${collapsed ? 'lg:hidden' : ''} lg:relative`}
      style={{ '--sidebar-w': `${width}px` } as CSSProperties}
    >
      <div
        onPointerDown={startResize}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize folders"
        title="Drag to resize"
        className="absolute inset-y-0 -right-1 z-10 hidden w-2 cursor-col-resize hover:bg-brand/20 active:bg-brand/30 lg:block"
      />
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4 lg:h-10 lg:pr-1.5 lg:pl-3">
        <span className="font-bold lg:text-[11px] lg:font-semibold lg:tracking-[0.16em] lg:text-muted lg:uppercase">Spaces</span>
        <button
          onClick={tree.collapseAll}
          disabled={tree.expanded.size === 0}
          className="ml-auto grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-panel hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent lg:h-8 lg:w-8"
          aria-label="Collapse all folders"
          title="Collapse all folders"
        >
          <ChevronsDownUp size={16} />
        </button>
        <button onClick={() => nav.setOpen(false)} className="grid h-9 w-9 place-items-center rounded-md hover:bg-panel lg:hidden" aria-label="Close folders">
          <X size={18} />
        </button>
        <button
          onClick={() => setCollapsed(true)}
          className="hidden h-8 w-8 place-items-center rounded-md text-muted hover:bg-panel hover:text-ink lg:grid"
          aria-label="Hide folders"
          title="Hide folders"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto p-3" aria-label="Folders">
        {error && <p className="p-2 text-red-700">Backend unreachable: {error}</p>}
        {GROUPS.map(({ mode, label }) => {
          const group = SHOW_MODE ? folders.filter((f) => (f.mode ?? null) === mode) : folders
          if (!group.length) return null
          return (
            <div key={mode ?? 'spaces'} className="mb-4">
              {SHOW_MODE && <p className="eyebrow px-2 pb-2">{label}</p>}
              {group.map((f) => {
                const expanded = tree.expanded.has(f.id)
                const active = f.id === activeId
                return (
                  <div key={f.id}>
                    <Row
                      depth={0}
                      selected={active && activeDir === ''}
                      actions={renaming !== f.id && (
                        <>
                          <button onClick={() => setRenaming(f.id)} className={actionBtn} aria-label={`Rename ${f.name}`} title="Rename Space">
                            <Pencil size={13} />
                          </button>
                          <DirActions folderId={f.id} dir="" label={f.name} />
                        </>
                      )}
                    >
                      <button
                        onClick={() => tree.toggle(f.id)}
                        className="grid h-6 w-5 shrink-0 place-items-center rounded hover:bg-panel"
                        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${f.name}`}
                        aria-expanded={expanded}
                      >
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      {renaming === f.id ? (
                        <RenameSpace folder={f} onDone={() => setRenaming(null)} />
                      ) : (
                        <button
                          onClick={() => openFolder(f)}
                          onDoubleClick={() => setRenaming(f.id)}
                          className={`flex min-w-0 flex-1 items-start gap-1.5 py-1.5 text-left leading-snug ${active ? 'font-semibold' : ''}`}
                          aria-current={active ? 'page' : undefined}
                          title={`${f.name} (double-click to rename)`}
                        >
                          {expanded ? <FolderOpen size={15} className="mt-0.5 shrink-0" /> : <FolderIcon size={15} className="mt-0.5 shrink-0" />}
                          <span className="line-clamp-2 break-words">{f.name}</span>
                        </button>
                      )}
                    </Row>
                    {expanded && (
                      <FolderTree
                        folderId={f.id}
                        currentPath={active ? currentPath : undefined}
                        activeDir={active ? activeDir : undefined}
                        onOpenFile={(p) => openFile(f.id, p)}
                        onOpenDir={(d) => openDir(f.id, d)}
                      />
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
          title="Create a new Space from a folder on this computer"
        >
          <FolderInput size={15} /> Import folder
          <span className="ml-auto text-[11px] font-normal text-muted">new Space</span>
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
type TreeProps = {
  folderId: string
  currentPath?: string
  activeDir?: string
  onOpenFile: (path: string) => void
  onOpenDir: (dir: string) => void
}

function FolderTree(props: TreeProps) {
  const { folderId } = props
  const tree = useTree()
  const [root, setRoot] = useState<Node | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.files(folderId), api.dirs(folderId)])
      // The Space README is shown on the Space's overview, so it is not listed as a file here.
      .then(([files, dirs]) => { setRoot(buildTree(dirs, files.map((f) => f.path).filter((p) => p !== 'README.md'))); setError(null) })
      .catch((e) => setError(e.message))
  }, [folderId, tree.version])

  if (error) return <p className="py-1 pl-8 text-xs text-red-700">{error}</p>
  if (!root) return <p className="py-1 pl-8 text-xs text-muted">Loading…</p>
  if (!root.dirs.length && !root.files.length) return <p className="py-1 pl-8 text-xs text-muted">Empty: import files or add a subfolder.</p>
  return <Children {...props} node={root} depth={1} />
}

function Children({ node, depth, ...props }: TreeProps & { node: Node; depth: number }) {
  const { folderId, currentPath, activeDir, onOpenFile, onOpenDir } = props
  const tree = useTree()
  return (
    <>
      {node.dirs.map((d) => {
        const key = `${folderId}/${d.path}`
        const open = tree.dirOpen(key)
        return (
          <div key={d.path}>
            <Row depth={depth} selected={d.path === activeDir} actions={<DirActions folderId={folderId} dir={d.path} />}>
              <button
                onClick={() => tree.toggleDir(key)}
                className="grid h-6 w-4 shrink-0 place-items-center self-start rounded hover:bg-white"
                aria-label={`${open ? 'Collapse' : 'Expand'} ${d.name}`}
                aria-expanded={open}
              >
                {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
              <button
                onClick={() => onOpenDir(d.path)}
                className="flex min-w-0 flex-1 items-start gap-1.5 py-1.5 text-left leading-snug"
                aria-current={d.path === activeDir ? 'page' : undefined}
                title={`Open ${d.path}: chat about this subfolder only`}
              >
                {open ? <FolderOpen size={14} className="mt-0.5 shrink-0" /> : <FolderIcon size={14} className="mt-0.5 shrink-0" />}
                <span className="line-clamp-2 break-words">{d.name}</span>
              </button>
            </Row>
            {open && (
              d.dirs.length || d.files.length
                ? <Children {...props} node={d} depth={depth + 1} />
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
            className={`flex min-w-0 flex-1 items-start gap-1.5 py-1.5 pl-[1.1rem] text-left leading-snug ${path === currentPath ? '' : 'text-muted'}`}
          >
            <FileText size={14} className="mt-0.5 shrink-0" />
            <span className="line-clamp-2 break-words">{fileLabel(path)}</span>
          </button>
        </Row>
      ))}
    </>
  )
}

// Space is always reserved and the buttons only fade in, so hovering a row never
// narrows its label (which made long names re-wrap and the tree jump).
const actionBtn = 'grid h-6 w-6 shrink-0 place-items-center rounded text-muted transition-opacity hover:bg-white hover:text-ink lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100'

/** Inline rename of a Space's display name: Enter saves, Escape or clicking away cancels. */
function RenameSpace({ folder, onDone }: { folder: Folder; onDone: () => void }) {
  const tree = useTree()
  const [name, setName] = useState(folder.name)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    const clean = name.trim()
    if (!clean || clean === folder.name) return onDone()
    try {
      await api.renameFolder(folder.id, clean)
      tree.foldersChanged()
      onDone()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form
      onSubmit={save}
      onBlur={(e) => { if (!error && !e.currentTarget.contains(e.relatedTarget as Element | null)) onDone() }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onDone() } }}
      className="min-w-0 flex-1 py-1"
    >
      <input
        autoFocus
        value={name}
        maxLength={120}
        onChange={(e) => setName(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={`New name for ${folder.name}`}
        className="w-full min-w-0 rounded border border-brand bg-white px-2 py-1 text-xs outline-none"
      />
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </form>
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

  const btn = actionBtn
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
