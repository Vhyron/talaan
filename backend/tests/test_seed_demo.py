"""D3: the demo seed/reset script."""

import importlib.util
import json
from pathlib import Path

import pytest

from app.audit import list_events, log_event
from app.policy.engine import handle
from app.policy.grants import get_grants, set_grants
from app.policy.proposals import list_pending
from app.schemas import Grant, Grants

spec = importlib.util.spec_from_file_location("seed_demo", Path(__file__).parents[1] / "scripts" / "seed_demo.py")
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)

F = "Lakbay-Logistics-Inc"
D = "Case 2026-014 Dela Cruz"
SANTOS = f"{D}/2026-09-13_interview_R-Santos.md"
ITEMS = f"{D}/2026-10-02_open-items.md"
SPACES = ["Bayani-Retail-Corp", "Lakbay-Logistics-Inc", "Santos-Family-Clinic", "Talaan-Hackathon-Team"]


def run(*args):
    seed.main([*args, "--no-warm"])


def test_reset_restores_files(talaan_home):
    folder = talaan_home / "folders" / F
    original = (seed.DEMO_DATA / F / SANTOS).read_text(encoding="utf-8")
    (folder / SANTOS).unlink()
    (folder / ITEMS).write_text("edited in rehearsal", encoding="utf-8")
    (folder / D / "2026-10-03_call.md").write_text("approved draft", encoding="utf-8")

    run("--reset")

    assert (folder / SANTOS).read_text(encoding="utf-8") == original
    assert "Open Items" in (folder / ITEMS).read_text(encoding="utf-8")
    assert not (folder / D / "2026-10-03_call.md").exists()


def test_reset_clears_state_for_demo_folders_only(talaan_home):
    (talaan_home / "folders" / "Case-2026-099").mkdir()
    log_event("Case-2026-099", "user", "question", reason="keep me")
    set_grants(F, Grants(delete=Grant.ALLOW, read=Grant.NEVER))
    log_event(F, "user", "question")
    set_grants(F, Grants(create_drafts=Grant.NEEDS_APPROVAL))
    handle(F, {"action": "create_draft", "path": "x.md", "content": "x"})
    assert list_pending(F)

    run("--reset")

    assert get_grants(F) == Grants()
    assert list_events(F) == [] and list_pending(F) == []
    assert [e.reason for e in list_events("Case-2026-099")] == ["keep me"]
    assert (talaan_home / "folders" / "Case-2026-099").is_dir()


def test_reset_writes_folder_metadata(talaan_home):
    run("--reset")
    meta = json.loads((talaan_home / "folders" / "Santos-Family-Clinic" / ".talaan" / "folder.json").read_text(encoding="utf-8"))
    assert meta["name"] == "Santos Family Clinic"
    meta = json.loads((talaan_home / "folders" / F / ".talaan" / "folder.json").read_text(encoding="utf-8"))
    assert meta == {**meta, "name": "Lakbay Logistics Inc."}


def test_fresh_needs_confirmation(talaan_home):
    with pytest.raises(SystemExit):
        run("--fresh")
    assert (talaan_home / "folders" / F).is_dir()


def test_fresh_wipes_everything_then_seeds(talaan_home):
    (talaan_home / "folders" / "Case-2026-099").mkdir()
    log_event(F, "user", "question")
    run("--fresh", "--yes")
    names = sorted(p.name for p in (talaan_home / "folders").iterdir())
    assert names == SPACES
    assert list_events(F) == []


def test_fresh_refuses_unexpected_home(talaan_home):
    (talaan_home / "my-thesis.docx").write_text("not ours")
    with pytest.raises(SystemExit, match="Refusing to wipe"):
        run("--fresh", "--yes")
    assert (talaan_home / "my-thesis.docx").exists()


def test_reset_removes_legacy_demo_folders(talaan_home):
    for fid in seed.LEGACY:
        (talaan_home / "folders" / fid).mkdir()
        log_event(fid, "user", "question", reason="old demo")
    (talaan_home / "folders" / "Case-2026-099").mkdir()
    run("--reset")
    names = sorted(p.name for p in (talaan_home / "folders").iterdir())
    assert names == sorted([*SPACES, "Case-2026-099"])
    assert all(list_events(fid) == [] for fid in seed.LEGACY)
