import type {
  AppSettings, AskEvent, AskRequest, AskResponse, AuditEvent, FileEntry, Folder, FolderCreate, Grants, Health, IndexStatus, LlmCall, Outcome,
  Proposal, SystemTier, TimelineResponse, VoiceStatus,
} from './types'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function req(path: string, init?: RequestInit): Promise<Response> {
  const r = await fetch(`/api${path}`, init)
  if (!r.ok) {
    const detail = (await r.json().catch(() => null))?.detail
    throw new ApiError(r.status, typeof detail === 'string' ? detail : `HTTP ${r.status}`)
  }
  return r
}

const json = <T>(path: string, init?: RequestInit) => req(path, init).then((r) => r.json() as Promise<T>)
const send = <T>(method: string, path: string, body?: unknown) =>
  json<T>(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const f = (id: string) => `/folders/${encodeURIComponent(id)}`
const filePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

export const api = {
  health: () => json<Health>('/health'),

  folders: () => json<Folder[]>('/folders'),
  createFolder: (body: FolderCreate) => send<Folder>('POST', '/folders', body),
  folder: (id: string) => json<Folder>(f(id)),
  files: (id: string) => json<FileEntry[]>(`${f(id)}/files`),
  file: (id: string, path: string) => req(`${f(id)}/files/${filePath(path)}`).then((r) => r.text()),
  /** `path` is the file's name, or its relative path when `keepPaths` (e.g. "Interviews/a.md"). */
  importFiles: (id: string, uploads: { file: File; path: string }[], opts: { dest?: string; keepPaths?: boolean } = {}) => {
    const form = new FormData()
    uploads.forEach(({ file, path }) => form.append('files', file, path))
    form.append('dest', opts.dest ?? '')
    form.append('keep_paths', String(Boolean(opts.keepPaths)))
    return json<FileEntry[]>(`${f(id)}/import`, { method: 'POST', body: form })
  },
  dirs: (id: string) => json<string[]>(`${f(id)}/dirs`),
  createDir: (id: string, path: string) => send<{ path: string }>('POST', `${f(id)}/dirs`, { path }),

  reindex: (id: string) => send<IndexStatus>('POST', `${f(id)}/index`),
  ask: (id: string, question: string, opts: Omit<AskRequest, 'question'> = {}) =>
    send<AskResponse>('POST', `${f(id)}/ask`, { question, ...opts }),
  /** Like `ask`, but calls `onEvent` as the answer is written. Resolves with the final answer. */
  askStream: async (id: string, question: string, opts: Omit<AskRequest, 'question'>, onEvent: (e: AskEvent) => void) => {
    const r = await req(`${f(id)}/ask/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, ...opts }),
    })
    const reader = r.body!.pipeThrough(new TextDecoderStream()).getReader()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += value
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        const e = JSON.parse(line) as AskEvent
        if (e.type === 'done') return e.response
        if (e.type === 'error') throw new ApiError(503, e.message)
        onEvent(e)
      }
    }
    throw new ApiError(502, 'The answer stopped before it finished. Please ask again.')
  },
  timeline: (id: string) => send<TimelineResponse>('POST', `${f(id)}/timeline`),

  grants: (id: string) => json<Grants>(`${f(id)}/grants`),
  setGrants: (id: string, grants: Grants) => send<Grants>('PUT', `${f(id)}/grants`, grants),

  proposals: (id: string) => json<Proposal[]>(`${f(id)}/proposals`),
  approve: (pid: string) => send<Outcome>('POST', `/proposals/${encodeURIComponent(pid)}/approve`),
  reject: (pid: string) => send<unknown>('POST', `/proposals/${encodeURIComponent(pid)}/reject`),

  audit: (id: string) => json<AuditEvent[]>(`${f(id)}/audit`),
  auditExportUrl: (id: string, format: 'json' | 'csv') => `/api${f(id)}/audit/export?format=${format}`,

  transcribe: (id: string, audio: Blob, filename = 'recording.webm') => {
    const form = new FormData()
    form.append('audio', audio, filename)
    return json<Outcome>(`${f(id)}/transcribe`, { method: 'POST', body: form })
  },

  voiceStatus: () => json<VoiceStatus>('/system/voice'),
  systemTier: () => json<SystemTier>('/system/tier'),
  chooseModel: (chat_model: string | null) => send<SystemTier>('PUT', '/system/model', { chat_model }),
  llmLog: (after = 0) => json<LlmCall[]>(`/system/llm-log?after=${after}`),
  clearLlmLog: () => req('/system/llm-log', { method: 'DELETE' }),
  settings: () => json<AppSettings>('/system/settings'),
  setSettings: (body: AppSettings) => send<AppSettings>('PUT', '/system/settings', body),
}
