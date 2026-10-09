"""A2: folders and files on disk, through the API."""

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
