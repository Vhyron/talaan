"""Proposals: actions waiting for the user's approval. Stored in app.db.

approve() and reject() are user-only. No model code path may call them.
"""

import difflib
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException

from app.db import connect
from app.schemas import Action, ActionAdapter, CreateDraftAction, Proposal, ProposeEditAction


def create(folder_id: str, action: Action, target: Path | None) -> str:
    """Store a pending proposal and return its id."""
    old_content = old_mtime = None
    if target is not None and target.is_file():
        old_content = target.read_text(encoding="utf-8", errors="replace")
        old_mtime = target.stat().st_mtime
    new_content = action.content if isinstance(action, (ProposeEditAction, CreateDraftAction)) else None

    pid = uuid.uuid4().hex[:12]
    with connect() as db:
        db.execute(
            "INSERT INTO proposals (id, folder_id, action, status, reason, old_content, new_content, old_mtime, created_at)"
            " VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)",
            (pid, folder_id, action.model_dump_json(), action.reason, old_content, new_content, old_mtime,
             datetime.now().isoformat()),
        )
    return pid


def _diff(path: str, old: str | None, new: str | None) -> str | None:
    if new is None:
        return None
    lines = difflib.unified_diff(
        (old or "").splitlines(keepends=True),
        new.splitlines(keepends=True),
        fromfile=f"a/{path}" if old is not None else "/dev/null",
        tofile=f"b/{path}",
    )
    return "".join(lines)


def _to_model(row) -> Proposal:
    action = ActionAdapter.validate_json(row["action"])
    return Proposal(
        id=row["id"],
        folder_id=row["folder_id"],
        action=action,
        status=row["status"],
        reason=row["reason"],
        old_content=row["old_content"],
        new_content=row["new_content"],
        diff=_diff(getattr(action, "path", ""), row["old_content"], row["new_content"]),
        created_at=datetime.fromisoformat(row["created_at"]),
    )


def list_pending(folder_id: str) -> list[Proposal]:
    with connect() as db:
        rows = db.execute(
            "SELECT * FROM proposals WHERE folder_id = ? AND status = 'pending' ORDER BY created_at", (folder_id,)
        ).fetchall()
    return [_to_model(r) for r in rows]


def get(pid: str) -> tuple[Proposal, float | None]:
    """The proposal and the file's mtime when it was proposed."""
    with connect() as db:
        row = db.execute("SELECT * FROM proposals WHERE id = ?", (pid,)).fetchone()
    if row is None:
        raise HTTPException(404, "Proposal not found")
    return _to_model(row), row["old_mtime"]


def set_status(pid: str, status: str) -> None:
    with connect() as db:
        db.execute(
            "UPDATE proposals SET status = ?, decided_at = ? WHERE id = ? AND status = 'pending'",
            (status, datetime.now().isoformat(), pid),
        )
