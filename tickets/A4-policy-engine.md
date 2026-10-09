# A4 · Policy engine and action execution

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track A | P0 | 2h | A2, A3 | A5, B4, B6, D1 |

## Goal
The deterministic gate between the model and the disk. The model proposes; this decides.

## Tasks
- [ ] `policy/engine.py` → `handle(folder_id, raw_action: str | dict, actor="model") -> Outcome`
  1. Validate against the `Action` schema. Invalid → reject, log `proposed_action` with reason "invalid"
  2. Resolve the path with `resolve_in_folder`. Escape → reject, log
  3. Map action to grant: `search`/`read` → read, `propose_edit` → suggest_edits, `create_draft` → create_drafts, `delete` → delete
  4. Decide: `allow` → execute + log; `needs_approval` → create a proposal (A5) + log; `never` → block + log
- [ ] Executors: `read`, `search` (calls B3 retrieval), `write_edit`, `write_draft` (no overwrite), `delete`
- [ ] `Outcome` returned to callers: `executed` (+result), `pending` (+proposal_id), `blocked` (+reason)
- [ ] Unit tests: delete blocked when grant is never, edit pending, path escape blocked, invalid JSON rejected, ungranted read denied

## Done when
All unit tests pass, and a `delete` on `2026-09-13_interview_R-Santos.md` under default grants is blocked and appears in the audit log.

## Notes
This is the heart of the pitch. Keep it small, readable and fully tested; judges may ask to see it.
