import { useEffect, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, FileText, Folder as FolderIcon, FolderInput, FolderOpen, FolderPlus, PanelLeftClose, Pencil, Trash2, PanelLeftOpen, Upload as UploadIcon, X } from 'lucide-react'
import { api } from '../api/client'
import type { Folder, Mode } from '../api/types'
import { fileLabel } from '../lib/format'
import { useNav } from '../lib/nav'
import { useTree } from '../lib/tree'
import { useImportDialog } from '../lib/importDialog'
import { usePersistentFlag } from '../lib/usePersistentFlag'
import { splitImportable, type Upload } from '../lib/upload'
import { useFilePicker } from '../lib/useFilePicker'
import { renamePath } from '../lib/renamed'

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
  // Desktop only: below `lg` the sidebar is already a drawer.
  const [collapsed, setCollapsed] = usePersistentFlag('talaan.sidebar.collapsed')
  const [width, startResize] = useSidebarWidth()

  function openFolder(f: Folder) {
    tree.expand(f.id)
    nav.setOpen(false)
    // Clicking a folder (even the one you're in) shows its overview of files.
    navigate(`/folders/${encodeURIComponent(f.id)}`, { state: { overview: true } })
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
          title="Import folder (new Case/Chart)"
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
        <span className="font-bold lg:text-[11px] lg:font-semibold lg:tracking-[0.16em] lg:text-muted lg:uppercase">Folders</span>
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
                    <Row depth={0} actions={<><Rename kind="folder" folderId={f.id} path="" current={f.name} /><MoveToTrash kind="folder" folderId={f.id} path="" name={f.name} active={active} /><DirActions folderId={f.id} dir="" label={f.name} /></>}>
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
                        className={`flex min-w-0 flex-1 items-start gap-1.5 py-1.5 text-left leading-snug ${active ? 'font-semibold' : ''}`}
                        aria-current={active ? 'page' : undefined}
                      >
                        {expanded ? <FolderOpen size={15} className="mt-0.5 shrink-0" /> : <FolderIcon size={15} className="mt-0.5 shrink-0" />}
                        <span className="line-clamp-2 break-words" title={f.name}>{f.name}</span>
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
          onClick={() => { nav.setOpen(false); navigate('/trash') }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-medium hover:bg-panel"
          title="Deleted files and folders: restore or delete for good"
        >
          <Trash2 size={15} /> Trash
        </button>
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
            <Row depth={depth} actions={<><Rename kind="subfolder" folderId={folderId} path={d.path} current={d.name} /><MoveToTrash kind="subfolder" folderId={folderId} path={d.path} name={d.name} /><DirActions folderId={folderId} dir={d.path} /></>}>
              <button
                onClick={() => tree.toggleDir(key)}
                className="flex min-w-0 flex-1 items-start gap-1.5 py-1.5 text-left leading-snug"
                aria-expanded={open}
                title={d.path}
              >
                {open ? <ChevronDown size={13} className="mt-0.5 shrink-0" /> : <ChevronRight size={13} className="mt-0.5 shrink-0" />}
                {open ? <FolderOpen size={14} className="mt-0.5 shrink-0" /> : <FolderIcon size={14} className="mt-0.5 shrink-0" />}
                <span className="line-clamp-2 break-words">{d.name}</span>
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
        <Row key={path} depth={depth} selected={path === currentPath} actions={<><Rename kind="file" folderId={folderId} path={path} current={path.split('/').pop() ?? path} /><MoveToTrash kind="file" folderId={folderId} path={path} name={fileLabel(path)} /></>}>
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

  // Space is always reserved and the buttons only fade in, so hovering a row never
  // narrows its label (which made long names re-wrap and the tree jump).
  const btn = 'grid h-6 w-6 shrink-0 place-items-center rounded text-muted transition-opacity hover:bg-white hover:text-ink lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100'
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

/**
 * Rename a folder (its display name only: grants, audit and chat stay with it), a
 * subfolder or a file (in place; open tabs, saved chat sources and pending approvals
 * follow, and the folder is re-indexed). Only the user can rename; the AI can't.
 */
function Rename({ kind, folderId, path, current }: { kind: 'folder' | 'subfolder' | 'file'; folderId: string; path: string; current: string }) {
  const tree = useTree()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(current)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const isFolder = kind === 'folder'
  const isFile = kind === 'file'

  function start() {
    setName(current)
    setError(null)
    setEditing(true)
  }

  function cancel() {
    setEditing(false)
    setError(null)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const clean = name.trim()
    if (!clean || clean === current) return cancel()
    setSaving(true)
    try {
      if (isFolder) await api.renameFolder(folderId, clean)
      else await renamePath(folderId, path, clean)
      tree.changed()
      setEditing(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        onClick={start}
        className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted transition-opacity hover:bg-white hover:text-ink lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
        aria-label={`Rename ${current}`}
        title={`Rename ${kind}`}
      >
        <Pencil size={13} />
      </button>
      {editing && (
        <div className="basis-full px-2 pb-1.5" onClick={(e) => e.stopPropagation()}>
          <form
            onSubmit={save}
            onBlur={(e) => { if (!saving && !error && !e.currentTarget.contains(e.relatedTarget as Element | null)) cancelLater() }}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); cancel() } }}
            className="flex gap-1"
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null) }}
              // Select the name without its extension, so typing keeps the file type.
              onFocus={(e) => {
                const dot = isFile ? current.lastIndexOf('.') : -1
                e.currentTarget.setSelectionRange(0, dot > 0 ? dot : current.length)
              }}
              aria-label={`New name for ${current}`}
              className="min-w-0 flex-1 rounded border border-line bg-white px-2 py-1 text-xs outline-none focus:border-brand"
            />
            <button disabled={saving} className="rounded bg-brand px-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? '…' : 'Save'}</button>
            <button type="button" onClick={cancel} className="grid w-6 shrink-0 place-items-center rounded text-muted hover:bg-white hover:text-ink" aria-label="Cancel rename">
              <X size={13} />
            </button>
          </form>
          {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
          {isFolder && !error && <p className="mt-1 text-[11px] text-muted">Changes the name shown in Talaan. Permissions, audit log and chat stay with this folder.</p>}
        </div>
      )}
    </>
  )

  // Like the new-subfolder box: wait for a click to finish so the row under it doesn't jump away.
  function cancelLater() {
    if (!pointerIsDown) return cancel()
    document.addEventListener('pointerup', () => setTimeout(cancel, 0), { once: true })
  }
}

/**
 * Move a folder, subfolder or file to the Trash, after an inline confirm. It can be restored
 * from the Trash page. Only the user can do this; the AI's own delete stays a proposal
 * governed by the Delete permission.
 */
function MoveToTrash({ kind, folderId, path, name, active }: {
  kind: 'folder' | 'subfolder' | 'file'; folderId: string; path: string; name: string; active?: boolean
}) {
  const tree = useTree()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function trash() {
    setBusy(true)
    try {
      if (kind === 'folder') await api.trashFolder(folderId)
      else await api.trashPath(folderId, path)
      setConfirming(false)
      tree.changed()
      if (kind === 'folder' && active) navigate('/')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={() => { setConfirming(true); setError(null) }}
        className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted transition-opacity hover:bg-white hover:text-red-700 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
        aria-label={`Move ${name} to Trash`}
        title={`Delete ${kind}`}
      >
        <Trash2 size={13} />
      </button>
      {confirming && (
        <div
          className="basis-full px-2 pb-1.5"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setConfirming(false) } }}
        >
          <div role="alertdialog" aria-label={`Move ${name} to Trash?`} className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-900">
            <p>
              Move <span className="font-semibold break-words">{name}</span> to Trash?
              {kind === 'folder' ? ' The whole folder goes; its permissions, audit log and chats are kept.' : ''} You can restore it from Trash.
            </p>
            {error && <p role="alert" className="mt-1 text-red-700">{error}</p>}
            <div className="mt-1.5 flex gap-1">
              <button autoFocus onClick={trash} disabled={busy} className="rounded bg-red-700 px-2 py-1 font-semibold text-white disabled:opacity-50">
                {busy ? 'Moving…' : 'Move to Trash'}
              </button>
              <button onClick={() => setConfirming(false)} className="rounded px-2 py-1 hover:bg-white">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
