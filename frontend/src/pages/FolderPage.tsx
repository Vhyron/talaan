import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { api } from '../api/client'
import type { FileEntry, Folder } from '../api/types'
import Sidebar from '../components/Sidebar'
import FileTabs from '../components/FileTabs'
import FileViewer, { type Highlight } from '../components/FileViewer'
import RightPanel, { type PanelTab } from '../components/RightPanel'
import { DropZone, ImportButton } from '../components/ImportDrop'
import { useImport } from '../lib/useImport'
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
        <p className="p-10 text-muted">{folders.length ? 'Folder not found.' : 'Loading…'}</p>
      </div>
    )
  }
  // Keyed by folder: switching folders resets tabs, chat and highlights.
  return <FolderView key={folder.id} folder={folder} folders={folders} error={error} />
}

type Tabs = { paths: string[]; active: number }

function FolderView({ folder, folders, error }: { folder: Folder; folders: Folder[]; error: string | null }) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [tabs, setTabs] = useState<Tabs>({ paths: [], active: 0 })
  const [highlight, setHighlight] = useState<Highlight>(null)
  const [panel, setPanel] = useState<PanelTab>('ask')
  const [version, setVersion] = useState(0)

  const refreshFiles = useCallback(() => {
    api.files(folder.id).then(setFiles).catch(() => setFiles([]))
  }, [folder.id])

  useEffect(refreshFiles, [refreshFiles])

  // Open the first file once the list arrives.
  useEffect(() => {
    if (files.length) setTabs((t) => (t.paths.length ? t : { paths: [files[0].path], active: 0 }))
  }, [files])

  const openSource = useCallback((path: string, start?: number, end?: number) => {
    setTabs(({ paths }) => {
      const i = paths.indexOf(path)
      return i >= 0 ? { paths, active: i } : { paths: [...paths, path], active: paths.length }
    })
    setHighlight(start ? { start, end: end ?? start } : null)
  }, [])

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

  const ctx: FolderCtx = useMemo(
    () => ({ folder, files, openSource, refreshFiles, version, bump: () => setVersion((v) => v + 1) }),
    [folder, files, openSource, refreshFiles, version],
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
        onSelect={select}
        onClose={close}
      />
    </FolderContext.Provider>
  )
}

function FolderLayout({ folders, error, tabs, highlight, panel, onPanel, onSelect, onClose }: {
  folders: Folder[]
  error: string | null
  tabs: Tabs
  highlight: Highlight
  panel: PanelTab
  onPanel: (t: PanelTab) => void
  onSelect: (i: number) => void
  onClose: (i: number) => void
}) {
  const { folder, files, openSource } = useFolder()
  const imp = useImport()
  const current = tabs.paths[tabs.active]

  return (
    <div className="flex min-h-0 flex-1">
      <Sidebar
        folders={folders}
        error={error}
        activeId={folder.id}
        files={files}
        currentPath={current}
        onOpenFile={(p) => openSource(p)}
        footer={
          <>
            <ImportButton onFiles={imp.importFiles} busy={imp.busy} />
            {imp.message && (
              <button className="mt-1 px-2 text-left text-xs text-muted" onClick={imp.clear}>{imp.message}</button>
            )}
          </>
        }
      />

      <DropZone onFiles={imp.importFiles}>
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-4 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 font-semibold text-brand-text">
            <Lock size={11} /> Sealed: AI can only see this {noun(folder.mode).toLowerCase()}
          </span>
          <span className="text-muted">{files.length} files</span>
        </div>
        <FileTabs tabs={tabs.paths} active={tabs.active} onSelect={onSelect} onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {current ? (
            <FileViewer key={current} path={current} highlight={highlight} />
          ) : (
            <p className="p-10 text-muted">
              {files.length ? 'Open a file from the left.' : 'This folder is empty. Drop files here or use Import files.'}
            </p>
          )}
        </div>
      </DropZone>

      <RightPanel
        tab={panel}
        onTab={onPanel}
        wide={panel === 'audit' || panel === 'approvals' || panel === 'timeline'}
        panels={{
          ask: <AskPanel onShowApprovals={() => onPanel('approvals')} />,
          timeline: <TimelinePanel />,
          permissions: <PermissionsPanel />,
          approvals: <ApprovalsPanel />,
          audit: <AuditPanel />,
        }}
      />
    </div>
  )
}
