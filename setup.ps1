# Talaan one-time setup for Windows. Run setup.bat (double-click) or:
#   powershell -ExecutionPolicy Bypass -File setup.ps1 [-Yes] [-Model qwen3.5:4b] [-All] [-SkipDemo]
# Installs the backend (uv venv), the frontend (npm), the local models (you pick the chat model),
# the speech-to-text model and the demo folders. Needs internet once; after that Talaan runs offline.
# Safe to run again: finished steps are quick no-ops.

param(
    [switch]$Yes,       # take the recommended model and defaults without asking
    [string]$Model,     # download this chat model: qwen3.5:2b, qwen3.5:4b or gemma4:e4b
    [switch]$All,       # download all three chat models
    [switch]$SkipDemo   # don't load the demo folders
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Say($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host "`nSetup stopped: $text" -ForegroundColor Red; exit 1 }
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Confirm($question) {
    if ($Yes) { return $true }
    $a = Read-Host "$question [Y/n]"
    return ($a -eq '' -or $a -match '^[Yy]')
}
function Run($what, [scriptblock]$cmd) {
    & $cmd
    if ($LASTEXITCODE -ne 0) { Fail "$what failed (exit code $LASTEXITCODE). Fix the error above and run setup again." }
}
function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

Write-Host "Talaan setup: local AI for sensitive client files. Nothing leaves this laptop." -ForegroundColor Green

# --- 1. Tools ----------------------------------------------------------------
Say "1/6 Checking tools (uv, Node.js 20+, Ollama)"
$tools = @(
    @{ Cmd = 'uv';     Name = 'uv (Python packages; installs Python itself if needed)'; Winget = 'astral-sh.uv';       Url = 'https://docs.astral.sh/uv/' },
    @{ Cmd = 'node';   Name = 'Node.js 20+ (frontend)';                                Winget = 'OpenJS.NodeJS.LTS';  Url = 'https://nodejs.org/' },
    @{ Cmd = 'ollama'; Name = 'Ollama (runs the local models)';                       Winget = 'Ollama.Ollama';      Url = 'https://ollama.com/' }
)
foreach ($t in $tools) {
    if (Has $t.Cmd) { Write-Host "  OK  $($t.Name)"; continue }
    if ((Has 'winget') -and (Confirm "  $($t.Name) is missing. Install it with winget?")) {
        Run "Installing $($t.Cmd)" { winget install --id $t.Winget -e --accept-source-agreements --accept-package-agreements }
        Refresh-Path
    }
    if (-not (Has $t.Cmd)) {
        Fail "$($t.Name) is not installed or not on PATH. Install it from $($t.Url), open a new terminal and run setup again."
    }
    Write-Host "  OK  $($t.Name)"
}
$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) { Fail "Node.js $(node --version) is too old; install Node.js 20 or newer from https://nodejs.org/." }

# Ollama must be running to download models.
$ollamaUrl = if ($env:OLLAMA_BASE_URL) { $env:OLLAMA_BASE_URL } else { 'http://127.0.0.1:11434' }
function Ollama-Up { try { Invoke-WebRequest "$ollamaUrl/api/version" -UseBasicParsing -TimeoutSec 3 | Out-Null; $true } catch { $false } }
if (-not (Ollama-Up)) {
    Write-Host "  Starting Ollama..."
    Start-Process ollama -ArgumentList 'serve' -WindowStyle Hidden
    for ($i = 0; $i -lt 20 -and -not (Ollama-Up); $i++) { Start-Sleep -Seconds 1 }
    if (-not (Ollama-Up)) { Fail "Ollama did not start. Open the Ollama app, then run setup again." }
}
Write-Host "  OK  Ollama is running at $ollamaUrl"

# --- 2. Backend --------------------------------------------------------------
Say "2/6 Backend: Python environment and packages (backend\.venv)"
Push-Location backend
Run 'uv sync' { uv sync }
Pop-Location

# --- 3. Frontend -------------------------------------------------------------
Say "3/6 Frontend: npm packages (frontend\node_modules)"
Push-Location frontend
Run 'npm ci' { npm ci --no-audit --no-fund }
Pop-Location

# --- 4. Models ---------------------------------------------------------------
Say "4/6 Local AI models"
Push-Location backend
$pick = @()
if ($Model) { $pick = @('--model', $Model) } elseif ($All) { $pick = @('--all') } elseif ($Yes) { $pick = @('--yes') }
Run 'Model download' { uv run python -m scripts.setup_models @pick }

# --- 5. Speech-to-text -------------------------------------------------------
Say "5/6 Speech-to-text model for voice notes (faster-whisper small, ~464 MB)"
Run 'Speech model download' { uv run python -m app.transcribe.whisper --download }

# --- 6. Demo folders ---------------------------------------------------------
Say "6/6 Demo folders (synthetic HR cases and clinic charts)"
$home_ = if ($env:TALAAN_HOME) { $env:TALAAN_HOME } else { Join-Path $HOME 'Talaan' }
$seeded = Test-Path (Join-Path $home_ 'folders\Case-2026-014_Dela-Cruz')
if ($SkipDemo) {
    Write-Host "  Skipped (-SkipDemo)."
} elseif ($seeded -and -not $Yes -and -not (Confirm "  Demo folders already exist in $home_. Reset them to the original state (clears their chats and audit log)?")) {
    Write-Host "  Kept the existing demo folders."
} elseif ($seeded -and $Yes) {
    Write-Host "  Demo folders already in $home_; kept them."
} else {
    Run 'Loading demo folders' { uv run python scripts/seed_demo.py --reset --no-warm }
}
Pop-Location

Write-Host "`nSetup complete. Everything from here runs offline." -ForegroundColor Green
Write-Host @"

Start Talaan (two terminals, from $Root):
  1) cd backend;  uv run uvicorn app.main:app      -> API on http://localhost:8000
  2) cd frontend; npm run dev                      -> open http://localhost:5173

Switch the chat model any time on the Settings page.
"@
