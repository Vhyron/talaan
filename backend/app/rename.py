"""Renaming, by the user only (the model has no rename action).

- A folder rename changes only its display name (.talaan/folder.json). The folder id is the
  directory name and keys its grants, audit log, proposals and chat session, so it stays.
- A file or subfolder rename moves it to a new name in the same place, inside the sealed
  folder. Pending proposals and saved chat sources that point at the old path are updated,
  the folder is re-indexed, and the rename is audited. Old audit entries are never rewritten:
  the rename entry links the old and new paths.
"""

import json

from fastapi import HTTPException

from app import audit, folders, index
from app.db import connect
from app.folders import META, clean_rel_path
from app.policy import PathOutsideFolder, rel, resolve_in_folder
from app.schemas import Folder


def rename_folder(folder_id: str, name: str) -> Folder:
    name = " ".join(name.split())
    if not name or len(name) > 120:
        raise HTTPException(400, "Give the folder a name (up to 120 characters)")
    root = folders.folder_root(folder_id)
    old = folders.get_folder(folder_id)
    if name == old.name:
        return old
    if any(f.name.casefold() == name.casefold() for f in folders.list_folders() if f.id != folder_id):
        raise HTTPException(409, "Another folder already has that name")
    meta = {"name": name, "mode": old.mode, "created_at": old.created_at.isoformat()}
    (root / ".talaan").mkdir(exist_ok=True)
    (root / ".talaan" / META).write_text(json.dumps(meta), encoding="utf-8")
    audit.log_event(folder_id, "user", "rename", action="rename_folder",
                    reason=f'Folder renamed from "{old.name}" to "{name}"')
    return folders.get_folder(folder_id)


def _moved(path: str, old: str, new: str) -> str | None:
    """The new path for `path` if it is `old` or inside it, else None."""
    if path == old:
        return new
    if path.startswith(old + "/"):
        return new + path[len(old):]
    return None


def rename_path(folder_id: str, path: str, new_name: str) -> str:
    """Rename a file or subfolder in place. Returns its new folder-relative path."""
    root = folders.folder_root(folder_id)
    old_rel = clean_rel_path(path)
    name = clean_rel_path(new_name)
    if not old_rel:
        raise HTTPException(400, "Choose a file or subfolder to rename")
    if not name or "/" in name:
        raise HTTPException(400, "A new name can't contain / or \\")
    try:
        source = resolve_in_folder(root, old_rel)
        target = resolve_in_folder(root, "/".join([*old_rel.split("/")[:-1], name]))
    except PathOutsideFolder:
        raise HTTPException(403, "That path is outside this folder")
    if not source.exists():
        raise HTTPException(404, "File not found")
    if source.is_file() and source.suffix.lower() != target.suffix.lower():
        raise HTTPException(400, f"Keep the file type ({source.suffix or 'no extension'})")
    new_rel = rel(root, target)
    if new_rel == old_rel:
        return old_rel
    # A case-only rename on Windows finds the same file at the "new" name: that's fine.
    if target.exists() and not (source.exists() and target.samefile(source)):
        raise HTTPException(409, "A file or subfolder with that name already exists")
    source.rename(target)

    _update_proposals(folder_id, old_rel, new_rel)
    _update_chats(folder_id, old_rel, new_rel)
    kind = "subfolder" if target.is_dir() else "file"
    audit.log_event(folder_id, "user", "rename", action=f"rename_{'dir' if kind == 'subfolder' else 'file'}",
                    path=new_rel, reason=f"Renamed {kind} {old_rel} → {new_rel}")
    index.refresh(folder_id)  # drops the old path, indexes the new one
    return new_rel


def _update_proposals(folder_id: str, old: str, new: str) -> None:
    """Pending proposals follow the file (approving still re-checks path and grants)."""
    with connect() as db:
        rows = db.execute("SELECT id, action FROM proposals WHERE folder_id = ? AND status = 'pending'",
                          (folder_id,)).fetchall()
        for r in rows:
            action = json.loads(r["action"])
            moved = _moved(action.get("path") or "", old, new)
            if moved:
                action["path"] = moved
                db.execute("UPDATE proposals SET action = ? WHERE id = ?", (json.dumps(action), r["id"]))


def _update_chats(folder_id: str, old: str, new: str) -> None:
    """Saved chat sources (this folder's session, and home-chat sources from this folder)."""
    with connect() as db:
        rows = db.execute(
            "SELECT id, scope, response FROM chat_messages WHERE response IS NOT NULL AND scope IN (?, '__all__')",
            (folder_id,),
        ).fetchall()
        for r in rows:
            res = json.loads(r["response"])
            changed = False
            for s in res.get("sources", []):
                if r["scope"] == "__all__" and s.get("folder_id") != folder_id:
                    continue
                moved = _moved(s.get("path", ""), old, new)
                if moved:
                    s["path"], changed = moved, True
            if changed:
                db.execute("UPDATE chat_messages SET response = ? WHERE id = ?", (json.dumps(res), r["id"]))

