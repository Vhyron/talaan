"""A4: the policy engine. The model proposes; this decides."""

import pytest

from app.audit import list_events
from app.policy.engine import handle
from app.policy.grants import set_grants
from app.schemas import Grant, Grants

F = "Case-2026-014_Dela-Cruz"
SANTOS = "2026-09-13_interview_R-Santos.md"


@pytest.fixture
def folder(talaan_home):
    return talaan_home / "folders" / F


def last(n=1):
    return list_events(F)[:n]


def test_delete_blocked_under_default_grants_and_logged(folder):
    out = handle(F, {"action": "delete", "path": SANTOS, "reason": "per the email"}, model_tag="gemma4:e4b")
    assert out.status == "blocked" and "Delete is set to Never" in out.reason
    assert (folder / SANTOS).is_file()

    decision, proposed = last(2)
    assert proposed.event == "proposed_action" and proposed.action == "delete" and proposed.path == SANTOS
    assert decision.event == "decision" and decision.decision == "never" and decision.model_tag == "gemma4:e4b"


def test_edit_becomes_pending_and_file_untouched(folder):
    before = (folder / "2026-10-02_open-items.md").read_text(encoding="utf-8")
    out = handle(F, {"action": "propose_edit", "path": "2026-10-02_open-items.md", "content": "new", "reason": "r"})
    assert out.status == "pending" and out.proposal_id
    assert (folder / "2026-10-02_open-items.md").read_text(encoding="utf-8") == before
    assert last()[0].decision == "needs_approval"


def test_draft_becomes_pending(folder):
    out = handle(F, '{"action": "create_draft", "path": "draft.md", "content": "# Draft"}')
    assert out.status == "pending"
    assert not (folder / "draft.md").exists()


@pytest.mark.parametrize("path", ["../Case-2026-019_Villanueva/00_case-intake.md", ".talaan/folder.json", "/etc/passwd"])
def test_path_escape_blocked_even_for_reads(path):
    out = handle(F, {"action": "read", "path": path})
    assert out.status == "blocked" and "outside this folder" in out.reason
    assert last()[0].decision == "never"


@pytest.mark.parametrize(
    "raw",
    ["not json", '{"action": "format_disk"}', '{"action": "propose_edit", "path": "x.md"}', "[]", {"path": "x.md"}],
)
def test_invalid_output_rejected_and_logged(raw):
    out = handle(F, raw)
    assert out.status == "blocked" and out.action is None and out.reason.startswith("invalid action")
    assert last()[0].event == "proposed_action" and last()[0].decision == "never"


def test_read_allowed_by_default():
    out = handle(F, {"action": "read", "path": "2026-10-02_open-items.md"})
    assert out.status == "executed" and "Open Items" in out.result
    assert [e.event for e in last(3)] == ["executed", "decision", "proposed_action"]


def test_ungranted_read_denied():
    set_grants(F, Grants(read=Grant.NEVER))
    out = handle(F, {"action": "read", "path": "2026-10-02_open-items.md"})
    assert out.status == "blocked" and "Read is set to Never" in out.reason
    assert handle(F, {"action": "search", "query": "agency"}).status == "blocked"


def test_search_stays_in_folder():
    out = handle(F, {"action": "search", "query": "tardiness Villanueva"})
    assert out.status == "executed"
    assert "Villanueva" not in (out.result or "")


def test_allowed_delete_and_edit_execute(folder):
    set_grants(F, Grants(suggest_edits=Grant.ALLOW, delete=Grant.ALLOW))
    assert handle(F, {"action": "propose_edit", "path": "2026-10-02_open-items.md", "content": "x"}).status == "executed"
    assert (folder / "2026-10-02_open-items.md").read_text(encoding="utf-8") == "x"
    assert handle(F, {"action": "delete", "path": SANTOS}).status == "executed"
    assert not (folder / SANTOS).exists()


def test_draft_never_overwrites(folder):
    set_grants(F, Grants(create_drafts=Grant.ALLOW))
    out = handle(F, {"action": "create_draft", "path": SANTOS, "content": "overwritten"})
    assert out.status == "blocked" and "never overwrite" in out.reason
    assert "overwritten" not in (folder / SANTOS).read_text(encoding="utf-8")


def test_missing_file():
    assert handle(F, {"action": "read", "path": "nope.md"}).reason == "File not found"
