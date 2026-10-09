import { useEffect, useState, type ReactNode } from 'react'
import { ClipboardCheck, GanttChart, History, MessageSquare, Pin, PinOff, Shield, X } from 'lucide-react'
import { api } from '../api/client'
import { useFolder } from '../lib/folderContext'
import { useMediaQuery } from '../lib/useMediaQuery'

export type PanelTab = 'ask' | 'timeline' | 'permissions' | 'approvals' | 'audit'

const TOOLS: { id: PanelTab; label: string; title: string; icon: typeof MessageSquare }[] = [
  { id: 'ask', label: 'Ask', title: 'Ask this folder', icon: MessageSquare },
  { id: 'timeline', label: 'Timeline', title: 'Timeline', icon: GanttChart },
  { id: 'permissions', label: 'Access', title: 'Permissions', icon: Shield },
  { id: 'approvals', label: 'Approvals', title: 'Approvals', icon: ClipboardCheck },
  { id: 'audit', label: 'Audit', title: 'Audit log', icon: History },
]

function usePendingCount(): number {
  const { folder, version } = useFolder()
  const [pending, setPending] = useState(0)
  useEffect(() => {
    api.proposals(folder.id).then((p) => setPending(p.length)).catch(() => setPending(0))
  }, [folder.id, version])
  return pending
}

/**
 * Folder tools as a floating dock in the bottom-right corner (bottom centre on
 * phones). A tool opens as a floating card at the right edge above the dock, or a
 * bottom sheet on phones, so the document keeps the full width. On wide screens the
 * card can be pinned into a side column instead.
 */
export default function FloatingTools({ open, onOpen, pinned, onPin, panels }: {
  open: PanelTab | null
  onOpen: (t: PanelTab | null) => void
  pinned: boolean
  onPin: (p: boolean) => void
  panels: Record<PanelTab, ReactNode>
}) {
  const pending = usePendingCount()
  const tool = TOOLS.find((t) => t.id === open)
  // Pinning only applies on wide screens; narrower ones always float.
  const wide = useMediaQuery('(min-width: 1024px)')
  const docked = pinned && wide

  // Esc closes the card, unless a modal dialog (voice note, import) is on top.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) onOpen(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpen])

  // The card is always mounted (hidden when nothing is open) so the Ask conversation
  // survives switching tools and closing the card; the other tools load when shown.
  const shown = tool ?? TOOLS[0]
  const card = (
    <section
      role="dialog"
      aria-label={shown.title}
      className={`${tool ? '' : 'hidden '}` + (
        docked
          ? // Pinned: a column beside the document, the old panel's widths; bottom padding
            // keeps the panel's own controls clear of the dock in the corner.
            'flex min-h-0 w-96 shrink-0 flex-col border-l border-line bg-panel pb-16 xl:w-[28rem]'
          : // Floating: a card at the right edge, above the dock (md+); a bottom sheet on phones.
            'fixed inset-x-0 bottom-0 z-30 flex h-[78dvh] flex-col overflow-hidden rounded-t-2xl border border-line bg-panel pb-16 shadow-2xl ' +
            'md:inset-x-auto md:top-[8.5rem] md:right-3 md:bottom-[4.5rem] md:h-auto md:w-80 md:rounded-2xl md:pb-0 lg:w-96 xl:w-[28rem]')
      }
    >
      <header className="flex h-9 shrink-0 items-center gap-1.5 border-b border-line bg-white pr-1 pl-3">
        <shown.icon size={13} className="text-brand-text" />
        <span className="mr-auto text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">{shown.label === 'Access' ? 'Permissions' : shown.label}</span>
        <button
          onClick={() => onPin(!pinned)}
          className="hidden h-7 w-7 place-items-center rounded-md text-muted hover:bg-panel hover:text-ink lg:grid"
          aria-label={pinned ? 'Unpin panel' : 'Pin panel beside the document'}
          title={pinned ? 'Unpin (float over the document)' : 'Pin beside the document'}
        >
          {pinned ? <PinOff size={15} /> : <Pin size={15} />}
        </button>
        <button onClick={() => onOpen(null)} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-panel hover:text-ink" aria-label={`Close ${shown.title}`}>
          <X size={16} />
        </button>
      </header>
      <div className={`min-h-0 flex-1 ${open === 'ask' ? '' : 'hidden'}`}>{panels.ask}</div>
      {open && open !== 'ask' && <div className="min-h-0 flex-1">{panels[open]}</div>}
    </section>
  )

  return (
    <>
      {card}
      <nav
        role="toolbar"
        aria-label="Folder tools"
        // Phone: bottom centre with labels. Larger screens: bottom-right corner, icons only.
        className="fixed bottom-3 left-1/2 z-40 flex -translate-x-1/2 gap-0.5 rounded-full border border-line bg-white/95 p-1 shadow-lg backdrop-blur md:right-3 md:left-auto md:translate-x-0"
      >
        {TOOLS.map(({ id, label, title, icon: Icon }) => {
          const active = open === id
          return (
            <button
              key={id}
              onClick={() => onOpen(active ? null : id)}
              aria-pressed={active}
              aria-label={title}
              title={title}
              className={`relative flex h-11 w-12 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold md:h-10 md:w-10 ${
                active ? 'bg-brand text-white' : 'text-muted hover:bg-panel hover:text-ink'
              }`}
            >
              <Icon size={17} />
              <span className="md:hidden">{label}</span>
              {id === 'approvals' && pending > 0 && (
                <span className={`absolute -top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] ${active ? 'bg-white text-brand-text' : 'bg-warn-soft text-warn-text'}`}>
                  {pending}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </>
  )
}
