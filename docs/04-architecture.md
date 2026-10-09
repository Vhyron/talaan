# 04 · Architecture and tech stack

Chosen for speed of building and ease of debugging over a 20-hour hackathon, not for familiarity.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | **Python + FastAPI** | All AI pieces are mature Python libraries: Ollama client, faster-whisper, PyMuPDF, numpy. FastAPI's auto-generated `/docs` page lets you call every endpoint by hand, so the AI and policy engine can be debugged without a UI and frontend/backend can be built in parallel. Pydantic defines the action schema once: sent to the model and used to validate its output |
| Frontend | **React + Vite + Tailwind** | Instant hot reload. The browser network tab shows every request and response, so bugs are easy to place on one side or the other |
| Model runtime | **Ollama** | Headless, one command per model, verbose logs with `OLLAMA_DEBUG=1`, `ollama ps` shows loaded models, JSON-schema-constrained output, embeddings endpoint. Code against its native API (`/api/chat`, `/api/embed`) with a configurable base URL: only the native API takes `num_ctx` and `think` per request, so long prompts are never silently truncated |
| Storage | **Plain Markdown files + one SQLite file per folder** | SQLite full-text search for keywords, embeddings stored as blobs, similarity computed with numpy. No vector DB service to crash; any `.db` opens in a SQLite viewer; deleting a client = deleting one folder |
| PDF text | PyMuPDF | Fast, reliable text extraction |
| Transcription | faster-whisper | Runs on CPU, int8, timestamps |
| Python env | **uv** | Locked, fast installs; judges reproduce in a few commands |
| Delivery | **Localhost web app** | Rules don't require packaging, only reproduction instructions |

### Rejected

| Option | Why not |
|---|---|
| Tauri | Rust compile times and debugging the Rust/web bridge |
| Electron | Packaging overhead; Node lacks the Python AI libraries, so we'd still run a Python process |
| Streamlit / Gradio | Rerun-on-interaction model makes multi-step approval flows hard to debug; limited UI hurts demo quality |
| Forking marka.md | "Pre-existing project" is a dispute trigger; must be substantially built during the hackathon |

## What the index does

The index lets the app find the right passages fast. Each document is split into chunks; each chunk gets a keyword entry and an embedding (numbers representing meaning). A question retrieves the best-matching chunks, and only those go to the model, tagged with file and position for citations.

**One index per folder makes sealing physical:** retrieval can't reach another client's chunks. Saved chats, grants and the audit log are stored separately in the app database, which the model can't reach.

## Data layout

```
~/Talaan/
  folders/
    Lakbay-Logistics-Inc/         <- a Space: the sealed unit (plain Markdown, PDFs)
      README.md                   <- what this Space is
      policies/                   <- Space-level files
      Case 2026-014 Dela Cruz/    <- subfolder = a chat scope, not a seal
      .talaan/index.db            <- this Space's index only
    Santos-Family-Clinic/
      .talaan/index.db
  app.db                          <- grants, audit log, saved chats (outside all folders)
```

The policy engine never exposes `.talaan/` or `app.db` to the model.

## Repo layout

Folders marked *(planned)* belong to tickets not merged yet.

```
talaan/
  backend/
    app/
      main.py            FastAPI app and routes
      config.py          TALAAN_HOME, OLLAMA_BASE_URL, CHAT_MODEL, EMBED_MODEL, NUM_CTX
      schemas.py         Shared contract, incl. the action schema (mirrored in frontend/src/api/types.ts)
      db.py              app.db: grants, audit, proposals, chat_sessions + chat_messages
      chats.py           Saved Ask chats per folder: save each turn, list/search, resume, rename, delete
      folders.py         Folders and files on disk, import
      fixtures.py        Sample responses for routes not built yet (removed as tickets land)
      policy/
        paths.py         resolve_in_folder: path sealing
        grants.py        Per-folder grants
        engine.py        handle(): validate, seal, decide, execute; approve / reject
        proposals.py     Pending proposals and diffs
      audit/             Audit log writer, reader and export
      index/             extract.py, chunk.py (B2); store.py: per-folder index.db, FTS5 + embeddings, retrieve (B3)
      llm/               (planned, B1, B4–B6) Ollama client, prompts, tool calls
      transcribe/        (planned, D1) faster-whisper wrapper
      system/            (planned, D7) hardware tier detection
    tests/
    pyproject.toml
  frontend/
    src/
      api/               types.ts (mirrors schemas.py), client.ts
      pages/             Folders page, Folder view
      components/        Top bar, sidebar tree, file tabs, file viewer, right-hand tabs, import, source chip
      panels/            Ask (+ ChatHistory), Timeline, Permissions, Approvals, Audit
      lib/               Folder context, formatting, hooks
  demo-data/
  docs/
  tickets/
  CLAUDE.md
  README.md              (D5) setup + run instructions for judges
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Status and the configured chat and embedding model tags |
| GET / POST | `/folders` | List or create folders |
| GET | `/folders/{id}` | One folder |
| GET | `/folders/{id}/files` | List files (`.talaan/` hidden) |
| GET | `/folders/{id}/files/{path}` | File content (PDFs as `application/pdf`) |
| POST | `/folders/{id}/import` | Add .md, .txt or .pdf files |
| POST | `/folders/{id}/index` | Build or refresh the index |
| POST | `/folders/{id}/ask` | Question → answer with sources, or proposed action |
| POST | `/folders/{id}/ask/stream` | Same as `/ask`, streamed as NDJSON: `status`, `answer` (live text, display only), then `done` (the final answer) or `error`. Thinking mode is never used |
| POST | `/folders/{id}/timeline` | Timeline with sources |
| GET / PUT | `/folders/{id}/grants` | Read or change permissions |
| GET | `/folders/{id}/proposals` | Pending actions awaiting approval, with diffs |
| POST | `/proposals/{pid}/approve` · `/reject` | User decision (UI only, never called by model code) |
| GET | `/folders/{id}/audit` | Audit log, newest first |
| GET | `/folders/{id}/audit/export?format=json\|csv` | Audit log download |
| POST | `/folders/{id}/transcribe` | Audio → transcript draft (needs Create) |
| GET | `/system/tier` | Detected hardware tier and recommended models |

## Run locally

Full setup, configuration, tests, demo reset and troubleshooting: **[09-runbook.md](09-runbook.md)**. In short:

```bash
ollama pull gemma4:e4b && ollama pull qwen3-embedding:0.6b   # tags pinned in B1
cd backend && uv sync && uv run uvicorn app.main:app --reload
cd frontend && npm ci && npm run dev
```
