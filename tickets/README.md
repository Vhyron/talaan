# Talaan · Ticket board

Work split for a team of four, one track each. With 3+ people the **case timeline is promoted to P0** (see [docs/02-scope.md](../docs/02-scope.md)).

Fill in names, then update the **Status** column as you go: `todo` · `doing` · `review` · `done` · `cut`.

## Tracks

| Track | Owner | Focus |
|---|---|---|
| **A · Core & policy** | _Person A_ | FastAPI scaffold, folders, path sealing, grants, policy engine, approvals, audit log |
| **B · AI & retrieval** | _Person B_ | Ollama client, model bake-off, extraction, per-folder index, ask with sources, timeline |
| **C · Frontend** | _Person C_ | React app: folders, file viewer, ask panel, permissions, approvals, audit, timeline |
| **D · Voice, demo & ship** | _Person D_ | Transcription, recorder, demo seed, acceptance tests, judge README, videos, submission |

## Milestones (Oct 9–10)

| By | Milestone | Must be true |
|---|---|---|
| **9:00 PM Oct 9** | M0 · Contract | A1 merged: schemas + stub routes. C builds against stubs. B has the bake-off running |
| **12:00 AM Oct 10** | M1 · Model pinned | B1 done, chat + embedding tags pinned. **No model changes after this** |
| **4:00 AM** | M2 · P0 end-to-end | Ask with sources, sealing, grants, approvals, audit and timeline all work through the UI. D4 passes Q1–Q9 |
| **7:00 AM** | M3 · Feature freeze | P1 done or cut. Bug fixes only from here |
| **7:00–9:00 AM** | Rehearse | Full demo with Wi-Fi off, record backup run, record 1-min video |
| **9:30 AM** | Ship | Pushed, repo **public**, README verified on a clean clone |
| **10:00 AM** | Code freeze | Submission sent (single submission, no edits) |

## Board

| ID | Title | Track | Pri | Est | Depends on | Status |
|---|---|---|---|---|---|---|
| [A1](A1-backend-scaffold-and-schemas.md) | Backend scaffold and shared schemas | A | P0 | 1h | — | done |
| [A2](A2-folders-files-path-sealing.md) | Folders, files and path sealing | A | P0 | 2h | A1 | done |
| [A3](A3-app-db-grants-audit.md) | app.db: grants and audit log | A | P0 | 1.5h | A1 | done |
| [A4](A4-policy-engine.md) | Policy engine and action execution | A | P0 | 2h | A2, A3 | done |
| [A5](A5-proposals-approval-flow.md) | Proposals and approval flow | A | P0 | 1.5h | A4 | done |
| [B1](B1-ollama-client-bake-off.md) | Ollama client and model bake-off | B | P0 | 2h | — | review |
| [B2](B2-extraction-and-chunking.md) | Text extraction and chunking | B | P0 | 1h | A1 | todo |
| [B3](B3-per-folder-index.md) | Per-folder index and retrieval | B | P0 | 2h | B1, B2 | todo |
| [B4](B4-ask-with-sources.md) | Ask with sources and scope refusal | B | P0 | 2.5h | B3, A4 | todo |
| [B5](B5-case-timeline.md) | Case timeline with contradictions | B | P0 | 2h | B3 | review |
| [B6](B6-prompt-injection.md) | Prompt-injection demo hardening | B | P1 | 1h | B4, A4 | todo |
| [C1](C1-frontend-scaffold.md) | Frontend scaffold and API client | C | P0 | 1h | A1 (stubs) | review |
| [C2](C2-folders-and-file-viewer.md) | Folders page, folder view, file viewer | C | P0 | 2h | C1 | review |
| [C3](C3-ask-panel.md) | Ask panel with clickable sources | C | P0 | 2h | C2 | review |
| [C4](C4-permission-panel.md) | Permission panel | C | P0 | 1h | C2 | review |
| [C5](C5-approval-diff.md) | Approval preview and diff | C | P0 | 1.5h | C2 | review |
| [C6](C6-audit-log-view.md) | Audit log view and export | C | P0 | 1h | C2 | review |
| [C7](C7-timeline-view.md) | Timeline view | C | P0 | 1.5h | C2 | review |
| [D1](D1-transcription-backend.md) | Transcription backend | D | P1 | 2h | A1, A4 | todo |
| [D2](D2-recorder-ui.md) | Recorder UI | D | P1 | 1.5h | C1, D1 | todo |
| [D3](D3-demo-seed-reset.md) | Demo seed and reset script | D | P0 | 1h | A2, A3, B3 | todo |
| [D4](D4-acceptance-tests.md) | Acceptance test harness (Q1–Q9) | D | P0 | 1.5h | B4 | todo |
| [D5](D5-judge-readme-disclosure.md) | Judge README and disclosure list | D | P0 | 1h | — | todo |
| [D6](D6-videos-and-submission.md) | Videos, backup demo, submission | D | P0 | 2h | M2 | todo |
| [D7](D7-hardware-tier-detection.md) | Hardware tier detection | D | P2 | 1h | B1 | todo |

## Critical path

```
A1 ─┬─ A2 ─┬─ A4 ── A5 ─────────────┐
    ├─ A3 ─┘    │                   │
    ├─ B2 ──┐   │                   ├─ M2 ── D6 ── ship
B1 ─┴───────┴─ B3 ─┬─ B4 ── D4 ─────┤
                   └─ B5 ───────────┤
C1 ── C2 ── C3..C7 (on stubs, then real API)
```

A1 is the bottleneck: it unblocks everyone. Person A ships it first, even rough.

## Working agreements

- **Contract first.** `backend/app/schemas.py` (A1) is the shared contract. Change it only with a heads-up to the team. C mirrors it in `frontend/src/api/types.ts`.
- **Branches:** one branch per ticket (`a2-path-sealing`), PR into `dev`. Small PRs, merge often. `main` gets the final submission.
- **No cloud AI, anywhere**, including tests and scripts. See [CLAUDE.md](../CLAUDE.md).
- **Cut, don't slip.** If a P1 ticket isn't done by M3, mark it `cut` and move to the roadmap slide.
- **Log disclosures as you go:** any new library, model tag or AI tool gets added to D5's list.

## Ticket template

```markdown
# <ID> · <Title>

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|

## Goal
## Tasks
- [ ] ...
## Done when
## Notes
```
