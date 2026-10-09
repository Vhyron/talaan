# Talaan backend

FastAPI app. Every AI call goes to a local Ollama; nothing leaves the laptop.

```bash
uv sync
uv run uvicorn app.main:app --reload   # http://localhost:8000/docs
uv run pytest
uv run python -m scripts.bakeoff --runs 3   # model bake-off (needs Ollama + models), see docs/09-runbook.md
```

Config via environment variables (see `app/config.py`): `TALAAN_HOME` (default `~/Talaan`), `OLLAMA_BASE_URL`, `CHAT_MODEL` (optional override), `NUM_CTX`, `LLM_LOG_PROMPTS`.

Models: pinned tags per tier in `app/llm/models.py`; the active chat model is chosen by `app/llm/selection.py` (hardware tier, Settings page choice, or `CHAT_MODEL`). All model calls go through `app/llm/client.py` and are logged by `app/llm/trace.py`.

The API contract lives in `app/schemas.py`. Announce changes to the team before merging.
