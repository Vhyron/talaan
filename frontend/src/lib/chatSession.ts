import { useEffect, useSyncExternalStore } from 'react'
import { api } from '../api/client'
import type { AskResponse, ChatSession, Turn } from '../api/types'
import { movedPath, onRenamed } from './renamed'

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

function load() {
  if (thread.loaded || thread.busy) return
  set({ loaded: true })
  api.homeChat()
    .then((s) => set((t) => (t.busy || !s ? {} : { sessionId: s.id, messages: fromSaved(s) })))
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

/** Remembers whether the home chat is expanded on the home page (vs. minimized to its question box). */
export const HOME_CHAT_OPEN = 'talaan.homeChat.open'
