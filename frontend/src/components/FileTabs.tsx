import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, LayoutGrid, X } from 'lucide-react'
import { fileLabel } from '../lib/format'

/** Open files as tabs, after a fixed Overview tab (active = -1). The arrows step between them. */
export default function FileTabs({ tabs, active, onSelect, onClose }: {
  tabs: string[]
  active: number
  onSelect: (i: number) => void
  onClose: (i: number) => void
}) {
  const strip = useRef<HTMLDivElement>(null)

  useEffect(() => {
    strip.current?.children[active]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active, tabs.length])

  const arrow = 'grid w-8 shrink-0 place-items-center text-muted hover:bg-panel disabled:opacity-30 disabled:hover:bg-transparent'
  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-line bg-panel/40">
      <button
        role="tab"
        aria-selected={active === -1}
        onClick={() => onSelect(-1)}
        title="Folder overview"
        className={`flex shrink-0 items-center gap-1.5 border-r border-line px-3 text-sm ${active === -1 ? 'bg-white font-semibold' : 'text-muted hover:bg-white/60'}`}
      >
        <LayoutGrid size={14} /> <span className="hidden sm:inline">Overview</span>
      </button>
      <button className={arrow} disabled={active <= -1} onClick={() => onSelect(active - 1)} aria-label="Previous tab">
        <ChevronLeft size={16} />
      </button>
      <div ref={strip} className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">
        {tabs.map((path, i) => (
          <div
            key={path}
            role="tab"
            aria-selected={i === active}
            onClick={() => onSelect(i)}
            onAuxClick={(e) => e.button === 1 && onClose(i)}
            title={path}
            className={`group flex max-w-56 shrink-0 cursor-pointer items-center gap-2 border-r border-line px-3 text-sm ${
              i === active ? 'bg-white font-semibold' : 'text-muted hover:bg-white/60'
            }`}
          >
            <span className="truncate">{fileLabel(path)}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(i) }}
              className={`rounded p-0.5 hover:bg-panel ${i === active ? '' : 'opacity-0 group-hover:opacity-100'}`}
              aria-label={`Close ${path}`}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <button className={arrow} disabled={active >= tabs.length - 1} onClick={() => onSelect(active + 1)} aria-label="Next tab">
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
