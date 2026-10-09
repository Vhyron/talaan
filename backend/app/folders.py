"""Client folders on disk: ~/Talaan/folders/<id>/ with a private .talaan/ inside."""

import json
import re
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app import config
from app.policy import PathOutsideFolder, rel, resolve_in_folder
from app.schemas import FileEntry, Folder, FolderCreate

IMPORT_TYPES = {".md", ".txt", ".pdf"}
META = "folder.json"


def _root() -> Path:
    config.FOLDERS_DIR.mkdir(parents=True, exist_ok=True)
    return config.FOLDERS_DIR


def _meta(path: Path) -> Folder:
    meta_file = path / ".talaan" / META
    if meta_file.is_file():
        return Folder(id=path.name, **json.loads(meta_file.read_text(encoding="utf-8")))
    # Folders copied in by hand (e.g. demo data) have no metadata yet.
    mode = "chart" if path.name.lower().startswith("chart") else "case"
    name = path.name.replace("_", " · ", 1).replace("-", " ") if mode == "chart" else _case_name(path.name)
    return Folder(id=path.name, name=name, mode=mode, created_at=datetime.fromtimestamp(path.stat().st_ctime))


def _case_name(folder_id: str) -> str:
    """Case-2026-014_Dela-Cruz -> Case 2026-014 · Dela Cruz"""
    head, _, who = folder_id.partition("_")
    head = head.replace("-", " ", 1)
    return f"{head} · {who.replace('-', ' ')}" if who else head


def folder_root(folder_id: str) -> Path:
    try:
        path = resolve_in_folder(_root(), folder_id)
    except PathOutsideFolder:
        raise HTTPException(404, "Folder not found")
    if path.parent != _root().resolve() or not path.is_dir():
        raise HTTPException(404, "Folder not found")
    return path


def list_folders() -> list[Folder]:
    return [_meta(p) for p in sorted(_root().iterdir()) if p.is_dir() and not p.name.startswith(".")]


def get_folder(folder_id: str) -> Folder:
    return _meta(folder_root(folder_id))


def _slug(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-.") or "folder"


def create_folder(body: FolderCreate) -> Folder:
    folder_id = _slug(body.name)
    path = _root() / folder_id
    if path.exists():
        raise HTTPException(409, "A folder with that name already exists")
    (path / ".talaan").mkdir(parents=True)
    meta = {"name": body.name, "mode": body.mode, "created_at": datetime.now().isoformat()}
    (path / ".talaan" / META).write_text(json.dumps(meta), encoding="utf-8")
    return _meta(path)


def list_files(folder_id: str) -> list[FileEntry]:
    root = folder_root(folder_id)
    out = []
    for p in sorted(root.rglob("*")):
        if not p.is_file() or ".talaan" in p.relative_to(root).parts:
            continue
        try:
            resolve_in_folder(root, rel(root, p))  # drops symlinks pointing outside
        except (PathOutsideFolder, ValueError):
            continue
        st = p.stat()
        out.append(FileEntry(path=rel(root, p), size=st.st_size, mtime=datetime.fromtimestamp(st.st_mtime)))
    return out


def file_path(folder_id: str, path: str) -> Path:
    root = folder_root(folder_id)
    try:
        target = resolve_in_folder(root, path)
    except PathOutsideFolder:
        raise HTTPException(403, "That path is outside this folder")
    if not target.is_file():
        raise HTTPException(404, "File not found")
    return target


def _free_name(root: Path, filename: str) -> Path:
    base = Path(filename).name  # strip any directory parts from the client
    stem, suffix = Path(base).stem, Path(base).suffix
    candidate, n = root / base, 1
    while candidate.exists():
        n += 1
        candidate = root / f"{stem} ({n}){suffix}"
    return candidate


async def import_files(folder_id: str, files: list[UploadFile]) -> list[FileEntry]:
    root = folder_root(folder_id)
    bad = [f.filename for f in files if Path(f.filename or "").suffix.lower() not in IMPORT_TYPES]
    if bad:
        raise HTTPException(415, f"Only .md, .txt and .pdf can be imported: {', '.join(map(str, bad))}")
    saved = []
    for f in files:
        target = _free_name(root, f.filename or "upload.txt")
        resolve_in_folder(root, target.name)
        target.write_bytes(await f.read())
        st = target.stat()
        saved.append(FileEntry(path=rel(root, target), size=st.st_size, mtime=datetime.fromtimestamp(st.st_mtime)))
    return saved
