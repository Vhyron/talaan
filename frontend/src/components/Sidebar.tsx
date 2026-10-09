import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, FileText, Folder as FolderIcon } from 'lucide-react'
import type { FileEntry, Folder, Mode } from '../api/types'
import { fileLabel } from '../lib/format'

const GROUPS: { mode: Mode; label: string }[] = [
  { mode: 'case', label: 'HR cases' },
  { mode: 'chart', label: 'Clinic charts' },
]

/** Folder tree. The open folder expands to show its files. */
export default function Sidebar({ folders, error, activeId, files, currentPath, onOpenFile, footer }: {
  folders: Folder[]
  error: string | null
  activeId?: string
  files?: FileEntry[]
  currentPath?: string
  onOpenFile?: (path: string) => void
  footer?: ReactNode
}) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-panel/50 text-sm">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {error && <p className="p-2 text-red-700">Backend unreachable: {error}</p>}
        {GROUPS.map(({ mode, label }) => {
          const group = folders.filter((f) => f.mode === mode)
          if (!group.length) return null
          return (
            <div key={mode} className="mb-4">
              <p className="eyebrow px-2 pb-2">{label}</p>
              {group.map((f) => {
                const open = f.id === activeId
                return (
                  <div key={f.id}>
                    <Link
                      to={open ? '/' : `/folders/${encodeURIComponent(f.id)}`}
                      className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 ${open ? 'font-semibold' : 'hover:bg-panel'}`}
                    >
                      {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <FolderIcon size={15} className="shrink-0" />
                      <span className="truncate">{f.name}</span>
                    </Link>
                    {open &&
                      files?.map((file) => (
                        <button
                          key={file.path}
                          onClick={() => onOpenFile?.(file.path)}
                          title={file.path}
                          className={`flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 pl-8 text-left ${
                            file.path === currentPath ? 'bg-brand-soft font-semibold' : 'text-muted hover:bg-panel'
                          }`}
                        >
                          <FileText size={14} className="shrink-0" />
                          <span className="truncate">{fileLabel(file.path)}</span>
                        </button>
                      ))}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      {footer && <div className="border-t border-line p-3">{footer}</div>}
    </aside>
  )
}
