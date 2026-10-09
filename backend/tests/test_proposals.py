"""A5: proposals wait for the user; only approval executes them."""

import os

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.policy.engine import handle
from app.policy.grants import set_grants
from app.schemas import Grant, Grants

c = TestClient(app)
F = "Lakbay-Logistics-Inc"
D = "Case 2026-014 Dela Cruz"
ITEMS = f"{D}/2026-10-02_open-items.md"


@pytest.fixture
def folder(talaan_home):
    return talaan_home / "folders" / F


def propose_edit(folder, extra="\n- [ ] Agency: Tulong Manpower Services\n"):
    old = (folder / ITEMS).read_text(encoding="utf-8")
    out = handle(F, {"action": "propose_edit", "path": ITEMS, "content": old + extra, "reason": "From the Oct 3 call"})
    assert out.status == "pending"
    return out.proposal_id, old


def test_pending_edit_listed_with_diff(folder):
    pid, _ = propose_edit(folder)
    [p] = c.get(f"/folders/{F}/proposals").json()
    assert p["id"] == pid and p["status"] == "pending" and p["reason"] == "From the Oct 3 call"
    assert "+- [ ] Agency: Tulong Manpower Services" in p["diff"]
    assert p["diff"].startswith(f"--- a/{ITEMS}")


def test_draft_diff_against_nothing():
    handle(F, {"action": "create_draft", "path": "notes/draft.md", "content": "# Draft\n"})
    [p] = c.get(f"/folders/{F}/proposals").json()
    assert p["old_content"] is None and p["diff"].startswith("--- /dev/null")


def test_approve_writes_file_and_logs(folder):
    pid, old = propose_edit(folder)
    out = c.post(f"/proposals/{pid}/approve").json()
    assert out["status"] == "executed"
    assert "Tulong" in (folder / ITEMS).read_text(encoding="utf-8")
    assert c.get(f"/folders/{F}/proposals").json() == []

    events = c.get(f"/folders/{F}/audit").json()
    assert [(e["actor"], e["event"], e["decision"]) for e in events[:2]] == [
        ("user", "executed", None), ("user", "decision", "approved"),
    ]


def test_approve_draft_creates_file(folder):
    pid = handle(F, {"action": "create_draft", "path": "2026-10-03_call.md", "content": "# Call\n"}).proposal_id
    assert c.post(f"/proposals/{pid}/approve").json()["status"] == "executed"
    assert (folder / "2026-10-03_call.md").read_text(encoding="utf-8") == "# Call\n"


def test_reject_leaves_file_untouched(folder):
    pid, old = propose_edit(folder)
    out = c.post(f"/proposals/{pid}/reject").json()
    assert out["status"] == "blocked" and out["reason"] == "Rejected by you"
    assert (folder / ITEMS).read_text(encoding="utf-8") == old
    assert c.get(f"/folders/{F}/audit").json()[0]["decision"] == "rejected"


def test_cannot_decide_twice(folder):
    pid, _ = propose_edit(folder)
    c.post(f"/proposals/{pid}/reject")
    assert c.post(f"/proposals/{pid}/approve").status_code == 409
    assert c.post(f"/proposals/{pid}/reject").status_code == 409


def test_stale_when_file_changed(folder):
    pid, _ = propose_edit(folder)
    (folder / ITEMS).write_text("someone else edited this", encoding="utf-8")
    st = (folder / ITEMS).stat()
    os.utime(folder / ITEMS, (st.st_atime, st.st_mtime + 5))
    out = c.post(f"/proposals/{pid}/approve").json()
    assert out["status"] == "blocked" and "changed" in out["reason"]
    assert (folder / ITEMS).read_text(encoding="utf-8") == "someone else edited this"


def test_stale_when_draft_target_now_exists(folder):
    pid = handle(F, {"action": "create_draft", "path": "new.md", "content": "model"}).proposal_id
    (folder / "new.md").write_text("mine", encoding="utf-8")
    assert c.post(f"/proposals/{pid}/approve").json()["status"] == "blocked"
    assert (folder / "new.md").read_text(encoding="utf-8") == "mine"


def test_grant_revoked_before_approval(folder):
    pid, old = propose_edit(folder)
    set_grants(F, Grants(suggest_edits=Grant.NEVER))
    out = c.post(f"/proposals/{pid}/approve").json()
    assert out["status"] == "blocked" and "Never" in out["reason"]
    assert (folder / ITEMS).read_text(encoding="utf-8") == old


def test_unknown_proposal():
    assert c.post("/proposals/nope/approve").status_code == 404
