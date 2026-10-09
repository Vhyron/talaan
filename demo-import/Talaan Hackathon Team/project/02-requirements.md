# Requirements

## P0: must work in the live demo

| Requirement | Done when |
|---|---|
| Client folders | Create, open and list Spaces on disk |
| Import | Add .md, .txt and .pdf files to a Space |
| Sealed index | One index per Space; retrieval can't reach other Spaces |
| Ask with sources | Answers cite file names; clicking a source opens it |
| Permission panel | Per-Space grants for Read, Suggest edits, Create drafts, Delete |
| Policy engine | Every model action is checked against grants before anything happens |
| Approval UI | Suggested edits and drafts show a preview; the user approves or rejects |
| Audit log | Every question, proposed action and decision is recorded per Space |
| Scope refusal | Asking about another client returns "I can only see {folder name}" |
| Case timeline | Dated events with sources, contradictions flagged for human review |
| Works offline | The full demo runs with Wi-Fi off |

## P1: strong add-ons

| Requirement | Notes |
|---|---|
| Create drafts | Saved only after approval |
| Prompt-injection demo | The planted email in the Dela Cruz case; any delete is blocked and logged |
| Voice transcription | Record or upload audio, transcribe locally with faster-whisper, save the transcript into the Space (needs the Create grant) |

## Submission requirements (deadline 10:00 AM, Oct 10)

- Project name, short description, team members
- Public GitHub repo with run instructions
- Demo video, about 1 minute
- X or LinkedIn video post tagging Devin / Cognition with #AppBuildersPH
- Disclosure: what runs locally, what needs internet, exact model tags, libraries, AI development tools
- Answer: why does this product benefit from running AI locally?
- Single submission, no edits after sending
