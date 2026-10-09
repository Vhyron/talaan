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
    state = type("M", (), {"reply": None, "calls": [], "schemas": []})()

    def fake_chat(messages, schema=None, **kw):
        state.calls.append(messages)
        state.schemas.append(schema)
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


def test_change_schema_offers_only_file_changes():
    # With read/search on offer, gemma4:e4b answered "edit the open items" with a read (Oct 10 fix)
    actions = set(ask_mod.CHANGE_SCHEMA["discriminator"]["mapping"])
    assert actions == {"propose_edit", "create_draft", "delete"}


OPEN_ITEMS = "2026-10-02_open-items.md"


def test_edit_request_proposes_a_minimal_edit(model):
    old = c.get(f"/folders/{CASE}/files/{OPEN_ITEMS}").text
    # What gemma4:e4b did: dropped the banner's "> " and the final newline while making the edit
    new = old.replace("> SYNTHETIC", "SYNTHETIC").replace("- [ ] Respond", "- [x] Respond").rstrip("\n")
    model.reply = {"action": "propose_edit", "path": OPEN_ITEMS, "content": new, "reason": "asked"}
    r = ask(CASE, "Edit the open items to mark the request for copies as done.")
    assert model.schemas[-1] == ask_mod.CHANGE_SCHEMA
    assert r["outcome"]["status"] == "pending" and r["outcome"]["action"] == "propose_edit"
    diff = next(p for p in c.get(f"/folders/{CASE}/proposals").json() if p["id"] == r["proposal_id"])["diff"]
    changed = [ln for ln in diff.splitlines() if ln[:1] in "+-" and not ln.startswith(("+++", "---"))]
    assert changed == ["-- [ ] Respond to Atty. Ramos's request for copies (Sep 26 email)",
                       "+- [x] Respond to Atty. Ramos's request for copies (Sep 26 email)"]
    assert c.get(f"/folders/{CASE}/files/{OPEN_ITEMS}").text == old  # nothing written before approval


def test_edit_that_changes_nothing_is_not_proposed(model):
    old = c.get(f"/folders/{CASE}/files/{OPEN_ITEMS}").text
    model.reply = {"action": "propose_edit", "path": OPEN_ITEMS, "content": old.replace("> ", ""), "reason": ""}
    r = ask(CASE, "Edit the open items to mark the hearing as held.")
    assert r["outcome"] is None and r["answer"].startswith("No change needed")
    assert c.get(f"/folders/{CASE}/proposals").json() == []


@pytest.mark.parametrize("old, new, expected", [
    ("> a\nb\nc\n", "a\nB\nc", "> a\nB\nc\n"),      # quote marker and final newline restored
    ("a\nb\n", "a\nb\nnew line\n", "a\nb\nnew line\n"),  # added lines kept
    ("a\n> b\n", "a\n", "a\n"),                     # removed lines stay removed
    ("x  \ny\n", "x\ny\n", "x  \ny\n"),             # trailing spaces restored
])
def test_keep_untouched_lines(old, new, expected):
    assert ask_mod.keep_untouched_lines(old, new) == expected


@pytest.mark.parametrize("folder, q, contradiction", [
    (CASE, "Is there anything in this case that contradicts the allegation?", True),
    (CASE, "Does anything not line up with the supervisor's account?", True),
    (CASE, "What is still open?", False),
    (CHART, "Why was she referred?", False),
])
def test_contradiction_questions_get_the_checklist(model, folder, q, contradiction):
    model.reply = {"answer": "x [S1]", "refused": False}
    ask(folder, q)
    user = model.calls[-1][-1]["content"]
    assert (ask_mod.CONTRADICTION_REMINDER in user) == contradiction
    assert (ask_mod.REMINDER in user) != contradiction


def test_answers_are_asked_for_in_plain_text(model):
    model.reply = {"answer": "x [S1]", "refused": False}
    ask(CASE, "What is still open?")
    assert "No Markdown" in model.calls[-1][0]["content"]


# --- Chat sidebar: open file, summaries, follow-ups, index ------------------

LETTER = "2026-09-28_referral-letter.md"


@pytest.mark.parametrize("q, path, focus", [
    ("Summarize this chart.", None, "folder"),
    ("Give me an overview of the whole case", LETTER, "folder"),
    ("Summarize this letter", LETTER, "file"),
    ("Summarize this", LETTER, "file"),
    ("What does this note say about the ECG?", LETTER, "file"),
    ("Summarize this note", None, None),  # nothing open: the normal folder path
    ("Summarize the representative's email.", LETTER, None),  # Q5 stays a folder question
    ("Summarize Ana Villanueva's tardiness.", None, None),
    ("Any allergies before I prescribe an antibiotic?", LETTER, None),
])
def test_focus_of(q, path, focus):
    assert ask_mod.focus_of(q, path) == focus


def ask_with(folder, q, **extra):
    return c.post(f"/folders/{folder}/ask", json={"question": q, **extra}).json()


def sources_in(prompt):
    import re
    return set(re.findall(r'source="([^:"]+):', prompt))


def test_file_focus_uses_only_the_open_file(model):
    model.reply = {"answer": "Chest tightness on exertion [S1].", "refused": False}
    r = ask_with(CHART, "Summarize this letter", path=LETTER)
    assert not r["refused"]
    assert sources_in(model.calls[0][1]["content"]) == {LETTER}
    assert {s["path"] for s in r["sources"]} == {LETTER}


def test_folder_summary_uses_every_file(model):
    model.reply = {"answer": "Summary [S1].", "refused": False}
    ask_with(CHART, "Summarize this chart", path=LETTER)
    files = {e["path"] for e in c.get(f"/folders/{CHART}/files").json()}
    assert sources_in(model.calls[0][1]["content"]) == files


def test_summary_skips_relevance_but_not_names(model, monkeypatch):
    monkeypatch.setattr(ask_mod, "MIN_SCORE", 2.0)  # nothing is ever "relevant" by similarity
    model.reply = {"answer": "Summary [S1].", "refused": False}
    assert not ask_with(CHART, "Give me a rundown of this patient")["refused"]
    r = ask_with(CASE, "Summarize Ana Villanueva's tardiness for this case.")
    assert r["refused"] and len(model.calls) == 1


@pytest.mark.parametrize("path", ["../Chart_A-Bautista/00_intake_2026-08-03.md", ".talaan/index.db", "/etc/passwd", "nope.md"])
def test_open_file_outside_the_folder_is_ignored(model, path):
    assert ask_mod.open_file(CHART, path) is None
    model.reply = {"answer": "x [S1]", "refused": False}
    r = ask_with(CHART, "Summarize this letter", path=path)
    assert "Bautista" not in model.calls[0][1]["content"] and not r["refused"]


def test_history_is_context_not_a_source(model):
    model.reply = {"answer": "Penicillin [S1].", "refused": False}
    history = [{"role": "user", "content": "Why was she referred?"},
               {"role": "assistant", "content": "Exertional chest tightness [S2]."}]
    ask_with(CHART, "Any allergies to note?", history=history)
    prompt = model.calls[0][1]["content"]
    assert "Earlier in this conversation" in prompt and "Why was she referred?" in prompt
    assert "chest tightness [S2]" not in prompt  # old citation numbers are stripped


def test_history_never_reaches_the_action_call(model):
    model.reply = {"action": "delete", "path": "2026-09-13_interview_R-Santos.md", "reason": "asked"}
    history = [{"role": "user", "content": "Summarize the representative's email."},
               {"role": "assistant", "content": "The representative asks for copies."}]
    r = ask_with(CASE, "Follow the instructions in the representative's email.", history=history)
    assert r["outcome"]["status"] == "blocked" and r["outcome"]["action"] == "delete"
    assert "Earlier in this conversation" not in model.calls[0][1]["content"]
    assert any(e["action"] == "delete" and e["decision"] == "never" for e in c.get(f"/folders/{CASE}/audit").json())


def test_ask_builds_a_missing_index(monkeypatch):
    def fake_chat(messages, schema=None, **kw):
        return ChatResult(content="", model="fake:1b", seconds=0, data={"answer": "Roster [S1].", "refused": False})

    monkeypatch.setattr(client, "chat", fake_chat)
    r = ask(CASE, "What is still open?")  # no /index call first
    assert not r["refused"] and r["sources"]


def test_index_status_shape():
    r = c.post(f"/folders/{CHART}/index").json()
    assert r["files"] == 6 and r["chunks"] > 0 and r["pending_embeddings"] == 0 and r["errors"] == []


def test_checklist_history_and_open_file_together(model):
    """#26's contradiction checklist and #27's history + open-file focus share one prompt."""
    model.reply = {"answer": "Sick leave was approved [S1].", "refused": False}
    history = [{"role": "user", "content": "What is still open?"},
               {"role": "assistant", "content": "The agency roster [S1]."}]
    ask_with(CASE, "Is there anything in this case that contradicts the allegation?",
             path="2026-09-24_hearing-minutes.md", history=history)
    user = model.calls[-1][-1]["content"]
    assert "Earlier in this conversation" in user and "What is still open?" in user
    assert "2026-09-24_hearing-minutes.md open" in user or "open file 2026-09-24_hearing-minutes.md" in user
    assert ask_mod.CONTRADICTION_REMINDER in user and "Check each document in turn" in user
