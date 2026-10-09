"""A1 contract check: every route answers and matches its response model."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas import ActionAdapter

c = TestClient(app)
F = "Case-2026-014_Dela-Cruz"


def test_every_route_responds():
    assert c.get("/folders").status_code == 200
    assert c.post("/folders", json={"name": "Case 2026-020", "mode": "case"}).status_code == 201
    assert c.get(f"/folders/{F}/files").status_code == 200
    assert c.get(f"/folders/{F}/files/2026-10-02_open-items.md").status_code == 200
    assert c.post(f"/folders/{F}/import", files={"files": ("a.md", b"# hi")}).status_code == 200
    assert c.post(f"/folders/{F}/index").status_code == 200
    assert c.get(f"/folders/{F}/grants").json()["delete"] == "never"
    assert c.get(f"/folders/{F}/proposals").status_code == 200
    assert c.get(f"/folders/{F}/audit").status_code == 200
    assert c.get(f"/folders/{F}/audit/export?format=csv").text.startswith("id,")
    assert c.get("/system/tier").status_code == 200


def test_unknown_folder_404():
    assert c.get("/folders/nope/files").status_code == 404




def test_action_schema():
    assert ActionAdapter.validate_python({"action": "delete", "path": "x.md"}).action == "delete"
    with pytest.raises(ValidationError):
        ActionAdapter.validate_python({"action": "format_disk"})
    with pytest.raises(ValidationError):
        ActionAdapter.validate_python({"action": "propose_edit", "path": "x.md"})  # missing content
