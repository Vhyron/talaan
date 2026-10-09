"""Home-page chat across all folders: tagged sources, Read grants, audit, read-only."""

import pytest
from fastapi.testclient import TestClient

from app import global_ask
from app.llm import client
from app.llm.client import ChatResult
from app.main import app
from app.policy.grants import set_grants
from app.schemas import Grant, Grants

c = TestClient(app)
CASE = "Case-2026-014_Dela-Cruz"
CHART = "Chart_M-Reyes"
VILLA = "Case-2026-019_Villanueva"


@pytest.fixture
def model(monkeypatch):
    state = type("M", (), {"reply": None, "calls": []})()

    def fake_chat(messages, schema=None, **kw):
        state.calls.append(messages)
        return ChatResult(content="", model="fake:1b", seconds=0, data=state.reply)

    monkeypatch.setattr(client, "chat", fake_chat)
    return state


def ask(q, **extra):
    return c.post("/ask", json={"question": q, **extra}).json()


def doc_ids(prompt: str, folder_name: str) -> list[int]:
    import re
    return [int(n) for n, f in re.findall(r'<document id="S(\d+)" folder="([^"]+)"', prompt) if f == folder_name]


def test_answers_from_several_folders_with_tagged_sources(model):
    # Penicillin is in Chart M Reyes; the badge log is in Case 2026-014.
    model.reply = {"answer": "x", "refused": False}
    ask("penicillin allergy and badge entry")
    prompt = model.calls[0][1]["content"]
    case_s, chart_s = doc_ids(prompt, "Case 2026-014 · Dela Cruz"), doc_ids(prompt, "Chart · M Reyes")
    assert case_s and chart_s, "both folders should contribute passages"

    model.reply = {"answer": f"Penicillin allergy [S{chart_s[0]}]. Badge entry [S{case_s[0]}].", "refused": False}
    r = ask("penicillin allergy and badge entry")
    assert not r["refused"] and r["answer"] == "Penicillin allergy [S1]. Badge entry [S2]."
    assert [s["folder_id"] for s in r["sources"]] == [CHART, CASE]


def test_catalogue_lists_folders_and_files(model):
    model.reply = {"answer": "You have four folders.", "refused": False}
    ask("Which folders do I have?")
    prompt = model.calls[0][1]["content"]
    assert "Folders on this laptop:" in prompt
    assert "Case 2026-019 · Villanueva (case" in prompt and "attendance-summary.md" in prompt


def test_read_never_folder_is_not_searched(model):
    set_grants(VILLA, Grants(read=Grant.NEVER))
    model.reply = {"answer": "x", "refused": False}
    ask("Ana Villanueva tardiness attendance")
    prompt = model.calls[0][1]["content"]
    before_question = prompt.split("Question:")[0]
    assert "Case 2026-019" not in before_question and "attendance-summary.md" not in before_question
    assert all(e["event"] != "question" for e in c.get(f"/folders/{VILLA}/audit").json())


def test_audit_written_in_every_folder_used(model):
    model.reply = {"answer": "Penicillin [S1].", "refused": False}
    ask("penicillin allergy and badge entry")
    for fid in (CASE, CHART):
        events = c.get(f"/folders/{fid}/audit").json()
        assert any(e["event"] == "question" and e["reason"].startswith("Home chat (all folders)") for e in events)
        assert any(e["event"] == "answer" and e["model_tag"] == "fake:1b" for e in events)


def test_read_only_even_when_asked_to_change_files(model):
    model.reply = {"answer": "I can't change files from here.", "refused": False}
    r = ask("Delete the interview with Rhea Santos.")
    assert r["outcome"] is None and r["proposal_id"] is None
    assert len(model.calls) == 1  # one answer call, no action call
    assert all(c.get(f"/folders/{f}/proposals").json() == [] for f in (CASE, CHART, VILLA))


def test_not_found(model):
    model.reply = {"answer": "whatever", "refused": True}
    r = ask("What is the capital of Mongolia?")
    assert r["refused"] and r["answer"] == global_ask.NOT_FOUND and r["sources"] == []


def test_citations_to_unknown_documents_are_dropped(model):
    model.reply = {"answer": "Ghost fact [S99].", "refused": False}
    r = ask("penicillin")
    assert r["answer"] == "Ghost fact." and r["sources"] == []


def test_history_is_passed_as_context(model):
    model.reply = {"answer": "x", "refused": False}
    history = [{"role": "user", "content": "Who is allergic to penicillin?"}, {"role": "assistant", "content": "M Reyes [S1]."}]
    ask("What else is in that chart?", history=history)
    assert "Earlier in this conversation" in model.calls[0][1]["content"]


# --- saved home thread ------------------------------------------------------


def test_home_thread_is_saved_and_continued(model):
    model.reply = {"answer": "x", "refused": False}
    assert c.get("/chat").json() is None
    sid = ask("first")["session_id"]
    assert sid and ask("second", session_id=sid)["session_id"] == sid
    thread = c.get("/chat").json()
    assert thread["id"] == sid and [m["content"] for m in thread["messages"] if m["role"] == "user"] == ["first", "second"]


def test_new_home_thread_replaces_the_old_one_but_audit_stays(model):
    model.reply = {"answer": "Penicillin [S1].", "refused": False}
    old = ask("penicillin allergy")["session_id"]
    new = ask("badge entry")["session_id"]
    assert new != old and c.get("/chat").json()["id"] == new
    assert any(e["reason"] == "Home chat (all folders): penicillin allergy" for e in c.get(f"/folders/{CHART}/audit").json())


def test_home_thread_is_not_a_folder_chat(model):
    model.reply = {"answer": "x", "refused": False}
    sid = ask("first")["session_id"]
    for f in (CASE, CHART):
        assert c.get(f"/folders/{f}/chats").json() == []
        assert c.get(f"/folders/{f}/chats/{sid}").status_code == 404
    assert c.get("/folders/*/chats").status_code == 404
    assert c.post("/ask", json={"question": "x", "session_id": "nope"}).status_code == 404
