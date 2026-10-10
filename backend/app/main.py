"""Talaan API. Routes not yet implemented return fixture data (see app/fixtures.py)."""

import json
import logging
import queue
import tempfile
import threading
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from fastapi import BackgroundTasks, FastAPI, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, Response, StreamingResponse

from app import config
from app import fixtures as fx
from app import ask as ask_mod
from app import audit as audit_log
from app import chats, folders, global_ask, index, rename, trash
from app import timeline as case_timeline
from app import transcribe as voice
from app.policy import engine, grants, proposals
from app.llm import client, selection, trace
from app.llm.client import OllamaError
from app.llm.models import EMBED_MODEL
from app.schemas import (
    FolderRename, GlobalAskRequest, PathRef, PathRename, TrashItem,
    CreateDraftAction,
    AppSettings, AskRequest, AskResponse, AuditEvent, ChatRename, ChatSession, ChatSessionSummary, DirCreate, FileEntry, Folder, FolderCreate, FolderRename, Grants, IndexStatus, LlmCall, ModelChoice,
    Outcome,
    Proposal, SystemTier, TimelineResponse, VoiceStatus,
)

@asynccontextmanager
async def lifespan(_: FastAPI):
    # Chat model + embedder ready before the first question, and kept loaded while the app runs.
    threading.Thread(target=client.warm, daemon=True, name="ollama-warm").start()
    yield
    client.release()


app = FastAPI(title="Talaan", description="Local AI for sensitive client files. Nothing leaves this laptop.",
              lifespan=lifespan)

if config.LLM_LIVE_LOG:  # dev/demo: say in the terminal which models Ollama has loaded, as it changes
    client.watch_models()

    class _QuietPolling(logging.Filter):
        """Hide the Settings page polling from the access log so the live model output stays readable."""

        def filter(self, record: logging.LogRecord) -> bool:
            return not any(p in record.getMessage() for p in ("/system/llm-log", "GET /health"))

    logging.getLogger("uvicorn.access").addFilter(_QuietPolling())

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


@app.middleware("http")
async def only_local_pages_change_things(request: Request, call_next):
    """CORS hides the reply from other websites but does not stop the request: a page open in the
    same browser could still import a file (a planted prompt injection) or approve a proposal.
    Browsers send Origin on every cross-site write, so refuse writes from any non-local page.
    No Origin at all (curl, scripts, tests) is not a browser page and is allowed."""
    origin = request.headers.get("origin")
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and origin is not None:
        try:
            host = urlsplit(origin).hostname
        except ValueError:
            host = None
        if host not in LOCAL_HOSTS:
            return JSONResponse(status_code=403, content={"detail": "Requests from other websites are not allowed"})
    return await call_next(request)

@app.exception_handler(OllamaError)
def ollama_error(_: Request, e: OllamaError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(e)})


def _folder(folder_id: str) -> Folder:
    return folders.get_folder(folder_id)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "chat_model": selection.active_chat_model().tag, "embed_model": EMBED_MODEL}


# --- Folders and files (A2) --------------------------------------------------


@app.get("/folders")
def list_folders() -> list[Folder]:
    return folders.list_folders()


@app.post("/folders", status_code=201)
def create_folder(body: FolderCreate) -> Folder:
    return folders.create_folder(body)


@app.get("/folders/{folder_id}")
def get_folder(folder_id: str) -> Folder:
    return folders.get_folder(folder_id)


@app.get("/folders/{folder_id}/files")
def list_files(folder_id: str) -> list[FileEntry]:
    return folders.list_files(folder_id)


@app.get("/folders/{folder_id}/files/{path:path}", response_model=None)
def read_file(folder_id: str, path: str) -> PlainTextResponse | FileResponse:
    target = folders.file_path(folder_id, path)
    if target.suffix.lower() == ".pdf":
        return FileResponse(target, media_type="application/pdf")
    return PlainTextResponse(target.read_text(encoding="utf-8", errors="replace"))


@app.delete("/folders/{folder_id}/files/{path:path}", status_code=204)
def delete_file(folder_id: str, path: str) -> None:
    """User-only, from the file tree. The model's `delete` action still goes through the policy engine."""
    rel_path = folders.delete_file(folder_id, path)
    audit_log.log_event(folder_id, "user", "file_deleted", action="delete", path=rel_path)
    index.refresh(folder_id)  # drop its chunks so answers can't cite it


@app.get("/folders/{folder_id}/dirs")
def list_dirs(folder_id: str) -> list[str]:
    """Subfolders, folder-relative (`.talaan/` hidden). Empty ones included."""
    return folders.list_dirs(folder_id)


@app.patch("/folders/{folder_id}")
def rename_folder(folder_id: str, body: FolderRename) -> Folder:
    """Change the folder's display name. Its id (and so its grants, audit and chat) stays."""
    return rename.rename_folder(folder_id, body.name)


@app.post("/folders/{folder_id}/rename")
async def rename_path(folder_id: str, body: PathRename) -> dict[str, str]:
    """Rename a file or subfolder (user only; the model has no rename action). Re-indexes."""
    new = await run_in_threadpool(rename.rename_path, folder_id, body.path, body.name)
    return {"path": new}


# --- Trash (user only; the model's own `delete` stays a proposal under the Delete grant) ----


@app.delete("/folders/{folder_id}")
def trash_folder(folder_id: str) -> TrashItem:
    """Move a whole folder to the Trash. Its grants, audit log and chats stay in app.db."""
    return trash.trash_folder(folder_id)


@app.post("/folders/{folder_id}/trash")
async def trash_path(folder_id: str, body: PathRef) -> TrashItem:
    """Move a file or subfolder to the Trash (re-indexes the folder)."""
    return await run_in_threadpool(trash.trash_path, folder_id, body.path)


@app.get("/trash")
def list_trash() -> list[TrashItem]:
    return trash.list_items()


@app.post("/trash/{tid}/restore")
async def restore_trash(tid: str) -> TrashItem:
    return await run_in_threadpool(trash.restore, tid)


@app.delete("/trash/{tid}", status_code=204)
def purge_trash(tid: str) -> None:
    """Delete for good. The audit log keeps the record."""
    trash.purge(tid)


@app.post("/folders/{folder_id}/dirs", status_code=201)
def create_dir(folder_id: str, body: DirCreate) -> dict:
    return {"path": folders.create_dir(folder_id, body.path)}


@app.post("/folders/{folder_id}/import")
async def import_files(
    folder_id: str,
    files: list[UploadFile],
    dest: str = Form(""),
    keep_paths: bool = Form(False),
) -> list[FileEntry]:
    """Add files under `dest` (a subfolder, "" = top level). `keep_paths` recreates each
    upload's own subfolders, for importing a whole folder from disk."""
    saved = await folders.import_files(folder_id, files, dest=dest, keep_paths=keep_paths)
    await run_in_threadpool(index.refresh, folder_id)  # so the next question can cite the new files
    return saved


# --- Index, ask, timeline (B3–B5) ---------------------------------------------


@app.post("/folders/{folder_id}/index")
def build_index(folder_id: str) -> IndexStatus:
    """Build or refresh the folder's index (incremental). If Ollama is down, keyword search is
    still indexed and `pending_embeddings` says how many chunks the next build will embed."""
    _folder(folder_id)
    return IndexStatus(**index.build_index(folder_id))


@app.post("/ask")
def ask_all_folders(body: GlobalAskRequest) -> AskResponse:
    """Home-page chat: answers from every folder the AI may read. Read-only; audited per folder.
    Saved like folder chats: `session_id` continues one, none starts a new one."""
    if body.session_id:
        chats.check(chats.ALL, body.session_id)
    # The question is saved first, so a reload while the model is still answering shows it
    # (the page then waits for the answer). If answering fails, the question is taken back.
    sid = body.session_id or chats.new_id()
    qid = chats.save_question(chats.ALL, sid, body.question)
    try:
        res = global_ask.ask_all(body.question, body.history)
    except BaseException:
        chats.drop_message(qid)
        raise
    res.session_id = sid
    chats.save_answer(chats.ALL, sid, res)
    return res


@app.get("/chats")
def list_home_chats(q: str | None = None) -> list[ChatSessionSummary]:
    """Saved home-page chats (all folders), newest first; `q` searches titles and messages."""
    return chats.list_sessions(chats.ALL, q)


@app.get("/chats/{sid}")
def get_home_chat(sid: str) -> ChatSession:
    return chats.get_session(chats.ALL, sid)


@app.patch("/chats/{sid}")
def rename_home_chat(sid: str, body: ChatRename) -> ChatSessionSummary:
    return chats.rename(chats.ALL, sid, body.title)


@app.delete("/chats/{sid}", status_code=204)
def delete_home_chat(sid: str) -> None:
    """Removes the saved chat only. Each folder it read keeps the questions in its audit log."""
    chats.delete(chats.ALL, sid)


@app.get("/chat")
def home_chat() -> ChatSession | None:
    """The most recent home-page chat, opened when the home page loads."""
    latest = chats.list_sessions(chats.ALL)
    return chats.get_session(chats.ALL, latest[0].id) if latest else None


@app.post("/folders/{folder_id}/ask")
def ask(folder_id: str, body: AskRequest, tasks: BackgroundTasks) -> AskResponse:
    """Saved to a chat: `session_id` continues one, none starts a new one (returned in the response)."""
    res = ask_mod.ask(folder_id, body.question, body.path, body.history, body.session_id, scope=body.scope)
    # First turn: title the chat after the answer is sent. Not after a refusal, which is decided in
    # code without the model, so the LLM log shows no model call for an out-of-scope question.
    if body.session_id is None and res.session_id and not res.refused:
        tasks.add_task(chats.auto_title, folder_id, res.session_id, body.question)
    return res


class _Stopped(Exception):
    """Raised in the ask thread once the streaming client has disconnected."""


@app.post("/folders/{folder_id}/ask/stream")
def ask_stream(folder_id: str, body: AskRequest) -> StreamingResponse:
    """Same as /ask, as NDJSON lines while it works: `status` and `answer` (live text, display only),
    then `done` with the final AskResponse, or `error`."""
    _folder(folder_id)
    events: queue.Queue[dict | None] = queue.Queue()
    stopped = threading.Event()  # the client went away (Stop pressed): stop generating at the next token

    def emit(event: dict) -> None:
        if stopped.is_set():
            raise _Stopped
        events.put(event)

    def work() -> None:
        try:
            res = ask_mod.ask(folder_id, body.question, body.path, body.history, body.session_id, emit=emit,
                              scope=body.scope)
            events.put({"type": "done", "response": res.model_dump(mode="json")})
        except _Stopped:
            return
        except OllamaError as e:
            events.put({"type": "error", "message": str(e)})
        except Exception:
            logging.getLogger("talaan").exception("ask/stream failed")
            events.put({"type": "error", "message": "Something went wrong answering this question. Please ask again."})
        else:
            events.put(None)  # the answer is complete: close the stream before titling the chat
            if body.session_id is None and res.session_id and not res.refused:  # same as /ask
                try:
                    chats.auto_title(folder_id, res.session_id, body.question)
                except Exception:
                    logging.getLogger("talaan").exception("chat title failed")
            return
        events.put(None)

    threading.Thread(target=work, daemon=True, name="ask-stream").start()

    def lines():
        try:
            while (event := events.get()) is not None:
                yield json.dumps(event) + "\n"
        finally:
            stopped.set()

    return StreamingResponse(lines(), media_type="application/x-ndjson")


@app.post("/folders/{folder_id}/timeline")
def timeline(folder_id: str, refresh: bool = False, scope: str | None = None) -> TimelineResponse:
    """Dated events and flags for human review, every one with sources. `scope` is a subfolder
    (e.g. one case in the Space). Cached per index version, chat model and scope; `refresh=true`
    rebuilds anyway."""
    return case_timeline.build(_folder(folder_id), refresh, folders.scope_dir(folder_id, scope))


# --- Chat sessions (C8) -------------------------------------------------------
# User-only: the model has no action that reaches saved chats.


@app.get("/folders/{folder_id}/chats")
def list_chats(folder_id: str, q: str | None = None) -> list[ChatSessionSummary]:
    _folder(folder_id)
    return chats.list_sessions(folder_id, q)


@app.get("/folders/{folder_id}/chats/{sid}")
def get_chat(folder_id: str, sid: str) -> ChatSession:
    _folder(folder_id)
    return chats.get_session(folder_id, sid)


@app.patch("/folders/{folder_id}/chats/{sid}")
def rename_chat(folder_id: str, sid: str, body: ChatRename) -> ChatSessionSummary:
    _folder(folder_id)
    return chats.rename(folder_id, sid, body.title)


@app.delete("/folders/{folder_id}/chats/{sid}", status_code=204)
def delete_chat(folder_id: str, sid: str) -> None:
    """Removes the chat only. The audit log keeps every question and answer."""
    _folder(folder_id)
    chats.delete(folder_id, sid)


# --- Grants, proposals, audit (A3–A5) -----------------------------------------


@app.get("/folders/{folder_id}/grants")
def get_grants(folder_id: str) -> Grants:
    _folder(folder_id)
    return grants.get_grants(folder_id)


@app.put("/folders/{folder_id}/grants")
def put_grants(folder_id: str, body: Grants) -> Grants:
    _folder(folder_id)
    try:
        return grants.set_grants(folder_id, body)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


@app.get("/folders/{folder_id}/proposals")
def list_proposals(folder_id: str) -> list[Proposal]:
    _folder(folder_id)
    return proposals.list_pending(folder_id)


# User-only: these are called from the approval UI, never from model code.
@app.post("/proposals/{pid}/approve")
def approve(pid: str) -> Outcome:
    return engine.approve(pid)


@app.post("/proposals/{pid}/reject")
def reject(pid: str) -> Outcome:
    return engine.reject(pid)


@app.get("/folders/{folder_id}/audit")
def audit(folder_id: str) -> list[AuditEvent]:
    _folder(folder_id)
    return audit_log.list_events(folder_id)


@app.get("/folders/{folder_id}/audit/export")
def audit_export(folder_id: str, format: Literal["json", "csv"] = "json") -> Response:
    _folder(folder_id)
    headers = {"Content-Disposition": f'attachment; filename="{folder_id}_audit.{format}"'}
    if format == "json":
        return Response(audit_log.export_json(folder_id), media_type="application/json", headers=headers)
    return Response(audit_log.export_csv(folder_id), media_type="text/csv", headers=headers)


# --- Voice (D1) and system (D7) ------------------------------------------------


async def _transcribe_upload(folder_id: str | None, audio: UploadFile, extra_hotwords: str = "") -> "voice.Transcript":
    """Transcribe an upload on this laptop. Names from `folder_id`'s own files (if given) help spelling."""
    suffix = Path(audio.filename or "").suffix.lower()
    if suffix not in voice.AUDIO_TYPES:
        raise HTTPException(415, f"Audio must be one of: {', '.join(sorted(voice.AUDIO_TYPES))}")

    # The upload is staged outside every client folder and deleted right after.
    with tempfile.TemporaryDirectory(prefix="talaan-audio-") as tmp:
        staged = Path(tmp) / f"audio{suffix}"
        staged.write_bytes(await audio.read())
        texts = [
            folders.file_path(folder_id, f.path).read_text(encoding="utf-8", errors="replace")
            for f in folders.list_files(folder_id)
            if f.path.endswith((".md", ".txt"))
        ] if folder_id else []
        try:
            hotwords = ", ".join(h for h in (extra_hotwords, voice.folder_vocabulary(texts)) if h)
            transcript = await run_in_threadpool(voice.whisper.transcribe_file, staged, hotwords)
        except voice.whisper.TooShort as e:
            raise HTTPException(422, str(e))
        except Exception as e:  # undecodable audio, missing model, ...
            raise HTTPException(422, f"Could not transcribe this audio: {e}")

    if not transcript.text:
        raise HTTPException(422, "No speech detected in the recording")
    return transcript


@app.post("/folders/{folder_id}/transcribe")
async def transcribe(folder_id: str, audio: UploadFile, dir: str = Form("")) -> Outcome:
    """Audio -> local transcript -> create_draft through the policy engine.

    `dir` is the subfolder that was open when recording ("" = the Space's top level);
    the draft is proposed there. The transcript is never written directly: with the
    default grants it becomes a proposal the user approves, and with Create drafts set
    to Never it is blocked.
    """
    root = folders.folder_root(folder_id)
    subdir = folders.scope_dir(folder_id, dir) or ""  # same sealing checks as every path
    recorded = datetime.now()
    transcript = await _transcribe_upload(folder_id, audio)

    action = CreateDraftAction(
        action="create_draft",
        path=voice.draft_name(root, recorded, subdir),
        content=voice.to_markdown(transcript, recorded),
        reason=f"Voice note ({transcript.duration:.0f}s) transcribed on this laptop",
    )
    return engine.handle(folder_id, action, model_tag=transcript.model)


@app.post("/voice/dictate")
async def dictate(audio: UploadFile, folder_id: str | None = Form(None), wake: bool = Form(False)) -> dict[str, str]:
    """Hold-to-talk and the "Hey Tala" wake phrase: audio -> text, on this laptop.

    Nothing is saved, proposed or logged here; the text only goes anywhere if it becomes a
    question, which is audited then. With `folder_id`, names from that Space's own files
    help spelling (never another Space's). `wake` also biases Whisper toward "Tala".
    """
    if folder_id:
        folders.folder_root(folder_id)  # 404 for an unknown Space
    extra = "Hey Tala, Tala Tala" if wake else ""
    return {"text": (await _transcribe_upload(folder_id, audio, extra)).text}


@app.get("/system/voice")
def voice_status() -> VoiceStatus:
    """Can voice notes be transcribed here? The recorder checks this before recording."""
    return voice.whisper.status()


@app.post("/system/voice/download")
def voice_download() -> VoiceStatus:
    """Fetch the configured speech model (the one-time download); poll GET /system/voice for progress."""
    if not voice.whisper.status().ready:
        voice.whisper.start_download()
    return voice.whisper.status()


@app.get("/system/tier")
def system_tier() -> SystemTier:
    return selection.system_tier()


@app.put("/system/model")
def choose_model(body: ModelChoice) -> SystemTier:
    """Switch the chat model to another pinned tag, or back to automatic (null)."""
    try:
        return selection.choose(body.chat_model)
    except selection.ModelChoiceError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.get("/system/llm-log")
def llm_log(after: int = 0) -> list[LlmCall]:
    """Model calls since `after` (an LlmCall id), oldest first. In memory only; cleared on restart."""
    return trace.recent(after)


@app.delete("/system/llm-log", status_code=204)
def clear_llm_log() -> None:
    trace.clear()


@app.get("/system/settings")
def get_settings() -> AppSettings:
    return AppSettings(log_prompts=trace.log_prompts())


@app.put("/system/settings")
def put_settings(body: AppSettings) -> AppSettings:
    trace.set_log_prompts(body.log_prompts)
    return get_settings()
