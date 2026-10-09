"""Spaces on disk: ~/Talaan/folders/<id>/ with a private .talaan/ inside.

A Space is the sealed unit. Its subfolders (cases, charts, policies) are chat scopes inside it.
"""

import json
import re
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app import config
from app.policy import PathOutsideFolder, rel, resolve_in_folder
from app.policy.grants import has_history, init_grants
from app.schemas import FileEntry, Folder, FolderCreate

IMPORT_TYPES = {".md", ".txt", ".pdf"}
META = "folder.json"
# Every Space starts with a README saying what it is; the UI shows it on the Space's page and a
# subfolder chat reads it alongside the subfolder (ask.scope_of).
README = "README.md"
README_TEMPLATE = """# {name}

What this Space holds and how it is organised. The AI reads this file in every chat in this Space.

- **Type:** (e.g. HR investigations, patient charts, client contracts)
- **Subfolders:** (e.g. one per case, named "Case <year>-<number> <surname>")
- **Handling:** (who may see these files)
"""


def _root() -> Path:
    config.FOLDERS_DIR.mkdir(parents=True, exist_ok=True)
    return config.FOLDERS_DIR


def _meta(path: Path) -> Folder:
    meta_file = path / ".talaan" / META
    if meta_file.is_file():
        return Folder(id=path.name, **json.loads(meta_file.read_text(encoding="utf-8")))
    # Spaces copied in by hand (e.g. demo data) have no metadata yet: Lakbay-Logistics-Inc -> Lakbay Logistics Inc
    return Folder(id=path.name, name=path.name.replace("-", " "), created_at=datetime.fromtimestamp(path.stat().st_ctime))


def _write_meta(path: Path, folder: Folder) -> None:
    (path / ".talaan").mkdir(exist_ok=True)
    (path / ".talaan" / META).write_text(folder.model_dump_json(exclude={"id"}), encoding="utf-8")


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
    base = _slug(body.name)
    path = _root() / base
    if path.exists():
        raise HTTPException(409, "A folder with that name already exists")
    # A trashed folder keeps its id, grants, audit and chats: give the new one a fresh id.
    folder_id, n = base, 2
    while has_history(folder_id) or (_root() / folder_id).exists():
        folder_id, n = f"{base}-{n}", n + 1
    path = _root() / folder_id
    path.mkdir(parents=True)
    _write_meta(path, Folder(id=folder_id, name=body.name, mode=body.mode, created_at=datetime.now()))
    (path / README).write_text(README_TEMPLATE.format(name=body.name), encoding="utf-8")
    init_grants(folder_id)
    return _meta(path)


def scope_dir(folder_id: str, scope: str | None) -> str | None:
    """A chat scope: an existing subfolder of this Space, Space-relative. None for the whole Space.
    Same checks as every other path (no ../, symlinks out or .talaan/); a bad scope is refused."""
    clean = clean_rel_path(scope or "")
    if not clean:
        return None
    root = folder_root(folder_id)
    try:
        target = resolve_in_folder(root, clean)
    except PathOutsideFolder:
        raise HTTPException(403, "That path is outside this Space")
    if not target.is_dir():
        raise HTTPException(404, f"No subfolder {clean!r} in this Space")
    return rel(root, target)


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


def list_dirs(folder_id: str) -> list[str]:
    """Subfolders inside a client folder (`.talaan/` hidden), folder-relative."""
    root = folder_root(folder_id)
    out = []
    for p in sorted(root.rglob("*")):
        if not p.is_dir() or ".talaan" in p.relative_to(root).parts:
            continue
        try:
            out.append(rel(root, resolve_in_folder(root, rel(root, p))))
        except (PathOutsideFolder, ValueError):
            continue  # symlinked directory leaving the folder
    return out


# One path segment of a user-made subfolder or imported file: no separators,
# no characters Windows forbids, not hidden ("." prefix), not "." or "..".
_SEGMENT = re.compile(r'^(?!\.)[^\\/:*?"<>|\x00-\x1f]{1,80}$')


def clean_rel_path(path: str) -> str:
    """Normalise a client-supplied relative path, or raise 400.

    Empty segments and "." are dropped; "..", hidden segments and illegal names are refused.
    """
    parts = [p.strip() for p in path.replace("\\", "/").split("/") if p.strip() not in ("", ".")]
    for p in parts:
        if p == ".." or not _SEGMENT.match(p):
            raise HTTPException(400, f"Not an allowed name: {p!r}")
    return "/".join(parts)


def create_dir(folder_id: str, path: str) -> str:
    root = folder_root(folder_id)
    clean = clean_rel_path(path)
    if not clean:
        raise HTTPException(400, "Give the subfolder a name")
    try:
        target = resolve_in_folder(root, clean)
    except PathOutsideFolder:
        raise HTTPException(403, "That path is outside this folder")
    if target.exists():
        raise HTTPException(409, "A file or subfolder with that name already exists")
    target.mkdir(parents=True)
    return rel(root, target)


def _dest_dir(root: Path, dest: str) -> Path:
    clean = clean_rel_path(dest)
    if not clean:
        return root
    try:
        d = resolve_in_folder(root, clean)
    except PathOutsideFolder:
        raise HTTPException(403, "That path is outside this folder")
    if not d.is_dir():
        raise HTTPException(404, f"No subfolder {clean!r} in this folder")
    return d


def file_path(folder_id: str, path: str) -> Path:
    root = folder_root(folder_id)
    try:
        target = resolve_in_folder(root, path)
    except PathOutsideFolder:
        raise HTTPException(403, "That path is outside this folder")
    if not target.is_file():
        raise HTTPException(404, "File not found")
    return target


def delete_file(folder_id: str, path: str) -> str:
    """User-only delete from the file tree. Files only; sealed like every other access."""
    target = file_path(folder_id, path)
    rel_path = rel(folder_root(folder_id), target)
    target.unlink()
    return rel_path


def _free_name(directory: Path, base: str) -> Path:
    stem, suffix = Path(base).stem, Path(base).suffix
    candidate, n = directory / base, 1
    while candidate.exists():
        n += 1
        candidate = directory / f"{stem} ({n}){suffix}"
    return candidate


async def import_files(folder_id: str, files: list[UploadFile], dest: str = "", keep_paths: bool = False) -> list[FileEntry]:
    """Save uploads into `dest` (a subfolder, "" for the top level). Never overwrites.

    With `keep_paths`, each upload's own relative path (e.g. "Interviews/r-santos.md",
    from a dropped folder) is recreated under `dest`; otherwise directories are stripped.
    """
    root = folder_root(folder_id)
    bad = [f.filename for f in files if Path(f.filename or "").suffix.lower() not in IMPORT_TYPES]
    if bad:
        raise HTTPException(415, f"Only .md, .txt and .pdf can be imported: {', '.join(map(str, bad))}")
    base_dir = _dest_dir(root, dest)
    base_rel = "" if base_dir == root else rel(root, base_dir)
    saved = []
    for f in files:
        name = (f.filename or "upload.txt").replace("\\", "/")
        sub = clean_rel_path(name) if keep_paths else clean_rel_path(name.rsplit("/", 1)[-1])
        if not sub:
            raise HTTPException(400, f"Not an allowed file name: {f.filename!r}")
        try:
            # Seals the whole destination, including symlinked subfolders and .talaan/.
            wanted = resolve_in_folder(root, f"{base_rel}/{sub}" if base_rel else sub)
        except PathOutsideFolder:
            raise HTTPException(403, "That path is outside this folder")
        wanted.parent.mkdir(parents=True, exist_ok=True)
        target = _free_name(wanted.parent, wanted.name)
        target.write_bytes(await f.read())
        st = target.stat()
        saved.append(FileEntry(path=rel(root, target), size=st.st_size, mtime=datetime.fromtimestamp(st.st_mtime)))
    return saved
