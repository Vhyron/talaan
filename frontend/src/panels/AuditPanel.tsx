import { useEffect, useState } from 'react'
import { Bot, Download, User } from 'lucide-react'
import { api } from '../api/client'
import type { AuditEvent } from '../api/types'
import { useFolder } from '../lib/folderContext'
import { timeOf } from '../lib/format'

// A user setting a grant to Never is a settings change, not a blocked action.
const isBlocked = (e: AuditEvent) => e.decision === 'never' && e.event !== 'grant_change'

const GRANT_LABEL: Record<string, string> = {
  read: 'Read',
  suggest_edits: 'Suggest edits',
  create_drafts: 'Create drafts',
  delete: 'Delete',
}
const VALUE_LABEL: Record<string, string> = { allow: 'Allow', needs_approval: 'Needs approval', never: 'Never' }

const words = (s: string) => s.replace(/_/g, ' ')
const ACTION_NOUN: Record<string, string> = { propose_edit: 'edit', create_draft: 'draft', delete: 'delete', read: 'read', search: 'search' }

/** One-line summary: what happened, in plain words. */
function title(e: AuditEvent): string {
  if (e.event === 'grant_change') return `Permission changed: ${GRANT_LABEL[e.action ?? ''] ?? words(e.action ?? '')}`
  if (e.event === 'rename') return e.action === 'rename_folder' ? 'Folder renamed' : e.action === 'rename_dir' ? 'Subfolder renamed' : 'File renamed'
  if (e.event === 'question') return 'Question asked'
  if (e.event === 'answer') return 'Answer given'
  const action = ACTION_NOUN[e.action ?? ''] ?? (e.action ? words(e.action) : 'action')
  if (e.event === 'proposed_action') return `Proposed ${action}`
  if (e.event === 'executed') return `Executed ${action}`
  return `Decision on ${action}`
}

/** Details line; grant changes read "Needs approval → Allow" instead of raw values. */
function details(e: AuditEvent): string | null {
  if (e.event === 'grant_change' && e.reason) {
    return e.reason.split('→').map((v) => VALUE_LABEL[v.trim()] ?? v.trim()).join(' → ')
  }
  return e.reason
}

function Badge({ e }: { e: AuditEvent }) {
  const d = e.decision
  if (!d || e.event === 'grant_change') return null
  const [label, cls] =
    d === 'never' ? ['Blocked', 'bg-red-700 text-white']
      : d === 'needs_approval' ? ['Needs approval', 'bg-warn-soft text-warn-text']
        : d === 'rejected' ? ['Rejected', 'bg-panel text-muted']
          : d === 'approved' ? ['Approved', 'bg-brand-soft text-brand-text']
            : ['Allowed', 'bg-brand-soft text-brand-text']
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>
}

function Row({ e }: { e: AuditEvent }) {
  const Who = e.actor === 'user' ? User : Bot
  const more = details(e)
  const pending = e.decision === 'needs_approval' && e.event !== 'grant_change'
  return (
    <li
      data-audit-row
      className={`min-w-0 border-b border-line px-3 py-2.5 last:border-b-0 ${isBlocked(e) ? 'bg-red-50' : pending ? 'bg-warn-soft/40' : ''}`}
    >
      <div className="flex items-start gap-2">
        <span className={`min-w-0 flex-1 font-semibold ${isBlocked(e) ? 'text-red-900' : ''}`}>{title(e)}</span>
        <Badge e={e} />
      </div>
      {e.path && (
        <p className="mt-0.5 truncate font-mono text-[11px] text-muted" title={e.path}>{e.path}</p>
      )}
      {more && <p className={`mt-0.5 break-words ${isBlocked(e) ? 'text-red-900' : ''}`}>{more}</p>}
      <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted">
        <span className="whitespace-nowrap">{timeOf(e.timestamp)}</span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1">
          <Who size={11} /> {e.actor === 'user' ? 'You' : 'AI'}
        </span>
        {e.model_tag && (
          <span className="max-w-full truncate rounded bg-panel px-1 font-mono" title={e.model_tag}>{e.model_tag}</span>
        )}
      </p>
    </li>
  )
}

export default function AuditPanel() {
  const { folder, version } = useFolder()
  const [events, setEvents] = useState<AuditEvent[] | null>(null)
  const [blockedOnly, setBlockedOnly] = useState(false)

  useEffect(() => {
    api.audit(folder.id).then(setEvents).catch(() => setEvents([]))
  }, [folder.id, version])

  const shown = (events ?? []).filter((e) => !blockedOnly || isBlocked(e))
  const blockedCount = (events ?? []).filter(isBlocked).length

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-4 pb-3">
        <div>
          <h2 className="font-bold">Audit log</h2>
          <p className="text-xs text-muted">Every question, AI action and decision in {folder.name}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="mr-auto inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold">
            <input type="checkbox" checked={blockedOnly} onChange={(e) => setBlockedOnly(e.target.checked)} className="accent-red-700" />
            Blocked only
            {blockedCount > 0 && <span className="rounded-full bg-red-700 px-1.5 text-[10px] text-white">{blockedCount}</span>}
          </label>
          {(['csv', 'json'] as const).map((f) => (
            <a
              key={f}
              href={api.auditExportUrl(folder.id, f)}
              download
              className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-panel"
            >
              <Download size={12} /> {f.toUpperCase()}
            </a>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {events === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : !shown.length ? (
          <p className="text-sm text-muted">{blockedOnly ? 'Nothing has been blocked.' : 'No activity yet.'}</p>
        ) : (
          <ol className="overflow-hidden rounded-xl bg-white text-xs" aria-label="Audit events, newest first">
            {shown.map((e) => <Row key={e.id} e={e} />)}
          </ol>
        )}
      </div>
    </div>
  )
}
