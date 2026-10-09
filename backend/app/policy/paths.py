"""Path sealing. Every file access in the app goes through resolve_in_folder."""

from pathlib import Path, PurePosixPath, PureWindowsPath
from urllib.parse import unquote

# Never exposed, whatever the grants say.
HIDDEN_DIRS = {".talaan"}


class PathOutsideFolder(ValueError):
    pass


def resolve_in_folder(folder_root: Path, rel_path: str) -> Path:
    """Resolve rel_path inside folder_root, or raise PathOutsideFolder.

    Rejects absolute paths, drive letters, `..` escapes (also URL-encoded),
    symlinks that leave the root, the root itself, and anything under `.talaan/`.
    """
    decoded = unquote(rel_path)
    if not decoded or "\x00" in decoded:
        raise PathOutsideFolder(rel_path)
    if PurePosixPath(decoded).is_absolute() or PureWindowsPath(decoded).anchor:
        raise PathOutsideFolder(rel_path)

    root = folder_root.resolve()
    target = (root / decoded).resolve()  # follows symlinks
    if target == root or not target.is_relative_to(root):
        raise PathOutsideFolder(rel_path)
    # casefold: macOS and Windows filesystems are case-insensitive, so `.TALAAN` is `.talaan`
    if HIDDEN_DIRS & {p.casefold() for p in target.relative_to(root).parts}:
        raise PathOutsideFolder(rel_path)
    return target


def rel(folder_root: Path, target: Path) -> str:
    """Folder-relative path with forward slashes, as shown to users and the model."""
    return target.resolve().relative_to(folder_root.resolve()).as_posix()
