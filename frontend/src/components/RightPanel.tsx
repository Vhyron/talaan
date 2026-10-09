import { useEffect, useState, type ReactNode } from 'react'
import { ClipboardCheck, GanttChart, History, MessageSquare, Shield } from 'lucide-react'
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

export default function RightPanel({ tab, onTab, panels, wide }: {
  tab: PanelTab
  onTab: (t: PanelTab) => void
  panels: Record<PanelTab, ReactNode>
  wide: boolean
}) {
  const { folder, version } = useFolder()
  const [pending, setPending] = useState(0)

  useEffect(() => {
    api.proposals(folder.id).then((p) => setPending(p.length)).catch(() => setPending(0))
  }, [folder.id, version])

  return (
    <aside className={`flex shrink-0 flex-col border-l border-line bg-panel transition-[width] ${wide ? 'w-[34rem]' : 'w-96'}`}>
      <nav className="flex shrink-0 border-b border-line bg-white" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTab(id)}
            className={`relative flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-semibold ${
              tab === id ? 'text-brand-text after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-brand' : 'text-muted hover:text-ink'
            }`}
          >
            <Icon size={16} />
            {label}
            {id === 'approvals' && pending > 0 && (
              <span className="absolute top-1 right-2 grid h-4 min-w-4 place-items-center rounded-full bg-warn-soft px-1 text-[10px] text-warn-text">
                {pending}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1">{panels[tab]}</div>
    </aside>
  )
}
