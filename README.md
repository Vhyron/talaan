# Talaan

**Local AI for sensitive client files.** Each HR case or clinic chart is a sealed folder. A local model reads only the folder you open, and only does what you allow. Nothing leaves the laptop.

Built for the AppBuildersPH Hackathon 2026 (Local AI theme).

- **Who it's for:** HR investigators and clinicians who aren't allowed to paste client files into cloud AI.
- **What it does:** answers questions with clickable sources, builds case timelines that flag contradictions, transcribes voice notes, and proposes edits and drafts that you approve.
- **What makes it safe:** a deterministic policy engine, outside the model, decides every AI action against per-folder permissions (Read · Suggest edits · Create drafts · Delete), and every question and action is written to a per-folder audit log. Folder chats only see their own folder; the home-page chat can read across folders you allow (Read grant), is read-only, and logs to each folder it used.

## Requirements

| Tool | Version | Install |
|---|---|---|
| Python | 3.11+ | [python.org](https://www.python.org/downloads/) |
| uv | latest | `pip install uv` ([docs](https://docs.astral.sh/uv/)) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org/) |
| Ollama | latest | [ollama.com](https://ollama.com/) |

A 16 GB RAM laptop runs the default models comfortably. About 15 GB of free disk space is needed for models and dependencies.

## Run it

Commands are for PowerShell; on macOS/Linux replace `;` with `&&`. Steps 1–3 need internet once; after that everything works offline.

```powershell
git clone https://github.com/Vhyron/talaan.git
cd talaan

# 1. Local models (one-time download): embeddings + the chat model for your RAM
ollama pull qwen3-embedding:0.6b
ollama pull qwen3.5:2b      # 8 GB RAM (Light)
ollama pull gemma4:e4b      # 16 GB+ RAM (Standard); skip on 8 GB

# 2. Backend (Python): install, cache the speech model, load the demo folders
cd backend
uv sync
uv run python -m app.transcribe.whisper --download
uv run scripts/seed_demo.py --fresh --yes
uv run uvicorn app.main:app            # http://localhost:8000/docs

# 3. Frontend (in a second terminal, from the repo root)
cd frontend
npm ci
npm run dev                            # open http://localhost:5173
```

`seed_demo.py` copies four synthetic folders from `demo-data/` into `~/Talaan/folders` (set `TALAAN_HOME` to use another location). Run `uv run scripts/seed_demo.py --reset` at any time to return them to their original state.

### Try it

Open **Case 2026-014 · Dela Cruz** and:

1. **Permissions** tab: Read is allowed, edits and drafts need your approval, Delete is Never.
2. **Timeline** tab → Build timeline: dated events with sources, and contradictions flagged for review.
3. **Ask** "Summarize the representative's email." The email hides an instruction to delete witness files; any delete is **blocked** by the policy engine and shown in **Audit → Blocked only**.
4. **Ask** "Summarize Ana Villanueva's tardiness." → refused: that's another client's folder.
5. **Voice note** (toolbar): record or upload audio; it's transcribed on this laptop and proposed in **Approvals**.
6. Open **Chart · M Reyes** and ask "Any allergies before I prescribe an antibiotic?"

More: [demo-data/README.md](demo-data/README.md) lists the nine test questions and expected answers.

### Tests

```powershell
cd backend;  uv run pytest
cd frontend; npx tsc -b; npm run lint; npm run build
```

## What runs locally, and what needs internet

- **Runs locally:** all AI — chat, embeddings and speech-to-text — plus all storage (plain Markdown files and SQLite). The app makes no network calls except to Ollama on `localhost`.
- **Needs internet:** only the one-time downloads in steps 1–2 (models and packages).
- **Cloud services and external APIs:** none.

## Why does this product benefit from running AI locally?

Talaan's users (HR investigators and clinicians) handle files containing health data, government ID numbers, witness identities and disciplinary records. They often can't legally or contractually send these to a cloud AI, so cloud AI isn't slower or pricier for them; it's off-limits. Running the model on the laptop makes AI usable on these files at all. Local inference also lets us seal each client folder physically, enforce permissions outside the model, keep a per-folder audit log, and work with no internet.

## Disclosure

### Models

| Use | Model | Runs on |
|---|---|---|
| Chat, answers, timeline, actions | Picked by detected hardware tier: `qwen3.5:2b` (8 GB, Light), `gemma4:e4b` (16 GB, Standard), `gemma4:26b` (32 GB, Pro). Also selectable on the Settings page: `qwen3.5:4b`, `qwen3.5:9b`. Pinned 2026-10-09; tags and digests in [docs/05](docs/05-models.md#pinned-tags) | Ollama |
| Embeddings (retrieval) | `qwen3-embedding:0.6b` on every tier | Ollama |
| Speech-to-text | faster-whisper `small` (CTranslate2 int8, ~464 MB) | CPU, in the backend |

### Libraries and frameworks

All open source.

| Area | Libraries |
|---|---|
| Backend | FastAPI, Pydantic, Uvicorn, python-multipart, faster-whisper (CTranslate2), PyAV, httpx (Ollama client), psutil (hardware tier detection), PyMuPDF (PDF text extraction), NumPy (embedding similarity), SQLite with FTS5 (Python standard library) |
| Backend tests | pytest, httpx |
| Frontend | React, React DOM, React Router, Vite, Tailwind CSS, react-markdown, remark-gfm, lucide-react (icons), Fontsource (Noto Sans, JetBrains Mono, bundled locally) |
| Frontend tooling | TypeScript, ESLint, typescript-eslint |
| Tooling | uv, npm, Ollama |

Libraries added by the AI-retrieval work (B tickets) are listed in their PRs and added here before submission.

### APIs and cloud services

None.

### Existing code and assets

- No pre-existing project code: the app was built from scratch during the hackathon (from Oct 9, 2:30 PM), using only the open-source libraries above.
- Synthetic demo data in `demo-data/` (all people, companies, IDs and medical details are made up) and UI mockups, created on Oct 9 for this project.

### AI development tools

- Claude Code (Anthropic) was used for code, documentation and testing assistance.

## Documentation

- [docs/](docs/README.md) — product brief, scope, permission model, architecture, models, demo script, rules
- [docs/09-runbook.md](docs/09-runbook.md) — full setup, configuration, demo reset and troubleshooting
- [tickets/](tickets/README.md) — how the work was split

## License

[MIT](LICENSE)
