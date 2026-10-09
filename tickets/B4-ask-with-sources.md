# B4 · Ask with sources and scope refusal

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track B | P0 | 2.5h | B3, A4 | B6, D4, C3 |

## Goal
`POST /folders/{id}/ask` answers from this folder only, with clickable citations, or refuses.

## Tasks
- [ ] Retrieve chunks → build prompt with chunks tagged `[S1] path:lines`, wrapped as untrusted document text
- [ ] System prompt: answer only from sources, cite `[S#]`, flag contradictions for human review, never decide
- [ ] Map `[S#]` citations back to `Source` objects in the response; drop citations that don't exist
- [ ] **Scope refusal:** low retrieval scores, or the question names a person not found in the folder → `refused: true`, answer "I can only see <folder name>."
- [ ] Action path: let the model optionally return an `Action` JSON (structured output); pass it to `policy.handle()` (A4) and return the outcome in the response
- [ ] Log `question`, `answer` and the model tag via A3

## Done when
Q3, Q6, Q7 and Q8 answer correctly with the right sources; Q4 and Q9 refuse.

## Handoff notes (2026-10-09, after B3)

**Start from `dev` with B3 merged (PR #18).** B4 needs `app/index` (`retrieve`, `contains`). Read the B3 ticket's Outcome first.

**Retrieval**
- `index.retrieve(folder_id, question, k=8)` returns `Hit(path, start_line, end_line, text, page, similarity, keyword, score)`. A `Source` is `path`, `start=start_line`, `end=end_line`, `snippet` = a short excerpt of `text`.
- **Send the whole folder when it fits `num_ctx`** (`k=None`, every chunk, ranked). Q2 ("anything that contradicts the allegation?") can't be found by lookup: the medical certificate ranks 8th–10th of 10. The demo case is ~1.5k tokens, so the whole folder always fits. Use top-k only for big folders.
- Tag each chunk `[S1] path:start-end` and wrap the chunks as untrusted document text (docs/03). HTML comments are kept on purpose: Q5's injection must reach the model.

**Scope refusal (runs in code before the model is called)**
- Measured with the real embedder: the best similarity for answerable questions was 0.46–0.67. Q4 (Villanueva, from Case 2026-014) scored 0.44 with **no keyword hits**. Q9 (A. Bautista) has a keyword hit on "allergy". The threshold alone is too thin.
- So the **name check does most of the work**: pull the names out of the question and refuse if `index.contains(folder_id, name)` is False for any of them. Refusal text comes from the folder: `f"I can only see {folder.name}."`
- **Don't reuse `_NAME` from `app/transcribe/__init__.py` as is:**
  - It misses "A. Bautista" (an initial plus a surname: Q9).
  - It swallows a capitalised first word: "Summarize Leo Fernandez's interview" would give "Summarize Leo Fernandez" and wrongly refuse.
  - Handle initials, strip `'s`, ignore the question's first word and common capitalised words, and check each name (or surname) separately.
- The threshold check: best similarity < `MIN_SCORE` **and** no keyword hits → refuse. 0.45 fits the measurements. Make it a constant and note it in docs/03.

**Model calls**
- **Start from the prompts in `scripts/bakeoff.py`.** Use `SYSTEM` + `SCHEMA` for answers and `ACTION_SYSTEM` + `ActionAdapter.json_schema()` for actions. Thinking off, through `app/llm/client.py` (`chat(messages, schema=...)` returns `.data` and `.model`).
- **Answering and acting need separate calls** (B1): with one schema for both, every action request came back as a refusal. Only make the action call when the question asks for an action, e.g. "draft…", "delete…", "edit…". Pass the action to `policy.engine.handle(folder_id, action, model_tag=...)` and return the `Outcome`.
- Map `[S#]` in the answer back to `Source` objects, and drop numbers that don't exist.
- Read set to Never → don't retrieve or call the model. Answer "Reading is turned off for this folder" and still log the question (docs/03).
- Log `question` (actor user) and `answer` (actor model, `model_tag`) with `app.audit.log_event`. The `conversations` table in `app.db` exists but nothing uses it yet; it's optional.
- Remove the fixture branch in the `ask` route (`main.py`) and anything in `app/fixtures.py` that B4 no longer needs. C3 already renders `AskResponse`.

**Models on the dev machine** (32 GB RAM, GTX 1050 Ti 4 GB)
- The active chat model is `gemma4:e4b`, but as a saved Settings choice (`source: user` in `~/Talaan/app.db`), not tier detection. Tier detection says Pro (`gemma4:26b`, not installed). Check the Settings page before measuring.
- Tune for `gemma4:e4b`: it's the only tested model that finds Q2 (PR #17). `qwen3.5:2b` misses Q2 and leaves "ECG" out of Q8. Both models split CPU/GPU on 4 GB; ~9 s median per answer.

**Done-when check:** `uv run scripts/seed_demo.py --reset`, start the backend, then `uv run scripts/acceptance.py`. It checks keywords per question (Q8 needs "chest" and "ECG", Q6 "metformin", "1,000" and "atorvastatin"), refusals for Q4/Q9, sealing, and Q5's blocked delete. Neither model proposed a delete on Q5 in the bake-offs, so Q5's blocked delete depends on B6's fallback.

**Open decisions**
- PDF citations: `Source` has no page field. Either add `page: int | None` to `schemas.py` and `frontend/src/api/types.ts` (heads-up to the team, then FileViewer opens `#page=N`), or cite PDFs by file only.
