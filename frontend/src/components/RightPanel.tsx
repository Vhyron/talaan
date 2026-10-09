import { useEffect, useState, type ReactNode } from 'react'
import { ClipboardCheck, FileText, GanttChart, History, MessageSquare, Shield } from 'lucide-react'
import { api } from '../api/client'
import { useFolder } from '../lib/folderContext'

export type PanelTab = 'ask' | 'timeline' | 'permissions' | 'approvals' | 'audit'

const TABS: { id: PanelTab; label: string; icon: typeof MessageSquare }[] = [
  { id: 'ask', label: 'Ask', icon: MessageSquare },
  { id: 'timeline', label: 'Timeline', icon: GanttChart },
  { id: 'permissions', label: 'Permissions', icon: Shield },
  { id: 'approvals', label: 'Approvals', icon: ClipboardCheck },
  { id: 'audit', label: 'Audit', icon: History },
]

function usePendingCount(): number {
  const { folder, version } = useFolder()
  const [pending, setPending] = useState(0)
  useEffect(() => {
    api.proposals(folder.id).then((p) => setPending(p.length)).catch(() => setPending(0))
  }, [folder.id, version])
  return pending
}

function Badge({ n }: { n: number }) {
  if (!n) return null
  return (
    <span className="absolute top-1 right-1/2 grid h-4 min-w-4 translate-x-5 place-items-center rounded-full bg-warn-soft px-1 text-[10px] text-warn-text">
      {n}
    </span>
  )
}

const tabClass = (on: boolean) =>
  `relative flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-semibold ${
    on ? 'text-brand-text after:absolute after:inset-x-2 after:h-0.5 after:bg-brand' : 'text-muted hover:text-ink'
  }`

/**
 * Ask · Timeline · Permissions · Approvals · Audit.
 * From `md` up it's a column beside the document with its own tab bar. On phones
 * it fills the screen when shown, and MobileTabs (below) switches views instead.
 */
export default function RightPanel({ tab, onTab, panels, wide, mobileVisible }: {
  tab: PanelTab
  onTab: (t: PanelTab) => void
  panels: Record<PanelTab, ReactNode>
  wide: boolean
  mobileVisible: boolean
}) {
  const pending = usePendingCount()

  return (
    <aside
      className={`${mobileVisible ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col bg-panel md:flex md:w-80 md:flex-none md:shrink-0 md:border-l md:border-line lg:w-96 ${
        wide ? 'xl:w-[34rem]' : ''
      }`}
    >
      <nav className="hidden shrink-0 border-b border-line bg-white md:flex" role="tablist" aria-label="Folder tools">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => onTab(id)} className={`${tabClass(tab === id)} after:bottom-0`}>
            <Icon size={16} />
            {label}
            {id === 'approvals' && <Badge n={pending} />}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1">{panels[tab]}</div>
    </aside>
  )
}

/** Phone-only bottom bar: the document plus each panel. */
export function MobileTabs({ view, onView }: { view: 'doc' | PanelTab; onView: (v: 'doc' | PanelTab) => void }) {
  const pending = usePendingCount()
  const items = [{ id: 'doc' as const, label: 'File', icon: FileText }, ...TABS]
  return (
    <nav
      className="flex shrink-0 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      role="tablist"
      aria-label="Views"
    >
      {items.map(({ id, label, icon: Icon }) => (
        <button key={id} role="tab" aria-selected={view === id} onClick={() => onView(id)} className={`${tabClass(view === id)} after:top-0`}>
          <Icon size={18} />
          <span className="max-w-full truncate">{label === 'Permissions' ? 'Access' : label}</span>
          {id === 'approvals' && <Badge n={pending} />}
        </button>
      ))}
    </nav>
  )
}
