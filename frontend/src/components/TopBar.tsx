import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cpu, Menu, WifiOff } from 'lucide-react'
import { api } from '../api/client'
import { useNav } from '../lib/nav'

export default function TopBar() {
  const [model, setModel] = useState<string | null>(null)
  const nav = useNav()

  useEffect(() => {
    api.health().then((h) => setModel(h.chat_model)).catch(() => setModel(null))
  }, [])

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
      <Link to="/" className="flex min-w-0 items-baseline gap-2">
        <span className="text-lg font-extrabold">Talaan</span>
        <span className="hidden truncate text-xs text-muted sm:inline">Sealed client files</span>
      </Link>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <span
          className="hidden items-center gap-1.5 rounded-full border border-line px-3 py-1 font-mono text-xs text-muted md:inline-flex"
          title="Local model"
        >
          <Cpu size={13} /> {model ?? 'model offline'}
        </span>
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
