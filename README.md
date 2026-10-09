# Talaan

**Local AI for sensitive client files.** Each HR case or clinic chart is a sealed folder. A local model reads only the folder you open, and only does what you allow. Nothing leaves the laptop.

Built for the AppBuildersPH Hackathon 2026 (Local AI theme).

- **Who it's for:** HR investigators and clinicians who aren't allowed to paste client files into cloud AI.
- **What it does:** answers questions with clickable sources, builds case timelines that flag contradictions, transcribes voice notes, and proposes edits and drafts that you approve.
- **What makes it safe:** a deterministic policy engine, outside the model, decides every AI action against per-folder permissions (Read · Suggest edits · Create drafts · Delete), and every question and action is written to a per-folder audit log. Folder chats only see their own folder; the home-page chat can read across folders you allow (Read grant), is read-only, and logs to each folder it used.

## Requirements

| Tool | Version | Install |
|---|---|---|
| uv | latest | [docs.astral.sh/uv](https://docs.astral.sh/uv/) (installs Python 3.11+ itself if needed) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org/) |
| Ollama | latest | [ollama.com](https://ollama.com/) |

The setup script checks for these and offers to install any that are missing (winget on Windows, Homebrew on macOS). Windows 10/11 or macOS; 8 GB RAM minimum, 16 GB+ recommended; about 15 GB of free disk for models and dependencies.

## Set up (one command)

```powershell
git clone https://github.com/Vhyron/talaan.git
cd talaan
```

| OS | Run |
|---|---|
| Windows | double-click **`setup.bat`**, or `.\setup.bat` in a terminal |
| macOS | double-click **`setup.command`** in Finder, or `./setup.sh` in Terminal |
| Linux | `./setup.sh` |

It does everything in six steps and is safe to run again:

1. Checks uv, Node.js and Ollama (offers to install missing ones) and starts Ollama.
2. Backend: creates `backend/.venv` with the locked Python packages (`uv sync`).
3. Frontend: installs the locked npm packages (`npm ci`).
4. **Models:** shows this laptop's RAM, GPU and free disk, recommends a chat model, and asks which to download (see [Choosing a model](#choosing-a-model)). Always downloads the embedding model.
5. Speech-to-text model for voice notes (faster-whisper `small`, ~464 MB).
6. Loads four synthetic demo folders into `~/Talaan/folders` (set `TALAAN_HOME` to use another location).

Options: `-Yes` / `--yes` takes the recommended model without asking, `-Model qwen3.5:4b` / `--model qwen3.5:4b` picks one, `-All` / `--all` downloads all three, `-SkipDemo` / `--skip-demo` skips the demo folders. Internet is needed only for this setup; after it, Talaan runs with Wi-Fi off.

## Run it

Two terminals, from the repo root:

```powershell
cd backend;  uv run uvicorn app.main:app      # API on http://localhost:8000/docs
cd frontend; npm run dev                      # open http://localhost:5173
```

(macOS/Linux: `&&` in place of `;`.) Ollama must be running: it starts with the Ollama app. Reset the demo folders any time with `cd backend; uv run scripts/seed_demo.py --reset`.

## Choosing a model

Talaan offers three local chat models. All three passed our bake-off on the nine ground-truth questions in [demo-data/README.md](demo-data/README.md); pick by the laptop's RAM.

| Model | Class | Download | Needs RAM* | Bake-off | Pick it when |
|---|---|---|---|---|---|
| `qwen3.5:2b` | Budget | 2.7 GB | 13 GB | 21/27 | 8–12 GB laptops, or you want the fastest answers. Good at search and short answers with sources; misses contradictions. |
| `qwen3.5:4b` | Mid | 3.3 GB | 14 GB | 24/27 | 16 GB laptops. Most accurate in our tests (finds every contradiction), slower per answer. |
| `gemma4:e4b` | High | 6.6 GB | 19 GB | 23/27 | 24 GB+ laptops. Strong all-round and best at case timelines. |

\*RAM is budgeted generously: the chat model at a 16k-token context **plus** the embedding model (~2.5 GB) **plus** 6 GB for the OS, the browser running the app, the backend and speech-to-text, all at once. GPU memory makes answers faster but isn't counted as extra room. Below 13 GB, `qwen3.5:2b` still runs, marked "may be slow".

- **Automatic (default):** runs the model for this laptop's class if downloaded, otherwise the largest downloaded one that fits, otherwise any downloaded one of the three. Other Ollama models on the machine are never used.
- **Switch any time** on the **Settings** page (gear icon). Downloaded models are listed there with their RAM needs; switching never needs re-indexing because every model uses the same embedding model.
- **Download another later:** `cd backend; uv run python -m scripts.setup_models`.
- Thinking mode is off on every call: it was too slow on laptop hardware.

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
| Chat, answers, timeline, actions | One of three, picked by detected hardware: `qwen3.5:2b` (Budget, under 14 GB RAM), `qwen3.5:4b` (Mid, 14 GB+), `gemma4:e4b` (High, 19 GB+). Budgets count the chat model, the embedding model and 6 GB for the OS, browser and backend. Any of the three can be chosen on the Settings page. Pinned 2026-10-09; tags and digests in [docs/05](docs/05-models.md#pinned-tags) | Ollama |
| Embeddings (retrieval) | `qwen3-embedding:0.6b` with every chat model | Ollama |
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
