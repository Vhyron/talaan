import os
from pathlib import Path

# Root that holds every client folder, plus app.db outside all of them.
TALAAN_HOME = Path(os.environ.get("TALAAN_HOME", Path.home() / "Talaan")).expanduser().resolve()
FOLDERS_DIR = TALAAN_HOME / "folders"
APP_DB = TALAAN_HOME / "app.db"

# 127.0.0.1, not localhost: on Windows localhost tries IPv6 first and adds ~2 s per call.
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
CHAT_MODEL = os.environ.get("CHAT_MODEL", "gemma4:e4b")  # pin after the B1 bake-off
EMBED_MODEL = os.environ.get("EMBED_MODEL", "qwen3-embedding:0.6b")
NUM_CTX = int(os.environ.get("NUM_CTX", "16384"))

# faster-whisper size: base / small / large-v3-turbo per tier (docs/05-models.md)
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
# Languages a voice note may be in. Whisper picks the likeliest of these; it never
# guesses outside them (short clips otherwise get "detected" as e.g. Chinese).
# "en,tl" covers English, Tagalog and Taglish. Use a single code to force one.
WHISPER_LANGUAGES = [c.strip() for c in os.environ.get("WHISPER_LANGUAGES", "en,tl").split(",") if c.strip()]
