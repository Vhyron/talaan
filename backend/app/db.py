"""app.db: grants, audit log, proposals, chat sessions.

Lives in TALAAN_HOME, outside every client folder. The model has no tool that reaches it.
"""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager

from app import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS grants (
    folder_id     TEXT PRIMARY KEY,
    read          TEXT NOT NULL,
    suggest_edits TEXT NOT NULL,
    create_drafts TEXT NOT NULL,
    "delete"      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    folder_id TEXT NOT NULL,
    actor     TEXT NOT NULL CHECK (actor IN ('user', 'model')),
    event     TEXT NOT NULL,
    action    TEXT,
    path      TEXT,
    decision  TEXT,
    reason    TEXT,
    model_tag TEXT
);
CREATE INDEX IF NOT EXISTS audit_folder ON audit (folder_id, id);
CREATE TABLE IF NOT EXISTS proposals (
    id          TEXT PRIMARY KEY,
    folder_id   TEXT NOT NULL,
    action      TEXT NOT NULL,  -- JSON of the validated Action
    status      TEXT NOT NULL,
    reason      TEXT NOT NULL DEFAULT '',
    old_content TEXT,
    new_content TEXT,
    old_mtime   REAL,
    created_at  TEXT NOT NULL,
    decided_at  TEXT
);
CREATE INDEX IF NOT EXISTS proposals_folder ON proposals (folder_id, status);
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_sessions (
    id           TEXT PRIMARY KEY,
    folder_id    TEXT NOT NULL,
    title        TEXT NOT NULL,
    title_source TEXT NOT NULL DEFAULT 'question',  -- question | model | user
    scope        TEXT,  -- subfolder the chat was started from; NULL is the whole Space
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_sessions_folder ON chat_sessions (folder_id, updated_at);
CREATE TABLE IF NOT EXISTS chat_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    folder_id  TEXT NOT NULL,
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content    TEXT NOT NULL,
    response   TEXT,  -- AskResponse JSON for assistant turns
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_messages_session ON chat_messages (session_id, id);
CREATE TABLE IF NOT EXISTS trash (
    id          TEXT PRIMARY KEY,
    folder_id   TEXT NOT NULL,
    folder_name TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('file', 'dir', 'folder')),
    path        TEXT NOT NULL,  -- where it was, folder-relative ('' for a whole folder)
    name        TEXT NOT NULL,
    deleted_at  TEXT NOT NULL
);
DROP TABLE IF EXISTS conversations;  -- the old single-thread table, never written
"""


def _drop_presession_chats(conn: sqlite3.Connection) -> None:
    """A pre-release chat_messages without sessions (a `scope` column; never on dev) would break
    SCHEMA's index on session_id: drop it first so SCHEMA recreates it."""
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(chat_messages)")}
    if cols and "session_id" not in cols:
        conn.execute("DROP TABLE chat_messages")


def _migrate(conn: sqlite3.Connection) -> None:
    """Columns added after a table first shipped (CREATE TABLE IF NOT EXISTS won't add them)."""
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(audit)")}
    if "session_id" not in cols:
        conn.execute("ALTER TABLE audit ADD COLUMN session_id TEXT")
    if "scope" not in {r["name"] for r in conn.execute("PRAGMA table_info(chat_sessions)")}:
        conn.execute("ALTER TABLE chat_sessions ADD COLUMN scope TEXT")


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    """One short-lived connection per call; commits on success."""
    config.TALAAN_HOME.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.APP_DB)
    conn.row_factory = sqlite3.Row
    try:
        _drop_presession_chats(conn)
        conn.executescript(SCHEMA)
        _migrate(conn)
        yield conn
        conn.commit()
    finally:
        conn.close()
