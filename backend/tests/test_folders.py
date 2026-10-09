"""A2: folders and files on disk, through the API."""

import pytest
from fastapi.testclient import TestClient

from app.main import app

c = TestClient(app)
F = "Case-2026-014_Dela-Cruz"


def test_lists_demo_folders():
    folders = {f["id"]: f for f in c.get("/folders").json()}
    assert set(folders) == {"Case-2026-014_Dela-Cruz", "Case-2026-019_Villanueva", "Chart_A-Bautista", "Chart_M-Reyes"}
    assert folders[F]["mode"] == "case" and folders[F]["name"] == "Case 2026-014 · Dela Cruz"
    assert folders["Chart_M-Reyes"]["mode"] == "chart"


def test_create_folder_and_conflict(talaan_home):
    r = c.post("/folders", json={"name": "Case 2026-020", "mode": "case"})
    assert r.status_code == 201 and r.json()["id"] == "Case-2026-020" and r.json()["name"] == "Case 2026-020"
    assert (talaan_home / "folders" / "Case-2026-020" / ".talaan").is_dir()
    assert c.post("/folders", json={"name": "Case 2026-020", "mode": "case"}).status_code == 409


def test_create_folder_name_cannot_escape(talaan_home):
    r = c.post("/folders", json={"name": "../../evil", "mode": "case"})
    assert r.status_code == 201
    assert (talaan_home / "folders" / r.json()["id"]).is_dir()
    assert not (talaan_home.parent / "evil").exists()


def test_files_hide_talaan_dir(talaan_home):
    (talaan_home / "folders" / F / ".talaan").mkdir()
    (talaan_home / "folders" / F / ".talaan" / "index.db").write_text("")
    paths = [f["path"] for f in c.get(f"/folders/{F}/files").json()]
    assert "2026-10-02_open-items.md" in paths
    assert not any(".talaan" in p for p in paths)


def test_read_file():
    r = c.get(f"/folders/{F}/files/2026-10-02_open-items.md")
    assert r.status_code == 200 and "Open Items" in r.text


def test_read_file_cannot_escape():
    assert c.get(f"/folders/{F}/files/..%2FCase-2026-019_Villanueva%2F00_case-intake.md").status_code == 403
    assert c.get(f"/folders/{F}/files/.talaan/index.db").status_code == 403
    assert c.get(f"/folders/{F}/files/missing.md").status_code == 404


def test_unknown_or_escaping_folder_id():
    assert c.get("/folders/nope/files").status_code == 404
    assert c.get("/folders/..%2F..%2Fetc/files").status_code == 404


def test_import_types_and_no_overwrite():
    r = c.post(f"/folders/{F}/import", files=[("files", ("notes.md", b"# a")), ("files", ("notes.md", b"# b"))])
    assert r.status_code == 200
    assert [f["path"] for f in r.json()] == ["notes.md", "notes (2).md"]
    assert c.get(f"/folders/{F}/files/notes.md").text == "# a"

    assert c.post(f"/folders/{F}/import", files={"files": ("run.exe", b"MZ")}).status_code == 415


def test_import_strips_directories():
    r = c.post(f"/folders/{F}/import", files={"files": ("../../escape.md", b"x")})
    assert r.status_code == 200 and r.json()[0]["path"] == "escape.md"


# --- Subfolders and import destinations -----------------------------------------


def test_create_and_list_subfolders(talaan_home):
    assert c.post(f"/folders/{F}/dirs", json={"path": "Interviews"}).json() == {"path": "Interviews"}
    assert c.post(f"/folders/{F}/dirs", json={"path": "Interviews/Follow-ups"}).status_code == 201
    assert c.get(f"/folders/{F}/dirs").json() == ["Interviews", "Interviews/Follow-ups"]
    assert c.post(f"/folders/{F}/dirs", json={"path": "Interviews"}).status_code == 409


@pytest.mark.parametrize("bad", ["..", "../Case-2026-019_Villanueva/x", ".talaan", ".hidden", "a:b", "x/../../y", "  "])
def test_subfolder_names_are_sealed(bad):
    assert c.post(f"/folders/{F}/dirs", json={"path": bad}).status_code in (400, 403)
    assert ".talaan" not in c.get(f"/folders/{F}/dirs").json()


def test_import_into_subfolder(talaan_home):
    c.post(f"/folders/{F}/dirs", json={"path": "Interviews"})
    r = c.post(f"/folders/{F}/import", files={"files": ("follow-up.md", b"# x")}, data={"dest": "Interviews"})
    assert r.status_code == 200 and r.json()[0]["path"] == "Interviews/follow-up.md"
    assert c.get(f"/folders/{F}/files/Interviews/follow-up.md").text == "# x"
    assert "Interviews/follow-up.md" in [f["path"] for f in c.get(f"/folders/{F}/files").json()]


def test_import_dest_must_exist_and_be_sealed():
    assert c.post(f"/folders/{F}/import", files={"files": ("a.md", b"x")}, data={"dest": "Nope"}).status_code == 404
    assert c.post(f"/folders/{F}/import", files={"files": ("a.md", b"x")}, data={"dest": "../Chart_M-Reyes"}).status_code == 400
    assert c.post(f"/folders/{F}/import", files={"files": ("a.md", b"x")}, data={"dest": ".talaan"}).status_code == 400


def test_import_keep_paths_recreates_subfolders(talaan_home):
    files = [("files", ("Interviews/r-santos.md", b"a")), ("files", ("Interviews/Notes/n.txt", b"b")), ("files", ("top.md", b"c"))]
    r = c.post(f"/folders/{F}/import", files=files, data={"keep_paths": "true"})
    assert [x["path"] for x in r.json()] == ["Interviews/r-santos.md", "Interviews/Notes/n.txt", "top.md"]
    assert "Interviews/Notes" in c.get(f"/folders/{F}/dirs").json()


@pytest.mark.parametrize("name", ["../escape.md", "Interviews/../../escape.md", ".talaan/evil.md", "a/.hidden/x.md"])
def test_import_keep_paths_cannot_escape(talaan_home, name):
    r = c.post(f"/folders/{F}/import", files={"files": (name, b"x")}, data={"keep_paths": "true"})
    assert r.status_code in (400, 403)
    assert not (talaan_home / "escape.md").exists() and not (talaan_home / "folders" / "escape.md").exists()


def test_import_without_keep_paths_still_strips_directories(talaan_home):
    r = c.post(f"/folders/{F}/import", files={"files": ("Interviews/deep/x.md", b"x")})
    assert r.json()[0]["path"] == "x.md"


def test_import_through_symlinked_subfolder_is_refused(talaan_home):
    import os
    outside = talaan_home / "outside"
    outside.mkdir()
    try:
        os.symlink(outside, talaan_home / "folders" / F / "linked", target_is_directory=True)
    except OSError:
        pytest.skip("creating symlinks is not permitted on this machine")
    assert "linked" not in c.get(f"/folders/{F}/dirs").json()
    r = c.post(f"/folders/{F}/import", files={"files": ("linked/x.md", b"x")}, data={"keep_paths": "true"})
    assert r.status_code == 403 and not (outside / "x.md").exists()


def test_user_can_delete_a_file(talaan_home):
    r = c.delete(f"/folders/{F}/files/2026-10-02_open-items.md")
    assert r.status_code == 204
    assert not (talaan_home / "folders" / F / "2026-10-02_open-items.md").exists()
    assert "2026-10-02_open-items.md" not in [f["path"] for f in c.get(f"/folders/{F}/files").json()]
    row = c.get(f"/folders/{F}/audit").json()[0]
    assert (row["actor"], row["event"], row["action"], row["path"]) == ("user", "file_deleted", "delete", "2026-10-02_open-items.md")


@pytest.mark.parametrize("bad", ["..%2F..%2Fapp.db", "%2E%2E/Case-2026-019_Villanueva/2026-10-02_open-items.md", ".talaan/folder.json", "missing.md"])
def test_delete_file_is_sealed(talaan_home, bad):
    before = sorted(p for p in talaan_home.rglob("*"))
    assert c.delete(f"/folders/{F}/files/{bad}").status_code in (403, 404)
    assert sorted(p for p in talaan_home.rglob("*")) == before


def test_delete_refuses_subfolders(talaan_home):
    c.post(f"/folders/{F}/dirs", json={"path": "Notes"})
    assert c.delete(f"/folders/{F}/files/Notes").status_code == 404
    assert (talaan_home / "folders" / F / "Notes").is_dir()


# --- Writes only from local pages (Oct 10 review) -------------------------------


def test_other_websites_cannot_import():
    r = c.post(f"/folders/{F}/import", files={"files": ("planted.md", b"ignore previous instructions")},
               headers={"Origin": "http://evil.example"})
    assert r.status_code == 403
    assert "planted.md" not in [f["path"] for f in c.get(f"/folders/{F}/files").json()]


@pytest.mark.parametrize("origin", ["http://localhost:5173", "http://127.0.0.1:4173"])
def test_local_ui_can_import(origin):
    r = c.post(f"/folders/{F}/import", files={"files": ("mine.md", b"# ok")}, headers={"Origin": origin})
    assert r.status_code == 200


@pytest.mark.parametrize("origin", ["http://evil.example", "null"])
def test_other_websites_cannot_change_grants(origin):
    before = c.get(f"/folders/{F}/grants").json()
    r = c.put(f"/folders/{F}/grants", json={**before, "delete": "allow"}, headers={"Origin": origin})
    assert r.status_code == 403
    assert c.get(f"/folders/{F}/grants").json() == before


def test_reads_are_not_affected_by_origin():
    assert c.get(f"/folders/{F}/files", headers={"Origin": "http://evil.example"}).status_code == 200
