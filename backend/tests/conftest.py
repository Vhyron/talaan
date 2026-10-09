import shutil
from pathlib import Path

import pytest

from app import config

DEMO = Path(__file__).resolve().parents[2] / "demo-data"


@pytest.fixture(autouse=True)
def talaan_home(tmp_path, monkeypatch):
    """Fresh ~/Talaan per test, seeded with the demo folders."""
    folders = tmp_path / "folders"
    for group in ("hr", "clinic"):
        for src in (DEMO / group).iterdir():
            shutil.copytree(src, folders / src.name)
    monkeypatch.setattr(config, "TALAAN_HOME", tmp_path)
    monkeypatch.setattr(config, "FOLDERS_DIR", folders)
    monkeypatch.setattr(config, "APP_DB", tmp_path / "app.db")
    return tmp_path
