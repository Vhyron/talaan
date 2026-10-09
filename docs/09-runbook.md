# 09 · Runbook

How to install, run, test and reset Talaan on a team laptop. Commands are PowerShell (Windows); a bash version follows each block where it differs. The judge-facing setup lives in the root `README.md` (ticket D5) and should copy from here.

## 1. Prerequisites (once per laptop)

| Tool | Version | Check | Install |
|---|---|---|---|
| Git | any recent | `git --version` | git-scm.com |
| Python | 3.11+ | `python --version` | python.org (tick "Add to PATH") |
| uv | latest | `uv --version` | `python -m pip install --user uv` |
| Node.js | 20+ | `node --version` | nodejs.org (LTS) |
| Ollama | latest | `ollama --version` | ollama.com |

If `uv` isn't found after a pip install, use `python -m uv` in place of `uv` everywhere below, or add Python's user `Scripts` folder to PATH.

Hardware: the app detects RAM/GPU and picks the chat model automatically (Budget `qwen3.5:2b` under 14 GB RAM, Mid `qwen3.5:4b` 14 GB+, High `gemma4:e4b` 19 GB+, counting the embedding model and 6 GB for the OS, browser and backend; see [05-models.md](05-models.md)). Keep ~15 GB disk free for models and dependencies.

## 2. One-time setup

**Quickest:** run `setup.bat` (Windows), `setup.command` / `./setup.sh` (macOS) or `./setup.sh` (Linux) from the repo root. It checks the tools (offering winget / Homebrew installs), runs every step below, and asks which chat model to download, recommending one for the laptop's RAM (`backend/scripts/setup_models.py`). Flags: `-Yes`/`--yes`, `-Model <tag>`/`--model <tag>`, `-All`/`--all`, `-SkipDemo`/`--skip-demo`.

The same steps by hand, from the repo root:

```powershell
git clone https://github.com/Vhyron/talaan.git
cd talaan
git checkout dev

# Backend: creates backend\.venv with the exact locked versions (incl. pytest)
cd backend; uv sync; cd ..

# Frontend: clean install from package-lock.json
cd frontend; npm ci; cd ..

# Models: one-time download, the only step that needs internet
ollama pull qwen3-embedding:0.6b   # every tier, always
ollama pull qwen3.5:2b             # Budget (any machine)
ollama pull qwen3.5:4b             # Mid    (14 GB+ RAM, e.g. 16 GB)
ollama pull gemma4:e4b             # High   (19 GB+ RAM, e.g. 24/32 GB)

# Speech-to-text model for voice notes (faster-whisper "small", ~464 MB)
cd backend; uv run python -m app.transcribe.whisper --download; cd ..
```

Pull the embedding model plus the chat model for your tier; pulling more is fine (switch on the Settings page). Pinned tags live in `backend/app/llm/models.py` and are final after the B1 bake-off (05-models.md). Pull models before the venue; the Wi-Fi there may be slow.

**`npm ci` vs `npm install`:** use `npm ci` to install. Use `npm install <pkg>` only when adding a dependency, then commit `package-lock.json` and add the library to the disclosure list (06-demo-and-pitch.md). The backend equivalent is `uv add <pkg>`, which updates `uv.lock`.

## 3. Load the demo data

Talaan reads client folders from `TALAAN_HOME\folders`, default `C:\Users\<you>\Talaan\folders` (`~/Talaan/folders`). Copy, don't move, so the originals stay intact for resets:

```powershell
New-Item -ItemType Directory -Force "$HOME\Talaan\folders" | Out-Null
Copy-Item -Recurse demo-data\hr\*, demo-data\clinic\* "$HOME\Talaan\folders\"
```

```bash
mkdir -p ~/Talaan/folders && cp -r demo-data/hr/* demo-data/clinic/* ~/Talaan/folders/
```

You should see `Case-2026-014_Dela-Cruz`, `Case-2026-019_Villanueva`, `Chart_A-Bautista` and `Chart_M-Reyes`.

To keep data somewhere else, set `TALAAN_HOME` before starting the backend (e.g. `$env:TALAAN_HOME = "D:\talaan-data"`). The app creates `folders\` and `app.db` there.

## 4. Run (every day)

Two terminals, from the repo root:

```powershell
# Terminal 1: backend   -> http://localhost:8000/docs
cd backend; uv run uvicorn app.main:app --reload

# Terminal 2: frontend  -> http://localhost:5173
cd frontend; npm run dev
```

Ollama must be running for AI features (it starts with the desktop app; otherwise `ollama serve`).

The frontend proxies `/api` to `http://localhost:8000`. To point it at another backend: `$env:API_TARGET = "http://localhost:8011"; npm run dev`.

### Configuration

All optional, set as environment variables before starting the backend (see `backend/app/config.py`):

| Variable | Default | Use |
|---|---|---|
| `TALAAN_HOME` | `~/Talaan` | Where folders and `app.db` live |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama server. Use `127.0.0.1`, not `localhost`: on Windows `localhost` tries IPv6 first and adds ~2 s to every model call. The client uses Ollama's native API (needed for per-request `num_ctx`), so LM Studio is not a drop-in swap |
| `CHAT_MODEL` | unset (auto by hardware tier) | Optional dev override; must be a pinned tag in `backend/app/llm/models.py`. Normally switch on the Settings page / `PUT /system/model` ([05-models.md](05-models.md#model-switching-in-the-app)). The embedding model is fixed (`qwen3-embedding:0.6b`), not configurable |
| `NUM_CTX` | `16384` | Context window sent on every request |
| `MODEL_KEEP_ALIVE` | `-1` | How long Ollama keeps the chat model and embedder loaded after each call. `-1` keeps both loaded while the app runs: the app preloads both at startup and hands them back to Ollama's 5m default on shutdown. Any Ollama duration (`30m`) or seconds also works |
| `LLM_LOG_PROMPTS` | unset | `1` forces "Record prompt and response text" on in the LLM activity log (memory only, never written to disk). Same as the toggle on the Settings page |
| `LLM_LIVE_LOG` | unset | `1` streams every chat call live to the backend terminal: model, `num_ctx`, think, a status spinner (`loading model + processing prompt` / `processing prompt`) until the first token, then the thinking (dimmed) and answer as they generate, then load / prompt / gen timings and tok/s. Also prints a line whenever Ollama loads, unloads or refreshes a model (from `/api/ps`: GPU/CPU split, context, when it unloads), with a spinner while the Settings page loads one. Terminal only, never the UI or disk. Prints client text, so dev/demo use |
| `LLM_LIVE_PROMPT` | unset | `1` also prints the full prompt (system + retrieved chunks + question) before each call. Turns on `LLM_LIVE_LOG` |
| `WHISPER_MODEL` | `small` | faster-whisper size: `base` (Light), `small` (Standard), `large-v3-turbo` (Pro). Download it with the command in section 2 |
| `WHISPER_LANGUAGES` | `en,tl` | Languages a voice note may be in; Whisper picks the likeliest of these (English, Tagalog, Taglish). One code forces it, e.g. `en` |

### Running ticket branches side by side

Each ticket branch only contains its own track. To run a backend branch with a frontend branch, use a second worktree instead of switching branches under a running server:

```powershell
git worktree add ..\talaan-backend a-branch-name
cd ..\talaan-backend\backend; uv sync; uv run uvicorn app.main:app --port 8000
```

Remove it afterwards with `git worktree remove ..\talaan-backend`.

### Models: Settings page and LLM log

Open **http://localhost:5173/settings** (or click the model chip in the top bar):

- **This device:** detected RAM, GPU, free disk and tier. Warns if Ollama isn't running or the embedding model is missing.
- **Chat model:** "Automatic" picks your tier's model. "Use" switches to another installed pinned model (first load can take ~20 s). Models above your tier are allowed but marked as possibly slow. `ollama list` must show a model before it can be picked.
- **LLM activity:** every model call (tokens in/out, tok/s, load and total time, errors). Click a row for details. "Record prompt and response text" is off by default; when on, text stays in memory only.

The backend terminal prints the same calls as `[llm]` lines. API: `GET /system/tier`, `PUT /system/model`, `GET /system/llm-log`.

### Watching the model live (terminal)

```powershell
# Talaan live log: prompt, "processing prompt" status, streamed thinking + answer, timings,
# model load/unload lines and why a question was refused before the model
cd backend
$env:LLM_LIVE_PROMPT="1"; uv run uvicorn app.main:app --reload   # LLM_LIVE_LOG="1" = same without the prompt

# Ollama's own server log (model loads, GPU/memory, request timings), no restart needed
Get-Content "$env:LOCALAPPDATA\Ollama\server.log" -Wait -Tail 50

# More detail: quit Ollama from the tray icon, then run the server in debug mode
$env:OLLAMA_DEBUG="1"; ollama serve

# Which models are loaded right now
ollama ps
```

Ollama's own log never shows the model's output or thinking; use the Talaan live log for that. Greetings like "hello" are refused before the model (nothing in the folder matches), so they print only an `embed` line and the refusal reason.

## 5. Test

```powershell
# Backend: unit + API tests (use a temp TALAAN_HOME, never your real data)
cd backend; uv run pytest

# Frontend: typecheck, lint, production build
cd frontend; npx tsc -b; npm run lint; npm run build
```

All four must pass before opening a PR.

**Model bake-off (B1).** Runs Q1–Q9 plus action-JSON probes against real models (Ollama running, models pulled). About 5 min per small model with 3 runs; a 4B model on 8 GB takes ~20 min:

```powershell
cd backend
uv run python -m scripts.bakeoff --models qwen3.5:2b qwen3.5:4b --runs 3
uv run python -m scripts.bakeoff --models qwen3.5:4b gemma4:e4b --runs 3   # 16 GB+ laptops
uv run python -m scripts.bakeoff --actions-only --runs 3                    # action JSON only
```

It prints a summary table and saves every answer to `backend/scripts/bakeoff_results/<date>.json`. Commit that file and add the row to the results table in [05-models.md](05-models.md#bake-off-results), noting the laptop (model, RAM, GPU).

### Acceptance test (D4)

The nine ground-truth questions in [demo-data/README.md](../demo-data/README.md), plus the sealing and prompt-injection rules, against the running backend:

```powershell
cd backend
uv run scripts/seed_demo.py --reset     # always start from the demo state
uv run scripts/acceptance.py            # backend on http://127.0.0.1:8000
uv run scripts/acceptance.py --only 4,5,9 --base http://127.0.0.1:8011
```

**Browser check (Playwright).** `e2e/verify-fixes.mjs` drives the real UI through an edit request (propose → diff → approve) and Q2, asserts the results and saves annotated screenshots to `docs/verification/`. Run it after acceptance, since it edits a demo file; then reseed. Steps are in [10-verification.md](10-verification.md#re-run).

It prints PASS/FAIL per question with the reason and real seconds per answer, and exits non-zero on any failure. It is the sign-off for milestone M2: everything must pass before rehearsals. Until B4/B5 merge, only Q3, Q4 and Q9 pass (the routes still return sample answers). Timings may be quoted in the pitch, so only quote numbers from a real run on the demo laptop.

## 6. Reset before a demo or rehearsal

Rehearsals approve drafts, change grants and fill the audit log. One command gets back to the demo state (from `backend/`):

```powershell
uv run scripts/seed_demo.py --reset
```

It restores the four demo folders from `demo-data/` (removing files added during rehearsal), resets their grants to the defaults, clears their proposals, audit log and chat history, rebuilds their indexes and warms the Ollama models so the first answer isn't slow. Other folders and their history are left alone. Add `--no-warm` to skip the model warm-up.

For a completely clean `TALAAN_HOME` (e.g. a new laptop): `uv run scripts/seed_demo.py --fresh --yes`. It refuses to wipe a folder that contains anything other than `folders/` and `app.db`, in case `TALAAN_HOME` points somewhere wrong.

**Never edit the files in `demo-data/`** to "fix" the demo. `2026-09-26_email_from-representative.md` contains a deliberate prompt injection; it is a test fixture.

## 7. Pre-demo checklist (offline run)

Do this on the demo laptop, at least once the evening before and again at the venue:

- [ ] `git pull` on the branch being demoed; `uv sync` and `npm ci` if dependencies changed
- [ ] Models pulled and listed in `ollama list` (exact pinned tags)
- [ ] `uv run scripts/seed_demo.py --reset` (section 6)
- [ ] Settings page shows the expected tier and the chat model you will demo with ("In use"); no `CHAT_MODEL` env var left over
- [ ] Backend and frontend running; `http://localhost:8000/health` shows the pinned model tags
- [ ] Ask one question per folder so the models are loaded and warm (`ollama ps`)
- [ ] **Turn Wi-Fi off**, refresh the app, run the full 5-minute script from [06-demo-and-pitch.md](06-demo-and-pitch.md)
- [ ] `uv run scripts/acceptance.py` passes 9/9 with Wi-Fi off
- [ ] Check Audit → Blocked only shows the injection attempt; then reset again
- [ ] Backup demo video on the laptop and on a USB stick

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `npm ci` fails with `EPERM ... lightningcss...node` | A running `npm run dev` locks a native module; `npm ci` also leaves `node_modules` half deleted | Stop the dev server, run `npm ci` again |
| `error: Failed to spawn: uvicorn` / `program not found` | The checked-out branch has no `backend/pyproject.toml` (e.g. a frontend-only ticket branch), so uv has no project | `git checkout dev`, or use a worktree for the backend branch (section 4), then `uv sync` |
| `uv` not recognized | Installed with pip but not on PATH | Use `python -m uv …` |
| Browser shows "Backend unreachable" or an empty folder list | Backend not running, or wrong port | Start the backend; check `http://localhost:8000/health`; set `API_TARGET` if it runs elsewhere |
| Folder list is empty but the backend is up | No folders in `TALAAN_HOME\folders` | Load the demo data (section 3); check `TALAAN_HOME` |
| `Port 5173 is already in use` / `[Errno 10048]` on 8000 | Another dev server still running | Close it, or run on another port (`npx vite --port 5174`, `uvicorn … --port 8001` with `API_TARGET`) |
| Model tag in the top bar says `model offline` | Backend can't be reached from the frontend | As above |
| Settings shows "Ollama is not running" / API returns 503 | Ollama app closed | Open the Ollama app or run `ollama serve` |
| `Model X is not installed. Run ollama pull X` | Picked or auto-selected a model that isn't pulled | Run the `ollama pull` shown, or pick an installed model on the Settings page |
| `X took longer than 300s and was stopped` | Model too big for this laptop, or thinking mode on | Use your tier's model (Settings → Automatic); keep thinking off |
| Answers suddenly slow, `ollama ps` shows `CPU/GPU` split | Model larger than memory allows, or a second chat model still loaded | Switch on the Settings page (it unloads the old model); `ollama stop <tag>` |
| Timeline takes 1–2 min | The model writes ~1.5k tokens; on a 4 GB GPU that's ~90 s (B5). The result is cached per folder until a file, the model or the prompt changes | Build it once before the demo; later clicks are instant. `POST /folders/{id}/timeline?refresh=true` forces a rebuild |
| `git push` → `403 Permission … denied to <work account>` | Git Credential Manager uses one saved GitHub login for every folder | In the partition's gitconfig (e.g. `~/.gitconfig-personal`) set `[credential "https://github.com"] username = <your account>`; optionally `gitHubAuthModes = device` and complete the code in a browser window signed in to that account |
| Voice note fails with `open() got an unexpected keyword argument 'metadata_errors'` | PyAV 19 removed an argument faster-whisper 1.2 still passes | `uv sync` (the lockfile pins `av<19`); don't upgrade `av` past 18 |
| Voice note comes out in the wrong language (e.g. Chinese) or as random words | Whisper guessed the language from a very short or quiet clip | Fixed: it now only chooses among `WHISPER_LANGUAGES`, refuses clips under 1.5 s and drops segments it rates as non-speech. Speak for a few seconds, close to the mic |
| Voice note fails offline / tries to download | Whisper model not cached | Run the download command in section 2 while online |
| `git add -A` stages thousands of files | Branch made from a commit without `.gitignore` | Unstage (`git reset`), branch from current `dev`, add paths explicitly |
