"""Saved Ask chats, one or more per folder, stored in app.db.

ask() saves every question and answer as it happens; the user lists, resumes, renames and deletes
sessions from the UI. The model has no action that reaches these tables. Deleting a session never
touches the audit log, which keeps its own copy of every question and answer.
"""

import re
import uuid
from datetime import datetime

from fastapi import HTTPException
from pydantic import BaseModel

from app import audit
from app.db import connect
from app.llm import client
from app.llm.client import OllamaError
from app.policy.grants import get_grants
from app.schemas import AskResponse, ChatMessage, ChatSession, ChatSessionSummary, Grant

TITLE_CHARS = 60

TITLE_SYSTEM = """Write a short title (3 to 6 words) for a chat that starts with the user's question below.
Plain words only: no quotes, no punctuation at the end, no names that are not in the question."""


class Title(BaseModel):
    title: str


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def clip(text: str, limit: int = TITLE_CHARS) -> str:
    flat = " ".join(text.split())
    return flat if len(flat) <= limit else flat[:limit].rstrip() + "…"


def fallback_title(question: str) -> str:
    return clip(question) or "New chat"


def _row(db, folder_id: str, sid: str):
    row = db.execute("SELECT * FROM chat_sessions WHERE id = ? AND folder_id = ?", (sid, folder_id)).fetchone()
    if row is None:  # unknown, or another folder's session: both look the same from here
        raise HTTPException(404, "Chat not found")
    return row


def check(folder_id: str, sid: str) -> None:
    with connect() as db:
        _row(db, folder_id, sid)


def save_turn(folder_id: str, sid: str, question: str, resp: AskResponse, scope: str | None = None) -> None:
    """`scope` is kept from the chat's first turn: where it was started."""
    now = datetime.now().isoformat()
    with connect() as db:
        db.execute(
            "INSERT INTO chat_sessions (id, folder_id, title, created_at, updated_at, scope) VALUES (?, ?, ?, ?, ?, ?)"
            " ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at",
            (sid, folder_id, fallback_title(question), now, now, scope),
        )
        db.executemany(
            "INSERT INTO chat_messages (session_id, folder_id, role, content, response, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [(sid, folder_id, "user", question, None, now),
             (sid, folder_id, "assistant", resp.answer, resp.model_dump_json(), now)],
        )


def _summary(row) -> ChatSessionSummary:
    return ChatSessionSummary(
        id=row["id"], title=row["title"], message_count=row["message_count"], scope=row["scope"],
        created_at=datetime.fromisoformat(row["created_at"]), updated_at=datetime.fromisoformat(row["updated_at"]),
    )


SUMMARY_SQL = """SELECT s.*, (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) AS message_count
FROM chat_sessions s WHERE s.folder_id = ?"""


def list_sessions(folder_id: str, q: str | None = None) -> list[ChatSessionSummary]:
    """Newest first. `q` matches the title or any message, within this folder only."""
    sql, args = SUMMARY_SQL, [folder_id]
    if q and q.strip():
        like = "%" + q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        sql += (" AND (s.title LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM chat_messages m"
                " WHERE m.session_id = s.id AND m.content LIKE ? ESCAPE '\\'))")
        args += [like, like]
    with connect() as db:
        rows = db.execute(sql + " ORDER BY s.updated_at DESC, s.rowid DESC", args).fetchall()
    return [_summary(r) for r in rows]


def get_session(folder_id: str, sid: str) -> ChatSession:
    with connect() as db:
        _row(db, folder_id, sid)
        summary = db.execute(SUMMARY_SQL + " AND s.id = ?", (folder_id, sid)).fetchone()
        rows = db.execute("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id", (sid,)).fetchall()
        messages = []
        for r in rows:
            resp = AskResponse.model_validate_json(r["response"]) if r["response"] else None
            status = None
            if resp and resp.proposal_id:  # the proposal's status now: it may have been decided since
                p = db.execute("SELECT status FROM proposals WHERE id = ? AND folder_id = ?",
                               (resp.proposal_id, folder_id)).fetchone()
                status = p["status"] if p else None
            messages.append(ChatMessage(role=r["role"], content=r["content"], response=resp, proposal_status=status,
                                        created_at=datetime.fromisoformat(r["created_at"])))
    return ChatSession(**_summary(summary).model_dump(), messages=messages)


def rename(folder_id: str, sid: str, title: str) -> ChatSessionSummary:
    title = clip(title, 80)
    with connect() as db:
        _row(db, folder_id, sid)
        db.execute("UPDATE chat_sessions SET title = ?, title_source = 'user' WHERE id = ?", (title, sid))
    audit.log_event(folder_id, "user", "session_renamed", reason=title, session_id=sid)
    return next(s for s in list_sessions(folder_id) if s.id == sid)


def delete(folder_id: str, sid: str) -> None:
    with connect() as db:
        title = _row(db, folder_id, sid)["title"]
        db.execute("DELETE FROM chat_messages WHERE session_id = ?", (sid,))
        db.execute("DELETE FROM chat_sessions WHERE id = ?", (sid,))
    audit.log_event(folder_id, "user", "session_deleted", reason=title, session_id=sid)


def auto_title(folder_id: str, sid: str, question: str) -> None:
    """Background task after a chat's first answer: a short title from the first question only.
    Keeps the fallback title if the model is unavailable, and never overwrites a user's rename."""
    if get_grants(folder_id).read == Grant.NEVER:
        return
    try:
        r = client.chat([{"role": "system", "content": TITLE_SYSTEM},
                         {"role": "user", "content": f"Question: {clip(question, 500)}"}], schema=Title)
        title = Title.model_validate(r.data).title if r.data is not None else ""
    except (OllamaError, ValueError):
        return
    title = clip(re.sub(r"[\"'`*#\[\]<>]", "", title).strip(" .:;-"))
    if not title:
        return
    with connect() as db:
        db.execute("UPDATE chat_sessions SET title = ?, title_source = 'model'"
                   " WHERE id = ? AND folder_id = ? AND title_source = 'question'", (title, sid, folder_id))
