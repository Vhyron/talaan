// Mirrors backend/app/schemas.py. Keep in sync; announce changes to the team.

export type Mode = 'case' | 'chart'

/** A Space: one sealed top-level folder. `mode` is legacy labelling, hidden while SHOW_MODE is off. */
export type Folder = { id: string; name: string; mode: Mode | null; created_at: string }
export type FolderCreate = { name: string; mode?: Mode | null }
export type FileEntry = { path: string; size: number; mtime: string }

export type ActionName = 'search' | 'read' | 'propose_edit' | 'create_draft' | 'delete'

export type Action =
  | { action: 'search'; query: string; reason: string }
  | { action: 'read'; path: string; reason: string }
  | { action: 'propose_edit'; path: string; content: string; reason: string }
  | { action: 'create_draft'; path: string; content: string; reason: string }
  | { action: 'delete'; path: string; reason: string }

export type Grant = 'allow' | 'needs_approval' | 'never'
export type Grants = { read: Grant; suggest_edits: Grant; create_drafts: Grant; delete: Grant }

export type Outcome = {
  status: 'executed' | 'pending' | 'blocked'
  /** null when the model's output didn't parse */
  action: ActionName | null
  path: string | null
  reason: string | null
  proposal_id: string | null
  result: string | null
}

/** start/end are 1-based line numbers in the file. */
export type Source = { path: string; start: number; end: number; snippet: string; folder_id?: string | null }

/** An earlier chat turn, sent so follow-ups make sense. Context only, never a source. */
export type Turn = { role: 'user' | 'assistant'; content: string }
/**
 * `path` is the file open in the viewer (answers come from it only); the backend re-checks it.
 * `scope` is a subfolder of the Space (null/"" = the whole Space), ignored when `path` is set.
 */
export type AskRequest = { question: string; path?: string; scope?: string | null; history?: Turn[]; session_id?: string | null }
/** Lines from POST /ask/stream. `answer` is live text for display; `done` carries the final answer. */
export type AskEvent =
  | { type: 'status'; text: string }
  | { type: 'answer'; text: string }
  | { type: 'done'; response: AskResponse }
  | { type: 'error'; message: string }

/** Result of building or refreshing a folder's index. */
export type IndexStatus = {
  files: number
  chunks: number
  changed: number
  removed: number
  /** > 0: Ollama was unreachable, search is keyword-only until the next build */
  pending_embeddings: number
  version: number
  errors: string[]
}
/** `answer` references sources as [S1], [S2]… in `sources` order. */
export type AskResponse = {
  answer: string
  sources: Source[]
  refused: boolean
  outcome: Outcome | null
  proposal_id: string | null
  /** the saved chat this turn belongs to */
  session_id: string | null
}

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'stale'
export type Proposal = {
  id: string
  folder_id: string
  action: Action
  status: ProposalStatus
  reason: string
  old_content: string | null
  new_content: string | null
  diff: string | null
  created_at: string
}

export type AuditEventType =
  | 'question' | 'answer' | 'proposed_action' | 'decision' | 'executed' | 'grant_change'
  | 'session_renamed' | 'session_deleted' | 'file_deleted' | 'rename' | 'deleted' | 'restored' | 'purged'
export type AuditEvent = {
  id: number
  timestamp: string
  folder_id: string
  actor: 'user' | 'model'
  event: AuditEventType
  action: string | null
  path: string | null
  decision: string | null
  reason: string | null
  model_tag: string | null
  session_id: string | null
}

/** `scope`: the subfolder the chat was started in, null for the whole Space. */
export type ChatSessionSummary = { id: string; title: string; created_at: string; updated_at: string; message_count: number; scope: string | null }
/** A saved turn. `proposal_status` is the proposal's status now, not when it was proposed. */
export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  response: AskResponse | null
  proposal_status: ProposalStatus | null
  created_at: string
}
export type ChatSession = ChatSessionSummary & { messages: ChatMessage[] }

export type TimelineEvent = { date: string; time: string | null; description: string; sources: Source[] }
export type TimelineFlag = { description: string; sources: Source[] }
export type TimelineResponse = { events: TimelineEvent[]; flags: TimelineFlag[] }

export type TierId = 'light' | 'standard' | 'pro'
export type Tier = {
  id: TierId
  name: string
  min_ram_gb: number
  chat_model: string
  embed_model: string
  whisper_model: string
  fits: boolean
}
/** A pinned chat model the user can switch to. `fits`: this machine has the memory its tier calls for. */
export type ModelOption = { tag: string; tier: TierId; installed: boolean; fits: boolean; active: boolean }
export type SystemTier = {
  ram_gb: number
  gpu: string | null
  free_disk_gb: number
  recommended: TierId
  tiers: Tier[]
  ollama_running: boolean
  active_chat_model: string | null
  /** What "Automatic" runs here: the best installed pinned model that fits */
  auto_chat_model: string | null
  /** env var, Settings page choice, or hardware tier detection */
  active_source: 'env' | 'user' | 'auto'
  embed_installed: boolean
  models: ModelOption[]
}
/** `chat_model: null` returns to automatic selection by hardware tier. */
export type ModelChoice = { chat_model: string | null }

export type LlmCallKind = 'chat' | 'embed' | 'load' | 'unload'
/** One model call. prompt/response only when "Record prompts" is on (memory only). */
export type LlmCall = {
  id: number
  timestamp: string
  kind: LlmCallKind
  model: string
  ok: boolean
  error: string | null
  warning: string | null
  num_ctx: number | null
  think: boolean | null
  inputs: number | null
  prompt_tokens: number | null
  output_tokens: number | null
  tokens_per_s: number | null
  load_s: number | null
  total_s: number
  json_valid: boolean | null
  prompt: string | null
  response: string | null
}
export type AppSettings = { log_prompts: boolean }

export type Health = { status: string; chat_model: string; embed_model: string }

/** Can voice notes be transcribed on this laptop? (GET /system/voice) */
export type VoiceStatus = {
  ready: boolean
  model: string
  problem: 'library' | 'model' | null
  message: string | null
  fix: string | null
}

/** Something the user moved to the Trash. `path` is where it was ("" for a whole folder). */
export type TrashItem = {
  id: string
  folder_id: string
  folder_name: string
  kind: 'file' | 'dir' | 'folder'
  path: string
  name: string
  deleted_at: string
}
