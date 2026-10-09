"""Thin Ollama client (B1). Local only: the base URL defaults to localhost.

Uses Ollama's native API rather than /v1 because only the native API takes `num_ctx` and
`think` per request; without `num_ctx` Ollama silently truncates long prompts.
"""

import itertools
import json
import sys
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import httpx
from pydantic import BaseModel

from app import config
from app.llm import trace
from app.llm.models import EMBED_MODEL

CHAT_TIMEOUT = 300.0  # first call includes loading the model from disk
# Chunks are ~400–600 tokens (B2). At 8192 the embedder grew to 2.9 GB and evicted the chat model
# on an 8 GB M2; at 2048 both stay loaded on the GPU (measured with `ollama ps`).
EMBED_NUM_CTX = 2048


class OllamaError(RuntimeError):
    """Ollama is not running, or the model is not pulled. Message says how to fix it."""


@dataclass
class ChatResult:
    content: str
    model: str  # exact tag that answered, for the audit log
    seconds: float
    data: Any = None  # parsed JSON when a schema was given and the output parsed


@dataclass
class EmbedResult:
    vectors: list[list[float]]
    model: str


def _post(path: str, body: dict, timeout: float) -> dict:
    url = f"{config.OLLAMA_BASE_URL}{path}"
    try:
        r = httpx.post(url, json=body, timeout=timeout)
    except httpx.TimeoutException as e:
        raise OllamaError(f"{body.get('model', 'Model')} took longer than {timeout:.0f}s and was stopped. "
                          "Try a smaller model or a shorter prompt (thinking mode is slow).") from e
    except httpx.TransportError as e:
        raise OllamaError(f"Ollama is not reachable at {config.OLLAMA_BASE_URL}. Start it with `ollama serve`.") from e
    if r.status_code == 404 and "model" in body:
        raise OllamaError(f"Model {body['model']} is not installed. Run `ollama pull {body['model']}`.")
    if r.is_error:
        raise OllamaError(f"Ollama error {r.status_code}: {r.text[:300]}")
    return r.json()


_DIM, _BOLD, _CYAN, _RESET, _CLEAR = "\033[2m", "\033[1m", "\033[36m", "\033[0m", "\r\033[2K"
_live_lock = threading.Lock()  # one live call prints at a time so parallel calls don't interleave


def _out(text: str) -> None:
    enc = sys.stdout.encoding or "utf-8"  # cp1252 on a Windows console: replace what it can't print
    sys.stdout.write(text.encode(enc, "replace").decode(enc))
    sys.stdout.flush()


def _loaded(tag: str) -> bool:
    try:
        return any(m.get("name") == tag for m in httpx.get(f"{config.OLLAMA_BASE_URL}/api/ps", timeout=2).json()["models"])
    except (httpx.HTTPError, KeyError, ValueError):
        return True  # unknown: don't claim a load


def _status(stop: threading.Event, label: str, t0: float) -> None:
    """LM Studio-style status line, redrawn until the first token arrives."""
    spin = itertools.cycle("|/-\\")
    while not stop.wait(0.25):
        _out(f"{_CLEAR}{_CYAN}{next(spin)} {label}... {time.perf_counter() - t0:.1f}s{_RESET}")


def _stats(d: dict, seconds: float) -> str:
    def part(name: str, n: int | None, ns: int | None) -> str:
        if not ns:
            return ""
        rate = f", {n / (ns / 1e9):.1f} tok/s" if n else ""
        return f"{name} {n if n is not None else '?'} tok in {ns / 1e9:.2f}s{rate} | "
    load = f"load {d['load_duration'] / 1e9:.2f}s | " if d.get("load_duration", 0) > 5e7 else ""
    return (f"{load}{part('prompt', d.get('prompt_eval_count'), d.get('prompt_eval_duration'))}"
            f"{part('gen', d.get('eval_count'), d.get('eval_duration'))}total {seconds:.2f}s"
            f" | stop: {d.get('done_reason', '?')}")


def _with_spinner(label: str, fn):
    """LLM_LIVE_LOG: show a status line while `fn` runs (model load/unload), then clear it."""
    with _live_lock:
        t0, stop = time.perf_counter(), threading.Event()
        ticker = threading.Thread(target=_status, args=(stop, label, t0), daemon=True)
        ticker.start()
        try:
            return fn()
        finally:
            stop.set()
            ticker.join()
            _out(_CLEAR)


def _describe(m: dict) -> str:
    """One loaded model from /api/ps, like `ollama ps`: where it runs, its context, when it unloads."""
    size, vram = m.get("size") or 0, m.get("size_vram") or 0
    where = "100% GPU" if size and vram >= size else "100% CPU" if not vram else f"{vram / size:.0%} GPU"
    det = m.get("details", {})
    exp = m.get("expires_at", "")
    until = "never" if exp[:4] > "2100" else exp[11:16]  # keep_alive -1 shows as year 2318+
    return (f"{m['name']} ({det.get('parameter_size', '?')} {det.get('quantization_level', '')}) | {where}"
            f" | ctx {m.get('context_length', '?')} | unloads {until or '?'}")


def _watch_models(interval: float) -> None:
    seen: dict[str, str] | None = None  # name -> description; None = Ollama unreachable
    first = True
    while True:
        try:
            now = {m["name"]: _describe(m) for m in
                   httpx.get(f"{config.OLLAMA_BASE_URL}/api/ps", timeout=2).json().get("models", [])}
        except (httpx.HTTPError, ValueError, KeyError):
            now = None
        if (first or now != seen) and _live_lock.acquire(blocking=False):  # never cut into a streaming answer
            try:
                stamp = time.strftime("%H:%M:%S")
                if now is None:
                    _out(f"{_CYAN}{stamp} [ollama] not reachable at {config.OLLAMA_BASE_URL}{_RESET}\n")
                elif not now:
                    _out(f"{_CYAN}{stamp} [ollama] no models loaded{_RESET}\n")
                else:
                    for name, desc in now.items():
                        if first or seen is None or seen.get(name) != desc:
                            verb = "running" if first or (seen and name in seen) else "loaded"
                            _out(f"{_CYAN}{stamp} [ollama] {verb}: {desc}{_RESET}\n")
                    for name in (seen or {}).keys() - now.keys():
                        _out(f"{_CYAN}{stamp} [ollama] unloaded: {name}{_RESET}\n")
                seen, first = now, False
            finally:
                _live_lock.release()
        time.sleep(interval)


def live_note(text: str) -> None:
    """LLM_LIVE_LOG: one status line in the live terminal (e.g. why a question never reached the model)."""
    with _live_lock:
        _out(f"{_CYAN}{time.strftime('%H:%M:%S')} {text}{_RESET}\n")


def watch_models(interval: float = 2.0) -> None:
    """LLM_LIVE_LOG: print to the terminal whenever Ollama loads or unloads a model (polls /api/ps)."""
    threading.Thread(target=_watch_models, args=(interval,), daemon=True, name="ollama-watch").start()


Delta = Callable[[str, str], None]  # (kind "thinking" | "content", text) as tokens arrive


def _stream_chat(body: dict, prompt: str, on_delta: Delta | None = None) -> dict:
    """Stream /api/chat: to the terminal (LLM_LIVE_LOG) and/or `on_delta`; returns a non-stream-shaped result."""
    if not config.LLM_LIVE_LOG:
        return _stream_chat_inner(body, prompt, on_delta, live=False)
    with _live_lock:
        return _stream_chat_inner(body, prompt, on_delta, live=True)


def _stream_chat_inner(body: dict, prompt: str, on_delta: Delta | None, live: bool) -> dict:
    out = _out if live else (lambda _text: None)
    url = f"{config.OLLAMA_BASE_URL}/api/chat"
    schema = " | json schema" if "format" in body else ""
    est = len(prompt) // 4  # rough token estimate; Ollama reports the real count at the end
    out(f"\n{_BOLD}== {body['model']} | num_ctx {config.NUM_CTX} | think {body['think']}{schema} "
        f"| ~{est:,} prompt tok =={_RESET}\n")
    if config.LLM_LIVE_PROMPT:
        out(f"{_BOLD}-- prompt --{_RESET}\n{_DIM}{prompt}{_RESET}\n{_BOLD}-- output --{_RESET}\n")
    label = "processing prompt" if not live or _loaded(body["model"]) else "loading model + processing prompt"
    t0 = time.perf_counter()
    stop = threading.Event()
    ticker = threading.Thread(target=_status, args=(stop, label, t0), daemon=True)
    if live:
        ticker.start()

    def first_token() -> None:
        if not stop.is_set():
            stop.set()
            if live:
                ticker.join()
                out(f"{_CLEAR}{_CYAN}[{label}: {time.perf_counter() - t0:.1f}s]{_RESET}\n")

    content, thinking, last, in_thinking = [], [], {}, False
    try:
        with httpx.stream("POST", url, json={**body, "stream": True}, timeout=CHAT_TIMEOUT) as r:
            if r.status_code == 404:
                raise OllamaError(f"Model {body['model']} is not installed. Run `ollama pull {body['model']}`.")
            if r.is_error:
                raise OllamaError(f"Ollama error {r.status_code}: {r.read().decode()[:300]}")
            for line in r.iter_lines():
                if not line:
                    continue
                last = json.loads(line)
                msg = last.get("message", {})
                if t := msg.get("thinking"):
                    first_token()
                    if not in_thinking:
                        out(f"{_DIM}[thinking] ")
                        in_thinking = True
                    thinking.append(t)
                    out(t)
                    if on_delta:
                        on_delta("thinking", t)
                if c := msg.get("content"):
                    first_token()
                    if in_thinking:
                        out(f"{_RESET}\n")
                        in_thinking = False
                    content.append(c)
                    out(c)
                    if on_delta:
                        on_delta("content", c)
    except httpx.TimeoutException as e:
        raise OllamaError(f"{body['model']} took longer than {CHAT_TIMEOUT:.0f}s and was stopped. "
                          "Try a smaller model or a shorter prompt (thinking mode is slow).") from e
    except httpx.TransportError as e:
        raise OllamaError(f"Ollama is not reachable at {config.OLLAMA_BASE_URL}. Start it with `ollama serve`.") from e
    finally:
        first_token()
        out(_RESET)
    out(f"\n{_BOLD}-- {_stats(last, time.perf_counter() - t0)} --{_RESET}\n")
    last["message"] = {"role": "assistant", "content": "".join(content), "thinking": "".join(thinking)}
    return last


def installed_models() -> list[str]:
    """Tags Ollama has locally, or [] if Ollama is not running."""
    try:
        r = httpx.get(f"{config.OLLAMA_BASE_URL}/api/tags", timeout=5)
        r.raise_for_status()
    except httpx.HTTPError:
        return []
    return [m["name"] for m in r.json().get("models", [])]


def chat(
    messages: list[dict],
    schema: type[BaseModel] | dict | None = None,
    think: bool = False,
    model: str | None = None,
    temperature: float = 0.0,
    on_delta: Delta | None = None,
) -> ChatResult:
    """One chat turn. Pass `schema` for constrained JSON output; keep `think` off for action calls.
    `on_delta` receives tokens as they generate (streams the request); the result is the same either way."""
    from app.llm.selection import active_chat_model  # avoid an import cycle with selection

    tag = model or active_chat_model().tag
    body: dict[str, Any] = {
        "model": tag,
        "messages": messages,
        "stream": False,
        "think": think,
        "keep_alive": config.MODEL_KEEP_ALIVE,
        "options": {"num_ctx": config.NUM_CTX, "temperature": temperature},
    }
    if schema is not None:
        body["format"] = schema.model_json_schema() if isinstance(schema, type) else schema

    prompt = "\n\n".join(f"[{m['role']}]\n{m['content']}" for m in messages)
    t0 = time.perf_counter()
    try:
        d = (_stream_chat(body, prompt, on_delta) if config.LLM_LIVE_LOG or on_delta
             else _post("/api/chat", body, CHAT_TIMEOUT))
    except OllamaError as e:
        trace.record("chat", tag, seconds=time.perf_counter() - t0, num_ctx=config.NUM_CTX, think=think,
                     prompt=prompt, error=str(e))
        raise
    seconds = time.perf_counter() - t0
    content = d["message"]["content"]
    data = None
    if schema is not None:
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            data = None  # caller decides; policy.handle() rejects and logs invalid actions
    answered_by = d.get("model", tag)
    trace.record("chat", answered_by, ollama=d, seconds=seconds, num_ctx=config.NUM_CTX, think=think,
                 json_valid=None if schema is None else data is not None, prompt=prompt, response=content)
    return ChatResult(content=content, model=answered_by, seconds=seconds, data=data)


def embed(texts: list[str]) -> EmbedResult:
    t0 = time.perf_counter()
    try:
        d = _post("/api/embed", {"model": EMBED_MODEL, "input": texts, "keep_alive": config.MODEL_KEEP_ALIVE, "options": {"num_ctx": EMBED_NUM_CTX}}, 120.0)
    except OllamaError as e:
        trace.record("embed", EMBED_MODEL, seconds=time.perf_counter() - t0, inputs=len(texts), error=str(e))
        raise
    trace.record("embed", d.get("model", EMBED_MODEL), ollama=d, seconds=time.perf_counter() - t0,
                 num_ctx=EMBED_NUM_CTX, inputs=len(texts))
    return EmbedResult(vectors=d["embeddings"], model=d.get("model", EMBED_MODEL))


def load(tag: str) -> None:
    """Load a chat model into memory now, with the same num_ctx chat() uses (so no reload later)."""
    t0 = time.perf_counter()
    body = {"model": tag, "keep_alive": config.MODEL_KEEP_ALIVE, "options": {"num_ctx": config.NUM_CTX}}
    try:
        if config.LLM_LIVE_LOG:
            d = _with_spinner(f"loading {tag} (num_ctx {config.NUM_CTX})", lambda: _post("/api/generate", body, CHAT_TIMEOUT))
        else:
            d = _post("/api/generate", body, CHAT_TIMEOUT)
    except OllamaError as e:
        trace.record("load", tag, seconds=time.perf_counter() - t0, num_ctx=config.NUM_CTX, error=str(e))
        raise
    trace.record("load", tag, ollama=d, seconds=time.perf_counter() - t0, num_ctx=config.NUM_CTX)


def unload(tag: str) -> None:
    """Free a model's memory. Matters on 8 GB machines where two chat models don't fit."""
    t0 = time.perf_counter()
    try:
        _post("/api/generate", {"model": tag, "keep_alive": 0}, 30.0)
    except OllamaError:
        return  # not loaded or not installed: nothing to free
    trace.record("unload", tag, seconds=time.perf_counter() - t0)


def warm() -> None:
    """Load the active chat model and the embedder now, so the first question doesn't wait on a load."""
    from app.llm.selection import active_chat_model  # avoid an import cycle with selection

    for name, step in (("chat model", lambda: load(active_chat_model().tag)), ("embedder", lambda: embed(["warm-up"]))):
        try:
            step()
        except OllamaError as e:
            trace.log.warning("could not preload the %s: %s", name, e)


def release() -> None:
    """On shutdown: give both models back to Ollama's default timeout instead of holding memory forever."""
    from app.llm.selection import active_chat_model

    for path, body in (("/api/generate", {"model": active_chat_model().tag}), ("/api/embed", {"model": EMBED_MODEL, "input": []})):
        try:
            _post(path, {**body, "keep_alive": "5m"}, 5.0)  # no prompt: only resets the timer
        except OllamaError:
            pass
