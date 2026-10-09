"""LLM activity trace: every model call, printed to the backend terminal and kept in memory.

Prompts contain client files, so prompt/response text is recorded only when the user turns on
"Record prompts" (or LLM_LOG_PROMPTS=1), and even then only in memory: never written to disk,
gone on restart. Timing and token counts are always recorded.
"""

import itertools
import logging
import os
import sys
import threading
from collections import deque
from datetime import datetime, timezone

from app.db import connect
from app.schemas import LlmCall, LlmCallKind

MAX_CALLS = 200
NEAR_CTX = 0.9  # warn when the prompt fills this share of num_ctx (Ollama truncates silently)
PREVIEW = 160  # chars of prompt/response printed to the terminal

log = logging.getLogger("talaan.llm")
if not log.handlers:
    _h = logging.StreamHandler(sys.stdout)
    _h.setFormatter(logging.Formatter("%(asctime)s [llm] %(message)s", "%H:%M:%S"))
    log.addHandler(_h)
    log.setLevel(logging.INFO)
    log.propagate = False

_calls: deque[LlmCall] = deque(maxlen=MAX_CALLS)
_ids = itertools.count(1)
_lock = threading.Lock()


def log_prompts() -> bool:
    if os.environ.get("LLM_LOG_PROMPTS") == "1":
        return True
    with connect() as db:
        row = db.execute("SELECT value FROM settings WHERE key = 'log_prompts'").fetchone()
    return bool(row) and row["value"] == "1"


def set_log_prompts(on: bool) -> None:
    with connect() as db:
        db.execute(
            "INSERT INTO settings (key, value) VALUES ('log_prompts', ?) "
            "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            ("1" if on else "0",),
        )
    if not on:
        with _lock:  # turning it off also forgets text already held in memory
            for i, c in enumerate(_calls):
                _calls[i] = c.model_copy(update={"prompt": None, "response": None})


def _sec(ns: int | None) -> float | None:
    return round(ns / 1e9, 2) if ns else None


def record(
    kind: LlmCallKind,
    model: str,
    *,
    ollama: dict | None = None,
    seconds: float,
    num_ctx: int | None = None,
    think: bool | None = None,
    json_valid: bool | None = None,
    inputs: int | None = None,
    prompt: str | None = None,
    response: str | None = None,
    error: str | None = None,
) -> LlmCall:
    d = ollama or {}
    prompt_tokens = d.get("prompt_eval_count")
    out_tokens = d.get("eval_count")
    tok_s = round(out_tokens / (d["eval_duration"] / 1e9), 1) if out_tokens and d.get("eval_duration") else None

    warning = None
    if prompt_tokens and num_ctx and prompt_tokens >= NEAR_CTX * num_ctx:
        warning = f"prompt used {prompt_tokens:,}/{num_ctx:,} tokens; near the context limit, may be truncated"
    if json_valid is False:
        warning = "output was not valid JSON"

    keep = log_prompts()
    call = LlmCall(
        id=next(_ids),
        timestamp=datetime.now(timezone.utc),
        kind=kind,
        model=model,
        ok=error is None,
        error=error,
        warning=warning,
        num_ctx=num_ctx,
        think=think,
        inputs=inputs,
        prompt_tokens=prompt_tokens,
        output_tokens=out_tokens,
        tokens_per_s=tok_s,
        load_s=_sec(d.get("load_duration")),
        total_s=round(seconds, 2),
        json_valid=json_valid,
        prompt=prompt if keep else None,
        response=response if keep else None,
    )
    with _lock:
        _calls.append(call)
    _print(call)
    return call


def _print(c: LlmCall) -> None:
    parts = [f"{c.kind:<6} {c.model}"]
    if c.kind == "chat":
        parts.append(f"ctx {c.num_ctx} think {'on' if c.think else 'off'}")
        parts.append(f"prompt {c.prompt_tokens or '?'} tok -> out {c.output_tokens or '?'} tok")
        if c.tokens_per_s:
            parts.append(f"{c.tokens_per_s} tok/s")
    elif c.kind == "embed":
        parts.append(f"{c.inputs} texts, {c.prompt_tokens or '?'} tok")
    if c.load_s and c.load_s >= 0.5:
        parts.append(f"load {c.load_s}s")
    parts.append(f"{c.total_s}s")
    line = " | ".join(parts)
    if c.error:
        log.error("%s | ERROR %s", line, c.error)
        return
    log.info(line)
    if c.warning:
        log.warning("  ! %s", c.warning)
    if c.prompt:
        log.info("  > %s", _preview(c.prompt))
    if c.response:
        log.info("  < %s", _preview(c.response))


def _preview(s: str) -> str:
    s = " ".join(s.split())
    return s if len(s) <= PREVIEW else s[:PREVIEW] + "..."


def recent(after: int = 0) -> list[LlmCall]:
    with _lock:
        return [c for c in _calls if c.id > after]


def clear() -> None:
    with _lock:
        _calls.clear()
