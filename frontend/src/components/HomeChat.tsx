import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Library, MessageSquare, RotateCcw, SendHorizontal, WifiOff, X } from 'lucide-react'
import type { Folder, Source } from '../api/types'
import { askHome, HOME_CHAT_OPEN, newHomeChat, useHomeChat } from '../lib/chatSession'
import { fileLabel } from '../lib/format'
import { useElapsed } from '../lib/useElapsed'
import Mascot from './Mascot'
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

function QuestionBox({ busy, rows, autoFocus, onAsk }: { busy: boolean; rows: number; autoFocus?: boolean; onAsk: (q: string) => void }) {
  const [question, setQuestion] = useState('')
  const send = () => {
    const q = question.trim()
    if (!q || busy) return
    setQuestion('')
    onAsk(q)
  }
  return (
    <div className="flex items-end gap-2 rounded-xl border border-line bg-white p-2 focus-within:border-brand">
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
        rows={rows}
        autoFocus={autoFocus}
        aria-label="Ask across all folders"
        placeholder="e.g. Which clients have a penicillin allergy?"
        className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none"
      />
      <button onClick={send} disabled={busy || !question.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-white disabled:opacity-40" aria-label="Send">
        <SendHorizontal size={16} />
      </button>
    </div>
  )
}

/**
 * Home-page chat: one question answered from every folder the AI may read, on this
 * laptop. The question box sits at the top of the page; the conversation opens in a
 * floating card (a bottom sheet on phones) so the folder cards stay in place. The
 * session is saved, so it is still there after opening a source and coming back.
 */
export default function HomeChat({ folders }: { folders: Folder[] }) {
  const { messages, busy, since } = useHomeChat()
  const [open, setOpen] = usePersistentFlag(HOME_CHAT_OPEN, false)
  const elapsed = useElapsed(busy, since)
  const end = useRef<HTMLDivElement>(null)
  const ask = (q: string) => {
    setOpen(true)
    askHome(q)
  }

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages, busy, open])

  // Esc closes the card, unless a modal dialog (import) is on top.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  const showCard = open && (messages.length > 0 || busy)

  return (
    <>
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
        <div className="mt-4">
          <QuestionBox busy={busy} rows={1} onAsk={ask} />
        </div>
      </section>

      {showCard && (
        <section
          role="dialog"
          aria-label="All-folders chat"
          className="fixed inset-x-0 bottom-0 z-30 flex h-[78dvh] flex-col overflow-hidden rounded-t-2xl border border-line bg-panel shadow-2xl md:inset-x-auto md:top-[8.5rem] md:right-3 md:bottom-3 md:h-auto md:w-96 md:rounded-2xl xl:w-[28rem]"
        >
          <header className="flex h-9 shrink-0 items-center gap-1.5 border-b border-line bg-white pr-1 pl-3">
            <Library size={13} className="text-brand-text" />
            <span className="mr-auto truncate text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">All folders</span>
            <button onClick={newHomeChat} disabled={busy} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted hover:bg-panel hover:text-ink disabled:opacity-40" title="Start a new chat (replaces this one; the audit log keeps its record)">
              <RotateCcw size={12} /> New chat
            </button>
            <button onClick={() => setOpen(false)} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-panel hover:text-ink" aria-label="Close all-folders chat">
              <X size={16} />
            </button>
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm" aria-live="polite">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="ml-8 rounded-xl rounded-tr-sm bg-brand-dark px-3 py-2 break-words text-white">{m.text}</div>
              ) : m.role === 'error' ? (
                <div key={i} className="rounded-xl border border-warn-text/30 bg-warn-soft px-3 py-2 text-warn-text">{m.text}</div>
              ) : (
                <div key={i} className={`rounded-xl bg-white px-3 py-2 leading-6 break-words ${m.res.refused ? 'text-muted' : ''}`}>
                  {withChips(m.res.answer, m.res.sources, folders)}
                </div>
              ),
            )}
            {busy && (
              <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-muted">
                <Mascot pose="search" className="h-12 w-8" /> Searching every folder on this laptop… {elapsed}s
              </div>
            )}
            <div ref={end} />
          </div>
          <div className="p-4 pt-0">
            <QuestionBox busy={busy} rows={2} onAsk={ask} />
          </div>
        </section>
      )}

      {!showCard && (messages.length > 0 || busy) && (
        <button
          onClick={() => setOpen(true)}
          className="fixed right-3 bottom-3 z-30 inline-flex items-center gap-2 rounded-full border border-line bg-white/95 py-2 pr-4 pl-3 text-sm font-semibold shadow-lg backdrop-blur hover:bg-panel"
          aria-label="Open all-folders chat"
        >
          <MessageSquare size={16} className="text-brand-text" />
          {busy ? `Answering… ${elapsed}s` : 'All-folders chat'}
        </button>
      )}
    </>
  )
}
