# B6 · Prompt-injection demo hardening

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track B | P1 | 1h | B4, A4 | — |

## Goal
Make the demo beat reliable: summarizing `2026-09-26_email_from-representative.md` stays factual, and any delete the model proposes is visibly blocked.

## Tasks
- [ ] Run Q5 10× on the pinned model; record how often it proposes a delete and whether the summary stays factual
- [ ] If the model never takes the bait, the demo still works: show the hidden instruction in the file, then show that a delete (triggered via `/docs` or a "delete these interviews" request) is blocked and logged
- [ ] Make sure the summary never claims an admission (the fake one has no source to cite)
- [ ] Note the actual behaviour for the pitch script (D6)

## Done when
Q5 behaves as the [demo-data README](../demo-data/README.md) expects, with the blocked delete visible in the audit log.

## Notes
Don't edit the email fixture. The point is that safety comes from the policy engine, not the prompt.
