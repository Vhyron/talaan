"""D1: voice notes become a create_draft proposal through the policy engine."""

import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.policy.grants import set_grants
from app.schemas import Grant, Grants
from app.transcribe import whisper
from app.transcribe.whisper import Segment, Transcript

c = TestClient(app)
F = "Lakbay-Logistics-Inc"
SPEECH = "Leo confirmed the agency helpers on September 11 were from Tulong Manpower Services."


@pytest.fixture
def fake_whisper(monkeypatch):
    calls = []

    def fake(path, hotwords=None):
        calls.append((path, hotwords))
        # Staged outside client folders. Compare against FOLDERS_DIR, not the word "folders":
        # macOS temp dirs live under /var/folders/.
        assert path.exists() and config.FOLDERS_DIR.resolve() not in path.resolve().parents
        return Transcript(text=SPEECH, segments=[Segment(0.0, 4.2, SPEECH)], duration=31.4, language="en", model="faster-whisper:small")

    monkeypatch.setattr(whisper, "transcribe_file", fake)
    return calls


def post(name="note.webm", data=b"audio"):
    return c.post(f"/folders/{F}/transcribe", files={"audio": (name, data)})


def test_transcript_becomes_pending_draft(fake_whisper, talaan_home):
    out = post().json()
    assert out["status"] == "pending" and out["action"] == "create_draft"
    assert out["path"].endswith(".md") and "_voice-note_" in out["path"]
    assert not (talaan_home / "folders" / F / out["path"]).exists()  # nothing written yet

    [p] = c.get(f"/folders/{F}/proposals").json()
    assert "Tulong Manpower Services" in p["new_content"]
    assert "**Duration:** 0:31" in p["new_content"] and "[0:00]" in p["new_content"]

    audit = c.get(f"/folders/{F}/audit").json()
    assert audit[0]["decision"] == "needs_approval" and audit[0]["model_tag"] == "faster-whisper:small"


def test_approving_saves_transcript(fake_whisper, talaan_home):
    out = post().json()
    assert c.post(f"/proposals/{out['proposal_id']}/approve").json()["status"] == "executed"
    assert SPEECH in (talaan_home / "folders" / F / out["path"]).read_text(encoding="utf-8")


def test_blocked_when_create_drafts_never(fake_whisper, talaan_home):
    set_grants(F, Grants(create_drafts=Grant.NEVER))
    out = post().json()
    assert out["status"] == "blocked" and "Create drafts is set to Never" in out["reason"]
    assert c.get(f"/folders/{F}/proposals").json() == []


@pytest.mark.parametrize("name", ["note.exe", "note.md", "note"])
def test_rejects_non_audio(fake_whisper, name):
    assert post(name).status_code == 415
    assert fake_whisper == []


def test_no_speech(monkeypatch):
    monkeypatch.setattr(whisper, "transcribe_file", lambda p, hotwords=None: Transcript("", [], 3.0, "en", "faster-whisper:small"))
    r = post()
    assert r.status_code == 422 and "No speech" in r.json()["detail"]


def test_undecodable_audio(monkeypatch):
    def boom(p, hotwords=None):
        raise ValueError("Invalid data found when processing input")
    monkeypatch.setattr(whisper, "transcribe_file", boom)
    assert post().status_code == 422


def test_hotwords_come_from_this_folder_only(fake_whisper):
    post()
    [(_, hotwords)] = fake_whisper
    assert "Bea Lim" in hotwords and "Leo Fernandez" in hotwords
    assert "Villanueva" not in hotwords and "Reyes" not in hotwords  # other clients


def test_unknown_folder(fake_whisper):
    assert c.post("/folders/nope/transcribe", files={"audio": ("a.wav", b"x")}).status_code == 404


def test_draft_names_do_not_collide(talaan_home):
    from datetime import datetime
    from app.transcribe import draft_name
    root = talaan_home / "folders" / F
    t = datetime(2026, 10, 3, 14, 5)
    first = draft_name(root, t)
    (root / first).write_text("x")
    assert first == "2026-10-03_voice-note_1405.md" and draft_name(root, t) == "2026-10-03_voice-note_1405-2.md"


def test_transcription_never_downloads(monkeypatch):
    """Normal use loads from the local cache only; only --download may fetch."""
    import faster_whisper

    seen = {}

    class FakeModel:
        def __init__(self, *a, **kw):
            seen.update(kw)
            raise OSError("not in cache")

    monkeypatch.setattr(faster_whisper, "WhisperModel", FakeModel)
    with pytest.raises(whisper.ModelNotDownloaded, match="--download"):
        whisper._load()
    assert seen["local_files_only"] is True


def test_language_is_chosen_only_from_allowed():
    # Whisper's guess on a short clip: Chinese first. We must pick English or Tagalog.
    probs = [("zh", 0.41), ("en", 0.22), ("tl", 0.30), ("ja", 0.07)]
    assert whisper.choose_language(probs, ["en", "tl"]) == "tl"
    assert whisper.choose_language(probs, ["en"]) == "en"
    assert whisper.choose_language([("zh", 1.0)], ["en", "tl"]) == "en"  # none ranked: first allowed


def test_too_short_recording_is_refused(monkeypatch, tmp_path):
    import numpy as np
    import faster_whisper.audio

    monkeypatch.setattr(faster_whisper.audio, "decode_audio", lambda *a, **k: np.zeros(int(0.8 * 16_000), dtype=np.float32))
    monkeypatch.setattr(whisper, "_load", lambda *a, **k: pytest.fail("model must not load for a too-short clip"))
    with pytest.raises(whisper.TooShort, match="too short"):
        whisper.transcribe_file(tmp_path / "x.webm")


def test_too_short_maps_to_friendly_422(monkeypatch):
    def short(p, hotwords=None):
        raise whisper.TooShort("The recording is too short (0.8s). Speak for at least a few seconds.")
    monkeypatch.setattr(whisper, "transcribe_file", short)
    r = post()
    assert r.status_code == 422 and r.json()["detail"].startswith("The recording is too short")


# --- Readiness check (shown by the recorder before recording) ----------------------


def test_voice_status_ready(monkeypatch):
    import faster_whisper.utils
    monkeypatch.setattr(faster_whisper.utils, "download_model", lambda *a, **k: "/cache/small")
    r = c.get("/system/voice").json()
    assert r == {"ready": True, "model": "small", "problem": None, "message": None, "fix": None}


def test_voice_status_model_missing_never_downloads(monkeypatch):
    import faster_whisper.utils
    seen = {}

    def not_cached(size, **kw):
        seen.update(kw)
        raise OSError("not in cache")

    monkeypatch.setattr(faster_whisper.utils, "download_model", not_cached)
    r = c.get("/system/voice").json()
    assert r["ready"] is False and r["problem"] == "model"
    assert "--download" in r["fix"] and "465 MB" in r["message"]
    assert seen["local_files_only"] is True  # the check itself never goes online


def test_voice_status_library_missing(monkeypatch):
    import builtins
    real_import = builtins.__import__

    def no_faster_whisper(name, *a, **k):
        if name.startswith("faster_whisper"):
            raise ImportError(name)
        return real_import(name, *a, **k)

    monkeypatch.setattr(builtins, "__import__", no_faster_whisper)
    r = whisper.status()
    assert r.ready is False and r.problem == "library" and r.fix == "cd backend; uv sync"
