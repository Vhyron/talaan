from fastapi.testclient import TestClient

from app.llm import trace
from app.main import app

c = TestClient(app)
OLLAMA = {"prompt_eval_count": 15000, "eval_count": 50, "eval_duration": 2_000_000_000, "load_duration": 1_500_000_000}


def setup_function():
    trace.clear()


def test_records_numbers_but_not_text_by_default(monkeypatch):
    monkeypatch.delenv("LLM_LOG_PROMPTS", raising=False)
    trace.record("chat", "qwen3.5:2b", ollama=OLLAMA, seconds=4.2, num_ctx=16384, prompt="secret case file", response="answer")
    [call] = c.get("/system/llm-log").json()
    assert call["prompt_tokens"] == 15000 and call["tokens_per_s"] == 25.0 and call["load_s"] == 1.5
    assert call["prompt"] is None and call["response"] is None
    assert "context limit" in call["warning"]


def test_text_kept_when_on_and_forgotten_when_turned_off(monkeypatch):
    monkeypatch.delenv("LLM_LOG_PROMPTS", raising=False)
    assert c.put("/system/settings", json={"log_prompts": True}).json() == {"log_prompts": True}
    trace.record("chat", "qwen3.5:2b", ollama=OLLAMA, seconds=1, prompt="p", response="r")
    assert c.get("/system/llm-log").json()[0]["prompt"] == "p"
    c.put("/system/settings", json={"log_prompts": False})
    assert c.get("/system/llm-log").json()[0]["prompt"] is None


def test_after_returns_only_newer_and_clear_empties():
    first = trace.record("embed", "qwen3-embedding:0.6b", seconds=0.1, inputs=2)
    trace.record("embed", "qwen3-embedding:0.6b", seconds=0.1, inputs=3)
    assert [x["inputs"] for x in c.get(f"/system/llm-log?after={first.id}").json()] == [3]
    assert c.delete("/system/llm-log").status_code == 204
    assert c.get("/system/llm-log").json() == []


def test_invalid_json_and_errors_are_flagged():
    trace.record("chat", "m", seconds=1, json_valid=False)
    trace.record("chat", "m", seconds=1, error="Model m is not installed.")
    bad_json, err = c.get("/system/llm-log").json()
    assert bad_json["warning"] == "output was not valid JSON"
    assert err["ok"] is False and "not installed" in err["error"]
