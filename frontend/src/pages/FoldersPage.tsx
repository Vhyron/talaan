import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import type { Folder } from '../api/types'

export default function FoldersPage({ folders }: { folders: Folder[] }) {
  return (
    <div className="overflow-y-auto px-10 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Your folders</h1>
      <p className="mt-1 text-muted">Each folder is sealed. The AI only sees the one you open.</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {folders.map((f) => (
          <li key={f.id}>
            <Link
              to={`/folders/${encodeURIComponent(f.id)}`}
              className="block rounded-xl border border-line p-4 hover:border-brand hover:bg-brand-soft/40"
            >
              <span className="rounded bg-panel px-1.5 py-0.5 text-[11px] font-semibold uppercase">{f.mode}</span>
              <p className="mt-2 font-bold">{f.name}</p>
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted">
                <Lock size={11} /> Opened {new Date(f.created_at).toLocaleDateString()}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
