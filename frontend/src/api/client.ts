import type {
  AppSettings, AskResponse, AuditEvent, FileEntry, Folder, FolderCreate, Grants, Health, LlmCall, Outcome, Proposal, SystemTier, TimelineResponse, VoiceStatus,
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

  reindex: (id: string) => send<{ chunks: number; files: number }>('POST', `${f(id)}/index`),
  ask: (id: string, question: string) => send<AskResponse>('POST', `${f(id)}/ask`, { question }),
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
