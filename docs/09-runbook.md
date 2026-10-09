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

Hardware: 16 GB RAM (Standard tier) runs the default models comfortably; see [05-models.md](05-models.md). Keep ~15 GB disk free for models and dependencies.

## 2. One-time setup

From the repo root:

```powershell
git clone https://github.com/Vhyron/talaan.git
cd talaan
git checkout dev

# Backend: creates backend\.venv with the exact locked versions (incl. pytest)
cd backend; uv sync; cd ..

# Frontend: clean install from package-lock.json
cd frontend; npm ci; cd ..

# Models: one-time download, the only step that needs internet
ollama pull gemma4:e4b
ollama pull qwen3-embedding:0.6b
```

The model tags are the defaults until the B1 bake-off pins the final ones (05-models.md). Pull models before the venue; the Wi-Fi there may be slow.

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
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama, or LM Studio's OpenAI-compatible URL. Use `127.0.0.1`, not `localhost`: on Windows `localhost` tries IPv6 first and adds ~2 s to every model call |
| `CHAT_MODEL` | `gemma4:e4b` | Chat model tag |
| `EMBED_MODEL` | `qwen3-embedding:0.6b` | Embedding model. Changing it means re-indexing every folder |
| `NUM_CTX` | `16384` | Context window sent on every request |

### Running ticket branches side by side

Each ticket branch only contains its own track. To run a backend branch with a frontend branch, use a second worktree instead of switching branches under a running server:

```powershell
git worktree add ..\talaan-backend a-branch-name
cd ..\talaan-backend\backend; uv sync; uv run uvicorn app.main:app --port 8000
```

Remove it afterwards with `git worktree remove ..\talaan-backend`.

## 5. Test

```powershell
# Backend: unit + API tests (use a temp TALAAN_HOME, never your real data)
cd backend; uv run pytest

# Frontend: typecheck, lint, production build
cd frontend; npx tsc -b; npm run lint; npm run build
```

All four must pass before opening a PR.

### Acceptance test (D4)

The nine ground-truth questions in [demo-data/README.md](../demo-data/README.md), plus the sealing and prompt-injection rules, against the running backend:

```powershell
cd backend
uv run scripts/seed_demo.py --reset     # always start from the demo state
uv run scripts/acceptance.py            # backend on http://127.0.0.1:8000
uv run scripts/acceptance.py --only 4,5,9 --base http://127.0.0.1:8011
```

It prints PASS/FAIL per question with the reason and real seconds per answer, and exits non-zero on any failure. It is the sign-off for milestone M2: everything must pass before rehearsals. Until B4/B5 merge, only Q3, Q4 and Q9 pass (the routes still return sample answers). Timings may be quoted in the pitch, so only quote numbers from a real run on the demo laptop.

## 6. Reset before a demo or rehearsal

Rehearsals approve drafts, change grants and fill the audit log. Reset to the pristine demo state:

```powershell
# Stop the backend first (Ctrl+C), then:
Remove-Item -Recurse -Force "$HOME\Talaan"
New-Item -ItemType Directory -Force "$HOME\Talaan\folders" | Out-Null
Copy-Item -Recurse demo-data\hr\*, demo-data\clinic\* "$HOME\Talaan\folders\"
```

This deletes `app.db` too: grants go back to defaults, the audit log and pending proposals are cleared. Indexes are rebuilt on the next index call. D3 replaces this with a reset script.

**Never edit the files in `demo-data/`** to "fix" the demo. `2026-09-26_email_from-representative.md` contains a deliberate prompt injection; it is a test fixture.

## 7. Pre-demo checklist (offline run)

Do this on the demo laptop, at least once the evening before and again at the venue:

- [ ] `git pull` on the branch being demoed; `uv sync` and `npm ci` if dependencies changed
- [ ] Models pulled and listed in `ollama list` (exact pinned tags)
- [ ] Demo data reset (section 6)
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
| Ask and Timeline always show Case 2026-014 answers | Expected until B4/B5 merge: those routes still return fixture data (`backend/app/fixtures.py`) | — |
| `git push` → `403 Permission … denied to <work account>` | Git Credential Manager uses one saved GitHub login for every folder | In the partition's gitconfig (e.g. `~/.gitconfig-personal`) set `[credential "https://github.com"] username = <your account>`; optionally `gitHubAuthModes = device` and complete the code in a browser window signed in to that account |
| `git add -A` stages thousands of files | Branch made from a commit without `.gitignore` | Unstage (`git reset`), branch from current `dev`, add paths explicitly |
