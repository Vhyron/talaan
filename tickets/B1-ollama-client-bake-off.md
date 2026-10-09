# B1 · Ollama client and model bake-off

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track B | P0 | 2h | — | B3, B4, B5, D7 |

## Goal
A thin local LLM client and a pinned chat model, chosen by testing on the demo laptop before midnight.

## Tasks
- [ ] Pull `gemma4:e4b`, `qwen3.5:4b`, `qwen3-embedding:0.6b` on the demo laptop
- [x] `llm/client.py` using Ollama's native API (per-request `num_ctx`; see docs/05) with a configurable base URL:
  - `chat(messages, schema=None, think=False)`: **always set `num_ctx`**, thinking off for JSON
  - `embed(texts) -> list[list[float]]`
  - Return the model tag with every response (for the audit log)
- [x] Quick bake-off script: run the 9 ground-truth questions from [demo-data/README.md](../demo-data/README.md) with naive context (whole folder in the prompt is fine here)
- [x] Score: correct answer, correct source file, valid JSON on an action call, seconds per answer
- [ ] Pin the winner's exact tag in `config.py` and [docs/05-models.md](../docs/05-models.md); tell D for the disclosure list

## Done when
The chat and embedding tags are pinned **before 12:00 AM Oct 10**, with the bake-off results noted in docs/05.

## Notes
No model changes after midnight. Record real numbers only; no invented benchmarks.
