"""Choose and download the local models (part of setup.bat / setup.sh).

    uv run python -m scripts.setup_models              # interactive: shows guidance, asks
    uv run python -m scripts.setup_models --yes        # take the recommendation for this laptop
    uv run python -m scripts.setup_models --model qwen3.5:4b
    uv run python -m scripts.setup_models --all        # all three chat models

Always pulls the embedding model too. Uses the same hardware detection and RAM budget as the
app (app/system/tier.py, app/llm/models.py), so the recommendation matches what "Automatic"
picks on the Settings page. Needs Ollama running; the only step that needs internet.
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # make `app` importable

from app import config  # noqa: E402
from app.llm import client  # noqa: E402
from app.llm.models import EMBED_MEM_GB, EMBED_MODEL, RESERVE_GB, TIER_BY_ID, TIERS  # noqa: E402
from app.system import tier as hw_tier  # noqa: E402

DOWNLOAD_GB = {"qwen3.5:2b": 2.7, "qwen3.5:4b": 3.3, "gemma4:e4b": 6.6, EMBED_MODEL: 0.64}  # `ollama list`
GUIDE = {
    "qwen3.5:2b": "Fastest and smallest. Fine for search and short answers with sources; "
                  "missed the contradiction question in our tests (21/27).",
    "qwen3.5:4b": "Most accurate in our tests (24/27, found every contradiction), "
                  "but slower: ~31 s per answer on an 8 GB laptop.",
    "gemma4:e4b": "Strong all-round (23/27) and best for case timelines; needs the most memory.",
}


def ollama_ready() -> bool:
    if not shutil.which("ollama"):
        print("Ollama is not installed. Get it from https://ollama.com, then run setup again.")
        return False
    try:
        client.httpx.get(f"{config.OLLAMA_BASE_URL}/api/version", timeout=5).raise_for_status()
    except client.httpx.HTTPError:
        print(f"Ollama is not running at {config.OLLAMA_BASE_URL}. Open the Ollama app (or run "
              "`ollama serve` in another terminal), then run setup again.")
        return False
    return True


def show(hw: hw_tier.Hardware, installed: list[str], rec: str) -> None:
    print(f"\nThis laptop: {hw.ram_gb} GB RAM | {hw.gpu or 'no GPU detected'} | {hw.free_disk_gb} GB free disk")
    print(f"A model fits when it, the embedding model ({EMBED_MEM_GB:g} GB) and {RESERVE_GB:g} GB for the OS, "
          "browser and backend\nall fit in RAM together. A GPU makes answers faster but isn't counted as extra room.\n")
    for i, t in enumerate(TIERS, 1):
        marks = []
        if t.chat_model == rec:
            marks.append("RECOMMENDED")
        if t.chat_model in installed:
            marks.append("installed")
        if not hw_tier.fits(hw, t.id):
            marks.append("may be slow here")
        print(f"  {i}) {t.chat_model:<11} {t.name:<7} {DOWNLOAD_GB[t.chat_model]:>4} GB download | "
              f"needs {t.min_mem_gb} GB RAM   {' | '.join(marks)}")
        print(f"     {GUIDE[t.chat_model]}")
    total = sum(DOWNLOAD_GB[t.chat_model] for t in TIERS)
    print(f"  {len(TIERS) + 1}) all three ({total:.1f} GB), to compare them on the Settings page\n")


def ask(rec: str) -> list[str]:
    default = next(i for i, t in enumerate(TIERS, 1) if t.chat_model == rec)
    while True:
        raw = input(f"Which chat model should be downloaded? [1-{len(TIERS) + 1}, Enter = {default}] ").strip()
        n = int(raw) if raw.isdigit() else default if not raw else 0
        if 1 <= n <= len(TIERS):
            return [TIERS[n - 1].chat_model]
        if n == len(TIERS) + 1:
            return [t.chat_model for t in TIERS]
        print("  Type a number from the list.")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    pick = ap.add_mutually_exclusive_group()
    pick.add_argument("--yes", action="store_true", help="download the recommended model without asking")
    pick.add_argument("--model", choices=[t.chat_model for t in TIERS], help="download this chat model")
    pick.add_argument("--all", action="store_true", help="download all three chat models")
    args = ap.parse_args()

    if not ollama_ready():
        return 1
    hw = hw_tier.detect()
    installed = client.installed_models()
    rec = TIER_BY_ID[hw_tier.recommended(hw)].chat_model
    show(hw, installed, rec)

    if args.model:
        chosen = [args.model]
    elif args.all:
        chosen = [t.chat_model for t in TIERS]
    elif args.yes or not sys.stdin.isatty():
        chosen = [rec]
    else:
        chosen = ask(rec)

    todo = [m for m in [EMBED_MODEL, *chosen] if m not in installed]
    need = sum(DOWNLOAD_GB[m] for m in todo)
    if need and hw.free_disk_gb < need + 2:
        print(f"Not enough disk: these downloads need ~{need:.1f} GB, {hw.free_disk_gb} GB is free.")
        return 1
    for m in [EMBED_MODEL, *chosen]:
        if m in installed:
            print(f"OK  {m} already downloaded")
            continue
        print(f"\nDownloading {m} ({DOWNLOAD_GB[m]} GB)...")
        if subprocess.run(["ollama", "pull", m]).returncode != 0:
            print(f"Download of {m} failed. Check the internet connection and run setup again.")
            return 1

    print("\nModels ready. The app runs the best downloaded model that fits this laptop ('Automatic');")
    print("you can switch between downloaded models on the Settings page.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
