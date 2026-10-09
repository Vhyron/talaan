import os
from pathlib import Path

# Root that holds every client folder, plus app.db outside all of them.
TALAAN_HOME = Path(os.environ.get("TALAAN_HOME", Path.home() / "Talaan")).expanduser().resolve()
FOLDERS_DIR = TALAAN_HOME / "folders"
APP_DB = TALAAN_HOME / "app.db"

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
# Optional dev override. Normally the chat model is picked by hardware tier or on the Setup page;
# pinned tags (B1 bake-off, 2026-10-09) live in app/llm/models.py. The embedding model is fixed there too (never per machine).
CHAT_MODEL = os.environ.get("CHAT_MODEL") or None
NUM_CTX = int(os.environ.get("NUM_CTX", "16384"))
