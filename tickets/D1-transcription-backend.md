# D1 · Transcription backend

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track D | P1 | 2h | A1, A4 | D2 |

## Goal
Audio in → transcript proposed as a new draft in the folder, gated by the Create grant.

## Tasks
- [ ] `transcribe/whisper.py`: faster-whisper, CPU int8, model size from config (default `small`); lazy-load and unload after use
- [ ] `POST /folders/{id}/transcribe` (multipart audio: webm/wav/m4a)
- [ ] Output a Markdown transcript with a header (date, duration) and optional timestamps
- [ ] Submit it as a `create_draft` action through `policy.handle()`. **Never write the file directly**
- [ ] Pre-download the Whisper model so it works offline; note the size for disclosure

## Done when
Uploading the 30-second test script recording produces a pending draft; approving saves it; Q3 then mentions the agency follow-up.
