"""Rename: folder display name keeps its id; file renames carry proposals, chats, index, audit."""

import pytest
from fastapi.testclient import TestClient

from app import chats, index
from app.main import app
from app.policy import engine
from app.schemas import AskResponse, Source

c = TestClient(app)
CASE = "Case-2026-014_Dela-Cruz"
CHART = "Chart_M-Reyes"


def files(fid):
    return {f["path"] for f in c.get(f"/folders/{fid}/files").json()}


def audit(fid):
    return c.get(f"/folders/{fid}/audit").json()


# --- folder -----------------------------------------------------------------


def test_folder_rename_keeps_id_grants_audit_and_chat():
    grants = c.get(f"/folders/{CHART}/grants").json() | {"suggest_edits": "never"}
    c.put(f"/folders/{CHART}/grants", json=grants)
    chats.save_turn(CHART, "s1", "q", AskResponse(answer="a"))
    r = c.patch(f"/folders/{CHART}", json={"name": "Chart · Maria Reyes"})
    assert r.status_code == 200 and r.json()["id"] == CHART and r.json()["name"] == "Chart · Maria Reyes"
    assert next(f for f in c.get("/folders").json() if f["id"] == CHART)["name"] == "Chart · Maria Reyes"
    assert c.get(f"/folders/{CHART}/grants").json()["suggest_edits"] == "never"
    assert c.get(f"/folders/{CHART}/chats/s1").json()["message_count"] == 2
    assert any(e["event"] == "rename" and "Chart · Maria Reyes" in e["reason"] for e in audit(CHART))


def test_folder_rename_rejects_duplicates_and_blank():
    taken = next(f["name"] for f in c.get("/folders").json() if f["id"] == CASE)
    assert c.patch(f"/folders/{CHART}", json={"name": taken.upper()}).status_code == 409
    assert c.patch(f"/folders/{CHART}", json={"name": "   "}).status_code == 400
    assert c.patch("/folders/Nope", json={"name": "x"}).status_code == 404


# --- files ------------------------------------------------------------------


def test_file_rename_moves_file_and_reindexes():
    old = sorted(p for p in files(CHART) if p.endswith(".md"))[0]
    r = c.post(f"/folders/{CHART}/rename", json={"path": old, "name": "renamed-note.md"})
    assert r.status_code == 200 and r.json()["path"] == "renamed-note.md"
    assert "renamed-note.md" in files(CHART) and old not in files(CHART)
    paths = {h.path for h in index.retrieve(CHART, "penicillin allergy", k=None)}
    assert old not in paths and "renamed-note.md" in paths
    e = next(e for e in audit(CHART) if e["event"] == "rename")
    assert e["actor"] == "user" and old in e["reason"] and e["path"] == "renamed-note.md"


def test_pending_proposal_follows_the_file():
    target = sorted(p for p in files(CASE) if p.endswith(".md"))[0]
    out = engine.handle(CASE, {"action": "propose_edit", "path": target, "content": "new text"})
    assert out.status == "pending"
    c.post(f"/folders/{CASE}/rename", json={"path": target, "name": "moved.md"})
    [p] = c.get(f"/folders/{CASE}/proposals").json()
    assert p["action"]["path"] == "moved.md"
    assert c.post(f"/proposals/{p['id']}/approve").json()["status"] == "executed"
    assert c.get(f"/folders/{CASE}/files/moved.md").text.strip() == "new text"


def test_saved_chat_sources_follow_the_file():
    target = sorted(p for p in files(CHART) if p.endswith(".md"))[0]
    src = Source(path=target, start=1, end=2, snippet="")
    chats.save_turn(CHART, "s1", "q", AskResponse(answer="a [S1]", sources=[src]))
    chats.save_turn(chats.ALL, "h1", "q", AskResponse(answer="a [S1]", sources=[src.model_copy(update={"folder_id": CHART})]))
    chats.save_turn(chats.ALL, "h1", "q", AskResponse(answer="b [S1]", sources=[src.model_copy(update={"folder_id": CASE})]))
    c.post(f"/folders/{CHART}/rename", json={"path": target, "name": "x.md"})
    assert c.get(f"/folders/{CHART}/chats/s1").json()["messages"][1]["response"]["sources"][0]["path"] == "x.md"
    home = [m["response"]["sources"][0] for m in c.get("/chat").json()["messages"] if m["response"]]
    assert home[0]["path"] == "x.md"
    assert home[1]["path"] == target  # same path in another folder: untouched


def test_subfolder_rename_moves_children():
    assert c.post(f"/folders/{CASE}/dirs", json={"path": "Notes"}).status_code == 201
    c.post(f"/folders/{CASE}/import", files={"files": ("a.md", b"# A\nhello", "text/markdown")}, data={"dest": "Notes"})
    assert "Notes/a.md" in files(CASE)
    r = c.post(f"/folders/{CASE}/rename", json={"path": "Notes", "name": "Interview notes"})
    assert r.json()["path"] == "Interview notes" and "Interview notes/a.md" in files(CASE)


@pytest.mark.parametrize("name", ["../escape.md", "sub/x.md", ".hidden.md", "a:b.md", "note.txt"])
def test_bad_names_are_refused(name):
    target = sorted(p for p in files(CHART) if p.endswith(".md"))[0]
    assert c.post(f"/folders/{CHART}/rename", json={"path": target, "name": name}).status_code == 400
    assert target in files(CHART)


def test_cannot_rename_outside_hidden_missing_or_over_existing():
    md = sorted(p for p in files(CHART) if p.endswith(".md"))
    assert c.post(f"/folders/{CHART}/rename", json={"path": "../Case-2026-014_Dela-Cruz", "name": "x"}).status_code == 400
    assert c.post(f"/folders/{CHART}/rename", json={"path": ".talaan", "name": "x"}).status_code == 400
    assert c.post(f"/folders/{CHART}/rename", json={"path": "missing.md", "name": "x.md"}).status_code == 404
    assert c.post(f"/folders/{CHART}/rename", json={"path": md[0], "name": md[1].split("/")[-1]}).status_code == 409


def test_model_has_no_rename_action():
    out = engine.handle(CHART, {"action": "rename", "path": "a.md", "name": "b.md"})
    assert out.status == "blocked"
