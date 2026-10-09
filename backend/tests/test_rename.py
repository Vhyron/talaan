"""Rename: folder display name keeps its id; file renames carry proposals, chats, index, audit."""

from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

from app import chats, index
from app.llm import client
from app.llm.client import ChatResult
from app.main import app
from app.policy import engine
from app.schemas import AskResponse, Source

c = TestClient(app)
CASE = "Lakbay-Logistics-Inc"
CHART = "Santos-Family-Clinic"
D = "Case 2026-014 Dela Cruz"
M = "Chart M Reyes"
INTAKE = f"{M}/00_intake_2026-08-03.md"  # has the penicillin allergy


def files(fid):
    return {f["path"] for f in c.get(f"/folders/{fid}/files").json()}


def audit(fid):
    return c.get(f"/folders/{fid}/audit").json()


# --- folder -----------------------------------------------------------------


def test_folder_rename_keeps_id_grants_audit_and_chat():
    grants = c.get(f"/folders/{CHART}/grants").json() | {"suggest_edits": "never"}
    c.put(f"/folders/{CHART}/grants", json=grants)
    chats.save_turn(CHART, "s1", "q", AskResponse(answer="a"))
    r = c.patch(f"/folders/{CHART}", json={"name": "Santos Clinic · Marikina"})
    assert r.status_code == 200 and r.json()["id"] == CHART and r.json()["name"] == "Santos Clinic · Marikina"
    assert next(f for f in c.get("/folders").json() if f["id"] == CHART)["name"] == "Santos Clinic · Marikina"
    assert c.get(f"/folders/{CHART}/grants").json()["suggest_edits"] == "never"
    assert c.get(f"/folders/{CHART}/chats/s1").json()["message_count"] == 2
    assert any(e["event"] == "rename" and "Santos Clinic · Marikina" in e["reason"] for e in audit(CHART))


def test_folder_rename_rejects_duplicates_and_blank():
    taken = next(f["name"] for f in c.get("/folders").json() if f["id"] == CASE)
    assert c.patch(f"/folders/{CHART}", json={"name": taken.upper()}).status_code == 409
    assert c.patch(f"/folders/{CHART}", json={"name": "   "}).status_code == 400
    assert c.patch("/folders/Nope", json={"name": "x"}).status_code == 404


# --- files ------------------------------------------------------------------


def test_file_rename_moves_file_and_reindexes():
    old, new = INTAKE, f"{M}/renamed-note.md"  # stays in its subfolder
    r = c.post(f"/folders/{CHART}/rename", json={"path": old, "name": "renamed-note.md"})
    assert r.status_code == 200 and r.json()["path"] == new
    assert new in files(CHART) and old not in files(CHART)
    paths = {h.path for h in index.retrieve(CHART, "penicillin allergy", k=None)}
    assert old not in paths and new in paths
    e = next(e for e in audit(CHART) if e["event"] == "rename")
    assert e["actor"] == "user" and old in e["reason"] and e["path"] == new


def test_pending_proposal_follows_the_file():
    target = f"{D}/2026-10-02_open-items.md"
    out = engine.handle(CASE, {"action": "propose_edit", "path": target, "content": "new text"})
    assert out.status == "pending"
    c.post(f"/folders/{CASE}/rename", json={"path": target, "name": "moved.md"})
    [p] = c.get(f"/folders/{CASE}/proposals").json()
    assert p["action"]["path"] == f"{D}/moved.md"
    assert c.post(f"/proposals/{p['id']}/approve").json()["status"] == "executed"
    assert c.get(f"/folders/{CASE}/files/{quote(D)}/moved.md").text.strip() == "new text"


def test_saved_chat_sources_follow_the_file():
    target = INTAKE
    src = Source(path=target, start=1, end=2, snippet="")
    chats.save_turn(CHART, "s1", "q", AskResponse(answer="a [S1]", sources=[src]))
    chats.save_turn(chats.ALL, "h1", "q", AskResponse(answer="a [S1]", sources=[src.model_copy(update={"folder_id": CHART})]))
    chats.save_turn(chats.ALL, "h1", "q", AskResponse(answer="b [S1]", sources=[src.model_copy(update={"folder_id": CASE})]))
    c.post(f"/folders/{CHART}/rename", json={"path": target, "name": "x.md"})
    assert c.get(f"/folders/{CHART}/chats/s1").json()["messages"][1]["response"]["sources"][0]["path"] == f"{M}/x.md"
    home = [m["response"]["sources"][0] for m in c.get("/chat").json()["messages"] if m["response"]]
    assert home[0]["path"] == f"{M}/x.md"
    assert home[1]["path"] == target  # same path in another folder: untouched


def test_subfolder_rename_moves_children():
    assert c.post(f"/folders/{CASE}/dirs", json={"path": "Notes"}).status_code == 201
    c.post(f"/folders/{CASE}/import", files={"files": ("a.md", b"# A\nhello", "text/markdown")}, data={"dest": "Notes"})
    assert "Notes/a.md" in files(CASE)
    r = c.post(f"/folders/{CASE}/rename", json={"path": "Notes", "name": "Interview notes"})
    assert r.json()["path"] == "Interview notes" and "Interview notes/a.md" in files(CASE)


@pytest.mark.parametrize("name", ["../escape.md", "sub/x.md", ".hidden.md", "a:b.md", "note.txt"])
def test_bad_names_are_refused(name):
    target = INTAKE
    assert c.post(f"/folders/{CHART}/rename", json={"path": target, "name": name}).status_code == 400
    assert target in files(CHART)


def test_cannot_rename_outside_hidden_missing_or_over_existing():
    md = sorted(p for p in files(CHART) if p.startswith(M + "/"))
    assert c.post(f"/folders/{CHART}/rename", json={"path": "../Lakbay-Logistics-Inc", "name": "x"}).status_code == 400
    assert c.post(f"/folders/{CHART}/rename", json={"path": f"../{CASE}/{D}", "name": "x"}).status_code == 400
    assert c.post(f"/folders/{CHART}/rename", json={"path": ".talaan", "name": "x"}).status_code == 400
    assert c.post(f"/folders/{CHART}/rename", json={"path": "missing.md", "name": "x.md"}).status_code == 404
    assert c.post(f"/folders/{CHART}/rename", json={"path": md[0], "name": md[1].split("/")[-1]}).status_code == 409


def test_model_has_no_rename_action():
    out = engine.handle(CHART, {"action": "rename", "path": "a.md", "name": "b.md"})
    assert out.status == "blocked"



def test_subfolder_rename_moves_its_chats_scope(monkeypatch):
    monkeypatch.setattr(client, "chat", lambda messages, schema=None, **kw: ChatResult(
        content="", model="fake:1b", seconds=0,
        data={"title": "t"} if schema is chats.Title else {"answer": "Open items [S1].", "refused": False}))
    sid = c.post(f"/folders/{CASE}/ask", json={"question": "What is still open?", "scope": D}).json()["session_id"]
    whole = c.post(f"/folders/{CASE}/ask", json={"question": "What is still open?"}).json()["session_id"]
    r = c.post(f"/folders/{CASE}/rename", json={"path": D, "name": "Case 2026-014 DC"})
    assert r.status_code == 200 and r.json()["path"] == "Case 2026-014 DC"
    scopes = {s["id"]: s["scope"] for s in c.get(f"/folders/{CASE}/chats").json()}
    assert scopes[sid] == "Case 2026-014 DC" and scopes[whole] is None
    # The renamed chat keeps working in its (moved) scope
    r = c.post(f"/folders/{CASE}/ask", json={"question": "What is still open?", "scope": "Case 2026-014 DC", "session_id": sid})
    assert r.status_code == 200 and all(s["path"].startswith("Case 2026-014 DC/") or s["path"] == "README.md"
                                        for s in r.json()["sources"])
