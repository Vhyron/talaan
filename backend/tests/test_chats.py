"""Saved chat sessions: survive navigation, stay per folder, clear without touching the audit."""

import pytest
from fastapi.testclient import TestClient

from app.llm import client
from app.llm.client import ChatResult
from app.main import app

c = TestClient(app)
CASE = "Case-2026-014_Dela-Cruz"
CHART = "Chart_M-Reyes"


@pytest.fixture
def model(monkeypatch):
    state = type("M", (), {"reply": {"answer": "Penicillin [S1].", "refused": False, "action": None}})()

    def fake_chat(messages, schema=None, **kw):
        return ChatResult(content="", model="fake:1b", seconds=0, data=state.reply)

    monkeypatch.setattr(client, "chat", fake_chat)
    return state


def test_folder_session_is_saved_and_reloaded(model):
    assert c.get(f"/folders/{CHART}/chat").json() == []
    r = c.post(f"/folders/{CHART}/ask", json={"question": "Any allergies?"}).json()
    saved = c.get(f"/folders/{CHART}/chat").json()
    assert [m["role"] for m in saved] == ["user", "assistant"]
    assert saved[0]["content"] == "Any allergies?"
    assert saved[1]["response"] == r  # sources and outcome come back intact


def test_sessions_stay_in_their_own_folder(model):
    c.post(f"/folders/{CHART}/ask", json={"question": "Any allergies?"})
    assert c.get(f"/folders/{CASE}/chat").json() == []
    assert c.get("/chat").json() == []


def test_home_session_is_separate(model):
    c.post("/ask", json={"question": "Who is allergic to penicillin?"})
    assert [m["content"] for m in c.get("/chat").json()][0] == "Who is allergic to penicillin?"
    assert c.get(f"/folders/{CHART}/chat").json() == []


def test_clear_keeps_the_audit_log(model):
    c.post(f"/folders/{CHART}/ask", json={"question": "Any allergies?"})
    before = len(c.get(f"/folders/{CHART}/audit").json())
    assert c.delete(f"/folders/{CHART}/chat").status_code == 204
    assert c.get(f"/folders/{CHART}/chat").json() == []
    assert len(c.get(f"/folders/{CHART}/audit").json()) == before
    c.post("/ask", json={"question": "x"})
    assert c.delete("/chat").status_code == 204 and c.get("/chat").json() == []


def test_unknown_folder_is_404():
    assert c.get("/folders/..%2Fnope/chat").status_code == 404
    assert c.get("/folders/Nope/chat").status_code == 404
