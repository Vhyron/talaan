"""Per-folder index: extraction and chunking (B2); storage and retrieval (B3)."""

from app.index.chunk import Chunk, chunk_file
from app.index.extract import INDEXED_TYPES, extract
from app.index.store import (
    Hit,
    all_chunks,
    build_index,
    contains,
    in_scope,
    file_chunks,
    index_version,
    refresh,
    retrieve,
    search_text,
)

__all__ = [
    "INDEXED_TYPES", "Chunk", "Hit", "all_chunks", "build_index", "chunk_file", "contains", "extract", "file_chunks", "in_scope",
    "index_version", "refresh", "retrieve", "search_text",
]
