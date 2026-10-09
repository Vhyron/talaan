import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, Library, MessageSquare, Minimize2, RotateCcw, SendHorizontal, WifiOff } from 'lucide-react'
import type { Folder, Source } from '../api/types'
import { askHome, HOME_CHAT_OPEN, newHomeChat, useHomeChat } from '../lib/chatSession'
import { fileLabel } from '../lib/format'
import { useElapsed } from '../lib/useElapsed'
import { usePersistentFlag } from '../lib/usePersistentFlag'

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

function QuestionBox({ busy, rows, placeholder, className = '', onAsk }: {
  busy: boolean
  rows: number
  placeholder: string
  className?: string
  onAsk: (q: string) => void
}) {
  const [question, setQuestion] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  const send = () => {
    const q = question.trim()
    if (!q || busy) return
    setQuestion('')
    onAsk(q)
    input.current?.focus() // ready for a follow-up, also after clicking Send
  }
  return (
    <div className={`flex items-end gap-2 rounded-xl border border-line bg-white p-2 focus-within:border-brand ${className}`}>
      <textarea
        ref={input}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
        rows={rows}
        aria-label="Ask across all folders"
        placeholder={placeholder}
        className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none"
      />
      <button onClick={send} disabled={busy || !question.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-white disabled:opacity-40" aria-label="Send">
        <SendHorizontal size={16} />
      </button>
    </div>
  )
}

const toolBtn = 'inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted hover:bg-white hover:text-ink disabled:opacity-40'

/**
 * Home-page chat: one question answered from every folder the AI may read, on this
 * laptop. It starts as a question box at the top of the page; asking grows that same
 * box into the conversation (filling the screen, input at the bottom), with the folder
 * list below it. Minimizing shrinks it back. The session is saved, so it is still there
 * after opening a source and coming back.
 */
export default function HomeChat({ folders }: { folders: Folder[] }) {
  const { messages, busy, since } = useHomeChat()
  const [open, setOpen] = usePersistentFlag(HOME_CHAT_OPEN, false)
  const elapsed = useElapsed(busy, since)
  const section = useRef<HTMLElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const hasThread = messages.length > 0 || busy
  const expanded = open && hasThread

  const bringIntoView = () => requestAnimationFrame(() => section.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  const ask = (q: string) => {
    setOpen(true)
    askHome(q)
    bringIntoView()
  }
  const resume = () => {
    setOpen(true)
    bringIntoView()
  }

  // Opening the conversation lands on the latest message; new messages then glide into view.
  useLayoutEffect(() => {
    if (expanded && list.current) list.current.scrollTop = list.current.scrollHeight
  }, [expanded])
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  // Esc minimizes the conversation, unless a modal dialog (import) is on top.
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded, setOpen])

  return (
    <section
      ref={section}
      aria-label="Ask across all folders"
      className={`flex scroll-mt-6 flex-col rounded-2xl border border-line bg-panel/60 p-4 sm:scroll-mt-8 sm:p-5 ${
        expanded ? 'h-[calc(100dvh-6.5rem)] min-h-[24rem] sm:h-[calc(100dvh-7.5rem)]' : ''
      }`}
    >
      <div className="flex shrink-0 flex-wrap items-start gap-x-3 gap-y-1">
        <div className="mr-auto min-w-0">
          <h2 className="flex items-center gap-2 font-bold"><Library size={17} className="text-brand-text" /> Ask across all folders</h2>
          <p className={`mt-0.5 text-xs text-muted ${expanded ? 'hidden sm:block' : ''}`}>
            Reads every folder you allow the AI to read. Each answer names the folder it came from; folders set to Read: Never are skipped.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-brand-text">
          <WifiOff size={11} /> On this laptop · read-only
        </span>
      </div>

      {expanded && (
        <>
          <div className="mt-2 flex shrink-0 flex-wrap items-center gap-1 border-b border-line pb-2">
            <button onClick={newHomeChat} disabled={busy} className={toolBtn} title="Start a new chat (replaces this one; the audit log keeps its record)">
              <RotateCcw size={12} /> New chat
            </button>
            <button onClick={() => setOpen(false)} className={toolBtn} title="Minimize (Esc)">
              <Minimize2 size={12} /> Minimize
            </button>
            <button
              onClick={() => document.getElementById('folders')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className={`${toolBtn} ml-auto`}
            >
              Your folders <ArrowDown size={12} />
            </button>
          </div>
          <div ref={list} className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-3 text-sm" aria-live="polite">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="chat-in ml-8 rounded-xl rounded-tr-sm bg-brand-dark px-3 py-2 break-words text-white">{m.text}</div>
              ) : m.role === 'error' ? (
                <div key={i} className="chat-in rounded-xl border border-warn-text/30 bg-warn-soft px-3 py-2 text-warn-text">{m.text}</div>
              ) : (
                <div key={i} className={`chat-in rounded-xl bg-white px-3 py-2 leading-6 break-words ${m.res.refused ? 'text-muted' : ''}`}>
                  {withChips(m.res.answer, m.res.sources, folders)}
                </div>
              ),
            )}
            {busy && <div className="chat-in rounded-xl bg-white px-3 py-2 text-muted">Searching every folder on this laptop… {elapsed}s</div>}
          </div>
        </>
      )}

      {/* One box for both states, so focus and a half-typed question survive the change. */}
      <QuestionBox
        busy={busy}
        rows={expanded ? 2 : 1}
        placeholder={expanded ? 'Ask a follow-up…' : 'e.g. Which clients have a penicillin allergy?'}
        className={expanded ? 'order-last shrink-0' : 'mt-4'}
        onAsk={ask}
      />

      {!expanded && hasThread && (
        <button onClick={resume} className="mt-2 inline-flex items-center gap-1.5 self-start rounded-md px-1 text-xs font-semibold text-brand-text hover:underline">
          <MessageSquare size={13} />
          {busy ? `Answering… ${elapsed}s` : `Continue chat · ${messages.length} messages`}
        </button>
      )}
    </section>
  )
}
