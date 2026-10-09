# B3 · Per-folder index and retrieval

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track B | P0 | 2h | B1, B2 | B4, B5, D3 |

## Goal
One SQLite index per folder. Retrieval physically cannot reach another folder.

## Tasks
- [ ] `index/store.py`: `<folder>/.talaan/index.db` with `chunks(id, path, start, end, text, hash, embedding BLOB)` + FTS5 table
- [ ] `build_index(folder_id)`: extract → chunk → embed → store; incremental by file hash
- [ ] `POST /folders/{id}/index` builds or refreshes; import (A2) triggers a refresh
- [ ] `retrieve(folder_id, query, k=8)`: hybrid of FTS5 BM25 + cosine similarity (numpy), merged and deduplicated
- [ ] Return relevance scores so B4 can tell when nothing relevant was found
- [ ] Test: with both HR cases indexed, a Villanueva query from inside Case 2026-014 returns nothing from Case 2026-019

## Done when
Retrieval on the demo folders returns the expected source files for Q2, Q3, Q6, Q7 and Q8, and the cross-folder test passes.

## Notes
The `retrieve` signature takes a `folder_id`, never a path or a list of folders.
