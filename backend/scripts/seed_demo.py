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
import urllib.error
import urllib.request
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
        for table in ("grants", "audit", "proposals", "conversations"):
            db.execute(f"DELETE FROM {table} WHERE folder_id IN ({marks})", folder_ids)
    for fid in folder_ids:
        init_grants(fid)


def build_indexes(folder_ids: list[str]) -> None:
    # The route function is the stable contract; B3 swaps in the real index behind it.
    from app.main import build_index

    for fid in folder_ids:
        result = build_index(fid)
        print(f"  indexed {fid}: {result}")


def _post(path: str, body: dict, timeout: float) -> None:
    req = urllib.request.Request(
        f"{config.OLLAMA_BASE_URL}{path}",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        r.read()


def warm_models() -> None:
    """One tiny chat and one embed call, kept loaded for 30 minutes."""
    calls = [
        ("chat", "/api/chat", {"model": config.CHAT_MODEL, "messages": [{"role": "user", "content": "hi"}],
                               "stream": False, "keep_alive": "30m", "options": {"num_ctx": config.NUM_CTX, "num_predict": 1}}),
        ("embed", "/api/embed", {"model": config.EMBED_MODEL, "input": "warm up", "keep_alive": "30m"}),
    ]
    for label, path, body in calls:
        t = time.perf_counter()
        try:
            _post(path, body, timeout=180)
            print(f"  warmed {label} model {body['model']} in {time.perf_counter() - t:.1f}s")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            print(f"  skipped {label} warm-up ({body['model']}): {getattr(e, 'reason', e)}. Is Ollama running?")


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
