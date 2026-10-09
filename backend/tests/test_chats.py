"""C8: saved chats per folder, with the model stubbed out."""

import pytest
from fastapi.testclient import TestClient

from app import chats
from app.llm import client
from app.llm.client import ChatResult, OllamaError
from app.main import app

c = TestClient(app)
CASE = "Lakbay-Logistics-Inc"
CHART = "Santos-Family-Clinic"
SCOPE = {CASE: "Case 2026-014 Dela Cruz", CHART: "Chart M Reyes"}  # chats are started from the case/chart


@pytest.fixture
def model(monkeypatch):
    """Answers with `reply`; titles with `title`. `title_calls` counts title requests."""
    state = type("M", (), {"reply": {"answer": "Open items [S1].", "refused": False}, "title": "Open items review",
                           "title_calls": 0})()

    def fake_chat(messages, schema=None, **kw):
        if schema is chats.Title:
            state.title_calls += 1
            return ChatResult(content="", model="fake:1b", seconds=0, data={"title": state.title})
        return ChatResult(content="", model="fake:1b", seconds=0, data=state.reply)

    monkeypatch.setattr(client, "chat", fake_chat)
    c.post(f"/folders/{CASE}/index")
    c.post(f"/folders/{CHART}/index")
    return state


def ask(folder, q, sid=None, scope=...):
    scope = SCOPE[folder] if scope is ... else scope
    r = c.post(f"/folders/{folder}/ask", json={"question": q, "session_id": sid, "scope": scope})
    assert r.status_code == 200, r.text
    return r.json()


def test_first_ask_starts_a_chat_and_follow_ups_continue_it(model):
    model.title = None  # no usable title: keep the question
    first = ask(CASE, "What is still open?")
    sid = first["session_id"]
    assert sid
    second = ask(CASE, "And who raised it?", sid)
    assert second["session_id"] == sid

    [summary] = c.get(f"/folders/{CASE}/chats").json()
    assert summary["id"] == sid and summary["message_count"] == 4 and summary["title"] == "What is still open?"
    chat = c.get(f"/folders/{CASE}/chats/{sid}").json()
    assert [m["role"] for m in chat["messages"]] == ["user", "assistant", "user", "assistant"]
    assert chat["messages"][1]["response"]["sources"]  # citations come back on resume


def test_model_titles_the_chat_in_the_background(model):
    sid = ask(CASE, "What is still open?")["session_id"]
    assert c.get(f"/folders/{CASE}/chats/{sid}").json()["title"] == "Open items review"
    ask(CASE, "Anything else?", sid)
    assert model.title_calls == 1  # only after the first answer


def test_refused_first_question_is_saved_but_not_titled(model):
    r = ask(CASE, "Summarize Ana Villanueva's tardiness.")
    assert r["refused"] and model.title_calls == 0
    chat = c.get(f"/folders/{CASE}/chats/{r['session_id']}").json()
    assert chat["messages"][1]["response"]["refused"]


def test_title_survives_ollama_being_down(model, monkeypatch):
    sid = ask(CASE, "What is still open?")["session_id"]
    chats.check(CASE, sid)

    def down(*a, **kw):
        raise OllamaError("down")

    monkeypatch.setattr(client, "chat", down)
    with chats.connect() as db:
        db.execute("UPDATE chat_sessions SET title = 'What is still open?', title_source = 'question'")
    chats.auto_title(CASE, sid, "What is still open?")
    assert c.get(f"/folders/{CASE}/chats/{sid}").json()["title"] == "What is still open?"


def test_rename_wins_over_a_late_model_title(model):
    model.title = None
    sid = ask(CASE, "What is still open?")["session_id"]
    r = c.patch(f"/folders/{CASE}/chats/{sid}", json={"title": "Follow-ups"})
    assert r.status_code == 200 and r.json()["title"] == "Follow-ups"
    model.title = "Model title"
    chats.auto_title(CASE, sid, "What is still open?")
    assert c.get(f"/folders/{CASE}/chats/{sid}").json()["title"] == "Follow-ups"
    assert any(e["event"] == "session_renamed" and e["session_id"] == sid for e in c.get(f"/folders/{CASE}/audit").json())


def test_no_title_call_when_reading_is_off(model):
    sid = ask(CASE, "What is still open?")["session_id"]
    calls = model.title_calls
    g = c.get(f"/folders/{CASE}/grants").json()
    c.put(f"/folders/{CASE}/grants", json={**g, "read": "never"})
    chats.auto_title(CASE, sid, "What is still open?")
    assert model.title_calls == calls
    assert c.get(f"/folders/{CASE}/chats/{sid}").status_code == 200  # still viewable


def test_chats_are_sealed_per_folder(model):
    sid = ask(CASE, "What is still open?")["session_id"]
    assert c.get(f"/folders/{CHART}/chats").json() == []
    assert c.get(f"/folders/{CHART}/chats/{sid}").status_code == 404
    assert c.patch(f"/folders/{CHART}/chats/{sid}", json={"title": "x"}).status_code == 404
    assert c.delete(f"/folders/{CHART}/chats/{sid}").status_code == 404
    r = c.post(f"/folders/{CHART}/ask", json={"question": "Any allergies?", "session_id": sid})
    assert r.status_code == 404
    assert c.post(f"/folders/{CASE}/ask", json={"question": "x", "session_id": "nope"}).status_code == 404


def test_search_matches_messages_in_this_folder_only(model):
    model.title = None
    a = ask(CASE, "What is still open?")["session_id"]
    ask(CASE, "Who was interviewed?")
    ask(CHART, "What is still open in this chart?")
    assert [s["id"] for s in c.get(f"/folders/{CASE}/chats", params={"q": "still OPEN"}).json()] == [a]
    assert len(c.get(f"/folders/{CASE}/chats", params={"q": "Open items"}).json()) == 2  # answer text
    assert c.get(f"/folders/{CASE}/chats", params={"q": "100%"}).json() == []


def test_audit_rows_carry_the_session_and_survive_delete(model):
    sid = ask(CASE, "What is still open?")["session_id"]
    assert c.delete(f"/folders/{CASE}/chats/{sid}").status_code == 204
    assert c.get(f"/folders/{CASE}/chats/{sid}").status_code == 404
    events = c.get(f"/folders/{CASE}/audit").json()
    mine = {e["event"] for e in events if e["session_id"] == sid}
    assert mine == {"question", "answer", "session_deleted"}


def test_resumed_proposal_shows_its_current_status(model):
    model.reply = {"action": "create_draft", "path": "follow-up.md", "content": "# Note", "reason": "asked"}
    r = ask(CASE, "Create a draft note of the open items.")
    assert r["outcome"]["status"] == "pending"
    sid, pid = r["session_id"], r["proposal_id"]
    assert c.get(f"/folders/{CASE}/chats/{sid}").json()["messages"][1]["proposal_status"] == "pending"
    c.post(f"/proposals/{pid}/approve")
    assert c.get(f"/folders/{CASE}/chats/{sid}").json()["messages"][1]["proposal_status"] == "approved"


def test_demo_reset_clears_chats(model):
    from scripts.seed_demo import clear_state

    ask(CASE, "What is still open?")
    clear_state([CASE])
    assert c.get(f"/folders/{CASE}/chats").json() == []


def test_chat_summary_carries_its_scope(model):
    scoped = ask(CASE, "What is still open?")["session_id"]
    whole = ask(CASE, "What is still open?", scope=None)["session_id"]
    ask(CASE, "Anything else?", scoped, scope=None)  # the scope is kept from the first turn
    summaries = {s["id"]: s for s in c.get(f"/folders/{CASE}/chats").json()}
    assert summaries[scoped]["scope"] == "Case 2026-014 Dela Cruz"
    assert summaries[whole]["scope"] is None


def test_draft_from_a_scoped_chat_lands_in_that_subfolder(model):
    model.reply = {"action": "create_draft", "path": "follow-up.md", "content": "# Note", "reason": "asked"}
    r = ask(CASE, "Create a draft note of the open items.")
    assert r["outcome"]["path"] == "Case 2026-014 Dela Cruz/follow-up.md"
