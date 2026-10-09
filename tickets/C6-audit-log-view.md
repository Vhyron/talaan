# C6 · Audit log view and export

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track C | P0 | 1h | C2 | — |

## Goal
A per-folder table of every question, proposed action and decision, with export.

## Tasks
- [ ] Table: time, actor (user/model), event, action, path, decision, reason, model tag
- [ ] Color decisions: allowed (neutral), needs approval (amber), blocked (red)
- [ ] Filter: "Blocked only" toggle (used in the injection demo beat)
- [ ] Export button → JSON/CSV download

## Done when
After the Q5 injection test, the blocked delete is visible at the top with the "Blocked only" filter on.
