# B1 · Ollama client and model bake-off

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track B | P0 | 2h | — | B3, B4, B5, D7 |

## Goal
A thin local LLM client and a pinned chat model, chosen by testing on the demo laptop before midnight.

## Tasks
- [x] Pull `gemma4:e4b`, `qwen3.5:4b`, `qwen3-embedding:0.6b` on the demo laptop (8 GB M2: `qwen3.5:2b`, `qwen3.5:4b`, embeddings; `gemma4:e4b` doesn't fit, needs a 16 GB machine)
- [x] `llm/client.py` using Ollama's native API (per-request `num_ctx`; see docs/05) with a configurable base URL:
  - [x] `chat(messages, schema=None, think=False)`: **always set `num_ctx`**, thinking off for JSON
  - [x] `embed(texts) -> list[list[float]]`
  - [x] Return the model tag with every response (for the audit log)
- [x] Quick bake-off script: run the 9 ground-truth questions from [demo-data/README.md](../demo-data/README.md) with naive context (whole folder in the prompt is fine here)
- [x] Score: correct answer, correct source file, valid JSON on an action call, seconds per answer
- [x] Pin the winner's exact tag in `config.py` and [docs/05-models.md](../docs/05-models.md); tell D for the disclosure list

## Done when
The chat and embedding tags are pinned **before 12:00 AM Oct 10**, with the bake-off results noted in docs/05.

## Notes
No model changes after midnight. Record real numbers only; no invented benchmarks.

## Outcome (2026-10-09)
- Pinned per tier in `backend/app/llm/models.py`, documented in [docs/05](../docs/05-models.md#pinned-tags); tags + digests in the disclosure list ([docs/06](../docs/06-demo-and-pitch.md)).
- Bake-off on 8 GB M2: `qwen3.5:2b` 21/27, 4.2 s median; `qwen3.5:4b` 24/27, 31 s median. `gemma4:e4b` untested (needs 16 GB).
- Beyond scope: in-app model switching by hardware tier (backend half of D7), Settings page, LLM activity log.
- Lessons for B4/B5: answer and action need separate calls; thinking off (2b with thinking timed out on Q2); 2b misses Q2, so B5 needs a dedicated contradiction prompt.
