# A5 · Proposals and approval flow

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track A | P0 | 1.5h | A4 | C5, D1 |

## Goal
Actions that need approval wait for the user; only a user action in the UI can execute them.

## Tasks
- [ ] Store pending proposals in `app.db` with old content (for edits) and new content
- [ ] `GET /folders/{id}/proposals` (pending only, with a unified diff for edits)
- [ ] `POST /proposals/{pid}/approve` → re-check grants and the path, then execute and log `decision` + `executed`
- [ ] `POST /proposals/{pid}/reject` → log `decision`
- [ ] Reject approval if the file changed since the proposal was made (stale) or the proposal was already decided

## Done when
A proposed edit shows up in proposals with a diff; approving writes the file, rejecting leaves it untouched; both are in the audit log.

## Notes
Approve/reject endpoints are user-only. No model code path may call them.
