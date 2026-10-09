import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cpu, WifiOff } from 'lucide-react'
import { api } from '../api/client'

export default function TopBar() {
  const [model, setModel] = useState<string | null>(null)

  useEffect(() => {
    api.health().then((h) => setModel(h.chat_model)).catch(() => setModel(null))
  }, [])

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-white px-5">
      <Link to="/" className="flex items-baseline gap-2">
        <span className="text-lg font-extrabold">Talaan</span>
        <span className="text-xs text-muted">Sealed client files</span>
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 font-mono text-xs text-muted">
          <Cpu size={13} /> {model ?? 'model offline'}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-text">
          <WifiOff size={14} /> Offline · nothing leaves this laptop
        </span>
      </div>
    </header>
  )
}
