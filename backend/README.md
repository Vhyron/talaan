# Talaan backend

FastAPI app. Every AI call goes to a local Ollama; nothing leaves the laptop.

```bash
uv sync
uv run uvicorn app.main:app --reload   # http://localhost:8000/docs
uv run pytest
```

Config via environment variables (see `app/config.py`): `TALAAN_HOME` (default `~/Talaan`), `OLLAMA_BASE_URL`, `CHAT_MODEL`, `EMBED_MODEL`, `NUM_CTX`.

The API contract lives in `app/schemas.py`. Announce changes to the team before merging.
