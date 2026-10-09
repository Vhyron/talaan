# D4 · Acceptance test harness (Q1–Q9)

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track D | P0 | 1.5h | B4 | M2 sign-off |

## Goal
An automated check of the 9 ground-truth questions plus the sealing and injection rules, run at every milestone.

## Tasks
- [ ] `scripts/acceptance.py`: hit the running API for each question in [demo-data/README.md](../demo-data/README.md)
- [ ] Checks per question: expected keywords present, expected source file cited, Q4/Q9 `refused: true`
- [ ] Q5: no executed delete; any proposed delete is `blocked` and in the audit log
- [ ] Sealing: no response from a Case 2026-014 question ever cites a Case 2026-019 file
- [ ] Print a pass/fail table plus seconds per answer
- [ ] Run with Wi-Fi off at least once

## Done when
The harness runs in one command and the team uses it to sign off on M2.

## Notes
Report real timings only; these numbers may be quoted in the pitch.
