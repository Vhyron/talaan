// Mirrors backend/app/schemas.py. Keep in sync; announce changes to the team.

export type Mode = 'case' | 'chart'

export type Folder = { id: string; name: string; mode: Mode; created_at: string }
export type FolderCreate = { name: string; mode: Mode }
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
  action: ActionName
  path: string | null
  reason: string | null
  proposal_id: string | null
  result: string | null
}

/** start/end are 1-based line numbers in the file. */
export type Source = { path: string; start: number; end: number; snippet: string }

export type AskRequest = { question: string }
/** `answer` references sources as [S1], [S2]… in `sources` order. */
export type AskResponse = {
  answer: string
  sources: Source[]
  refused: boolean
  outcome: Outcome | null
  proposal_id: string | null
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

export type AuditEventType = 'question' | 'answer' | 'proposed_action' | 'decision' | 'executed' | 'grant_change'
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
}

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
export type SystemTier = { ram_gb: number; gpu: string | null; free_disk_gb: number; recommended: TierId; tiers: Tier[] }

export type Health = { status: string; chat_model: string; embed_model: string }
