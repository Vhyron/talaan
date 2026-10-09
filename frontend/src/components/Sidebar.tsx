import { NavLink } from 'react-router-dom'
import { Folder as FolderIcon } from 'lucide-react'
import type { Folder, Mode } from '../api/types'

const GROUPS: { mode: Mode; label: string }[] = [
  { mode: 'case', label: 'HR cases' },
  { mode: 'chart', label: 'Clinic charts' },
]

export default function Sidebar({ folders, error }: { folders: Folder[]; error: string | null }) {
  return (
    <aside className="w-60 shrink-0 overflow-y-auto border-r border-line bg-panel/50 p-3 text-sm">
      {error && <p className="p-2 text-red-700">Backend unreachable: {error}</p>}
      {GROUPS.map(({ mode, label }) => {
        const group = folders.filter((f) => f.mode === mode)
        if (!group.length) return null
        return (
          <div key={mode} className="mb-4">
            <p className="eyebrow px-2 pb-2">{label}</p>
            {group.map((f) => (
              <NavLink
                key={f.id}
                to={`/folders/${encodeURIComponent(f.id)}`}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-2 py-1.5 ${isActive ? 'bg-brand-soft font-semibold' : 'hover:bg-panel'}`
                }
              >
                <FolderIcon size={15} className="shrink-0" />
                <span className="truncate">{f.name}</span>
              </NavLink>
            ))}
          </div>
        )
      })}
    </aside>
  )
}
