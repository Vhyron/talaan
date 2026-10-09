# B4 · Ask with sources and scope refusal

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track B | P0 | 2.5h | B3, A4 | B6, D4, C3 |

## Goal
`POST /folders/{id}/ask` answers from this folder only, with clickable citations, or refuses.

## Tasks
- [ ] Retrieve chunks → build prompt with chunks tagged `[S1] path:lines`, wrapped as untrusted document text
- [ ] System prompt: answer only from sources, cite `[S#]`, flag contradictions for human review, never decide
- [ ] Map `[S#]` citations back to `Source` objects in the response; drop citations that don't exist
- [ ] **Scope refusal:** low retrieval scores, or the question names a person not found in the folder → `refused: true`, answer "I can only see <folder name>."
- [ ] Action path: let the model optionally return an `Action` JSON (structured output); pass it to `policy.handle()` (A4) and return the outcome in the response
- [ ] Log `question`, `answer` and the model tag via A3

## Done when
Q3, Q6, Q7 and Q8 answer correctly with the right sources; Q4 and Q9 refuse.
