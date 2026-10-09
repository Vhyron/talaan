"""Trash: user-only delete of files, subfolders and whole folders, with restore."""

import pytest
from fastapi.testclient import TestClient

from app import index
from app.main import app
from app.policy import engine

c = TestClient(app)
CASE = "Lakbay-Logistics-Inc"
CHART = "Santos-Family-Clinic"
INTAKE = "Chart M Reyes/00_intake_2026-08-03.md"  # has the penicillin allergy


def files(fid):
    return {f["path"] for f in c.get(f"/folders/{fid}/files").json()}


def events(fid, kind):
    return [e for e in c.get(f"/folders/{fid}/audit").json() if e["event"] == kind]


def first_md(fid):
    """A file inside a subfolder (case or chart): the usual thing to trash in a Space."""
    return INTAKE if fid == CHART else "Case 2026-014 Dela Cruz/2026-10-02_open-items.md"


def test_trash_file_and_restore(talaan_home):
    target = first_md(CHART)
    r = c.post(f"/folders/{CHART}/trash", json={"path": target})
    assert r.status_code == 200 and r.json()["kind"] == "file" and r.json()["path"] == target
    tid = r.json()["id"]
    assert target not in files(CHART)
    assert (talaan_home / "trash" / tid).is_dir()  # outside every client folder
    assert target not in {h.path for h in index.retrieve(CHART, "penicillin", k=None)}
    assert events(CHART, "deleted")[0]["path"] == target

    assert c.post(f"/trash/{tid}/restore").status_code == 200
    assert target in files(CHART) and c.get("/trash").json() == []
    assert target in {h.path for h in index.retrieve(CHART, "penicillin", k=None)}
    assert events(CHART, "restored")


def test_trash_subfolder(talaan_home):
    c.post(f"/folders/{CASE}/dirs", json={"path": "Notes"})
    c.post(f"/folders/{CASE}/import", files={"files": ("a.md", b"# A\nhello", "text/markdown")}, data={"dest": "Notes"})
    tid = c.post(f"/folders/{CASE}/trash", json={"path": "Notes"}).json()["id"]
    assert "Notes/a.md" not in files(CASE) and "Notes" not in c.get(f"/folders/{CASE}/dirs").json()
    c.post(f"/trash/{tid}/restore")
    assert "Notes/a.md" in files(CASE)


def test_trash_whole_folder_keeps_grants_audit_and_chats(talaan_home):
    grants = c.get(f"/folders/{CHART}/grants").json() | {"suggest_edits": "never"}
    c.put(f"/folders/{CHART}/grants", json=grants)
    r = c.delete(f"/folders/{CHART}")
    assert r.status_code == 200 and r.json()["kind"] == "folder"
    assert CHART not in {f["id"] for f in c.get("/folders").json()}
    assert c.get(f"/folders/{CHART}/files").status_code == 404
    tid = r.json()["id"]
    c.post(f"/trash/{tid}/restore")
    assert CHART in {f["id"] for f in c.get("/folders").json()}
    assert c.get(f"/folders/{CHART}/grants").json()["suggest_edits"] == "never"
    assert events(CHART, "deleted") and events(CHART, "restored")


def test_trashed_folder_is_not_read_by_the_home_chat(talaan_home, monkeypatch):
    from app.llm import client
    from app.llm.client import ChatResult
    seen = []
    monkeypatch.setattr(client, "chat", lambda messages, **kw: seen.append(messages[1]["content"]) or
                        ChatResult(content="", model="fake", seconds=0, data={"answer": "x", "refused": False}))
    from app.policy.grants import set_grants
    from app.schemas import Grants
    for fid in (CASE, CHART):
        set_grants(fid, Grants(home_chat=True))  # included in the home chat, then trashed
    c.delete(f"/folders/{CHART}")
    c.post("/ask", json={"question": "penicillin allergy"})
    assert "Santos Family Clinic" not in seen[0].split("Question:")[0] and "enicillin" not in seen[0].split("Question:")[0]


def test_pending_proposal_for_a_trashed_file_goes_stale(talaan_home):
    target = first_md(CASE)
    engine.handle(CASE, {"action": "propose_edit", "path": target, "content": "x"})
    c.post(f"/folders/{CASE}/trash", json={"path": target})
    assert c.get(f"/folders/{CASE}/proposals").json() == []


def test_purge_is_permanent_and_audited(talaan_home):
    target = first_md(CHART)
    tid = c.post(f"/folders/{CHART}/trash", json={"path": target}).json()["id"]
    assert c.delete(f"/trash/{tid}").status_code == 204
    assert not (talaan_home / "trash" / tid).exists() and c.get("/trash").json() == []
    assert c.post(f"/trash/{tid}/restore").status_code == 404
    assert events(CHART, "purged")


def test_restore_never_overwrites(talaan_home):
    target = first_md(CHART)
    tid = c.post(f"/folders/{CHART}/trash", json={"path": target}).json()["id"]
    (talaan_home / "folders" / CHART / target).write_text("new file, same name", encoding="utf-8")
    assert c.post(f"/trash/{tid}/restore").status_code == 409
    assert (talaan_home / "folders" / CHART / target).read_text(encoding="utf-8") == "new file, same name"


def test_restore_file_of_a_trashed_folder_needs_the_folder_first(talaan_home):
    target = first_md(CHART)
    file_tid = c.post(f"/folders/{CHART}/trash", json={"path": target}).json()["id"]
    folder_tid = c.delete(f"/folders/{CHART}").json()["id"]
    assert c.post(f"/trash/{file_tid}/restore").status_code == 409
    c.post(f"/trash/{folder_tid}/restore")
    assert c.post(f"/trash/{file_tid}/restore").status_code == 200 and target in files(CHART)


@pytest.mark.parametrize("path,code", [("../Lakbay-Logistics-Inc", 400), (".talaan", 400), ("", 422), ("missing.md", 404)])
def test_bad_paths_are_refused(path, code):
    assert c.post(f"/folders/{CHART}/trash", json={"path": path}).status_code == code


def test_model_delete_is_still_governed_by_the_grant():
    out = engine.handle(CHART, {"action": "delete", "path": first_md(CHART)})
    assert out.status == "blocked"  # Delete = Never by default; the Trash is not a model action
    assert c.get("/trash").json() == []
