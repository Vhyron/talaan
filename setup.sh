#!/usr/bin/env bash
# Talaan one-time setup for macOS / Linux: ./setup.sh [--yes] [--model qwen3.5:4b] [--all] [--skip-demo]
# On a Mac you can also double-click setup.command in Finder.
# Installs the backend (uv venv), the frontend (npm), the local models (you pick the chat model),
# the speech-to-text model and the demo folders. Needs internet once; after that Talaan runs offline.
# Safe to run again: finished steps are quick no-ops.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"

YES=0; SKIP_DEMO=0; PICK=()
while [ $# -gt 0 ]; do
  case "$1" in
    --yes) YES=1; PICK=(--yes) ;;
    --all) PICK=(--all) ;;
    --model) PICK=(--model "$2"); shift ;;
    --skip-demo) SKIP_DEMO=1 ;;
    *) echo "Unknown option: $1"; exit 2 ;;
  esac
  shift
done

say()  { printf '\n\033[36m== %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mSetup stopped: %s\033[0m\n' "$1"; exit 1; }
has()  { command -v "$1" >/dev/null 2>&1; }
confirm() {
  [ "$YES" = 1 ] && return 0
  read -r -p "$1 [Y/n] " a
  [ -z "$a" ] || [[ "$a" =~ ^[Yy] ]]
}

printf '\033[32mTalaan setup: local AI for sensitive client files. Nothing leaves this laptop.\033[0m\n'

say "1/6 Checking tools (uv, Node.js 20+, Ollama)"
if ! has uv; then
  if confirm "  uv (Python packages; installs Python itself if needed) is missing. Install it?"; then
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
  fi
  has uv || fail "uv is not installed. See https://docs.astral.sh/uv/ and run setup again."
fi
echo "  OK  uv"
# Node.js and Ollama: offer Homebrew on macOS (the Ollama cask includes the menu-bar app)
brew_install() {  # brew_install <command> <formula or --cask name> <description> <url>
  if ! has "$1" && has brew && confirm "  $3 is missing. Install it with Homebrew?"; then
    brew install $2
  fi
  has "$1" || fail "$3 is not installed. Get it from $4 and run setup again."
}
brew_install node node "Node.js 20+ (frontend)" "https://nodejs.org/"
[ "$(node --version | sed 's/^v//; s/\..*//')" -ge 20 ] || fail "Node.js $(node --version) is too old; install Node.js 20 or newer."
echo "  OK  Node.js $(node --version)"
if [ "$(uname)" = Darwin ]; then
  brew_install ollama "--cask ollama" "Ollama (runs the local models)" "https://ollama.com/download/mac"
else
  has ollama || fail "Ollama is not installed. Install it with: curl -fsSL https://ollama.com/install.sh | sh"
fi
echo "  OK  Ollama"

OLLAMA_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
ollama_up() { curl -fsS -m 3 "$OLLAMA_URL/api/version" >/dev/null 2>&1; }
if ! ollama_up; then
  echo "  Starting Ollama..."
  if [ "$(uname)" = Darwin ] && open -a Ollama 2>/dev/null; then :; else (ollama serve >/dev/null 2>&1 &); fi
  for _ in $(seq 20); do ollama_up && break; sleep 1; done
  ollama_up || fail "Ollama did not start. Open the Ollama app, then run setup again."
fi
echo "  OK  Ollama is running at $OLLAMA_URL"

say "2/6 Backend: Python environment and packages (backend/.venv)"
(cd backend && uv sync) || fail "uv sync failed. Fix the error above and run setup again."

say "3/6 Frontend: npm packages (frontend/node_modules)"
(cd frontend && npm ci --no-audit --no-fund) || fail "npm ci failed. Fix the error above and run setup again."

say "4/6 Local AI models"
(cd backend && uv run python -m scripts.setup_models ${PICK[@]+"${PICK[@]}"}) || fail "Model download failed. Fix the error above and run setup again."

say "5/6 Speech-to-text model for voice notes (faster-whisper small, ~464 MB)"
(cd backend && uv run python -m app.transcribe.whisper --download) || fail "Speech model download failed."

say "6/6 Demo folders (synthetic HR cases and clinic charts)"
TALAAN_DIR="${TALAAN_HOME:-$HOME/Talaan}"
if [ "$SKIP_DEMO" = 1 ]; then
  echo "  Skipped (--skip-demo)."
elif [ -d "$TALAAN_DIR/folders/Case-2026-014_Dela-Cruz" ] && { [ "$YES" = 1 ] || ! confirm "  Demo folders already exist in $TALAAN_DIR. Reset them to the original state (clears their chats and audit log)?"; }; then
  echo "  Kept the existing demo folders."
else
  (cd backend && uv run python scripts/seed_demo.py --reset --no-warm) || fail "Loading the demo folders failed."
fi

printf '\n\033[32mSetup complete. Everything from here runs offline.\033[0m\n'
cat <<EOF

Start Talaan (two terminals, from $ROOT):
  1) cd backend  && uv run uvicorn app.main:app      -> API on http://localhost:8000
  2) cd frontend && npm run dev                      -> open http://localhost:5173

Switch the chat model any time on the Settings page.
EOF
