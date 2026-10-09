"""The policy engine: the deterministic gate between the model and the disk.

The model proposes; this decides. Every model action goes through handle():

    1. validate against the Action schema      invalid  -> blocked, logged
    2. resolve the path inside the folder      escape   -> blocked, logged
    3. map the action to its grant
    4. decide from the folder's grants:
         allow          -> execute, logged
         needs_approval -> stored as a proposal for the user, logged
         never          -> blocked, logged

Nothing here trusts the model, and nothing the model can call reaches grants,
proposals or the audit log.
"""

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app import folders
from app.audit import log_event
from app.policy import proposals
from app.policy.grants import get_grants
from app.policy.paths import PathOutsideFolder, rel, resolve_in_folder
from app.schemas import (
    Action, ActionAdapter, CreateDraftAction, DeleteAction, Grant, Outcome, ProposeEditAction,
    ReadAction, SearchAction,
)

ACTION_GRANT = {
    "search": "read",
    "read": "read",
    "propose_edit": "suggest_edits",
    "create_draft": "create_drafts",
    "delete": "delete",
}

_ACTION_TYPES = (SearchAction, ReadAction, ProposeEditAction, CreateDraftAction, DeleteAction)

GRANT_LABEL = {
    "read": "Read",
    "suggest_edits": "Suggest edits",
    "create_drafts": "Create drafts",
    "delete": "Delete",
}


class ActionRefused(Exception):
    """An executor's precondition failed (e.g. a draft would overwrite a file)."""


# Retrieval hook. B3 replaces this with the per-folder index; until then a plain
# line search over the folder keeps `search` working end to end.
SearchFn = Callable[[str, str], str]


def _line_search(folder_id: str, query: str) -> str:
    words = [w.lower() for w in query.split() if len(w) > 2]
    hits = []
    for entry in folders.list_files(folder_id):
        if not entry.path.endswith((".md", ".txt")):
            continue
        text = folders.file_path(folder_id, entry.path).read_text(encoding="utf-8", errors="replace")
        for n, line in enumerate(text.splitlines(), 1):
            if any(w in line.lower() for w in words):
                hits.append(f"{entry.path}:{n}: {line.strip()}")
    return "\n".join(hits[:20])


search_fn: SearchFn = _line_search


def handle(
    folder_id: str,
    raw_action: str | dict[str, Any] | Action,
    actor: str = "model",
    model_tag: str | None = None,
) -> Outcome:
    root = folders.folder_root(folder_id)

    def log(event: str, **kw: Any) -> None:
        log_event(folder_id, actor, event, model_tag=model_tag, **kw)  # type: ignore[arg-type]

    # 1. Validate.
    try:
        if isinstance(raw_action, str):
            raw_action = json.loads(raw_action)
        action = raw_action if isinstance(raw_action, _ACTION_TYPES) else ActionAdapter.validate_python(raw_action)
    except (json.JSONDecodeError, ValidationError, TypeError) as e:
        reason = f"invalid action: {_short(e)}"
        log("proposed_action", decision="never", reason=reason)
        return Outcome(status="blocked", reason=reason)

    name = action.action
    path = getattr(action, "path", None)
    log("proposed_action", action=name, path=path, reason=action.reason or None)

    def blocked(reason: str) -> Outcome:
        log("decision", action=name, path=path, decision="never", reason=reason)
        return Outcome(status="blocked", action=name, path=path, reason=reason)

    # 2. Seal the path.
    target = None
    if path is not None:
        try:
            target = resolve_in_folder(root, path)
        except PathOutsideFolder:
            return blocked("That path is outside this folder")
        path = rel(root, target)

    # 3–4. Decide.
    grant_name = ACTION_GRANT[name]
    grant = getattr(get_grants(folder_id), grant_name)

    if grant == Grant.NEVER:
        return blocked(f"{GRANT_LABEL[grant_name]} is set to Never for this folder")

    try:
        _check(action, target)
    except ActionRefused as e:
        return blocked(str(e))

    if grant == Grant.NEEDS_APPROVAL:
        pid = proposals.create(folder_id, action, target)
        log("decision", action=name, path=path, decision="needs_approval", reason=f"proposal {pid}")
        return Outcome(status="pending", action=name, path=path, proposal_id=pid)

    log("decision", action=name, path=path, decision="allow")
    result = execute(folder_id, action, target)
    log("executed", action=name, path=path)
    return Outcome(status="executed", action=name, path=path, result=result)


def _check(action: Action, target: Path | None) -> None:
    """Preconditions shared by proposing and executing."""
    if isinstance(action, (ReadAction, ProposeEditAction, DeleteAction)) and not (target and target.is_file()):
        raise ActionRefused("File not found")
    if isinstance(action, CreateDraftAction) and target and target.exists():
        raise ActionRefused("A file with that name already exists; drafts never overwrite")


def execute(folder_id: str, action: Action, target: Path | None) -> str | None:
    """Run an action that has already been allowed or approved."""
    _check(action, target)
    match action:
        case SearchAction():
            return search_fn(folder_id, action.query)
        case ReadAction():
            return target.read_text(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
        case ProposeEditAction():
            target.write_text(action.content, encoding="utf-8")  # type: ignore[union-attr]
        case CreateDraftAction():
            target.parent.mkdir(parents=True, exist_ok=True)  # type: ignore[union-attr]
            with open(target, "x", encoding="utf-8") as f:  # "x": fail rather than overwrite
                f.write(action.content)
        case DeleteAction():
            target.unlink()  # type: ignore[union-attr]
    return None


def _short(e: Exception) -> str:
    if isinstance(e, ValidationError):
        err = e.errors()[0]
        return f"{'.'.join(map(str, err['loc'])) or 'action'}: {err['msg']}"
    return str(e).splitlines()[0][:120]
