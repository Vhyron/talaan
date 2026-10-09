"""Per-folder grants, stored in app.db. Changed only by the user through the API."""

from app.audit import log_event
from app.db import connect
from app.schemas import Grant, Grants

FIELDS = ("read", "suggest_edits", "create_drafts", "delete")


def get_grants(folder_id: str) -> Grants:
    with connect() as db:
        row = db.execute("SELECT * FROM grants WHERE folder_id = ?", (folder_id,)).fetchone()
    if row is None:
        return Grants()  # defaults: read allow, suggest/create need approval, delete never
    g = Grants(**{k: row[k] for k in FIELDS}, home_chat=bool(row["home_chat"]))
    if g.read == Grant.NEEDS_APPROVAL:  # Read is Allow or Never; fail closed on an older stored value
        g.read = Grant.NEVER
    return g


def has_history(folder_id: str) -> bool:
    """Whether an id was ever used (a live or trashed folder), so a new folder never inherits its grants."""
    with connect() as db:
        return db.execute("SELECT 1 FROM grants WHERE folder_id = ? COLLATE NOCASE", (folder_id,)).fetchone() is not None


def set_grants(folder_id: str, new: Grants) -> Grants:
    if new.read == Grant.NEEDS_APPROVAL:
        raise ValueError("Read can only be Allow or Never")
    old = get_grants(folder_id)
    with connect() as db:
        db.execute(
            'INSERT INTO grants (folder_id, read, suggest_edits, create_drafts, "delete", home_chat)'
            ' VALUES (?, ?, ?, ?, ?, ?)'
            ' ON CONFLICT (folder_id) DO UPDATE SET read = excluded.read, suggest_edits = excluded.suggest_edits,'
            ' create_drafts = excluded.create_drafts, "delete" = excluded."delete", home_chat = excluded.home_chat',
            (folder_id, *(getattr(new, k).value for k in FIELDS), int(new.home_chat)),
        )
    for k in FIELDS:
        before, after = getattr(old, k), getattr(new, k)
        if before != after:
            log_event(folder_id, "user", "grant_change", action=k, decision=after.value, reason=f"{before.value} → {after.value}")
    if old.home_chat != new.home_chat:
        on = "on" if new.home_chat else "off"
        log_event(folder_id, "user", "grant_change", action="home_chat", decision=on,
                  reason=f"Include in home chat turned {on}")
    return new


def init_grants(folder_id: str) -> None:
    """Store the defaults explicitly when a folder is created."""
    with connect() as db:
        db.execute(
            'INSERT OR IGNORE INTO grants (folder_id, read, suggest_edits, create_drafts, "delete") VALUES (?, ?, ?, ?, ?)',
            (folder_id, *(getattr(Grants(), k).value for k in FIELDS)),
        )
