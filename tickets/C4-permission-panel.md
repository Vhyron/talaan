# C4 · Permission panel

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track C | P0 | 1h | C2 | — |

## Goal
The user controls, per folder, what the AI may do, in plain language.

## Tasks
- [ ] Four rows: Read · Suggest edits · Create drafts · Delete
- [ ] Each row: Allow / Needs approval / Never (segmented control) with a one-line explanation
- [ ] Load via `GET /grants`, save via `PUT /grants`
- [ ] No "allow everything" control

## Done when
Changing a grant persists after reload and appears in the audit log.

## Notes
Demo beat 0:30–1:00 opens on this panel. Make the default state (Delete: Never) visually obvious.
