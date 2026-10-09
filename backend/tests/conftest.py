import shutil
from pathlib import Path

import pytest

from app import config

DEMO = Path(__file__).resolve().parents[2] / "demo-data"


@pytest.fixture(autouse=True)
def talaan_home(tmp_path, monkeypatch):
    """Fresh ~/Talaan per test, seeded with the demo Spaces."""
    folders = tmp_path / "folders"
    for src in DEMO.iterdir():
        if src.is_dir():
            shutil.copytree(src, folders / src.name)
    monkeypatch.setattr(config, "TALAAN_HOME", tmp_path)
    monkeypatch.setattr(config, "FOLDERS_DIR", folders)
    monkeypatch.setattr(config, "APP_DB", tmp_path / "app.db")
    return tmp_path


def _fake_embed(texts):
    """Deterministic bag-of-words vectors, so tests never call Ollama."""
    import hashlib
    import re

    from app.llm.client import EmbedResult

    vectors = []
    for t in texts:
        v = [0.0] * 256
        for w in re.findall(r"[a-z]{3,}", t.lower()):
            v[int(hashlib.md5(w.encode()).hexdigest(), 16) % 256] += 1.0
        vectors.append(v)
    return EmbedResult(vectors=vectors, model="fake-embed")


@pytest.fixture(autouse=True)
def fake_embedder(request, monkeypatch):
    """Tests marked `live` use the real embedding model through Ollama instead."""
    if request.node.get_closest_marker("live") is None:
        from app.llm import client

        monkeypatch.setattr(client, "embed", _fake_embed)
