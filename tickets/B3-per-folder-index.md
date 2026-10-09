# B3 · Per-folder index and retrieval

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track B | P0 | 2h | B1, B2 | B4, B5, D3 |

## Goal
One SQLite index per folder. Retrieval physically cannot reach another folder.

## Tasks
- [x] `index/store.py`: `<folder>/.talaan/index.db` with `chunks(id, path, start, end, text, hash, embedding BLOB)` + FTS5 table
- [x] `build_index(folder_id)`: extract → chunk → embed → store; incremental by file hash
- [x] `POST /folders/{id}/index` builds or refreshes; import (A2) triggers a refresh
- [x] `retrieve(folder_id, query, k=8)`: hybrid of FTS5 BM25 + cosine similarity (numpy), merged and deduplicated
- [x] Return relevance scores so B4 can tell when nothing relevant was found
- [x] Test: with both HR cases indexed, a Villanueva query from inside Case 2026-014 returns nothing from Case 2026-019

## Done when
Retrieval on the demo folders returns the expected source files for Q2, Q3, Q6, Q7 and Q8, and the cross-folder test passes.

## Notes
The `retrieve` signature takes a `folder_id`, never a path or a list of folders.

## Outcome (2026-10-09)
- `app/index/store.py`: `<folder>/.talaan/index.db` with `files`, `chunks` (embedding as float32 blob) and an FTS5 table (porter stemming). `build_index` is incremental by file hash, and unchanged chunks keep their embedding. Changing the embedding model re-embeds everything.
- If Ollama is down, the build still stores chunks and keyword search (`pending_embeddings`), and `retrieve` falls back to keywords (`similarity: None`).
- `retrieve(folder_id, query, k=8)` returns `Hit(path, start_line, end_line, text, page, similarity, keyword, score)`: cosine similarity + BM25 merged by reciprocal rank fusion. `k=None` returns every chunk, ranked.
- `contains(folder_id, phrase)` checks a phrase word for word in the folder, for B4's name check.
- `index_version(folder_id)` changes whenever the content does, for B5's cache.
- Re-indexing: `POST /index`, after import, and after every executed write (`engine.execute`, docs/03 rule 6). The policy engine's `search` action now uses the index.
- Measured with `qwen3-embedding:0.6b` (live tests in `tests/test_index.py`): Q3, Q5, Q6, Q7 and Q8 put every expected file in the top 2. Indexing all 4 demo folders takes ~5 s and a query ~0.06 s.
- **Q2 doesn't work as a lookup:** with every prompt variant tried, the medical certificate ranks 8th–10th of 10. **B4/B5: send the whole folder (`k=None`) when it fits `num_ctx`.** The demo case is ~1.5k tokens. The test is marked `xfail` with this reason.
- **For B4's threshold:** the best similarity for answerable questions was 0.46–0.67. For Q4 (Villanueva, from Case 2026-014) it was 0.44, with no keyword hits. The gap is thin, so the name check (`contains`) has to do most of the work. Q9 ("A. Bautista") has a keyword hit on "allergy", so only the name check catches it.
- Added `numpy` (disclosure list updated). The hermetic tests use a fake embedder (`tests/conftest.py`); tests marked `live` use Ollama and skip without it.
