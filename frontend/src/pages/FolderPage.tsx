import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { api } from '../api/client'
import type { FileEntry, Folder } from '../api/types'
import Sidebar from '../components/Sidebar'
import FileTabs from '../components/FileTabs'
import FileViewer, { type Highlight } from '../components/FileViewer'
import FolderOverview from '../components/FolderOverview'
import VoiceNote from '../components/VoiceNote'
import FloatingTools, { type PanelTab } from '../components/FloatingTools'
import { usePersistentFlag } from '../lib/usePersistentFlag'
import { DropZone } from '../components/ImportDrop'
import { useImport } from '../lib/useImport'
import { useTree } from '../lib/tree'
import { movedPath, onRenamed } from '../lib/renamed'
import ApprovalsPanel from '../panels/ApprovalsPanel'
import AskPanel from '../panels/AskPanel'
import AuditPanel from '../panels/AuditPanel'
import PermissionsPanel from '../panels/PermissionsPanel'
import TimelinePanel from '../panels/TimelinePanel'
import { FolderContext, useFolder, type FolderCtx } from '../lib/folderContext'

export default function FolderPage({ folders, error }: { folders: Folder[]; error: string | null }) {
  const { id = '' } = useParams()
  const folder = folders.find((f) => f.id === id)

  if (!folder) {
    return (
      <div className="flex min-h-0 flex-1">
        <Sidebar folders={folders} error={error} />
        <p className="p-6 text-muted sm:p-10">{folders.length ? 'Folder not found.' : 'Loading…'}</p>
      </div>
    )
  }
  // Keyed by folder: switching folders resets chat and highlights; tabs are remembered.
  return <FolderView key={folder.id} folder={folder} folders={folders} error={error} />
}

// active = -1 is the overview of `dir` ("" = the whole Space); 0.. is an open file.
type Tabs = { paths: string[]; active: number; dir: string }

// Open tabs per folder for this session, so switching between folders keeps them.
const tabsByFolder = new Map<string, Tabs>()

const renameTabs = (t: Tabs, from: string, to: string): Tabs => ({ ...t, paths: t.paths.map((p) => movedPath(p, from, to)) })

// Remembered tabs of folders not on screen follow renames too.
onRenamed(({ folderId, from, to }) => {
  const t = tabsByFolder.get(folderId)
  if (t) tabsByFolder.set(folderId, renameTabs(t, from, to))
})

function FolderView({ folder, folders, error }: { folder: Folder; folders: Folder[]; error: string | null }) {
  const tree = useTree()
  const location = useLocation()
  const [files, setFiles] = useState<FileEntry[]>([])
  const [tabs, setTabs] = useState<Tabs>(() => tabsByFolder.get(folder.id) ?? { paths: [], active: -1, dir: '' })
  const [highlight, setHighlight] = useState<Highlight>(null)
  // Which folder tool is open in the floating card (or pinned column), if any.
  const [tool, setTool] = useState<PanelTab | null>(null)
  const [version, setVersion] = useState(0)
  // "That file was renamed or removed": a source or tab pointing at a file that's gone.
  const [notice, setNotice] = useState<string | null>(null)

  // Any change to files or subfolders (import, approval, new subfolder) bumps
  // tree.version; this view and every open sidebar tree refetch from that.
  useEffect(() => {
    api.files(folder.id).then(setFiles).catch(() => setFiles([]))
  }, [folder.id, tree.version])
  const refreshFiles = tree.changed

  // Open tabs follow a rename instead of closing.
  useEffect(() => onRenamed(({ folderId, from, to }) => {
    if (folderId === folder.id) setTabs((t) => renameTabs(t, from, to))
  }), [folder.id])

  const { expand } = tree
  useEffect(() => expand(folder.id), [expand, folder.id])

  useEffect(() => {
    tabsByFolder.set(folder.id, tabs)
  }, [folder.id, tabs])

  // Drop tabs for files that no longer exist; open the first file if nothing is open.
  useEffect(() => {
    if (!files.length) return
    const exists = new Set(files.map((f) => f.path))
    const gone = tabs.paths.filter((p) => !exists.has(p))
    if (gone.length) setNotice(`${gone[0]} was renamed or removed. Ask again to get current sources.`)
    setTabs((t) => {
      const paths = t.paths.filter((p) => exists.has(p))
      return paths.length === t.paths.length ? t : { ...t, paths, active: Math.min(t.active, paths.length - 1) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the file list changes
  }, [files])

  const filesRef = useRef(files)
  filesRef.current = files
  const openSource = useCallback((path: string, start?: number, end?: number) => {
    const known = filesRef.current
    if (known.length && !known.some((f) => f.path === path)) {
      setNotice(`${path} was renamed or removed. Ask again to get current sources.`)
      return
    }
    setNotice(null)
    setTabs((t) => {
      const i = t.paths.indexOf(path)
      return i >= 0 ? { ...t, active: i } : { ...t, paths: [...t.paths, path], active: t.paths.length }
    })
    setHighlight(start ? { start, end: end ?? start } : null)
    // On phones the tool sheet covers the document: close it to show the cited lines.
    if (window.matchMedia('(max-width: 767px)').matches) setTool(null)
  }, [])

  // A file clicked in another folder's sidebar tree arrives as navigation state.
  // A file to open can arrive with the navigation: from another folder's sidebar tree, or a
  // source in the home-page chat (which also passes the cited lines to highlight). A Space's or
  // subfolder's name in the sidebar asks for its overview (`dir`, "" for the whole Space).
  const navState = location.state as { open?: string; start?: number; end?: number; overview?: boolean; dir?: string } | null
  const requested = navState?.open
  useEffect(() => {
    if (requested) openSource(requested, navState?.start, navState?.end)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per navigation
  }, [requested, location.key, openSource])
  const openDir = useCallback((dir: string) => {
    setTabs((t) => ({ ...t, active: -1, dir }))
    setHighlight(null)
  }, [])
  // A click on a Space's or subfolder's name in the sidebar asks for its overview.
  const wantsOverview = navState?.overview
  const wantsDir = navState?.dir ?? ''
  useEffect(() => {
    if (wantsOverview) openDir(wantsDir)
  }, [wantsOverview, wantsDir, location.key, openDir])

  const select = (i: number) => {
    setTabs((t) => ({ ...t, active: i }))
    setHighlight(null)
  }

  const close = (i: number) => {
    setTabs(({ paths, active, dir }) => {
      const rest = paths.filter((_, j) => j !== i)
      // Closing the open tab moves to its neighbour; closing the last one shows the overview.
      const next = active > i ? active - 1 : active === i ? Math.min(i, rest.length - 1) : active
      return { paths: rest, active: next, dir }
    })
    setHighlight(null)
  }

  // The file in the active tab (none on the overview): the Ask chat focuses on it.
  const currentPath = tabs.active >= 0 ? tabs.paths[tabs.active] : undefined
  const ctx: FolderCtx = useMemo(
    () => ({ folder, files, currentPath, dir: tabs.dir, openDir, openSource, refreshFiles, version, bump: () => setVersion((v) => v + 1) }),
    [folder, files, currentPath, tabs.dir, openDir, openSource, refreshFiles, version],
  )

  return (
    <FolderContext.Provider value={ctx}>
      <FolderLayout
        folders={folders}
        error={error}
        tabs={tabs}
        notice={notice}
        onDismissNotice={() => setNotice(null)}
        highlight={highlight}
        tool={tool}
        onTool={setTool}
        onSelect={select}
        onClose={close}
      />
    </FolderContext.Provider>
  )
}

function FolderLayout({ folders, error, tabs, notice, onDismissNotice, highlight, tool, onTool, onSelect, onClose }: {
  folders: Folder[]
  error: string | null
  tabs: Tabs
  notice: string | null
  onDismissNotice: () => void
  highlight: Highlight
  tool: PanelTab | null
  onTool: (t: PanelTab | null) => void
  onSelect: (i: number) => void
  onClose: (i: number) => void
}) {
  const { folder, files, dir, openSource } = useFolder()
  const imp = useImport()
  const current = tabs.active >= 0 ? tabs.paths[tabs.active] : undefined
  const [pinned, setPinned] = usePersistentFlag('talaan.tools.pinned')

  return (
    <div className="flex min-h-0 flex-1">
      <Sidebar
        folders={folders}
        error={error}
        activeId={folder.id}
        activeDir={current ? undefined : dir}
        currentPath={current}
        onOpenFile={(p) => openSource(p)}
      />

      <DropZone onFiles={(u) => imp.importUploads(u, { keepPaths: true })}>
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3 text-xs sm:px-4">
          <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 font-semibold text-brand-text">
            <Lock size={11} className="shrink-0" />
            <span className="truncate">Sealed: AI can only see this Space</span>
          </span>
          <span className="hidden shrink-0 text-muted sm:inline">{files.length} {files.length === 1 ? 'file' : 'files'}</span>
          {notice && (
            <button onClick={onDismissNotice} role="status" className="min-w-0 truncate text-warn-text" title={`${notice} (click to dismiss)`}>
              {notice}
            </button>
          )}
          {(imp.busy || imp.message) && (
            <button onClick={imp.clear} role="status" className={`min-w-0 truncate ${imp.isError ? 'text-red-700' : 'text-brand-text'}`} title="Dismiss">
              {imp.busy ? 'Importing…' : imp.message}
            </button>
          )}
          <span className="ml-auto hidden truncate font-semibold sm:inline lg:hidden">{folder.name}</span>
          <span className="ml-auto sm:ml-0 lg:ml-auto">
            <VoiceNote onProposed={() => onTool('approvals')} />
          </span>
        </div>
        <FileTabs tabs={tabs.paths} active={tabs.active} onSelect={onSelect} onClose={onClose} />
        {/* Bottom padding keeps the end of the text clear of the floating tool dock. */}
        <div className="min-h-0 flex-1 overflow-y-auto pb-20">
          {current ? (
            <FileViewer key={current} path={current} highlight={highlight} />
          ) : (
            <FolderOverview onOpen={(p) => openSource(p)} />
          )}
        </div>
      </DropZone>

      <FloatingTools
        open={tool}
        onOpen={onTool}
        pinned={pinned}
        onPin={setPinned}
        panels={{
          ask: <AskPanel onShowApprovals={() => onTool('approvals')} />,
          timeline: <TimelinePanel key={dir} />,
          permissions: <PermissionsPanel />,
          approvals: <ApprovalsPanel />,
          audit: <AuditPanel />,
        }}
      />
    </div>
  )
}
