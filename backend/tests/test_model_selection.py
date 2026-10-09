import pytest

from app import config
from app.llm import client, selection
from app.system.tier import Hardware

M2_8GB = Hardware(ram_gb=8, gpu="Apple Silicon (unified memory)", vram_gb=0, free_disk_gb=20)
MAC_16GB = Hardware(ram_gb=16, gpu="Apple Silicon (unified memory)", vram_gb=0, free_disk_gb=50)
PC_RTX_16GB = Hardware(ram_gb=16, gpu="RTX 4080 (16 GB)", vram_gb=16, free_disk_gb=200)
ALL = ["qwen3.5:2b", "qwen3.5:4b", "gemma4:e4b", "gemma4:26b", "qwen3-embedding:0.6b"]


@pytest.fixture(autouse=True)
def no_env_override(monkeypatch):
    monkeypatch.setattr(config, "CHAT_MODEL", None)


@pytest.mark.parametrize(("hw", "tag"), [(M2_8GB, "qwen3.5:2b"), (MAC_16GB, "gemma4:e4b"), (PC_RTX_16GB, "gemma4:26b")])
def test_auto_picks_tier_model(hw, tag):
    assert selection.resolve(hw, ALL) == selection.Active(tag, "auto")


def test_falls_back_to_largest_installed_that_fits():
    # 16 GB Mac, Standard's gemma4:e4b not pulled: use the Standard alternate before dropping to Light.
    assert selection.resolve(MAC_16GB, ["qwen3.5:2b", "qwen3.5:4b"]).tag == "qwen3.5:4b"


def test_too_big_installed_model_still_used_when_nothing_fits():
    assert selection.resolve(M2_8GB, ["qwen3.5:4b"]).tag == "qwen3.5:4b"


def test_nothing_installed_points_at_recommended():
    assert selection.resolve(M2_8GB, []).tag == "qwen3.5:2b"


def test_user_choice_wins_and_persists():
    selection._save_choice("qwen3.5:4b")
    assert selection.resolve(M2_8GB, ALL) == selection.Active("qwen3.5:4b", "user")
    selection._save_choice(None)
    assert selection.resolve(M2_8GB, ALL).source == "auto"


def test_user_choice_ignored_once_uninstalled():
    selection._save_choice("qwen3.5:4b")
    assert selection.resolve(M2_8GB, ["qwen3.5:2b"]).tag == "qwen3.5:2b"


def test_env_override_must_be_pinned(monkeypatch):
    monkeypatch.setattr(config, "CHAT_MODEL", "qwen3.5:4b")
    assert selection.resolve(M2_8GB, ALL) == selection.Active("qwen3.5:4b", "env")
    monkeypatch.setattr(config, "CHAT_MODEL", "llama3:70b")
    assert selection.resolve(M2_8GB, ALL).source == "auto"


def test_choose_rejects_unpinned_and_uninstalled(monkeypatch):
    monkeypatch.setattr(client, "installed_models", lambda: ["qwen3.5:2b"])
    with pytest.raises(selection.ModelChoiceError, match="not a pinned model"):
        selection.choose("llama3:70b")
    with pytest.raises(selection.ModelChoiceError, match="ollama pull qwen3.5:4b"):
        selection.choose("qwen3.5:4b")


def test_choose_unloads_old_and_loads_new(monkeypatch):
    calls = []
    monkeypatch.setattr(client, "installed_models", lambda: ALL)
    monkeypatch.setattr(selection.hw_tier, "detect", lambda: M2_8GB)
    monkeypatch.setattr(client, "unload", lambda t: calls.append(("unload", t)))
    monkeypatch.setattr(client, "load", lambda t: calls.append(("load", t)))
    out = selection.choose("qwen3.5:4b")
    assert calls == [("unload", "qwen3.5:2b"), ("load", "qwen3.5:4b")]
    assert out.active_chat_model == "qwen3.5:4b" and out.active_source == "user"
    assert next(m for m in out.models if m.tag == "qwen3.5:4b").fits is False  # warned, not blocked
