# 02 · Scope

## P0 — must work in the live demo

| Feature | Done when |
|---|---|
| Client folders | Create, open and list Case and Chart folders on disk |
| Import | Add .md, .txt and .pdf files to a folder |
| Sealed index | One index per folder; retrieval can't reach other folders |
| Ask with sources | Answers cite file names; clicking a source opens it |
| Permission panel | Per-folder grants for Read, Suggest edits, Create drafts, Delete |
| Policy engine | Every model action is checked against grants before anything happens |
| Approval UI | Suggested edits and drafts show a preview; user approves or rejects |
| Audit log | Every question, proposed action and decision is recorded per folder |
| Scope refusal | Asking about another client returns "I can only see this case" |
| Works offline | The full demo runs with Wi-Fi off |

## P1 — strong add-ons

| Feature | Notes |
|---|---|
| **Case timeline with sources** | The hero demo. Dated events, each linked to a file, contradictions flagged for human review. **Promote to P0 if the team has 3+ people** |
| Create drafts | e.g. draft a Notice of Decision outline, saved only after approval |
| Prompt-injection demo | Uses the planted email in the demo data |
| **Voice transcription** | Record or upload audio, transcribe locally with faster-whisper, save the transcript into the folder (needs the Create grant) |

## P2 — if time allows

- Hardware-tier detection on first run (see 05-models.md)
- Clinic Chart mode polish (templates for SOAP notes)
- Read images: photographed certificates and CCTV stills via the vision-capable chat model

## Cut for this hackathon

- Image generation: no user need
- Live meeting transcription: reliability risk. **Roadmap slide only**, clearly labelled as future work
- Mobile app
- Rich editor features (Obsidian already wins)
- Any cloud AI

## Roadmap slide (future, not demoed)

- Live meeting transcription
- Encrypted folders at rest
- Practice-level view across clients (labels only, never note contents)
- Obsidian-compatible vaults (we already store plain Markdown)
- Lawyer mode
