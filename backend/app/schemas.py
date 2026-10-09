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
    action: ActionName
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


class AskRequest(BaseModel):
    question: str = Field(min_length=1)


class AskResponse(BaseModel):
    """`answer` may reference sources as [S1], [S2]… matching `sources` order."""

    answer: str
    sources: list[Source] = []
    refused: bool = False
    outcome: Outcome | None = None
    proposal_id: str | None = None


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

AuditEventType = Literal["question", "answer", "proposed_action", "decision", "executed", "grant_change"]


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


class SystemTier(BaseModel):
    ram_gb: int
    gpu: str | None
    free_disk_gb: int
    recommended: TierId
    tiers: list[Tier]
