# D2 · Recorder UI

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track D | P1 | 1.5h | C1, D1 | — |

## Goal
Record or upload a voice note from the folder view.

## Tasks
- [ ] Recorder component: MediaRecorder start/stop, timer, playback; or upload an audio file
- [ ] Send to `/transcribe`, show progress, then jump to the Approvals tab (C5)
- [ ] Handle mic permission denied gracefully (fall back to upload)

## Done when
Demo beat 3:15–3:45 works end to end: record → transcript proposed → approve → saved in the case.

## Notes
Coordinate with C on where the button lives (folder toolbar is suggested).
