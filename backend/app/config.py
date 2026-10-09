import os
from pathlib import Path

# Root that holds every client folder, plus app.db outside all of them.
TALAAN_HOME = Path(os.environ.get("TALAAN_HOME", Path.home() / "Talaan")).expanduser().resolve()
FOLDERS_DIR = TALAAN_HOME / "folders"
APP_DB = TALAAN_HOME / "app.db"

# 127.0.0.1, not localhost: on Windows localhost tries IPv6 first and adds ~2 s per call.
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
# Optional dev override. Normally the chat model is picked by hardware tier or on the Settings page;
# pinned tags (B1 bake-off, 2026-10-09) live in app/llm/models.py. The embedding model is fixed there too (never per machine).
CHAT_MODEL = os.environ.get("CHAT_MODEL") or None
NUM_CTX = int(os.environ.get("NUM_CTX", "16384"))
# How long Ollama keeps the chat and embedding models loaded after a call while the app runs.
# -1 = until the app stops (it hands them back to Ollama's 5m default on shutdown). Ollama duration or seconds.
_ka = os.environ.get("MODEL_KEEP_ALIVE", "-1")
MODEL_KEEP_ALIVE: int | str = int(_ka) if _ka.lstrip("-").isdigit() else _ka
# Dev/demo: stream every chat call to the backend terminal as it runs (status, thinking, answer, timings).
# LLM_LIVE_PROMPT=1 also prints the full prompt (and turns the live log on).
# Terminal only: nothing reaches the UI, the trace or disk. Prints client file text, so opt-in.
LLM_LIVE_PROMPT = os.environ.get("LLM_LIVE_PROMPT") == "1"
LLM_LIVE_LOG = os.environ.get("LLM_LIVE_LOG") == "1" or LLM_LIVE_PROMPT

# faster-whisper size: base / small / large-v3-turbo per tier (docs/05-models.md)
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
# Languages a voice note may be in. Whisper picks the likeliest of these; it never
# guesses outside them (short clips otherwise get "detected" as e.g. Chinese).
# "en,tl" covers English, Tagalog and Taglish. Use a single code to force one.
WHISPER_LANGUAGES = [c.strip() for c in os.environ.get("WHISPER_LANGUAGES", "en,tl").split(",") if c.strip()]
