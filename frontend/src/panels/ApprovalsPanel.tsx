import { useEffect, useState } from 'react'
import { Check, FilePlus2, PencilLine, Trash2, X } from 'lucide-react'
import { api } from '../api/client'
import type { Proposal } from '../api/types'
import { useFolder } from '../lib/folderContext'
import { timeOf } from '../lib/format'

const KIND = {
  propose_edit: { label: 'Edit', icon: PencilLine },
  create_draft: { label: 'Draft', icon: FilePlus2 },
  delete: { label: 'Delete', icon: Trash2 },
} as const

type Line = { op: '+' | '-' | ' ' | '@'; text: string }

/** Unified diff -> lines, skipping the ---/+++ headers. */
function parseDiff(diff: string): Line[] {
  return diff
    .split('\n')
    .filter((l) => l && !l.startsWith('---') && !l.startsWith('+++'))
    .map((l) => ({ op: (l.startsWith('@@') ? '@' : l[0]) as Line['op'], text: l.startsWith('@@') ? l : l.slice(1) }))
}

const pathOf = (p: Proposal) => ('path' in p.action ? p.action.path : '')

export default function ApprovalsPanel() {
  const { folder, version, bump, refreshFiles, openSource } = useFolder()
  const [items, setItems] = useState<Proposal[] | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState<string[]>([])

  useEffect(() => {
    api.proposals(folder.id).then((ps) => {
      setItems(ps)
      setChecked(new Set(ps.map((p) => p.id)))
      setSelected((s) => (s && ps.some((p) => p.id === s) ? s : ps[0]?.id ?? null))
    }).catch(() => setItems([]))
  }, [folder.id, version])

  async function decide(ids: string[], approve: boolean) {
    setBusy(true)
    const out: string[] = []
    for (const id of ids) {
      const p = items?.find((x) => x.id === id)
      try {
        if (approve) {
          const o = await api.approve(id)
          out.push(o.status === 'executed' ? `Saved ${pathOf(p!)}` : `Not applied: ${o.reason}`)
        } else {
          await api.reject(id)
          out.push(`Rejected ${pathOf(p!)}`)
        }
      } catch (e) {
        out.push((e as Error).message)
      }
    }
    setNotes(out)
    setBusy(false)
    refreshFiles()
    bump()
  }

  if (items === null) return <p className="p-4 text-sm text-muted">Loading…</p>

  const preview = items.find((p) => p.id === selected)
  const ids = items.filter((p) => checked.has(p.id)).map((p) => p.id)

  return (
    <div className="flex h-full flex-col">
      <div className="p-4 pb-2">
        <h2 className="font-bold">Approvals</h2>
        <p className="mt-1 text-xs text-muted">
          The AI proposes; nothing changes in {folder.name} until you approve.
        </p>
        {notes.length > 0 && (
          <ul className="mt-2 space-y-0.5 rounded-lg bg-white p-2 text-xs">
            {notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        )}
      </div>

      {!items.length ? (
        <p className="px-4 text-sm text-muted">Nothing waiting for approval.</p>
      ) : (
        <>
          <ul className="mx-4 max-h-[40%] shrink-0 divide-y divide-line overflow-y-auto rounded-xl border border-line bg-white">
            {items.map((p) => {
              const K = KIND[p.action.action as keyof typeof KIND] ?? KIND.propose_edit
              return (
                <li
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  className={`flex cursor-pointer gap-3 px-3 py-2.5 ${selected === p.id ? 'bg-brand-soft' : 'hover:bg-panel/60'}`}
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${pathOf(p)}`}
                    checked={checked.has(p.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => setChecked((c) => { const n = new Set(c); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n })}
                    className="mt-1 h-4 w-4 shrink-0 accent-brand"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded bg-panel px-1.5 py-0.5 text-[11px]">
                        <K.icon size={11} /> {K.label}
                      </span>
                      <span className="truncate font-mono text-xs">{pathOf(p)}</span>
                    </div>
                    {p.reason && <p className="mt-1 text-xs text-muted">{p.reason}</p>}
                    <p className="mt-0.5 text-[11px] text-muted">{timeOf(p.created_at)}</p>
                  </div>
                </li>
              )
            })}
          </ul>

          {preview && (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3">
              <p className="eyebrow">Preview · {KIND[preview.action.action as keyof typeof KIND]?.label}</p>
              <button onClick={() => openSource(pathOf(preview))} className="mt-1 font-mono text-sm font-semibold hover:underline" disabled={preview.action.action === 'create_draft'}>
                {pathOf(preview)}
              </button>
              <pre className="mt-2 overflow-x-auto rounded-xl bg-white py-2 font-mono text-[12px] leading-5">
                {preview.action.action === 'create_draft'
                  ? (preview.new_content ?? '').split('\n').map((l, i) => <div key={i} className="bg-brand-soft px-3">+ {l}</div>)
                  : parseDiff(preview.diff ?? '').map((l, i) => (
                      <div
                        key={i}
                        className={`px-3 ${l.op === '+' ? 'bg-brand-soft' : l.op === '-' ? 'bg-red-50 text-red-900 line-through decoration-red-300' : l.op === '@' ? 'text-muted' : ''}`}
                      >
                        {l.op === '@' ? l.text : `${l.op} ${l.text}`}
                      </div>
                    ))}
              </pre>
              <div className="mt-2 flex gap-2 pb-3">
                <button disabled={busy} onClick={() => decide([preview.id], true)} className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  <Check size={13} /> Approve this
                </button>
                <button disabled={busy} onClick={() => decide([preview.id], false)} className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
                  <X size={13} /> Reject
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-line bg-white p-3">
            <button className="btn-primary text-sm" disabled={busy || !ids.length} onClick={() => decide(ids, true)}>
              Approve {ids.length}
            </button>
            <button className="btn-ghost text-sm" disabled={busy} onClick={() => decide(items.map((p) => p.id), false)}>
              Reject all
            </button>
            <span className="ml-auto text-[11px] text-muted">Every decision goes in the audit log.</span>
          </div>
        </>
      )}
    </div>
  )
}
