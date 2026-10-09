"""Talaan API. Routes not yet implemented return fixture data (see app/fixtures.py)."""

import tempfile
from datetime import datetime
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, Response

from app import fixtures as fx
from app import ask as ask_mod
from app import audit as audit_log
from app import folders, index
from app import transcribe as voice
from app.policy import engine, grants, proposals
from app.llm import selection, trace
from app.llm.client import OllamaError
from app.llm.models import EMBED_MODEL
from app.schemas import (
    CreateDraftAction,
    AppSettings, AskRequest, AskResponse, AuditEvent, FileEntry, Folder, FolderCreate, Grants, LlmCall, ModelChoice, Outcome,
    Proposal, SystemTier, TimelineResponse,
)

app = FastAPI(title="Talaan", description="Local AI for sensitive client files. Nothing leaves this laptop.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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


@app.post("/folders/{folder_id}/import")
async def import_files(folder_id: str, files: list[UploadFile]) -> list[FileEntry]:
    saved = await folders.import_files(folder_id, files)
    await run_in_threadpool(index.refresh, folder_id)  # so the next question can cite the new files
    return saved


# --- Index, ask, timeline (B3–B5) ---------------------------------------------


@app.post("/folders/{folder_id}/index")
def build_index(folder_id: str) -> dict:
    """Build or refresh the folder's index (incremental). If Ollama is down, keyword search is
    still indexed and `pending_embeddings` says how many chunks the next build will embed."""
    _folder(folder_id)
    return index.build_index(folder_id)


@app.post("/folders/{folder_id}/ask")
def ask(folder_id: str, body: AskRequest) -> AskResponse:
    return ask_mod.ask(folder_id, body.question)


@app.post("/folders/{folder_id}/timeline")
def timeline(folder_id: str) -> TimelineResponse:
    _folder(folder_id)
    return fx.TIMELINE


# --- Grants, proposals, audit (A3–A5) -----------------------------------------


@app.get("/folders/{folder_id}/grants")
def get_grants(folder_id: str) -> Grants:
    _folder(folder_id)
    return grants.get_grants(folder_id)


@app.put("/folders/{folder_id}/grants")
def put_grants(folder_id: str, body: Grants) -> Grants:
    _folder(folder_id)
    return grants.set_grants(folder_id, body)


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


@app.post("/folders/{folder_id}/transcribe")
async def transcribe(folder_id: str, audio: UploadFile) -> Outcome:
    """Audio -> local transcript -> create_draft through the policy engine.

    The transcript is never written directly: with the default grants it becomes a
    proposal the user approves, and with Create drafts set to Never it is blocked.
    """
    root = folders.folder_root(folder_id)
    suffix = Path(audio.filename or "").suffix.lower()
    if suffix not in voice.AUDIO_TYPES:
        raise HTTPException(415, f"Audio must be one of: {', '.join(sorted(voice.AUDIO_TYPES))}")

    recorded = datetime.now()
    # The upload is staged outside every client folder and deleted right after.
    with tempfile.TemporaryDirectory(prefix="talaan-audio-") as tmp:
        staged = Path(tmp) / f"audio{suffix}"
        staged.write_bytes(await audio.read())
        texts = [
            folders.file_path(folder_id, f.path).read_text(encoding="utf-8", errors="replace")
            for f in folders.list_files(folder_id)
            if f.path.endswith((".md", ".txt"))
        ]
        try:
            transcript = await run_in_threadpool(voice.whisper.transcribe_file, staged, voice.folder_vocabulary(texts))
        except voice.whisper.TooShort as e:
            raise HTTPException(422, str(e))
        except Exception as e:  # undecodable audio, missing model, ...
            raise HTTPException(422, f"Could not transcribe this audio: {e}")

    if not transcript.text:
        raise HTTPException(422, "No speech detected in the recording")

    action = CreateDraftAction(
        action="create_draft",
        path=voice.draft_name(root, recorded),
        content=voice.to_markdown(transcript, recorded),
        reason=f"Voice note ({transcript.duration:.0f}s) transcribed on this laptop",
    )
    return engine.handle(folder_id, action, model_tag=transcript.model)


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
