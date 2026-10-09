import { useEffect, useSyncExternalStore } from 'react'
import { api } from '../api/client'
import type { AskResponse, ChatSession, Turn } from '../api/types'
import { movedPath, onRenamed } from './renamed'
import { usePersistentFlag } from './usePersistentFlag'

/**
 * The home-page chat (all folders), kept outside the page. The server saves the thread in
 * app.db; this store caches it for the tab and tracks a question still being answered, so
 * opening a source and coming back mid-answer shows the wait and then the answer.
 * (Folder chats keep their own saved sessions: see panels/AskPanel.)
 */
export type Msg = { role: 'user'; text: string } | { role: 'assistant'; res: AskResponse } | { role: 'error'; text: string }

type Thread = { sessionId: string | null; messages: Msg[]; busy: boolean; loaded: boolean; since: number }

const HISTORY_TURNS = 4
let thread: Thread = { sessionId: null, messages: [], busy: false, loaded: false, since: 0 }
const listeners = new Set<() => void>()

function set(change: Partial<Thread> | ((t: Thread) => Partial<Thread>)) {
  thread = { ...thread, ...(typeof change === 'function' ? change(thread) : change) }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

const fromSaved = (s: ChatSession): Msg[] =>
  s.messages.map((m) => (m.role === 'assistant' && m.response ? { role: 'assistant', res: m.response } : { role: 'user', text: m.content }))

// Cached sources follow a file rename (the server already updated the saved thread).
onRenamed(({ folderId, from, to }) => set((t) => ({
  messages: t.messages.map((m) => m.role !== 'assistant' ? m : {
    ...m,
    res: { ...m.res, sources: m.res.sources.map((s) => s.folder_id === folderId ? { ...s, path: movedPath(s.path, from, to) } : s) },
  }),
})))

/** Earlier turns sent with the next question, so follow-ups make sense. */
function historyOf(messages: Msg[]): Turn[] {
  const turns: Turn[] = []
  for (const m of messages) {
    if (m.role === 'user') turns.push({ role: 'user', content: m.text })
    else if (m.role === 'assistant' && !m.res.refused) turns.push({ role: 'assistant', content: m.res.answer })
  }
  return turns.slice(-HISTORY_TURNS)
}

const POLL_MS = 3000
const GIVE_UP_MS = 10 * 60_000 // an answer this late means the server stopped (e.g. restarted)

/** The saved thread ends with a question and no answer: it's still being answered (the page
 * was reloaded mid-answer). Show the wait, and poll until the answer is saved. */
function awaitAnswer(s: ChatSession) {
  const last = s.messages[s.messages.length - 1]
  const askedAt = new Date(last.created_at).getTime()
  if (Date.now() - askedAt > GIVE_UP_MS) {
    set((t) => ({ messages: [...t.messages, { role: 'error', text: 'This question was never answered. Please ask again.' }] }))
    return
  }
  set({ busy: true, since: askedAt })
  const poll = () => api.homeChat()
    .then((now) => {
      const done = now && now.id === s.id && now.messages[now.messages.length - 1]?.role === 'assistant'
      if (done) set({ busy: false, messages: fromSaved(now) })
      else if (now?.id !== s.id) set({ busy: false }) // replaced meanwhile (a new chat elsewhere)
      else if (Date.now() - askedAt > GIVE_UP_MS) set((t) => ({ busy: false, messages: [...t.messages, { role: 'error', text: 'No answer arrived. Please ask again.' }] }))
      else setTimeout(poll, POLL_MS)
    })
    .catch(() => setTimeout(poll, POLL_MS))
  setTimeout(poll, POLL_MS)
}

function load() {
  if (thread.loaded || thread.busy) return
  set({ loaded: true })
  api.homeChat()
    .then((s) => {
      if (thread.busy || !s || !s.messages.length) return
      set({ sessionId: s.id, messages: fromSaved(s) })
      if (s.messages[s.messages.length - 1].role === 'user') awaitAnswer(s)
    })
    .catch(() => set({ loaded: false }))
}

/** Ask across all folders. Keeps running (and lands in the thread) if the chat unmounts. */
export async function askHome(question: string) {
  if (thread.busy) return
  const history = historyOf(thread.messages)
  set((t) => ({ busy: true, since: Date.now(), messages: [...t.messages, { role: 'user', text: question }] }))
  try {
    const res = await api.askAll(question, history, thread.sessionId)
    set((t) => ({ sessionId: res.session_id ?? t.sessionId, messages: [...t.messages, { role: 'assistant', res }] }))
  } catch (e) {
    set((t) => ({ messages: [...t.messages, { role: 'error', text: (e as Error).message }] }))
  } finally {
    set({ busy: false })
  }
}

/** Start a new home chat; the next question replaces the saved thread (audit logs keep it all). */
export function newHomeChat() {
  if (!thread.busy) set({ sessionId: null, messages: [] })
}

export function useHomeChat() {
  const t = useSyncExternalStore(subscribe, () => thread)
  useEffect(load, [])
  return t
}

/** Remembers whether the home page's floating chat card is open. */
export const HOME_CHAT_OPEN = 'talaan.homeChat.open'

/** Whether the home chat card is showing, so the page can make room for it on wide screens. */
export function useHomeChatShown(): boolean {
  const { messages, busy } = useHomeChat()
  const [open] = usePersistentFlag(HOME_CHAT_OPEN, false)
  return open && (messages.length > 0 || busy)
}
