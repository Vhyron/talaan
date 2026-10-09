"""A3: grants and audit log in app.db."""

import importlib

from fastapi.testclient import TestClient

from app.audit import log_event
from app.main import app

c = TestClient(app)
F = "Lakbay-Logistics-Inc"
DEFAULTS = {"read": "allow", "suggest_edits": "needs_approval", "create_drafts": "needs_approval", "delete": "never",
            "home_chat": False}


def test_home_chat_toggle_is_logged():
    assert c.put(f"/folders/{F}/grants", json={**DEFAULTS, "home_chat": True}).json()["home_chat"] is True
    assert c.get(f"/folders/{F}/grants").json()["home_chat"] is True
    [ev] = [e for e in c.get(f"/folders/{F}/audit").json() if e["action"] == "home_chat"]
    assert (ev["actor"], ev["event"], ev["decision"]) == ("user", "grant_change", "on")


def test_default_grants():
    assert c.get(f"/folders/{F}/grants").json() == DEFAULTS


def test_new_folder_stores_defaults(talaan_home):
    folder = c.post("/folders", json={"name": "Chart X", "mode": "chart"}).json()
    assert c.get(f"/folders/{folder['id']}/grants").json() == DEFAULTS


def test_grants_persist_and_are_logged():
    new = {**DEFAULTS, "suggest_edits": "never"}
    assert c.put(f"/folders/{F}/grants", json=new).json() == new

    # A fresh import of the app reads the same value back from app.db.
    import app.main
    fresh = TestClient(importlib.reload(app.main).app)
    assert fresh.get(f"/folders/{F}/grants").json() == new

    events = c.get(f"/folders/{F}/audit").json()
    assert events[0]["event"] == "grant_change" and events[0]["actor"] == "user"
    assert events[0]["action"] == "suggest_edits" and events[0]["decision"] == "never"


def test_grants_reject_unknown_values():
    assert c.put(f"/folders/{F}/grants", json={**DEFAULTS, "delete": "always"}).status_code == 422


def test_grants_are_per_folder():
    c.put(f"/folders/{F}/grants", json={**DEFAULTS, "read": "never"})
    assert c.get("/folders/Santos-Family-Clinic/grants").json() == DEFAULTS


def test_audit_newest_first_and_scoped():
    log_event(F, "user", "question", reason="first")
    log_event(F, "model", "proposed_action", action="delete", path="x.md", model_tag="gemma4:e4b")
    log_event("Santos-Family-Clinic", "user", "question", reason="other folder")
    events = c.get(f"/folders/{F}/audit").json()
    assert [e["event"] for e in events] == ["proposed_action", "question"]


def test_audit_export():
    log_event(F, "model", "decision", action="delete", path="x.md", decision="never", reason="Delete is set to Never")
    j = c.get(f"/folders/{F}/audit/export?format=json")
    assert j.headers["content-disposition"].endswith('.json"') and j.json()[0]["decision"] == "never"
    csv = c.get(f"/folders/{F}/audit/export?format=csv").text.splitlines()
    assert csv[0].startswith("id,timestamp,folder_id,actor,event") and "Delete is set to Never" in csv[1]


def test_app_db_is_outside_every_folder(talaan_home):
    log_event(F, "user", "question")
    assert (talaan_home / "app.db").is_file()
    assert not list((talaan_home / "folders").rglob("app.db"))
