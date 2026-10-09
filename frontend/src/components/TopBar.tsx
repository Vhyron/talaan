import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cpu, Menu, Settings, WifiOff } from 'lucide-react'
import { api } from '../api/client'
import { useNav } from '../lib/nav'

export default function TopBar({ modelVersion = 0 }: { modelVersion?: number }) {
  const [model, setModel] = useState<string | null>(null)
  const nav = useNav()

  useEffect(() => {
    api.health().then((h) => setModel(h.chat_model)).catch(() => setModel(null))
  }, [modelVersion])

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-white px-3 sm:gap-4 sm:px-5">
      <button
        onClick={() => nav.setOpen(!nav.open)}
        className="-ml-1 grid h-9 w-9 place-items-center rounded-md hover:bg-panel lg:hidden"
        aria-label={nav.open ? 'Close folders' : 'Open folders'}
        aria-expanded={nav.open}
      >
        <Menu size={20} />
      </button>
      <Link to="/" className="flex min-w-0 items-center gap-1.5">
        {/* Balintong curled up and sealed: the app's mark. */}
        <img src="/talaan_3.png" alt="" className="h-8 w-8 shrink-0" />
        <span className="text-lg font-extrabold">Talaan</span>
      </Link>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <Link
          to="/settings"
          className="hidden items-center gap-1.5 rounded-full border border-line px-3 py-1 font-mono text-xs text-muted hover:border-brand hover:text-ink md:inline-flex"
          title="Local model · model and LLM activity settings"
        >
          <Cpu size={13} /> {model ?? 'model offline'}
        </Link>
        <Link to="/settings" aria-label="Settings" title="Settings" className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted hover:bg-panel hover:text-ink">
          <Settings size={18} />
        </Link>
        <span
          className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold whitespace-nowrap text-brand-text"
          title="Offline · nothing leaves this laptop"
        >
          <WifiOff size={14} />
          <span className="sm:hidden">Offline</span>
          <span className="hidden sm:inline">Offline · nothing leaves this laptop</span>
        </span>
      </div>
    </header>
  )
}
