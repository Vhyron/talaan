import { useCallback, useEffect, useMemo, useState } from 'react'
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
import ApprovalsPanel from '../panels/ApprovalsPanel'
import AskPanel from '../panels/AskPanel'
import AuditPanel from '../panels/AuditPanel'
import PermissionsPanel from '../panels/PermissionsPanel'
import TimelinePanel from '../panels/TimelinePanel'
import { FolderContext, noun, useFolder, type FolderCtx } from '../lib/folderContext'

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

// active = -1 is the folder overview; 0.. is an open file.
type Tabs = { paths: string[]; active: number }

// Open tabs per folder for this session, so switching between folders keeps them.
const tabsByFolder = new Map<string, Tabs>()

function FolderView({ folder, folders, error }: { folder: Folder; folders: Folder[]; error: string | null }) {
  const tree = useTree()
  const location = useLocation()
  const [files, setFiles] = useState<FileEntry[]>([])
  const [tabs, setTabs] = useState<Tabs>(() => tabsByFolder.get(folder.id) ?? { paths: [], active: -1 })
  const [highlight, setHighlight] = useState<Highlight>(null)
  // Which folder tool is open in the floating card (or pinned column), if any.
  const [tool, setTool] = useState<PanelTab | null>(null)
  const [version, setVersion] = useState(0)

  // Any change to files or subfolders (import, approval, new subfolder) bumps
  // tree.version; this view and every open sidebar tree refetch from that.
  useEffect(() => {
    api.files(folder.id).then(setFiles).catch(() => setFiles([]))
  }, [folder.id, tree.version])
  const refreshFiles = tree.changed

  const { expand } = tree
  useEffect(() => expand(folder.id), [expand, folder.id])

  useEffect(() => {
    tabsByFolder.set(folder.id, tabs)
  }, [folder.id, tabs])

  // Drop tabs for files that no longer exist; open the first file if nothing is open.
  useEffect(() => {
    if (!files.length) return
    const exists = new Set(files.map((f) => f.path))
    setTabs((t) => {
      const paths = t.paths.filter((p) => exists.has(p))
      return paths.length === t.paths.length ? t : { paths, active: Math.min(t.active, paths.length - 1) }
    })
  }, [files])

  const openSource = useCallback((path: string, start?: number, end?: number) => {
    setTabs(({ paths }) => {
      const i = paths.indexOf(path)
      return i >= 0 ? { paths, active: i } : { paths: [...paths, path], active: paths.length }
    })
    setHighlight(start ? { start, end: end ?? start } : null)
    // On phones the tool sheet covers the document: close it to show the cited lines.
    if (window.matchMedia('(max-width: 767px)').matches) setTool(null)
  }, [])

  // A file clicked in another folder's sidebar tree arrives as navigation state.
  const navState = location.state as { open?: string; overview?: boolean } | null
  const requested = navState?.open
  useEffect(() => {
    if (requested) openSource(requested)
  }, [requested, location.key, openSource])
  // A click on the folder's name in the sidebar asks for its overview.
  const wantsOverview = navState?.overview
  useEffect(() => {
    if (wantsOverview) {
      setTabs((t) => ({ ...t, active: -1 }))
      setHighlight(null)
    }
  }, [wantsOverview, location.key])

  const select = (i: number) => {
    setTabs((t) => ({ ...t, active: i }))
    setHighlight(null)
  }

  const close = (i: number) => {
    setTabs(({ paths, active }) => {
      const rest = paths.filter((_, j) => j !== i)
      // Closing the open tab moves to its neighbour; closing the last one shows the overview.
      const next = active > i ? active - 1 : active === i ? Math.min(i, rest.length - 1) : active
      return { paths: rest, active: next }
    })
    setHighlight(null)
  }

  // The file in the active tab (none on the overview): the Ask chat focuses on it.
  const currentPath = tabs.active >= 0 ? tabs.paths[tabs.active] : undefined
  const ctx: FolderCtx = useMemo(
    () => ({ folder, files, currentPath, openSource, refreshFiles, version, bump: () => setVersion((v) => v + 1) }),
    [folder, files, currentPath, openSource, refreshFiles, version],
  )

  return (
    <FolderContext.Provider value={ctx}>
      <FolderLayout
        folders={folders}
        error={error}
        tabs={tabs}
        highlight={highlight}
        tool={tool}
        onTool={setTool}
        onSelect={select}
        onClose={close}
      />
    </FolderContext.Provider>
  )
}

function FolderLayout({ folders, error, tabs, highlight, tool, onTool, onSelect, onClose }: {
  folders: Folder[]
  error: string | null
  tabs: Tabs
  highlight: Highlight
  tool: PanelTab | null
  onTool: (t: PanelTab | null) => void
  onSelect: (i: number) => void
  onClose: (i: number) => void
}) {
  const { folder, files, openSource } = useFolder()
  const imp = useImport()
  const current = tabs.active >= 0 ? tabs.paths[tabs.active] : undefined
  const [pinned, setPinned] = usePersistentFlag('talaan.tools.pinned')

  return (
    <div className="flex min-h-0 flex-1">
      <Sidebar
        folders={folders}
        error={error}
        activeId={folder.id}
        currentPath={current}
        onOpenFile={(p) => openSource(p)}
      />

      <DropZone onFiles={(u) => imp.importUploads(u, { keepPaths: true })}>
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3 text-xs sm:px-4">
          <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 font-semibold text-brand-text">
            <Lock size={11} className="shrink-0" />
            <span className="truncate">Sealed: AI can only see this {noun(folder.mode).toLowerCase()}</span>
          </span>
          <span className="hidden shrink-0 text-muted sm:inline">{files.length} {files.length === 1 ? 'file' : 'files'}</span>
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
          timeline: <TimelinePanel />,
          permissions: <PermissionsPanel />,
          approvals: <ApprovalsPanel />,
          audit: <AuditPanel />,
        }}
      />
    </div>
  )
}
