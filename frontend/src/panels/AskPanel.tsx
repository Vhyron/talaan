import { useCallback, useEffect, useRef, useState } from 'react'
import { Ban, Check, ClipboardCheck, Clock, Eye, Loader2, Lock, MessageSquare, SendHorizontal, SquarePen } from 'lucide-react'
import { api } from '../api/client'
import type { AskResponse, ChatSession, ChatSessionSummary, ProposalStatus, Source, Turn } from '../api/types'
import SourceChip from '../components/SourceChip'
import ChatMarkdown from '../components/ChatMarkdown'
import Mascot from '../components/Mascot'
import HoldToTalk from '../components/HoldToTalk'
import { ago } from '../lib/format'
import { useElapsed } from '../lib/useElapsed'
import { chatScope, useFolder } from '../lib/folderContext'
import { useIndexStatus, type IndexState } from '../lib/useIndexStatus'
import { movedPath, onRenamed } from '../lib/renamed'
import ChatHistory from './ChatHistory'

type Msg =
  | { role: 'user'; text: string }
  | { role: 'assistant'; res: AskResponse; proposalStatus?: ProposalStatus | null }
  | { role: 'error'; text: string }

/** What the model is doing right now, shown while the answer streams in. */
type Live = { status: string; answer: string }

/** Live text is shown before citations are mapped, so hide the raw [S3] markers until the final answer. */
const withoutMarkers = (text: string) => text.replace(/\s*\[S[\d,;\sS]*\]?/g, '')

/** The chat on screen. Saved on the server turn by turn; `sessionId` is null until the first answer. */
type Chat = { sessionId: string | null; messages: Msg[]; busy: boolean; live?: Live }
const EMPTY: Chat = { sessionId: null, messages: [], busy: false }

// The open chat per Space and scope (whole Space, a subfolder, or one file) for this browser tab,
// so switching away and coming back shows it again (like tabsByFolder in FolderPage). An answer
// that arrives after you moved to another scope lands in the chat it was asked in.
const chatByFolder = new Map<string, Chat>()

function useFolderChat(key: string) {
  const [, rerender] = useState(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const put = useCallback((k: string, next: Chat) => {
    chatByFolder.set(k, next)
    if (mounted.current) rerender((n) => n + 1)
  }, [])
  const update = useCallback((fn: (c: Chat) => Chat) => put(key, fn(chatByFolder.get(key) ?? EMPTY)), [key, put])
  // Sources in every chat of this Space follow a file rename (the server already updated the saved chats).
  const folderId = key.split('::')[0]
  useEffect(() => onRenamed(({ folderId: fid, from, to }) => {
    if (fid !== folderId) return
    for (const [k, c] of chatByFolder) {
      if (!k.startsWith(`${fid}::`)) continue
      put(k, {
        ...c,
        messages: c.messages.map((m) => m.role !== 'assistant' ? m : {
          ...m, res: { ...m.res, sources: m.res.sources.map((src) => ({ ...src, path: movedPath(src.path, from, to) })) },
        }),
      })
    }
  }), [folderId, put])
  return [chatByFolder.get(key) ?? EMPTY, update, put] as const
}

function fromSession(s: ChatSession): Msg[] {
  return s.messages.map((m): Msg => m.role === 'user'
    ? { role: 'user', text: m.content }
    : {
        role: 'assistant',
        res: m.response ?? { answer: m.content, sources: [], refused: false, outcome: null, proposal_id: null, session_id: s.id },
        proposalStatus: m.proposal_status,
      })
}

/** Turns sent back with the next question, so follow-ups ("what about her meds?") make sense. */
const HISTORY_TURNS = 4

function historyOf(messages: Msg[]): Turn[] {
  const turns: Turn[] = []
  for (const m of messages) {
    if (m.role === 'user') turns.push({ role: 'user', content: m.text })
    else if (m.role === 'assistant' && !m.res.refused && !m.res.outcome) turns.push({ role: 'assistant', content: m.res.answer })
  }
  return turns.slice(-HISTORY_TURNS)
}

/** "[S1]" in an answer becomes a clickable source chip. */
function chipFor(sources: Source[]) {
  return (n: number) => {
    const src = sources[n - 1]
    return src && <SourceChip source={src} n={n} />
  }
}

export default function AskPanel({ onShowApprovals, onShow }: {
  onShowApprovals: () => void
  /** Open the Ask card: a voice question can arrive while it's closed. */
  onShow?: () => void
}) {
  const { folder, currentPath, dir, openDir, version, bump } = useFolder()
  const index = useIndexStatus()
  const scope = chatScope(currentPath, dir)
  const [chat, update, put] = useFolderChat(`${folder.id}::${scope.key}`)
  const { messages, busy, sessionId } = chat
  const [question, setQuestion] = useState('')
  const [view, setView] = useState<'chat' | 'history'>('chat')
  const [last, setLast] = useState<ChatSessionSummary | null>(null)
  const elapsed = useElapsed(busy)
  const end = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages, busy, view, chat.live?.answer])

  // A restored chat mounts while the tool card is hidden, where scrolling does nothing: scroll
  // to the latest message when the card is shown.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let hidden = el.clientHeight === 0
    const ro = new ResizeObserver(() => {
      if (hidden && el.clientHeight > 0) el.scrollTop = el.scrollHeight // only this list, not the card
      hidden = el.clientHeight === 0
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [view])

  // An empty chat offers to continue the most recent saved one started in this scope.
  const empty = messages.length === 0
  useEffect(() => {
    if (!empty) return
    let live = true
    api.chats(folder.id)
      .then((list) => live && setLast(list.find((s) => (s.scope ?? '') === dir) ?? null))
      .catch(() => live && setLast(null))
    return () => { live = false }
  }, [folder.id, empty, dir])

  // An action proposed in this chat may be approved or rejected in Approvals: show its status now.
  const waiting = messages.some((m) => m.role === 'assistant' && m.res.outcome?.status === 'pending')
  useEffect(() => {
    if (!sessionId || !waiting) return
    api.chat(folder.id, sessionId).then((s) => {
      const status = new Map(s.messages.flatMap((m) => m.response?.proposal_id ? [[m.response.proposal_id, m.proposal_status]] : []))
      update((c) => c.sessionId !== sessionId ? c : {
        ...c,
        messages: c.messages.map((m) => m.role === 'assistant' && m.res.proposal_id && status.has(m.res.proposal_id)
          ? { ...m, proposalStatus: status.get(m.res.proposal_id) } : m),
      })
    }).catch(() => {})
  }, [folder.id, sessionId, waiting, version, update])

  // `spoken`: a voice question, added to anything already typed.
  async function send(spoken?: string) {
    const q = (spoken ? `${question.trimEnd()} ${spoken}` : question).trim()
    if (!q || busy || index.state === 'indexing') return
    const history = historyOf(messages)
    setQuestion('')
    update((c) => ({ ...c, busy: true, live: { status: 'Starting', answer: '' }, messages: [...c.messages, { role: 'user', text: q }] }))
    try {
      const res = await api.askStream(folder.id, q, { path: currentPath, scope: dir || null, history, session_id: sessionId }, (e) => {
        update((c) => {
          if (!c.live) return c
          if (e.type === 'status') return { ...c, live: { ...c.live, status: e.text } }
          if (e.type === 'answer') return { ...c, live: { ...c.live, answer: c.live.answer + e.text } }
          return c
        })
      })
      update((c) => ({ sessionId: res.session_id ?? c.sessionId, busy: false, messages: [...c.messages, { role: 'assistant', res }] }))
      if (res.outcome) bump() // a proposal or blocked action changes Approvals/Audit
    } catch (e) {
      update((c) => ({ ...c, busy: false, live: undefined, messages: [...c.messages, { role: 'error', text: (e as Error).message }] }))
    }
  }

  function newChat() {
    update(() => EMPTY)
    setView('chat')
  }

  // A saved chat reopens in the scope it was started in: that subfolder's overview, or the Space's.
  async function resume(sid: string) {
    try {
      const s = await api.chat(folder.id, sid)
      const to = s.scope ?? ''
      put(`${folder.id}::${chatScope(undefined, to).key}`, { sessionId: s.id, messages: fromSession(s), busy: false })
      openDir(to)
      setView('chat')
    } catch (e) {
      update((c) => ({ ...c, messages: [...c.messages, { role: 'error', text: (e as Error).message }] }))
      setView('chat')
    }
  }

  const iconBtn = 'grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-white hover:text-ink disabled:opacity-40'

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-1 px-4 pt-4">
        <h2 className="font-bold">{view === 'history' ? 'Saved chats' : 'Ask this Space'}</h2>
        <div className="flex min-w-0 items-center gap-1">
          <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs">
            <Lock size={11} className="shrink-0" /> <span className="truncate">Only sees {folder.name}</span>
          </span>
          <button onClick={newChat} disabled={busy || (empty && view === 'chat')} className={iconBtn} title="New chat" aria-label="New chat">
            <SquarePen size={15} />
          </button>
          <button
            onClick={() => setView((v) => (v === 'history' ? 'chat' : 'history'))}
            disabled={busy}
            aria-pressed={view === 'history'}
            className={`${iconBtn} ${view === 'history' ? 'bg-white text-ink' : ''}`}
            title={view === 'history' ? 'Back to chat' : 'Saved chats'}
            aria-label="Saved chats"
          >
            {view === 'history' ? <MessageSquare size={15} /> : <Clock size={15} />}
          </button>
        </div>
      </div>

      {view === 'history' ? (
        <ChatHistory
          folderId={folder.id}
          emptyText={`No saved chats in this ${folder.mode} yet. Every question you ask is saved here.`}
          activeId={sessionId}
          activeCount={messages.filter((m) => m.role !== 'error').length}
          onOpen={resume}
          onDeleted={(sid) => {
            if (sid === sessionId) update(() => EMPTY)
            if (sid === last?.id) setLast(null)
            bump() // the audit log has a new entry
          }}
          onRenamed={bump}
        />
      ) : (
        <>
          <div className="px-4 pt-1">
            <IndexPill index={index} onRetry={index.retry} />
          </div>

          <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {empty && <Mascot pose="hug" className="mx-auto h-24 w-24" />}
            {empty && (
              <p className="text-muted">
                Answers come only from {currentPath ? 'the open file' : dir ? `files in ${dir}` : 'files in this Space'}, with
                sources you can click. Open a subfolder or a file to narrow what the chat looks at.
              </p>
            )}
            {empty && last && !currentPath && !question.trim() && (
              <button
                onClick={() => resume(last.id)}
                className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-left hover:border-brand"
              >
                <Clock size={15} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted">Continue last chat · {ago(last.updated_at)}</span>
                  <span className="block truncate font-medium">{last.title}</span>
                </span>
              </button>
            )}
            {messages.map((m, i) => {
              if (m.role === 'user') {
                return <div key={i} className="ml-8 rounded-xl rounded-tr-sm bg-brand-dark px-3 py-2 leading-6 break-words whitespace-pre-wrap text-white">{m.text}</div>
              }
              if (m.role === 'error') {
                return <div key={i} className="rounded-xl border border-warn-text/30 bg-warn-soft px-3 py-2 break-words whitespace-pre-wrap text-warn-text">{m.text}</div>
              }
              return <Answer key={i} res={m.res} proposalStatus={m.proposalStatus} onShowApprovals={onShowApprovals} />
            })}
            {busy && <LiveAnswer live={chat.live ?? { status: 'Reading', answer: '' }} elapsed={elapsed} />}
            <div ref={end} />
          </div>

          <div className="p-4 pt-0">
            <p className="mb-1 flex min-w-0 items-center gap-1 text-xs text-muted" title={currentPath || dir || folder.name}>
              <Eye size={12} className="shrink-0" /> <span className="truncate">Asking: {scope.label}</span>
            </p>
            <div className="flex items-end gap-2 rounded-xl border border-line bg-white p-2 focus-within:border-brand">
              <textarea
                ref={input}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                rows={2}
                aria-label={`Ask about ${scope.label}`}
                className="flex-1 resize-none bg-transparent outline-none"
                placeholder={currentPath ? 'e.g. Summarize this note' : 'e.g. Summarize this · What is still open?'}
              />
              <HoldToTalk
                folderId={folder.id}
                onSend={(t) => {
                  onShow?.() // "Hey Tala" may be heard while the Ask card is closed
                  if (busy || index.state === 'indexing') setQuestion((q) => `${q.trimEnd()} ${t}`.trim()) // ask when ready
                  else void send(t)
                }}
              />
              <button onClick={() => void send()} disabled={busy || !question.trim() || index.state === 'indexing'} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-white disabled:opacity-40" aria-label="Send">
                <SendHorizontal size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function LiveAnswer({ live, elapsed }: { live: Live; elapsed: number }) {
  const answer = withoutMarkers(live.answer)
  return (
    <div className="space-y-2 rounded-xl bg-white px-3 py-2" aria-live="polite">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Loader2 size={12} className="animate-spin" /> {answer ? 'Writing the answer' : live.status}… {elapsed}s
      </p>
      {answer && <ChatMarkdown text={answer} typing />}
    </div>
  )
}

function IndexPill({ index, onRetry }: { index: IndexState; onRetry: () => void }) {
  const base = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs'
  if (index.state === 'indexing') {
    return <span className={`${base} bg-white text-muted`}>Indexing this folder…</span>
  }
  if (index.state === 'error') {
    return (
      <button onClick={onRetry} className={`${base} bg-warn-soft text-warn-text`} title={index.message}>
        Index failed: retry
      </button>
    )
  }
  const { files, pending_embeddings } = index.status
  if (pending_embeddings > 0) {
    return (
      <button onClick={onRetry} className={`${base} bg-warn-soft text-warn-text`} title={index.status.errors.join('\n')}>
        Keyword search only (Ollama offline): retry
      </button>
    )
  }
  return (
    <span className={`${base} bg-brand-soft text-brand-text`}>
      Indexed · {files} {files === 1 ? 'file' : 'files'}
    </span>
  )
}

const DECIDED: Partial<Record<ProposalStatus, string>> = {
  approved: 'Approved',
  rejected: 'Rejected. Nothing was changed.',
  stale: 'No longer applies: the file changed. Nothing was changed.',
}

function Answer({ res, proposalStatus, onShowApprovals }: {
  res: AskResponse
  proposalStatus?: ProposalStatus | null
  onShowApprovals: () => void
}) {
  if (res.refused) {
    return (
      <div className="flex gap-2 rounded-xl border border-line bg-white px-3 py-2 text-muted">
        <Lock size={15} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-medium whitespace-pre-wrap">{res.answer}</p>
          {res.detail && <p className="mt-1 text-xs leading-5">{res.detail}</p>}
        </div>
      </div>
    )
  }
  const o = res.outcome
  const decided = o?.status === 'pending' && proposalStatus ? DECIDED[proposalStatus] : undefined
  return (
    <div className="space-y-2 rounded-xl bg-white px-3 py-2">
      <ChatMarkdown text={res.answer} cite={chipFor(res.sources)} />

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
      {o?.status === 'pending' && !decided && (
        <button onClick={onShowApprovals} className="flex w-full items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-left text-warn-text">
          <ClipboardCheck size={15} /> Waiting for your approval. Review it in Approvals →
        </button>
      )}
      {decided && (
        <p className="flex items-center gap-2 rounded-lg bg-panel px-3 py-2 text-xs text-muted">
          <Check size={14} className="shrink-0" /> {decided}
        </p>
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
