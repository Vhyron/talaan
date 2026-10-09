"""Per-folder audit log. Append-only: there is no update or delete."""

import csv
import io
import json
from datetime import datetime
from typing import Literal

from app.db import connect
from app.schemas import AuditEvent, AuditEventType


def log_event(
    folder_id: str,
    actor: Literal["user", "model"],
    event: AuditEventType,
    action: str | None = None,
    path: str | None = None,
    decision: str | None = None,
    reason: str | None = None,
    model_tag: str | None = None,
) -> AuditEvent:
    ts = datetime.now()
    with connect() as db:
        cur = db.execute(
            "INSERT INTO audit (timestamp, folder_id, actor, event, action, path, decision, reason, model_tag)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (ts.isoformat(), folder_id, actor, event, action, path, decision, reason, model_tag),
        )
        event_id = cur.lastrowid
    return AuditEvent(
        id=event_id, timestamp=ts, folder_id=folder_id, actor=actor, event=event,
        action=action, path=path, decision=decision, reason=reason, model_tag=model_tag,
    )


def list_events(folder_id: str) -> list[AuditEvent]:
    """Newest first."""
    with connect() as db:
        rows = db.execute("SELECT * FROM audit WHERE folder_id = ? ORDER BY id DESC", (folder_id,)).fetchall()
    return [AuditEvent(**dict(r)) for r in rows]


def export_json(folder_id: str) -> str:
    return json.dumps([e.model_dump(mode="json") for e in list_events(folder_id)], indent=2)


def export_csv(folder_id: str) -> str:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=list(AuditEvent.model_fields))
    writer.writeheader()
    writer.writerows(e.model_dump(mode="json") for e in list_events(folder_id))
    return buf.getvalue()
