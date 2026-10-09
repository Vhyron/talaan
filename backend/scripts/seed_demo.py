"""Put Talaan into a known, demo-ready state.

    uv run scripts/seed_demo.py --reset     # restore the 4 demo folders, clear their
                                            # grants, proposals, audit and chat history
    uv run scripts/seed_demo.py --fresh --yes
                                            # wipe TALAAN_HOME entirely, then seed

Both then build each demo folder's index and warm the local models so the first
answer on stage isn't slow. Run from backend/. Respects TALAAN_HOME.
"""

import argparse
import json
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # make `app` importable

from app import config  # noqa: E402
from app.db import connect  # noqa: E402
from app.folders import META, _meta  # noqa: E402
from app.policy.grants import init_grants  # noqa: E402

DEMO_DATA = Path(__file__).resolve().parents[2] / "demo-data"
GROUPS = ("hr", "clinic")
# Only these may exist in TALAAN_HOME before a full wipe. Anything else means the
# path is probably wrong (e.g. TALAAN_HOME pointed at a real directory).
WIPEABLE = {"folders", "app.db", "app.db-journal", "app.db-wal", "app.db-shm"}


def demo_folders() -> list[Path]:
    return sorted(p for g in GROUPS for p in (DEMO_DATA / g).iterdir() if p.is_dir())


def wipe_home(home: Path) -> None:
    if not home.exists():
        return
    unexpected = sorted(p.name for p in home.iterdir() if p.name not in WIPEABLE)
    if unexpected:
        sys.exit(f"Refusing to wipe {home}: it contains {', '.join(unexpected)}. Check TALAAN_HOME.")
    shutil.rmtree(home)


def copy_folder(src: Path) -> str:
    dest = config.FOLDERS_DIR / src.name
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(src, dest)
    # Record name and mode explicitly so the folder never depends on name guessing.
    meta = _meta(dest).model_dump(mode="json", exclude={"id"})
    (dest / ".talaan").mkdir(exist_ok=True)
    (dest / ".talaan" / META).write_text(json.dumps(meta), encoding="utf-8")
    return src.name


def clear_state(folder_ids: list[str]) -> None:
    """Default grants, no proposals, no audit, no chat history for these folders."""
    marks = ",".join("?" * len(folder_ids))
    with connect() as db:
        for table in ("grants", "audit", "proposals", "chat_messages", "chat_sessions"):
            db.execute(f"DELETE FROM {table} WHERE folder_id IN ({marks})", folder_ids)
    for fid in folder_ids:
        init_grants(fid)


def build_indexes(folder_ids: list[str]) -> None:
    # The route function is the stable contract; B3 swaps in the real index behind it.
    from app.main import build_index

    for fid in folder_ids:
        result = build_index(fid)
        print(f"  indexed {fid}: {result}")


def warm_models() -> None:
    """Load the active chat model (picked by hardware tier, see app/llm/selection.py) and the
    embedding model, kept loaded for 30 minutes. Goes through app/llm/client.py so both load with
    the num_ctx real calls use; a different num_ctx would make Ollama reload them on the first question."""
    from app.llm import client
    from app.llm.models import EMBED_MODEL
    from app.llm.selection import active_chat_model

    chat_tag = active_chat_model().tag
    for label, tag, warm in [("chat", chat_tag, lambda: client.load(chat_tag)),
                             ("embed", EMBED_MODEL, lambda: client.embed(["warm up"]))]:
        t = time.perf_counter()
        try:
            warm()
            print(f"  warmed {label} model {tag} in {time.perf_counter() - t:.1f}s")
        except client.OllamaError as e:
            print(f"  skipped {label} warm-up ({tag}): {e}")


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--reset", action="store_true", help="restore the demo folders and clear their state")
    mode.add_argument("--fresh", action="store_true", help="wipe TALAAN_HOME entirely, then seed (needs --yes)")
    ap.add_argument("--yes", action="store_true", help="confirm the wipe for --fresh")
    ap.add_argument("--no-warm", action="store_true", help="skip warming the Ollama models")
    args = ap.parse_args(argv)

    start = time.perf_counter()
    home = config.TALAAN_HOME
    print(f"TALAAN_HOME = {home}")

    if args.fresh:
        if not args.yes:
            sys.exit("--fresh deletes everything in TALAAN_HOME. Re-run with --fresh --yes to confirm.")
        wipe_home(home)
        print("  wiped")

    config.FOLDERS_DIR.mkdir(parents=True, exist_ok=True)
    ids = [copy_folder(src) for src in demo_folders()]
    print(f"  restored {len(ids)} demo folders: {', '.join(ids)}")
    clear_state(ids)
    print("  default grants set; proposals, audit and chat history cleared")

    build_indexes(ids)
    if not args.no_warm:
        warm_models()

    print(f"Demo ready in {time.perf_counter() - start:.1f}s")


if __name__ == "__main__":
    main()
