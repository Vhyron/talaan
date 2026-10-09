"""Shared contract between backend, frontend (src/api/types.ts) and the model.

Announce any change to the team before merging.
"""

from datetime import datetime
from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, Field, TypeAdapter

Mode = Literal["case", "chart"]


# --- Folders and files -----------------------------------------------------


class Folder(BaseModel):
    id: str
    name: str
    mode: Mode
    created_at: datetime


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    mode: Mode


class DirCreate(BaseModel):
    path: str = Field(min_length=1, max_length=255)  # folder-relative, e.g. "Interviews/2026-09"


class FileEntry(BaseModel):
    path: str
    size: int
    mtime: datetime


# --- Model actions ---------------------------------------------------------
# The model emits one of these as JSON. It is validated here before the
# policy engine ever sees it; anything that doesn't parse is rejected.


class SearchAction(BaseModel):
    action: Literal["search"]
    query: str
    reason: str = ""


class ReadAction(BaseModel):
    action: Literal["read"]
    path: str
    reason: str = ""


class ProposeEditAction(BaseModel):
    action: Literal["propose_edit"]
    path: str
    content: str
    reason: str = ""


class CreateDraftAction(BaseModel):
    action: Literal["create_draft"]
    path: str
    content: str
    reason: str = ""


class DeleteAction(BaseModel):
    action: Literal["delete"]
    path: str
    reason: str = ""


Action = Annotated[
    SearchAction | ReadAction | ProposeEditAction | CreateDraftAction | DeleteAction,
    Field(discriminator="action"),
]
ActionAdapter: TypeAdapter[Action] = TypeAdapter(Action)

ActionName = Literal["search", "read", "propose_edit", "create_draft", "delete"]


# --- Grants ----------------------------------------------------------------


class Grant(str, Enum):
    ALLOW = "allow"
    NEEDS_APPROVAL = "needs_approval"
    NEVER = "never"


class Grants(BaseModel):
    """Per-folder permissions. Defaults follow docs/03. There is no allow-all."""

    read: Grant = Grant.ALLOW
    suggest_edits: Grant = Grant.NEEDS_APPROVAL
    create_drafts: Grant = Grant.NEEDS_APPROVAL
    delete: Grant = Grant.NEVER


# --- Policy outcome --------------------------------------------------------


class Outcome(BaseModel):
    status: Literal["executed", "pending", "blocked"]
    action: ActionName | None = None  # None when the model's output didn't parse
    path: str | None = None
    reason: str | None = None
    proposal_id: str | None = None
    result: str | None = None


# --- Ask -------------------------------------------------------------------


class Source(BaseModel):
    """A cited passage. start/end are 1-based line numbers in the file."""

    path: str
    start: int
    end: int
    snippet: str
    folder_id: str | None = None  # set by the home-page chat (all folders); None inside a folder


class Turn(BaseModel):
    """An earlier chat turn, sent back by the UI so follow-ups make sense. Context only, never a source."""

    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class GlobalAskRequest(BaseModel):
    """Home-page chat across every folder."""

    question: str = Field(min_length=1)
    history: list[Turn] = Field(default=[], max_length=8)
    session_id: str | None = None  # continue the home chat thread; None starts a new one


class AskRequest(BaseModel):
    question: str = Field(min_length=1)
    path: str | None = None  # the file open in the viewer (folder-relative); re-checked against the folder
    history: list[Turn] = Field(default=[], max_length=8)
    session_id: str | None = None  # continue this saved chat; None starts a new one


class AskResponse(BaseModel):
    """`answer` may reference sources as [S1], [S2]… matching `sources` order."""

    answer: str
    sources: list[Source] = []
    refused: bool = False
    outcome: Outcome | None = None
    proposal_id: str | None = None
    session_id: str | None = None  # the saved chat this turn belongs to


class TrashItem(BaseModel):
    """Something the user moved to the Trash: a file, a subfolder or a whole folder."""

    id: str
    folder_id: str
    folder_name: str
    kind: Literal["file", "dir", "folder"]
    path: str  # where it was, folder-relative ("" for a whole folder)
    name: str
    deleted_at: datetime


class PathRef(BaseModel):
    path: str = Field(min_length=1)


class FolderRename(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class PathRename(BaseModel):
    """Rename a file or subfolder in place: `name` is the new last segment only."""

    path: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=80)


class IndexStatus(BaseModel):
    """Result of building or refreshing a folder's index."""

    files: int
    chunks: int
    changed: int
    removed: int
    pending_embeddings: int  # > 0: Ollama was unreachable, search is keyword-only until the next build
    version: int
    errors: list[str] = []


# --- Proposals -------------------------------------------------------------

ProposalStatus = Literal["pending", "approved", "rejected", "stale"]


class Proposal(BaseModel):
    id: str
    folder_id: str
    action: Action
    status: ProposalStatus
    reason: str = ""
    old_content: str | None = None
    new_content: str | None = None
    diff: str | None = None
    created_at: datetime


# --- Audit -----------------------------------------------------------------

AuditEventType = Literal[
    "question", "answer", "proposed_action", "decision", "executed", "grant_change", "session_renamed", "session_deleted",
    "file_deleted", "rename", "deleted", "restored", "purged",
]


class AuditEvent(BaseModel):
    id: int
    timestamp: datetime
    folder_id: str
    actor: Literal["user", "model"]
    event: AuditEventType
    action: str | None = None
    path: str | None = None
    decision: str | None = None
    reason: str | None = None
    model_tag: str | None = None
    session_id: str | None = None


# --- Chat sessions ---------------------------------------------------------


class ChatSessionSummary(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int


class ChatMessage(BaseModel):
    """A saved turn. Assistant turns keep the full response (sources, outcome); `proposal_status`
    is the proposal's status now, not when it was proposed."""

    role: Literal["user", "assistant"]
    content: str
    response: AskResponse | None = None
    proposal_status: ProposalStatus | None = None
    created_at: datetime


class ChatSession(ChatSessionSummary):
    messages: list[ChatMessage]


class ChatRename(BaseModel):
    title: str = Field(min_length=1, max_length=80)


# --- Timeline --------------------------------------------------------------


class TimelineEvent(BaseModel):
    date: str  # ISO date, YYYY-MM-DD
    time: str | None = None  # HH:MM, 24h
    description: str
    sources: list[Source]


class TimelineFlag(BaseModel):
    """A possible contradiction, surfaced for human review. Never a verdict."""

    description: str
    sources: list[Source]


class TimelineResponse(BaseModel):
    events: list[TimelineEvent]
    flags: list[TimelineFlag] = []


# --- System ----------------------------------------------------------------

TierId = Literal["light", "standard", "pro"]


class Tier(BaseModel):
    id: TierId
    name: str
    min_ram_gb: int
    chat_model: str
    embed_model: str
    whisper_model: str
    fits: bool


class ModelOption(BaseModel):
    """A pinned chat model the user can switch to."""

    tag: str
    tier: TierId
    installed: bool
    fits: bool  # this machine has the memory the tier calls for
    active: bool


class VoiceStatus(BaseModel):
    """Whether voice notes can be transcribed on this laptop right now."""

    ready: bool
    model: str  # faster-whisper size, e.g. "small"
    problem: Literal["library", "model"] | None = None
    message: str | None = None  # plain-language explanation for the user
    fix: str | None = None  # command that fixes it


class SystemTier(BaseModel):
    ram_gb: int
    gpu: str | None
    free_disk_gb: int
    recommended: TierId
    tiers: list[Tier]
    ollama_running: bool = False
    active_chat_model: str | None = None
    active_source: Literal["env", "user", "auto"] = "auto"  # env var, Setup page choice, or tier detection
    embed_installed: bool = False
    models: list[ModelOption] = []


LlmCallKind = Literal["chat", "embed", "load", "unload"]


class LlmCall(BaseModel):
    """One model call, for the LLM activity log. prompt/response only when "Record prompts" is on."""

    id: int
    timestamp: datetime
    kind: LlmCallKind
    model: str
    ok: bool
    error: str | None = None
    warning: str | None = None
    num_ctx: int | None = None
    think: bool | None = None
    inputs: int | None = None  # texts in an embed call
    prompt_tokens: int | None = None
    output_tokens: int | None = None
    tokens_per_s: float | None = None
    load_s: float | None = None
    total_s: float
    json_valid: bool | None = None  # set when a JSON schema was requested
    prompt: str | None = None
    response: str | None = None


class AppSettings(BaseModel):
    log_prompts: bool = False  # keep prompt/response text in the in-memory LLM log


class ModelChoice(BaseModel):
    """`chat_model: null` returns to automatic selection by hardware tier."""

    chat_model: str | None
