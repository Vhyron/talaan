import { useEffect, useSyncExternalStore } from 'react'
import { api } from '../api/client'
import type { AskResponse, ChatMessage, Turn } from '../api/types'
import { usePersistentFlag } from './usePersistentFlag'

/**
 * Chat sessions that outlive the page. The server saves every exchange in app.db (one
 * session per folder, one for the home chat); this store caches them for the tab and
 * keeps track of a question still being answered, so leaving a chat mid-answer and
 * coming back shows the wait and then the answer.
 *
 * `scope` is a folder id, or null for the home chat.
 */
export type Msg = { role: 'user'; text: string } | { role: 'assistant'; res: AskResponse } | { role: 'error'; text: string }

type Session = { messages: Msg[]; busy: boolean; loaded: boolean; since: number }

const HISTORY_TURNS = 4
const HOME = '__all__'
const sessions = new Map<string, Session>()
const listeners = new Set<() => void>()
const EMPTY: Session = { messages: [], busy: false, loaded: false, since: 0 }

const key = (scope: string | null) => scope ?? HOME
const get = (scope: string | null) => sessions.get(key(scope)) ?? EMPTY

function set(scope: string | null, change: Partial<Session> | ((s: Session) => Partial<Session>)) {
  const s = get(scope)
  sessions.set(key(scope), { ...s, ...(typeof change === 'function' ? change(s) : change) })
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

const fromSaved = (saved: ChatMessage[]): Msg[] =>
  saved.map((m) => (m.role === 'assistant' && m.response ? { role: 'assistant', res: m.response } : { role: 'user', text: m.content }))

/** Earlier turns sent with the next question, so follow-ups make sense. */
export function historyOf(messages: Msg[]): Turn[] {
  const turns: Turn[] = []
  for (const m of messages) {
    if (m.role === 'user') turns.push({ role: 'user', content: m.text })
    else if (m.role === 'assistant' && !m.res.refused && !m.res.outcome) turns.push({ role: 'assistant', content: m.res.answer })
  }
  return turns.slice(-HISTORY_TURNS)
}

function load(scope: string | null) {
  if (get(scope).loaded || get(scope).busy) return
  set(scope, { loaded: true })
  api.chat(scope)
    .then((saved) => set(scope, (s) => (s.busy ? {} : { messages: fromSaved(saved) })))
    .catch(() => set(scope, { loaded: false }))
}

/** Ask in this session. Keeps running (and lands in the session) if the chat unmounts. */
export async function askIn(scope: string | null, question: string, ask: (history: Turn[]) => Promise<AskResponse>) {
  if (get(scope).busy) return undefined
  const history = historyOf(get(scope).messages)
  set(scope, (s) => ({ busy: true, since: Date.now(), messages: [...s.messages, { role: 'user', text: question }] }))
  try {
    const res = await ask(history)
    set(scope, (s) => ({ messages: [...s.messages, { role: 'assistant', res }] }))
    return res
  } catch (e) {
    set(scope, (s) => ({ messages: [...s.messages, { role: 'error', text: (e as Error).message }] }))
    return undefined
  } finally {
    set(scope, { busy: false })
  }
}

/** Start a new chat: clears the saved session (the audit log keeps its own record). */
export async function clearSession(scope: string | null) {
  if (get(scope).busy) return
  set(scope, { messages: [] })
  await api.clearChat(scope).catch(() => undefined)
}

export function useChatSession(scope: string | null) {
  const session = useSyncExternalStore(subscribe, () => get(scope))
  useEffect(() => load(scope), [scope])
  return session
}

/** Remembers whether the home page's floating chat card is open. */
export const HOME_CHAT_OPEN = 'talaan.homeChat.open'

/** Whether the home chat card is showing, so the page can make room for it on wide screens. */
export function useHomeChatShown(): boolean {
  const { messages, busy } = useChatSession(null)
  const [open] = usePersistentFlag(HOME_CHAT_OPEN, false)
  return open && (messages.length > 0 || busy)
}
