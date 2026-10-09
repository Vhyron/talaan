import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, FileText, Folder as FolderIcon, X } from 'lucide-react'
import type { FileEntry, Folder, Mode } from '../api/types'
import { fileLabel } from '../lib/format'
import { useNav } from '../lib/nav'

const GROUPS: { mode: Mode; label: string }[] = [
  { mode: 'case', label: 'HR cases' },
  { mode: 'chart', label: 'Clinic charts' },
]

/** Folder tree. The open folder expands to show its files.
 * Inline from `lg` up; below that it's a drawer opened from the top bar. */
export default function Sidebar({ folders, error, activeId, files, currentPath, onOpenFile, footer }: {
  folders: Folder[]
  error: string | null
  activeId?: string
  files?: FileEntry[]
  currentPath?: string
  onOpenFile?: (path: string) => void
  footer?: ReactNode
}) {
  const nav = useNav()
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
                          onClick={() => { onOpenFile?.(file.path); nav.setOpen(false) }}
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
    </>
  )
}
