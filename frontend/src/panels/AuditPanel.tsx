import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { api } from '../api/client'
import type { AuditEvent } from '../api/types'
import { useFolder } from '../lib/folderContext'
import { timeOf } from '../lib/format'

// A user setting a grant to Never is a settings change, not a blocked action.
const isBlocked = (e: AuditEvent) => e.decision === 'never' && e.event !== 'grant_change'

function tone(e: AuditEvent): string {
  if (isBlocked(e)) return 'bg-red-50 text-red-900'
  if (e.event === 'grant_change') return ''
  if (e.decision === 'needs_approval') return 'bg-warn-soft/70 text-warn-text'
  return ''
}

function badge(e: AuditEvent) {
  const { decision } = e
  if (!decision) return null
  if (e.event === 'grant_change') {
    return <span className="rounded bg-panel px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap">set to {decision.replace('_', ' ')}</span>
  }
  const cls =
    decision === 'never' ? 'bg-red-700 text-white'
      : decision === 'needs_approval' ? 'bg-warn-soft text-warn-text'
        : decision === 'rejected' ? 'bg-panel text-muted'
          : 'bg-brand-soft text-brand-text'
  const label = decision === 'never' ? 'blocked' : decision.replace('_', ' ')
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${cls}`}>{label}</span>
}

export default function AuditPanel() {
  const { folder, version } = useFolder()
  const [events, setEvents] = useState<AuditEvent[] | null>(null)
  const [blockedOnly, setBlockedOnly] = useState(false)

  useEffect(() => {
    api.audit(folder.id).then(setEvents).catch(() => setEvents([]))
  }, [folder.id, version])

  const shown = (events ?? []).filter((e) => !blockedOnly || isBlocked(e))

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 p-4 pb-3">
        <div className="mr-auto">
          <h2 className="font-bold">Audit log</h2>
          <p className="text-xs text-muted">Every question, AI action and decision in {folder.name}.</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold">
          <input type="checkbox" checked={blockedOnly} onChange={(e) => setBlockedOnly(e.target.checked)} className="accent-red-700" />
          Blocked only
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

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        {events === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : !shown.length ? (
          <p className="text-sm text-muted">{blockedOnly ? 'Nothing has been blocked.' : 'No activity yet.'}</p>
        ) : (
          <table className="w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-xl bg-white text-xs">
            <thead className="sticky top-0 bg-white text-left text-[11px] text-muted uppercase">
              <tr>
                {[['When', 'w-28'], ['What', ''], ['Decision', 'w-28'], ['Details', 'w-36']].map(([h, w]) => (
                  <th key={h} className={`border-b border-line px-2 py-2 font-semibold ${w}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} className={`align-top ${tone(e)}`}>
                  <td className="border-b border-line px-2 py-1.5 whitespace-nowrap">
                    {timeOf(e.timestamp)}
                    <span className="block text-[10px] text-muted">
                      {e.actor}{e.model_tag && <span className="font-mono"> · {e.model_tag}</span>}
                    </span>
                  </td>
                  <td className="border-b border-line px-2 py-1.5">
                    {e.event.replace('_', ' ')}{e.action && <> · <b>{e.action.replace('_', ' ')}</b></>}
                    {e.path && <span className="block truncate font-mono text-[10px]" title={e.path}>{e.path}</span>}
                  </td>
                  <td className="border-b border-line px-2 py-1.5">{badge(e)}</td>
                  <td className="border-b border-line px-2 py-1.5 break-words">{e.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
