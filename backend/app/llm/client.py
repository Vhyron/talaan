"""Thin Ollama client (B1). Local only: the base URL defaults to localhost.

Uses Ollama's native API rather than /v1 because only the native API takes `num_ctx` and
`think` per request; without `num_ctx` Ollama silently truncates long prompts.
"""

import json
import time
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
) -> ChatResult:
    """One chat turn. Pass `schema` for constrained JSON output; keep `think` off for JSON calls."""
    from app.llm.selection import active_chat_model  # avoid an import cycle with selection

    tag = model or active_chat_model().tag
    body: dict[str, Any] = {
        "model": tag,
        "messages": messages,
        "stream": False,
        "think": think,
        "options": {"num_ctx": config.NUM_CTX, "temperature": temperature},
    }
    if schema is not None:
        body["format"] = schema.model_json_schema() if isinstance(schema, type) else schema

    prompt = "\n\n".join(f"[{m['role']}]\n{m['content']}" for m in messages)
    t0 = time.perf_counter()
    try:
        d = _post("/api/chat", body, CHAT_TIMEOUT)
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
        d = _post("/api/embed", {"model": EMBED_MODEL, "input": texts, "options": {"num_ctx": EMBED_NUM_CTX}}, 120.0)
    except OllamaError as e:
        trace.record("embed", EMBED_MODEL, seconds=time.perf_counter() - t0, inputs=len(texts), error=str(e))
        raise
    trace.record("embed", d.get("model", EMBED_MODEL), ollama=d, seconds=time.perf_counter() - t0,
                 num_ctx=EMBED_NUM_CTX, inputs=len(texts))
    return EmbedResult(vectors=d["embeddings"], model=d.get("model", EMBED_MODEL))


def load(tag: str) -> None:
    """Load a chat model into memory now, with the same num_ctx chat() uses (so no reload later)."""
    t0 = time.perf_counter()
    try:
        d = _post("/api/generate", {"model": tag, "keep_alive": "30m", "options": {"num_ctx": config.NUM_CTX}}, CHAT_TIMEOUT)
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
