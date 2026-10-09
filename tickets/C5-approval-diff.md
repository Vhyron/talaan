# C5 · Approval preview and diff

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track C | P0 | 1.5h | C2 | D2 |

## Goal
Pending AI actions show a preview; only the user can approve or reject.

## Tasks
- [ ] Approvals tab with a pending-count badge
- [ ] Edit proposals: side-by-side or unified diff (a small diff lib is fine; disclose it)
- [ ] Draft proposals (incl. transcripts): file name + full preview
- [ ] Show the model's `reason`
- [ ] Approve / Reject buttons → refresh the file list and audit log

## Done when
A proposed draft can be approved (file appears) or rejected (nothing changes), with both logged.
