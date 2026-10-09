import { useEffect, useRef, useState } from 'react'
import { Pencil, Search, Trash2 } from 'lucide-react'
import { api } from '../api/client'
import type { ChatSessionSummary } from '../api/types'
import { ago } from '../lib/format'
import { useFolder } from '../lib/folderContext'

/** Saved chats for the open folder only: search, continue, rename, delete. */
export default function ChatHistory({ activeId, onOpen, onDeleted, onRenamed }: {
  activeId: string | null
  onOpen: (sid: string) => void
  onDeleted: (sid: string) => void
  onRenamed: () => void
}) {
  const { folder } = useFolder()
  const [q, setQ] = useState('')
  const [list, setList] = useState<ChatSessionSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const cancelled = useRef(false) // Escape: the blur that follows must not save

  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      api.chats(folder.id, q)
        .then((l) => { if (live) { setList(l); setError(null) } })
        .catch((e) => live && setError((e as Error).message))
    }, q ? 250 : 0)
    return () => { live = false; clearTimeout(t) }
  }, [folder.id, q])

  function startEdit(s: ChatSessionSummary) {
    cancelled.current = false
    setEditing({ id: s.id, title: s.title })
  }

  // Saved on blur only; Enter blurs the input, so a title is never saved twice.
  async function rename() {
    if (!editing || cancelled.current) return
    const title = editing.title.trim()
    setEditing(null)
    if (!title) return
    try {
      const s = await api.renameChat(folder.id, editing.id, title)
      setList((l) => l?.map((x) => (x.id === s.id ? s : x)) ?? l)
      onRenamed()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function remove(sid: string) {
    setConfirming(null)
    try {
      await api.deleteChat(folder.id, sid)
      setList((l) => l?.filter((x) => x.id !== sid) ?? l)
      onDeleted(sid)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pt-2">
        <label className="flex items-center gap-2 rounded-xl border border-line bg-white px-2 py-1.5 text-sm focus-within:border-brand">
          <Search size={14} className="shrink-0 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search saved chats"
            aria-label="Search saved chats"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
        {error && <p className="mb-2 rounded-xl bg-warn-soft px-3 py-2 text-warn-text">{error}</p>}
        {list === null ? (
          <p className="text-muted">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-muted">{q.trim() ? 'No saved chats match.' : 'No saved chats in this Space yet. Every question you ask is saved here.'}</p>
        ) : (
          <ul className="space-y-2">
            {list.map((s) => (
              <li
                key={s.id}
                className={`rounded-xl border bg-white px-3 py-2 ${s.id === activeId ? 'border-brand' : 'border-line'}`}
              >
                {editing?.id === s.id ? (
                  <input
                    autoFocus
                    value={editing.title}
                    maxLength={80}
                    onChange={(e) => setEditing({ id: s.id, title: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') { cancelled.current = true; setEditing(null) }
                    }}
                    onBlur={rename}
                    aria-label="Chat title"
                    className="w-full rounded border border-brand px-1 font-medium outline-none"
                  />
                ) : confirming === s.id ? (
                  <div className="space-y-2">
                    <p>Delete this chat? Its questions and answers stay in the audit log.</p>
                    <div className="flex gap-2 text-xs">
                      <button onClick={() => remove(s.id)} className="rounded-full bg-red-700 px-3 py-1 font-semibold text-white">Delete</button>
                      <button onClick={() => setConfirming(null)} className="rounded-full bg-panel px-3 py-1">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-w-0 items-start gap-2">
                    <button onClick={() => onOpen(s.id)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate font-medium">{s.title}</span>
                      <span className="block text-xs text-muted">
                        {s.scope ? `${s.scope} · ` : ''}{ago(s.updated_at)} · {Math.ceil(s.message_count / 2)} {s.message_count === 2 ? 'question' : 'questions'}
                        {s.id === activeId ? ' · open now' : ''}
                      </span>
                    </button>
                    <button onClick={() => startEdit(s)} className="p-1 text-muted hover:text-ink" title="Rename" aria-label={`Rename ${s.title}`}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setConfirming(s.id)} className="p-1 text-muted hover:text-red-700" title="Delete" aria-label={`Delete ${s.title}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
