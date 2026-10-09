"""A2: path sealing. Every escape must be rejected."""

import os

import pytest

from app.policy import PathOutsideFolder, resolve_in_folder


@pytest.fixture
def folder(tmp_path):
    root = tmp_path / "Case-A"
    (root / ".talaan").mkdir(parents=True)
    (root / ".talaan" / "index.db").write_text("")
    (root / "note.md").write_text("hi")
    (root / "sub").mkdir()
    (tmp_path / "Case-B").mkdir()
    (tmp_path / "Case-B" / "secret.md").write_text("other client")
    return root


@pytest.mark.parametrize(
    "bad",
    [
        "../Case-B/secret.md",
        "..%2fCase-B%2fsecret.md",
        "..%2FCase-B/secret.md",
        "sub/../../Case-B/secret.md",
        "..",
        ".",
        "",
        "/etc/passwd",
        "C:/Windows/win.ini",
        "C:\\Windows\\win.ini",
        "\\\\server\\share\\x.md",
        ".talaan/index.db",
        "sub/../.talaan/index.db",
        ".TALAAN/index.db",
        ".Talaan/index.db",
        "sub/../.TaLaAn/index.db",
        "note.md\x00.txt",
    ],
)
def test_rejects_escapes(folder, bad):
    with pytest.raises(PathOutsideFolder):
        resolve_in_folder(folder, bad)


def test_rejects_symlink_leaving_folder(folder):
    try:
        os.symlink(folder.parent / "Case-B", folder / "link", target_is_directory=True)
    except OSError:
        pytest.skip("creating symlinks is not permitted on this machine")
    with pytest.raises(PathOutsideFolder):
        resolve_in_folder(folder, "link/secret.md")


@pytest.mark.parametrize("ok", ["note.md", "sub/new.md", "./note.md", "sub/../note.md"])
def test_allows_paths_inside(folder, ok):
    assert resolve_in_folder(folder, ok).is_relative_to(folder.resolve())
