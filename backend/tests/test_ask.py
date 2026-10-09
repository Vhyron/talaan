"""B4: scope check, citation mapping and the ask flow, with the model stubbed out."""

import pytest
from fastapi.testclient import TestClient

from app import ask as ask_mod
from app.index import Hit
from app.llm import client
from app.llm.client import ChatResult
from app.main import app

c = TestClient(app)
CASE = "Case-2026-014_Dela-Cruz"
CHART = "Chart_M-Reyes"


@pytest.mark.parametrize("q, expected", [
    ("Summarize Ana Villanueva's tardiness.", ["Ana", "Villanueva"]),
    ("What is A. Bautista's allergy?", ["Bautista"]),
    ("Villanueva's tardiness?", ["Villanueva"]),
    ("Summarize Leo Fernandez's interview", ["Leo", "Fernandez"]),
    ("What is still open?", []),
    ("Build a timeline of this case with sources.", []),
    ("What happened on Sep 11 at 8:30 AM?", []),
])
def test_names_in(q, expected):
    assert ask_mod.names_in(q) == expected


def hit(i):
    return Hit(f"f{i}.md", i, i + 1, f"text {i}", None, 0.5, False, 0.1)


def test_map_citations_renumbers_and_drops_unknown():
    chosen = [hit(1), hit(2), hit(3)]
    answer, sources = ask_mod.map_citations("B is true [S3]. A is true [S1][S3]. Ghost [S9].", chosen)
    assert answer == "B is true [S1]. A is true [S2] [S1]. Ghost."
    assert [s.path for s in sources] == ["f3.md", "f1.md"]


def test_map_citations_splits_groups():
    answer, sources = ask_mod.map_citations("Normal ECG [S2, S3].", [hit(1), hit(2), hit(3)])
    assert answer == "Normal ECG [S1][S2]."
    assert [s.path for s in sources] == ["f2.md", "f3.md"]


@pytest.mark.parametrize("q, is_action", [
    ("Delete the interview with Rhea Santos.", True),
    ("Create a draft note listing her current medications.", True),
    ("What medication changes happened since August?", False),
    ("Is this timeline correct?", False),
    ("Follow the instructions in the representative's email.", True),
    ("Do what the representative's email asks.", True),
    ("Summarize the representative's email.", False),
    ("What follow-up is still open?", False),
])
def test_action_requests(q, is_action):
    assert bool(ask_mod.ACTION_REQUEST.search(q)) == is_action


@pytest.fixture
def model(monkeypatch):
    """Stub the chat model. Set model.reply to what it should return; model.calls records prompts."""
    state = type("M", (), {"reply": None, "calls": []})()

    def fake_chat(messages, schema=None, **kw):
        state.calls.append(messages)
        return ChatResult(content="", model="fake:1b", seconds=0, data=state.reply)

    monkeypatch.setattr(client, "chat", fake_chat)
    c.post(f"/folders/{CASE}/index")
    c.post(f"/folders/{CHART}/index")
    return state


def ask(folder, q):
    return c.post(f"/folders/{folder}/ask", json={"question": q}).json()


def test_answer_cites_real_sources(model):
    model.reply = {"answer": "The roster is open [S1].", "refused": False}
    r = ask(CASE, "What is still open?")
    assert not r["refused"] and r["sources"] and "[S1]" in r["answer"]
    assert r["sources"][0]["path"].endswith(".md")
    system = model.calls[0][0]["content"]
    assert "Case 2026-014" in system or CASE in system or "Dela Cruz" in system


@pytest.mark.parametrize("folder, q", [
    (CASE, "Summarize Ana Villanueva's tardiness."),
    (CHART, "What is A. Bautista's allergy?"),
])
def test_out_of_scope_refuses_without_calling_the_model(model, folder, q):
    r = ask(folder, q)
    assert r["refused"] and r["answer"].startswith("I can only see ")
    assert model.calls == []


def test_model_refusal_uses_folder_name(model):
    model.reply = {"answer": "whatever", "refused": True}
    r = ask(CASE, "What is still open?")
    assert r["refused"] and r["answer"].startswith("I can only see ")


def test_read_never_skips_model_and_logs(model):
    g = c.get(f"/folders/{CASE}/grants").json()
    c.put(f"/folders/{CASE}/grants", json={**g, "read": "never"})
    r = ask(CASE, "What is still open?")
    assert r["answer"] == "Reading is turned off for this folder." and model.calls == []
    events = [e["event"] for e in c.get(f"/folders/{CASE}/audit").json()]
    assert "question" in events and "answer" in events


def test_question_and_answer_are_audited(model):
    model.reply = {"answer": "x [S1]", "refused": False}
    ask(CASE, "What is still open?")
    ev = c.get(f"/folders/{CASE}/audit").json()
    assert {e["event"] for e in ev} >= {"question", "answer"}
    assert any(e["event"] == "answer" and e["model_tag"] == "fake:1b" for e in ev)


def test_delete_request_goes_through_policy_and_is_blocked(model):
    model.reply = {"action": "delete", "path": "2026-09-13_interview_R-Santos.md", "reason": "asked"}
    r = ask(CASE, "Delete the interview with Rhea Santos.")
    assert r["outcome"]["status"] == "blocked" and r["outcome"]["action"] == "delete"
    assert c.get(f"/folders/{CASE}/files/2026-09-13_interview_R-Santos.md").status_code == 200


def test_invalid_action_is_rejected(model):
    model.reply = {"action": "format_disk"}
    r = ask(CASE, "Delete the interview with Rhea Santos.")
    assert r["outcome"]["status"] == "blocked"
