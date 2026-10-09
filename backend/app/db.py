"""app.db: grants, audit log, proposals, conversations.

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
CREATE TABLE IF NOT EXISTS conversations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_id  TEXT NOT NULL,
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    """One short-lived connection per call; commits on success."""
    config.TALAAN_HOME.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.APP_DB)
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript(SCHEMA)
        yield conn
        conn.commit()
    finally:
        conn.close()
