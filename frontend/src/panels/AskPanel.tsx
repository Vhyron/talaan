import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Ban, ClipboardCheck, Lock, SendHorizontal } from 'lucide-react'
import { api } from '../api/client'
import type { AskResponse, Source } from '../api/types'
import SourceChip from '../components/SourceChip'
import { useElapsed } from '../lib/useElapsed'
import { useFolder } from '../lib/folderContext'

type Msg = { role: 'user'; text: string } | { role: 'assistant'; res: AskResponse } | { role: 'error'; text: string }

/** Turn "… [S1] … [S2]" into text with inline source chips. */
function withChips(answer: string, sources: Source[]): ReactNode[] {
  return answer.split(/(\[S\d+\])/g).map((part, i) => {
    const m = part.match(/^\[S(\d+)\]$/)
    const src = m && sources[Number(m[1]) - 1]
    return src ? <SourceChip key={i} source={src} n={Number(m[1])} /> : part
  })
}

export default function AskPanel({ onShowApprovals }: { onShowApprovals: () => void }) {
  const { folder, bump } = useFolder()
  const [messages, setMessages] = useState<Msg[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const elapsed = useElapsed(busy)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages, busy])

  async function send() {
    const q = question.trim()
    if (!q || busy) return
    setQuestion('')
    setMessages((m) => [...m, { role: 'user', text: q }])
    setBusy(true)
    try {
      const res = await api.ask(folder.id, q)
      setMessages((m) => [...m, { role: 'assistant', res }])
      if (res.outcome) bump() // a proposal or blocked action changes Approvals/Audit
    } catch (e) {
      setMessages((m) => [...m, { role: 'error', text: (e as Error).message }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pt-4">
        <h2 className="font-bold">Ask this {folder.mode}</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs">
          <Lock size={11} /> Only sees {folder.name}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        {!messages.length && (
          <p className="text-muted">
            Answers come only from files in this {folder.mode}, with sources you can click.
          </p>
        )}
        {messages.map((m, i) => {
          if (m.role === 'user') {
            return <div key={i} className="ml-8 rounded-xl rounded-tr-sm bg-brand-dark px-3 py-2 text-white">{m.text}</div>
          }
          if (m.role === 'error') {
            return <div key={i} className="rounded-xl border border-warn-text/30 bg-warn-soft px-3 py-2 text-warn-text">{m.text}</div>
          }
          return <Answer key={i} res={m.res} onShowApprovals={onShowApprovals} />
        })}
        {busy && (
          <div className="rounded-xl bg-white px-3 py-2 text-muted">
            Reading this {folder.mode} on this laptop… {elapsed}s
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="p-4 pt-0">
        <div className="flex items-end gap-2 rounded-xl border border-line bg-white p-2 focus-within:border-brand">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            rows={2}
            aria-label={`Ask about this ${folder.mode}`}
            className="flex-1 resize-none bg-transparent outline-none"
            placeholder={folder.mode === 'case' ? 'e.g. What is still open?' : 'e.g. Any allergies before I prescribe?'}
          />
          <button onClick={send} disabled={busy || !question.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-white disabled:opacity-40" aria-label="Send">
            <SendHorizontal size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

function Answer({ res, onShowApprovals }: { res: AskResponse; onShowApprovals: () => void }) {
  if (res.refused) {
    return (
      <div className="flex gap-2 rounded-xl border border-line bg-white px-3 py-2 text-muted">
        <Lock size={15} className="mt-0.5 shrink-0" />
        <span className="font-medium">{res.answer}</span>
      </div>
    )
  }
  const o = res.outcome
  return (
    <div className="space-y-2 rounded-xl bg-white px-3 py-2">
      <p className="leading-6">{withChips(res.answer, res.sources)}</p>

      {o?.status === 'blocked' && (
        <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
          <Ban size={15} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Blocked by policy</p>
            <p className="text-xs">
              {o.action ? `${o.action.replace('_', ' ')}${o.path ? ` · ${o.path}` : ''}. ` : ''}{o.reason}
            </p>
          </div>
        </div>
      )}
      {o?.status === 'pending' && (
        <button onClick={onShowApprovals} className="flex w-full items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-left text-warn-text">
          <ClipboardCheck size={15} /> Waiting for your approval. Review it in Approvals →
        </button>
      )}

      {res.sources.length > 0 && (
        <div className="border-t border-line pt-2">
          <p className="eyebrow">Sources</p>
          <ol className="mt-1 space-y-1">
            {res.sources.map((s, i) => (
              <li key={i} className="flex items-baseline gap-1 text-xs">
                <SourceChip source={s} n={i + 1} />
                <span className="truncate text-muted">lines {s.start}–{s.end}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
