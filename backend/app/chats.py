"""Saved chat sessions in app.db: one per folder, plus one for the home-page chat.

A session lets a conversation survive navigation, reloads and restarts. It lives in
app.db with the grants and audit log, outside every folder, so the model never sees it
as a document. Each folder's session is only ever loaded by that folder's chat; the home
chat has its own (ALL). Clearing a session never touches the audit log.
"""

from datetime import datetime, timezone

from app.db import connect
from app.schemas import AskResponse, ChatMessage

ALL = "__all__"  # the home-page chat's session (not a valid folder id: folder ids are slugs)
MAX_MESSAGES = 200  # oldest messages beyond this are dropped


def load(scope: str) -> list[ChatMessage]:
    with connect() as db:
        rows = db.execute(
            "SELECT role, content, response FROM chat_messages WHERE scope = ? ORDER BY id", (scope,)
        ).fetchall()
    return [
        ChatMessage(role=r["role"], content=r["content"],
                    response=AskResponse.model_validate_json(r["response"]) if r["response"] else None)
        for r in rows
    ]


def append(scope: str, question: str, response: AskResponse) -> None:
    """Save one exchange: the question and the answer it got."""
    now = datetime.now(timezone.utc).isoformat()
    with connect() as db:
        db.executemany(
            "INSERT INTO chat_messages (scope, role, content, response, created_at) VALUES (?, ?, ?, ?, ?)",
            [(scope, "user", question, None, now),
             (scope, "assistant", response.answer, response.model_dump_json(), now)],
        )
        db.execute(
            "DELETE FROM chat_messages WHERE scope = ? AND id NOT IN "
            "(SELECT id FROM chat_messages WHERE scope = ? ORDER BY id DESC LIMIT ?)",
            (scope, scope, MAX_MESSAGES),
        )


def clear(scope: str) -> None:
    with connect() as db:
        db.execute("DELETE FROM chat_messages WHERE scope = ?", (scope,))
