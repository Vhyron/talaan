"""Trash: deleting is the user's, from the UI, and can be undone.

A deleted file, subfolder or whole folder is moved to TALAAN_HOME/trash/<id>/, outside
every client folder, so no folder index, folder chat or the home chat can read it. It can
be restored to where it was, or deleted for good. The model has no action that reaches the
Trash; its own `delete` action stays a proposal governed by the Delete grant (Never by default).

Grants, the audit log and saved chats live in app.db and are never deleted with a folder:
restoring a folder brings it back as it was, and the audit log stays append-only.
"""

import shutil
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException

from app import audit, config, folders, index
from app.db import connect
from app.folders import clean_rel_path
from app.policy import PathOutsideFolder, proposals, rel, resolve_in_folder
from app.schemas import TrashItem


def _dir() -> Path:
    return config.TALAAN_HOME / "trash"


def _stale_proposals(folder_id: str, path: str = "") -> None:
    """Pending proposals for what was deleted can no longer be approved."""
    for p in proposals.list_pending(folder_id):
        target = getattr(p.action, "path", "") or ""
        if not path or target == path or target.startswith(path + "/"):
            proposals.set_status(p.id, "stale")


def _record(folder_id: str, folder_name: str, kind: str, path: str, name: str) -> str:
    tid = uuid.uuid4().hex[:12]
    with connect() as db:
        db.execute(
            "INSERT INTO trash (id, folder_id, folder_name, kind, path, name, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (tid, folder_id, folder_name, kind, path, name, datetime.now().isoformat()),
        )
    return tid


def trash_path(folder_id: str, path: str) -> TrashItem:
    """Move a file or subfolder of this folder to the Trash."""
    folder = folders.get_folder(folder_id)
    root = folders.folder_root(folder_id)
    clean = clean_rel_path(path)  # refuses "..", hidden names (.talaan) and illegal segments
    if not clean:
        raise HTTPException(400, "Choose a file or subfolder")
    try:
        source = resolve_in_folder(root, clean)
    except PathOutsideFolder:
        raise HTTPException(403, "That path is outside this folder")
    if not source.exists():
        raise HTTPException(404, "File not found")
    clean = rel(root, source)
    kind = "dir" if source.is_dir() else "file"
    tid = _record(folder_id, folder.name, kind, clean, source.name)
    dest = _dir() / tid
    dest.mkdir(parents=True)
    shutil.move(str(source), str(dest / source.name))
    _stale_proposals(folder_id, clean)
    audit.log_event(folder_id, "user", "deleted", action=f"trash_{kind}", path=clean,
                    reason=f"Moved {'subfolder' if kind == 'dir' else 'file'} {clean} to Trash")
    index.refresh(folder_id)  # its chunks leave the index
    return get(tid)


def trash_folder(folder_id: str) -> TrashItem:
    """Move a whole Case or Chart to the Trash. Its grants, audit log and chats stay in app.db."""
    folder = folders.get_folder(folder_id)
    root = folders.folder_root(folder_id)
    tid = _record(folder_id, folder.name, "folder", "", folder.name)
    dest = _dir() / tid
    dest.mkdir(parents=True)
    shutil.move(str(root), str(dest / root.name))  # its index (.talaan/) goes with it
    _stale_proposals(folder_id)
    audit.log_event(folder_id, "user", "deleted", action="trash_folder", reason=f'Moved folder "{folder.name}" to Trash')
    return get(tid)


def _row(tid: str):
    with connect() as db:
        row = db.execute("SELECT * FROM trash WHERE id = ?", (tid,)).fetchone()
    if row is None:
        raise HTTPException(404, "Not in the Trash")
    return row


def _item(row) -> TrashItem:
    return TrashItem(id=row["id"], folder_id=row["folder_id"], folder_name=row["folder_name"], kind=row["kind"],
                     path=row["path"], name=row["name"], deleted_at=datetime.fromisoformat(row["deleted_at"]))


def get(tid: str) -> TrashItem:
    return _item(_row(tid))


def list_items() -> list[TrashItem]:
    with connect() as db:
        rows = db.execute("SELECT * FROM trash ORDER BY deleted_at DESC").fetchall()
    return [_item(r) for r in rows]


def _forget(tid: str) -> None:
    shutil.rmtree(_dir() / tid, ignore_errors=True)
    with connect() as db:
        db.execute("DELETE FROM trash WHERE id = ?", (tid,))


def restore(tid: str) -> TrashItem:
    """Put it back where it was. Refuses rather than overwrite anything there now."""
    item = get(tid)
    stored = _dir() / tid / (item.folder_id if item.kind == "folder" else item.name)
    if not stored.exists():
        _forget(tid)
        raise HTTPException(410, "That item is no longer in the Trash")
    if item.kind == "folder":
        target = config.FOLDERS_DIR / item.folder_id
        if target.exists():
            raise HTTPException(409, "A folder with that name exists again. Rename or delete it first.")
        config.FOLDERS_DIR.mkdir(parents=True, exist_ok=True)
        shutil.move(str(stored), str(target))
        audit.log_event(item.folder_id, "user", "restored", action="restore_folder",
                        reason=f'Restored folder "{item.folder_name}" from Trash')
    else:
        try:
            root = folders.folder_root(item.folder_id)
        except HTTPException:
            raise HTTPException(409, f'Restore the folder "{item.folder_name}" first')
        target = resolve_in_folder(root, item.path)
        if target.exists():
            raise HTTPException(409, f"Something is already at {item.path}. Rename it first.")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(stored), str(target))
        audit.log_event(item.folder_id, "user", "restored", action=f"restore_{item.kind}", path=item.path,
                        reason=f"Restored {item.path} from Trash")
        index.refresh(item.folder_id)
    _forget(tid)
    return item


def purge(tid: str) -> None:
    """Delete for good. The audit log keeps the record that it existed and was deleted."""
    item = get(tid)
    _forget(tid)
    audit.log_event(item.folder_id, "user", "purged", action=f"purge_{item.kind}", path=item.path or None,
                    reason=f"Deleted {item.path or item.folder_name} permanently from Trash")
