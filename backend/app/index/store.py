"""Per-folder index (B3): <folder>/.talaan/index.db with chunks, embeddings and FTS5.

One index per folder makes sealing physical: retrieve() takes a folder_id, opens only
that folder's index.db, and so cannot return another client's text. `.talaan/` is never
listed or served (policy/paths.py), so the model can't reach the index itself.
"""

import hashlib
import re
import sqlite3
import threading
from collections import defaultdict
from collections.abc import Sequence
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from app import folders
from app.index.chunk import chunk_file
from app.index.extract import INDEXED_TYPES
from app.llm import client
from app.llm.client import OllamaError
from app.llm.models import EMBED_MODEL

EMBED_BATCH = 16
RRF_K = 60  # reciprocal rank fusion constant (the usual default)
# qwen3-embedding is instruction-aware: queries get a task prefix, documents don't.
QUERY_PREFIX = "Instruct: Given a question about a client's file, retrieve the passages that answer it\nQuery: "

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL,
    page INTEGER,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    text TEXT NOT NULL,
    hash TEXT NOT NULL,          -- of the chunk text: unchanged chunks keep their embedding
    embedding BLOB               -- float32, L2-normalised; NULL until embedded
);
CREATE INDEX IF NOT EXISTS chunks_path ON chunks (path);
CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5 (text, tokenize = 'porter unicode61 remove_diacritics 2');
"""

# Too common to say anything about relevance; dropped from keyword queries.
STOPWORDS = set("""a an and are as at be been but by can did do does for from had has have he her his how i if in
into is it its me my no not of on or our she so than that the their them then there these they this to was we
were what when where which who whom why will with would you your any anything about there's what's""".split())

_locks: defaultdict[str, threading.Lock] = defaultdict(threading.Lock)


@dataclass
class Hit:
    path: str
    start_line: int
    end_line: int
    text: str
    page: int | None
    similarity: float | None  # cosine similarity to the question; None if not embedded / Ollama down
    keyword: bool  # matched the keyword (FTS5) search
    score: float  # fused rank score; only for ordering, not comparable across queries


def _db(folder_id: str) -> sqlite3.Connection:
    meta_dir = folders.folder_root(folder_id) / ".talaan"
    meta_dir.mkdir(exist_ok=True)
    db = sqlite3.connect(meta_dir / "index.db")
    db.executescript(SCHEMA)
    return db


def _meta(db: sqlite3.Connection, key: str) -> str | None:
    row = db.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
    return row[0] if row else None


def _set_meta(db: sqlite3.Connection, key: str, value: str) -> None:
    db.execute("INSERT OR REPLACE INTO meta VALUES (?, ?)", (key, value))


def _sha(data: bytes | str) -> str:
    return hashlib.sha256(data.encode() if isinstance(data, str) else data).hexdigest()


def _drop(db: sqlite3.Connection, path: str) -> None:
    db.execute("DELETE FROM fts WHERE rowid IN (SELECT id FROM chunks WHERE path = ?)", (path,))
    db.execute("DELETE FROM chunks WHERE path = ?", (path,))
    db.execute("DELETE FROM files WHERE path = ?", (path,))


def _unit(vec: list[float]) -> np.ndarray:
    v = np.asarray(vec, dtype=np.float32)
    n = np.linalg.norm(v)
    return v / n if n else v


def _embed_input(path: str, text: str) -> str:
    # File names carry the date and document type ("2026-09-11_medical-certificate").
    return f"{path}\n{text}"


def _embed_pending(db: sqlite3.Connection) -> tuple[int, str | None]:
    """Embed chunks that have no embedding yet. Returns (still pending, error)."""
    rows = db.execute("SELECT id, path, text FROM chunks WHERE embedding IS NULL ORDER BY id").fetchall()
    for i in range(0, len(rows), EMBED_BATCH):
        batch = rows[i : i + EMBED_BATCH]
        try:
            vectors = client.embed([_embed_input(p, t) for _, p, t in batch]).vectors
        except OllamaError as e:
            return len(rows) - i, str(e)
        db.executemany("UPDATE chunks SET embedding = ? WHERE id = ?",
                       [(_unit(v).tobytes(), cid) for (cid, _, _), v in zip(batch, vectors)])
        db.commit()
    return 0, None


def build_index(folder_id: str) -> dict:
    """Build or refresh this folder's index. Incremental: only files whose bytes changed are
    re-chunked, and chunks whose text didn't change keep their embedding.

    Never fails because Ollama is down: chunks and keyword search are stored anyway, and the
    missing embeddings are filled in on the next build (`pending_embeddings`, `error`).
    """
    with _locks[folder_id], closing(_db(folder_id)) as db:
        if _meta(db, "embed_model") not in (None, EMBED_MODEL):
            db.execute("UPDATE chunks SET embedding = NULL")  # different vector space: re-embed everything
        _set_meta(db, "embed_model", EMBED_MODEL)

        on_disk: dict[str, Path] = {}
        for entry in folders.list_files(folder_id):  # sealed listing: no .talaan/, no escaping symlinks
            if Path(entry.path).suffix.lower() in INDEXED_TYPES:
                on_disk[entry.path] = folders.file_path(folder_id, entry.path)
        known = dict(db.execute("SELECT path, hash FROM files").fetchall())

        changed, errors = 0, []
        removed = sorted(known.keys() - on_disk.keys())
        for path in removed:
            _drop(db, path)
        for path, file in on_disk.items():
            file_hash = _sha(file.read_bytes())
            if known.get(path) == file_hash:
                continue
            kept = dict(db.execute("SELECT hash, embedding FROM chunks WHERE path = ? AND embedding IS NOT NULL",
                                   (path,)).fetchall())
            _drop(db, path)
            try:
                chunks = chunk_file(file, path)
            except Exception as e:  # e.g. a damaged PDF: index the rest of the folder
                chunks = []
                errors.append(f"{path}: {e}")
            for c in chunks:
                text_hash = _sha(c.text)
                cid = db.execute(
                    "INSERT INTO chunks (path, page, start_line, end_line, text, hash, embedding) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (path, c.page, c.start_line, c.end_line, c.text, text_hash, kept.get(text_hash)),
                ).lastrowid
                db.execute("INSERT INTO fts (rowid, text) VALUES (?, ?)", (cid, _embed_input(path, c.text)))
            db.execute("INSERT INTO files VALUES (?, ?)", (path, file_hash))
            changed += 1
        if changed or removed:
            _set_meta(db, "version", str(int(_meta(db, "version") or 0) + 1))
        db.commit()

        pending, error = _embed_pending(db)
        if error:
            errors.append(error)
        return {
            "files": len(on_disk),
            "chunks": db.execute("SELECT COUNT(*) FROM chunks").fetchone()[0],
            "changed": changed,
            "removed": len(removed),
            "pending_embeddings": pending,
            "version": int(_meta(db, "version") or 0),
            "errors": errors,
        }


def index_version(folder_id: str) -> int:
    """Bumps whenever the folder's indexed content changes (for caching, e.g. the B5 timeline)."""
    with closing(_db(folder_id)) as db:
        return int(_meta(db, "version") or 0)


def _terms(text: str) -> list[str]:
    return [w for w in re.findall(r"\w+", text.lower()) if len(w) > 2 and w not in STOPWORDS]


def _keyword_ids(db: sqlite3.Connection, query: str, limit: int) -> list[int]:
    terms = _terms(query)
    if not terms:
        return []
    match = " OR ".join(f'"{t}"' for t in terms)  # quoted: no FTS syntax from the user's text
    return [r[0] for r in db.execute("SELECT rowid FROM fts WHERE fts MATCH ? ORDER BY rank LIMIT ?", (match, limit))]


def in_scope(path: str, only: Sequence[str] | None) -> bool:
    """`only` is a chat scope inside the Space: Space-relative subfolders and files. None is the
    whole Space."""
    return only is None or any(path == p or path.startswith(p + "/") for p in only)


def contains(folder_id: str, phrase: str, only: Sequence[str] | None = None) -> bool:
    """Whether this folder's text (within `only`) contains the phrase (word for word, any case).
    For the scope check (B4): a name in the question that appears nowhere in scope means refuse."""
    words = re.findall(r"\w+", phrase.lower())
    if not words:
        return False
    with closing(_db(folder_id)) as db:
        rows = db.execute("SELECT c.path FROM fts JOIN chunks c ON c.id = fts.rowid WHERE fts MATCH ?",
                          (f'"{" ".join(words)}"',))
        return any(in_scope(path, only) for (path,) in rows)


def retrieve(folder_id: str, query: str, k: int | None = 8, only: Sequence[str] | None = None) -> list[Hit]:
    """The k best chunks for `query` from this folder only: embedding similarity (numpy) and
    FTS5 BM25, merged by reciprocal rank fusion and deduplicated by chunk. k=None returns
    every chunk, ranked: for small folders and questions that need the whole file set
    ("does anything contradict the allegation?" is reasoning, not lookup).

    Takes a folder_id, never a path or a list of folders; `only` narrows it to a chat scope
    inside that folder. If Ollama is down it falls back to keyword search alone (similarity None).
    """
    with closing(_db(folder_id)) as db:
        rows = {r[0]: r for r in db.execute("SELECT id, path, page, start_line, end_line, text, embedding FROM chunks")
                if in_scope(r[1], only)}
        if not rows:
            return []
        everything, k = k is None, len(rows) if k is None else k
        keyword = [cid for cid in _keyword_ids(db, query, 4 * k if only else 2 * k) if cid in rows][: 2 * k]

    sims: dict[int, float] = {}
    embedded = [r for r in rows.values() if r[6] is not None]
    if embedded:
        try:
            q = _unit(client.embed([QUERY_PREFIX + query]).vectors[0])
        except OllamaError:
            q = None
        if q is not None:
            # Vectors of another size come from a different embedder (a stale index): skip them
            # here (keyword search still finds those chunks) and clear them so the next build
            # re-embeds them.
            stale = [r[0] for r in embedded if len(r[6]) != q.nbytes]
            if stale:
                with _locks[folder_id], closing(_db(folder_id)) as db:
                    db.execute("UPDATE chunks SET embedding = NULL WHERE length(embedding) != ?", (q.nbytes,))
                    db.commit()
                embedded = [r for r in embedded if len(r[6]) == q.nbytes]
        if q is not None and embedded:
            matrix = np.frombuffer(b"".join(r[6] for r in embedded), dtype=np.float32).reshape(len(embedded), -1)
            sims = {r[0]: float(s) for r, s in zip(embedded, matrix @ q)}

    fused: defaultdict[int, float] = defaultdict(float)
    for rank, cid in enumerate(sorted(sims, key=sims.__getitem__, reverse=True)[: 2 * k]):
        fused[cid] += 1 / (RRF_K + rank + 1)
    for rank, cid in enumerate(keyword):
        fused[cid] += 1 / (RRF_K + rank + 1)

    hits = []
    unranked = [cid for cid in rows if cid not in fused] if everything else []
    for cid in (sorted(fused, key=fused.__getitem__, reverse=True) + unranked)[:k]:
        _, path, page, start, end, text, _ = rows[cid]
        hits.append(Hit(path, start, end, text, page, sims.get(cid), cid in keyword, fused[cid]))
    return hits


def all_chunks(folder_id: str, only: Sequence[str] | None = None) -> list[Hit]:
    """Every chunk of this folder (within `only`) in reading order (file, page, line), for
    whole-folder tasks like the B5 timeline. Unranked: similarity None, score 0."""
    with closing(_db(folder_id)) as db:
        rows = db.execute("SELECT path, start_line, end_line, text, page FROM chunks"
                          " ORDER BY path, COALESCE(page, 0), start_line, id").fetchall()
    return [Hit(path, start, end, text, page, None, False, 0.0) for path, start, end, text, page in rows
            if in_scope(path, only)]


def file_chunks(folder_id: str, path: str) -> list[Hit]:
    """Every chunk of one file in this folder, in reading order: for "summarize this note"."""
    with closing(_db(folder_id)) as db:
        rows = db.execute("SELECT path, start_line, end_line, text, page FROM chunks WHERE path = ?"
                          " ORDER BY COALESCE(page, 0), start_line, id", (path,)).fetchall()
    return [Hit(p, start, end, text, page, None, False, 0.0) for p, start, end, text, page in rows]


def search_text(folder_id: str, query: str, k: int = 8) -> str:
    """`search` action result: the best passages, each tagged with file and lines."""
    return "\n\n".join(f"[{h.path}:{h.start_line}-{h.end_line}]\n{h.text}" for h in retrieve(folder_id, query, k))


def refresh(folder_id: str) -> None:
    """Best-effort re-index after a write; never fails the write that triggered it."""
    try:
        build_index(folder_id)
    except Exception as e:  # noqa: BLE001 - the write already happened; the next build retries
        print(f"[index] refresh of {folder_id} failed: {e}")
