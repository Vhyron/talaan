import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Library, RotateCcw, SendHorizontal, WifiOff } from 'lucide-react'
import { api } from '../api/client'
import type { AskResponse, Folder, Source } from '../api/types'
import { fileLabel } from '../lib/format'
import { useElapsed } from '../lib/useElapsed'

type Msg = { role: 'user'; text: string } | { role: 'assistant'; res: AskResponse } | { role: 'error'; text: string }

const HISTORY_TURNS = 4

/** A citation from the home chat: names its folder and opens the file there with the lines highlighted. */
function GlobalSourceChip({ source, n, folders }: { source: Source; n: number; folders: Folder[] }) {
  const navigate = useNavigate()
  const folder = folders.find((f) => f.id === source.folder_id)
  return (
    <button
      onClick={() => source.folder_id && navigate(`/folders/${encodeURIComponent(source.folder_id)}`, {
        state: { open: source.path, start: source.start, end: source.end },
      })}
      title={`${folder?.name ?? source.folder_id} / ${source.path}, lines ${source.start}–${source.end}\n${source.snippet}`}
      className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 align-baseline text-xs font-semibold text-brand-text hover:bg-brand hover:text-white"
    >
      <span>{n}</span>
      <span className="truncate">{folder?.name ?? source.folder_id} · {fileLabel(source.path)}</span>
    </button>
  )
}

function withChips(answer: string, sources: Source[], folders: Folder[]): ReactNode[] {
  return answer.split(/(\[S\d+\])/g).map((part, i) => {
    const m = part.match(/^\[S(\d+)\]$/)
    const src = m && sources[Number(m[1]) - 1]
    return src ? <GlobalSourceChip key={i} source={src} n={Number(m[1])} folders={folders} /> : part
  })
}

/** Home-page chat: one question answered from every folder the AI may read, on this laptop. */
export default function HomeChat({ folders }: { folders: Folder[] }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const elapsed = useElapsed(busy)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [messages, busy])

  async function send() {
    const q = question.trim()
    if (!q || busy) return
    const history = messages
      .flatMap((m): { role: 'user' | 'assistant'; content: string }[] => (m.role === 'user' ? [{ role: 'user' as const, content: m.text }] : m.role === 'assistant' ? [{ role: 'assistant' as const, content: m.res.answer }] : []))
      .slice(-HISTORY_TURNS * 2)
    setQuestion('')
    setMessages((m) => [...m, { role: 'user', text: q }])
    setBusy(true)
    try {
      const res = await api.askAll(q, history)
      setMessages((m) => [...m, { role: 'assistant', res }])
    } catch (e) {
      setMessages((m) => [...m, { role: 'error', text: (e as Error).message }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-line bg-panel/60 p-4 sm:p-5" aria-label="Ask across all folders">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="mr-auto min-w-0">
          <h2 className="flex items-center gap-2 font-bold"><Library size={17} className="text-brand-text" /> Ask across all folders</h2>
          <p className="mt-0.5 text-xs text-muted">
            Reads every folder you allow the AI to read. Each answer names the folder it came from; folders set to Read: Never are skipped.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-brand-text">
          <WifiOff size={11} /> On this laptop · read-only
        </span>
      </div>

      {messages.length > 0 && (
        <div className="mt-4 max-h-[45dvh] space-y-3 overflow-y-auto pr-1 text-sm" aria-live="polite">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-brand-dark px-3 py-2 break-words text-white">{m.text}</div>
            ) : m.role === 'error' ? (
              <div key={i} className="rounded-xl border border-amber-300 bg-warn-soft px-3 py-2 text-warn-text">{m.text}</div>
            ) : (
              <div key={i} className={`max-w-[95%] rounded-xl bg-white px-3 py-2 leading-6 break-words ${m.res.refused ? 'text-muted' : ''}`}>
                {withChips(m.res.answer, m.res.sources, folders)}
              </div>
            ),
          )}
          {busy && <div className="rounded-xl bg-white px-3 py-2 text-muted">Searching every folder on this laptop… {elapsed}s</div>}
          <div ref={end} />
        </div>
      )}

      <div className="mt-4 flex items-end gap-2 rounded-xl border border-line bg-white p-2 focus-within:border-brand">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          rows={1}
          aria-label="Ask across all folders"
          placeholder="e.g. Which clients have a penicillin allergy?"
          className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none"
        />
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} disabled={busy} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-panel disabled:opacity-40" aria-label="Clear chat" title="Clear chat">
            <RotateCcw size={15} />
          </button>
        )}
        <button onClick={send} disabled={busy || !question.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-white disabled:opacity-40" aria-label="Send">
          <SendHorizontal size={16} />
        </button>
      </div>
    </section>
  )
}
