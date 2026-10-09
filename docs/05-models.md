# 05 · Models per hardware tier

**Rule:** the same embedding model on every tier, so an index built on one machine works on any other and switching tiers never means re-indexing.

## Tiers

| Tier | Typical device | Chat model | Embeddings | Speech-to-text |
|---|---|---|---|---|
| Light | 8 GB RAM, no GPU | `qwen3.5:2b` (~2.7 GB) | `qwen3-embedding:0.6b` | faster-whisper `base` or `small` |
| **Standard** | 16 GB RAM, Apple Silicon 16 GB, or 8–10 GB GPU | **`gemma4:e4b`** (needs ~10 GB VRAM or 16 GB unified memory) | `qwen3-embedding:0.6b` | faster-whisper `small` |
| Pro | 32 GB unified or 16–24 GB GPU | `gemma4:26b` (mixture of experts, ~4B active parameters, so fast for its quality) | `qwen3-embedding:0.6b` | faster-whisper `large-v3-turbo` |

**Alternates for the bake-off:** `qwen3.5:4b` (Standard), `qwen3.5:9b` (Pro).

## Why these

- **Gemma 4:** native tool calling and structured JSON output, which our propose-then-approve flow needs. E2B/E4B accept images and audio; E4B has 128K context.
- **Qwen3.5 small series** (0.8B, 2B, 4B, 9B): native tool calling, thinking mode, multimodal in Ollama.
- **qwen3-embedding:0.6b:** 100+ languages, 32K context, ~639 MB download, fits every tier. EmbeddingGemma is lighter but caps input at 2K tokens, too short for long hearing minutes.
- **faster-whisper** over Gemma's built-in audio: more predictable, gives timestamps, clear size steps per tier.

## Features per tier

| Feature | Light | Standard | Pro |
|---|---|---|---|
| Search and short answers with sources | Yes | Yes | Yes |
| Timeline with contradictions | Risky | Yes | Yes |
| Read images (certificates, stills) | No | Yes | Yes |
| Long multi-document reports | No | Limited | Yes |

## Bake-off (first hour, on the demo laptop)

1. Pull `gemma4:e4b`, `qwen3.5:4b`, `qwen3-embedding:0.6b`.
2. Run the 9 ground-truth questions in `demo-data/README.md` through both chat models.
3. Score: correct answer, correct source file, valid JSON on action calls, seconds per answer.
4. Pick the winner and **pin the exact tag. No model changes after midnight.**

## Gotchas

- **Set `num_ctx` explicitly** on every request. Ollama's default context is small and long prompts are silently truncated.
- **Thinking mode off for action calls.** It slows responses and can break strict JSON. Keep it only for the timeline if it helps.
- **Memory with several models loaded:** on Light, transcribe first, unload Whisper, then answer.
- **Never change the embedding model** without re-indexing every folder.
- **Disclose every model tag** in the submission.

## Model switching (in the app)

Pinned tags live in one place: `backend/app/llm/models.py` (tier table + bake-off alternates). The app picks the chat model in this order:

1. `CHAT_MODEL` env var (dev override, must be a pinned tag)
2. The user's choice (`PUT /system/model`), saved in `app.db`
3. The detected tier's model, if installed
4. The largest installed pinned model that fits this machine, then any installed pinned model

- `GET /system/tier` reports RAM/GPU, recommended tier, the active model and every pinned option (installed / fits / active).
- `PUT /system/model {"chat_model": "qwen3.5:4b"}` switches (unloads the old model, loads the new one); `{"chat_model": null}` returns to automatic. Unpinned or not-installed tags are rejected. A model above the machine's tier is allowed but reported as `fits: false`.
- The **embedding model is not switchable**: same tag on every tier, so indexes stay valid.
- Every answer logs the exact `model_tag`, so the audit log shows which model produced it.
- Measured on an 8 GB M2: embeddings at `num_ctx` 8192 evicted the chat model; at 2048 both stay loaded on the GPU.

## LLM activity log

Every model call (chat, embed, load, unload) prints one line to the backend terminal and shows on the **Settings** page (`/settings`, or click the model chip in the top bar): model, `num_ctx`, prompt → output tokens, tokens/s, load time, total time, JSON validity, errors. Warns when a prompt fills ≥90% of `num_ctx`. Prompt/response text is off by default (it contains client files); when turned on it is kept in memory only. API: `GET /system/llm-log?after=<id>`, `DELETE /system/llm-log`, `GET/PUT /system/settings`.

## Tier detection (P2)

On first run: read total RAM and GPU presence → map to Light / Standard / Pro → `ollama pull` that tier's models → show which features are available.
