import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { api } from '../api/client'
import type { FileEntry, Folder } from '../api/types'
import Sidebar from '../components/Sidebar'
import FileTabs from '../components/FileTabs'
import FileViewer, { type Highlight } from '../components/FileViewer'
import VoiceNote from '../components/VoiceNote'
import RightPanel, { MobileTabs, type PanelTab } from '../components/RightPanel'
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

type Tabs = { paths: string[]; active: number }

// Open tabs per folder for this session, so switching between folders keeps them.
const tabsByFolder = new Map<string, Tabs>()

function FolderView({ folder, folders, error }: { folder: Folder; folders: Folder[]; error: string | null }) {
  const tree = useTree()
  const location = useLocation()
  const [files, setFiles] = useState<FileEntry[]>([])
  const [tabs, setTabs] = useState<Tabs>(() => tabsByFolder.get(folder.id) ?? { paths: [], active: 0 })
  const [highlight, setHighlight] = useState<Highlight>(null)
  const [panel, setPanel] = useState<PanelTab>('ask')
  // Phones show one view at a time: the document or the selected panel.
  const [mobileView, setMobileView] = useState<'doc' | 'panel'>('doc')
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
      if (!paths.length) return { paths: [files[0].path], active: 0 }
      return paths.length === t.paths.length ? t : { paths, active: Math.min(t.active, paths.length - 1) }
    })
  }, [files])

  const openSource = useCallback((path: string, start?: number, end?: number) => {
    setTabs(({ paths }) => {
      const i = paths.indexOf(path)
      return i >= 0 ? { paths, active: i } : { paths: [...paths, path], active: paths.length }
    })
    setHighlight(start ? { start, end: end ?? start } : null)
    setMobileView('doc')
  }, [])

  // A file clicked in another folder's sidebar tree arrives as navigation state.
  const requested = (location.state as { open?: string } | null)?.open
  useEffect(() => {
    if (requested) openSource(requested)
  }, [requested, location.key, openSource])

  const select = (i: number) => {
    setTabs((t) => ({ ...t, active: i }))
    setHighlight(null)
  }

  const close = (i: number) => {
    setTabs(({ paths, active }) => ({
      paths: paths.filter((_, j) => j !== i),
      active: Math.max(0, active > i || active === paths.length - 1 ? active - 1 : active),
    }))
    setHighlight(null)
  }

  const currentPath = tabs.paths[tabs.active]
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
        panel={panel}
        onPanel={setPanel}
        mobileView={mobileView}
        onMobileView={(v) => {
          if (v === 'doc') return setMobileView('doc')
          setPanel(v)
          setMobileView('panel')
        }}
        onSelect={select}
        onClose={close}
      />
    </FolderContext.Provider>
  )
}

function FolderLayout({ folders, error, tabs, highlight, panel, onPanel, mobileView, onMobileView, onSelect, onClose }: {
  folders: Folder[]
  error: string | null
  tabs: Tabs
  highlight: Highlight
  panel: PanelTab
  onPanel: (t: PanelTab) => void
  mobileView: 'doc' | 'panel'
  onMobileView: (v: 'doc' | PanelTab) => void
  onSelect: (i: number) => void
  onClose: (i: number) => void
}) {
  const { folder, files, openSource } = useFolder()
  const imp = useImport()
  const current = tabs.paths[tabs.active]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex min-h-0 flex-1">
      <Sidebar
        folders={folders}
        error={error}
        activeId={folder.id}
        currentPath={current}
        onOpenFile={(p) => openSource(p)}
      />

      <DropZone onFiles={(u) => imp.importUploads(u, { keepPaths: true })} className={mobileView === 'panel' ? 'hidden md:flex' : ''}>
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
            <VoiceNote onProposed={() => onMobileView('approvals')} />
          </span>
        </div>
        <FileTabs tabs={tabs.paths} active={tabs.active} onSelect={onSelect} onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {current ? (
            <FileViewer key={current} path={current} highlight={highlight} />
          ) : (
            <p className="p-6 text-muted sm:p-10">
              {files.length ? 'Open a file from the folder list.' : 'This folder is empty. Drop files here, or hover the folder in the list and use Import here.'}
            </p>
          )}
        </div>
      </DropZone>

      <RightPanel
        tab={panel}
        onTab={onPanel}
        wide={panel === 'audit' || panel === 'approvals' || panel === 'timeline'}
        mobileVisible={mobileView === 'panel'}
        panels={{
          ask: <AskPanel onShowApprovals={() => onMobileView('approvals')} />,
          timeline: <TimelinePanel />,
          permissions: <PermissionsPanel />,
          approvals: <ApprovalsPanel />,
          audit: <AuditPanel />,
        }}
      />
    </div>
    <MobileTabs view={mobileView === 'doc' ? 'doc' : panel} onView={onMobileView} />
    </div>
  )
}
