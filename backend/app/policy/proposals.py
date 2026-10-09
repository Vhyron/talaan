"""Proposals: actions waiting for the user's approval. Stored in app.db."""

import uuid
from datetime import datetime
from pathlib import Path

from app.db import connect
from app.schemas import Action, CreateDraftAction, ProposeEditAction


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
