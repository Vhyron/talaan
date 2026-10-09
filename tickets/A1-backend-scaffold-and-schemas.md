# A1 · Backend scaffold and shared schemas

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track A | P0 | 1h | — | Everything |

## Goal
Get a running FastAPI app with the shared Pydantic contract and stub routes, so B, C and D can start in parallel.

## Tasks
- [ ] `backend/` uv project (`pyproject.toml`, Python 3.11+), FastAPI, uvicorn, pydantic
- [ ] `app/config.py`: `TALAAN_HOME` (default `~/Talaan`), `OLLAMA_BASE_URL` (default `http://localhost:11434`), `CHAT_MODEL`, `EMBED_MODEL`, `NUM_CTX`
- [ ] `app/schemas.py`:
  - `Folder` (id, name, mode: `case` | `chart`, created_at), `FileEntry` (path, size, mtime)
  - `Action`: discriminated union on `action` (`search`, `read`, `propose_edit`, `create_draft`, `delete`) with `path`, `content`, `query`, `reason`
  - `Grant` enum: `allow` | `needs_approval` | `never`; `Grants` (read, suggest_edits, create_drafts, delete)
  - `Source` (path, start, end, snippet), `AskRequest`, `AskResponse` (answer, sources, refused: bool, proposal_id?)
  - `Proposal` (id, folder_id, action, status, diff/old_content/new_content, created_at)
  - `AuditEvent` (fields from docs/03), `TimelineEvent` (date, time?, description, sources), `TimelineResponse` (events, flags)
- [ ] `app/main.py`: all routes from [docs/04-architecture.md](../docs/04-architecture.md) API table, returning **fixture data** for now
- [ ] CORS for `http://localhost:5173`
- [ ] Commit `backend/README.md` with the run command

## Done when
`uv run uvicorn app.main:app --reload` starts, and `/docs` shows every endpoint returning valid fixture responses. C can build against it.

## Notes
Keep the schema stable after merge; announce any change to the team.
