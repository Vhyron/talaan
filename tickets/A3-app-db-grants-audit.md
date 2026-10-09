# A3 · app.db: grants and audit log

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track A | P0 | 1.5h | A1 | A4, C4, C6 |

## Goal
Grants and the audit log stored in `~/Talaan/app.db`, outside every folder and out of the model's reach.

## Tasks
- [ ] SQLite tables: `grants(folder_id, read, suggest_edits, create_drafts, delete)`, `audit(...)`, `proposals(...)`, `conversations(...)`
- [ ] Default grants on folder create: Read = allow, Suggest edits = needs_approval, Create drafts = needs_approval, Delete = **never**
- [ ] `GET /folders/{id}/grants`, `PUT /folders/{id}/grants`. Log every grant change as a user event
- [ ] `audit/log.py` → `log_event(folder_id, actor, event, action=None, path=None, decision=None, reason=None, model_tag=None)`
- [ ] `GET /folders/{id}/audit` (newest first) and `GET /folders/{id}/audit/export?format=json|csv`

## Done when
Grants persist across restarts, and every call to `log_event` shows up in the audit endpoint and the export.

## Notes
Fields follow [docs/03-permissions-and-sealing.md](../docs/03-permissions-and-sealing.md). No "allow all" option.
