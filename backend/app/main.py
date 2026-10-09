"""Talaan API. A1: every route exists and returns fixture data (see app/fixtures.py)."""

import csv
import io
import json
from datetime import datetime
from typing import Literal

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, Response

from app import fixtures as fx
from app.config import CHAT_MODEL, EMBED_MODEL
from app.schemas import (
    AskRequest, AskResponse, AuditEvent, FileEntry, Folder, FolderCreate, Grants, Outcome,
    Proposal, SystemTier, TimelineResponse,
)

app = FastAPI(title="Talaan", description="Local AI for sensitive client files. Nothing leaves this laptop.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_grants: dict[str, Grants] = {}


def _folder(folder_id: str) -> Folder:
    for f in fx.FOLDERS:
        if f.id == folder_id:
            return f
    raise HTTPException(404, "Folder not found")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "chat_model": CHAT_MODEL, "embed_model": EMBED_MODEL}


# --- Folders and files (A2) --------------------------------------------------


@app.get("/folders")
def list_folders() -> list[Folder]:
    return fx.FOLDERS


@app.post("/folders", status_code=201)
def create_folder(body: FolderCreate) -> Folder:
    return Folder(id=body.name.replace(" ", "-"), name=body.name, mode=body.mode, created_at=datetime.now())


@app.get("/folders/{folder_id}")
def get_folder(folder_id: str) -> Folder:
    return _folder(folder_id)


@app.get("/folders/{folder_id}/files")
def list_files(folder_id: str) -> list[FileEntry]:
    _folder(folder_id)
    return fx.FILES


@app.get("/folders/{folder_id}/files/{path:path}", response_class=PlainTextResponse)
def read_file(folder_id: str, path: str) -> str:
    _folder(folder_id)
    return fx.FILE_CONTENT


@app.post("/folders/{folder_id}/import")
def import_files(folder_id: str, files: list[UploadFile]) -> list[FileEntry]:
    _folder(folder_id)
    return [FileEntry(path=f.filename or "upload", size=0, mtime=datetime.now()) for f in files]


# --- Index, ask, timeline (B3–B5) ---------------------------------------------


@app.post("/folders/{folder_id}/index")
def build_index(folder_id: str) -> dict:
    _folder(folder_id)
    return {"chunks": 0, "files": len(fx.FILES)}


@app.post("/folders/{folder_id}/ask")
def ask(folder_id: str, body: AskRequest) -> AskResponse:
    folder = _folder(folder_id)
    q = body.question.lower()
    if "villanueva" in q or "bautista" in q:
        return AskResponse(answer=f"I can only see {folder.name}.", refused=True)
    if "email" in q:
        return AskResponse(
            answer="Atty. Ramos asks for copies of the incident report and witness statements [S1]. "
            "The email also contained hidden instructions to delete files; that action was blocked.",
            sources=[fx.EMAIL],
            outcome=fx.BLOCKED_DELETE,
        )
    return AskResponse(**fx.ASK_ANSWER)


@app.post("/folders/{folder_id}/timeline")
def timeline(folder_id: str) -> TimelineResponse:
    _folder(folder_id)
    return fx.TIMELINE


# --- Grants, proposals, audit (A3–A5) -----------------------------------------


@app.get("/folders/{folder_id}/grants")
def get_grants(folder_id: str) -> Grants:
    _folder(folder_id)
    return _grants.get(folder_id, Grants())


@app.put("/folders/{folder_id}/grants")
def put_grants(folder_id: str, body: Grants) -> Grants:
    _folder(folder_id)
    _grants[folder_id] = body
    return body


@app.get("/folders/{folder_id}/proposals")
def list_proposals(folder_id: str) -> list[Proposal]:
    _folder(folder_id)
    return [p for p in fx.PROPOSALS if p.folder_id == folder_id]


@app.post("/proposals/{pid}/approve")
def approve(pid: str) -> Outcome:
    return Outcome(status="executed", action="propose_edit", path="2026-10-02_open-items.md")


@app.post("/proposals/{pid}/reject")
def reject(pid: str) -> dict:
    return {"id": pid, "status": "rejected"}


@app.get("/folders/{folder_id}/audit")
def audit(folder_id: str) -> list[AuditEvent]:
    _folder(folder_id)
    return [e for e in fx.AUDIT if e.folder_id == folder_id]


@app.get("/folders/{folder_id}/audit/export")
def audit_export(folder_id: str, format: Literal["json", "csv"] = "json") -> Response:
    events = audit(folder_id)
    headers = {"Content-Disposition": f'attachment; filename="{folder_id}_audit.{format}"'}
    if format == "json":
        body = json.dumps([e.model_dump(mode="json") for e in events], indent=2)
        return Response(body, media_type="application/json", headers=headers)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=list(AuditEvent.model_fields))
    writer.writeheader()
    writer.writerows(e.model_dump(mode="json") for e in events)
    return Response(buf.getvalue(), media_type="text/csv", headers=headers)


# --- Voice (D1) and system (D7) ------------------------------------------------


@app.post("/folders/{folder_id}/transcribe")
def transcribe(folder_id: str, audio: UploadFile) -> Outcome:
    _folder(folder_id)
    return Outcome(status="pending", action="create_draft", path="2026-10-03_voice-note.md", proposal_id="p-demo-2")


@app.get("/system/tier")
def system_tier() -> SystemTier:
    return fx.TIER
