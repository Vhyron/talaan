# C3 · Ask panel with clickable sources

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track C | P0 | 2h | C2 | — |

## Goal
Ask a question about the open folder; get an answer with source chips that open the file.

## Tasks
- [ ] Chat-style panel scoped to the open folder; clears when switching folders
- [ ] Render `[S#]` as clickable source chips → `openSource`
- [ ] Refusals (`refused: true`) styled distinctly: "I can only see Case 2026-014"
- [ ] If the response carries an outcome: `pending` → link to Approvals; `blocked` → red "Blocked by policy" notice with reason
- [ ] Loading state with elapsed seconds (local models are slow; show it's working)

## Done when
Q3 and Q7 render with working source chips; Q4 renders as a refusal; a blocked delete shows the notice.
