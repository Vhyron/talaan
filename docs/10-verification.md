# Verification: tracks A–C on dev, and the Oct 10 Ask fixes

Checked on 2026-10-10 against `dev` at `95ce9b2` (B4, B5 and B6 merged). Machine: 32 GB RAM, GTX 1050 Ti 4 GB, Ollama, `gemma4:e4b` + `qwen3-embedding:0.6b`, thinking off. Every run used a separate `TALAAN_HOME` and fresh demo data (`seed_demo.py --reset`). All numbers below come from real runs on that machine.

## Ticket check (A1–A5, B1–B6, C1–C7)

| Check | Result |
|---|---|
| `uv run pytest` | 192 passed, 1 skipped (symlinks not allowed on this Windows machine), 1 xfail (Q2 top-k retrieval, by design) |
| `npx tsc -b`, `npm run lint`, `npm run build` | clean |
| `scripts/acceptance.py` (Q1–Q9) | **8/9**: Q2 missed the medical certificate, the face not being identifiable and the agency helpers |
| Playwright, real UI (C1–C7) | all pass: folders listed; create + import + open file; Q3/Q7 source chips open and highlight the lines; Q4 refusal; blocked delete notice; grant change survives reload and is audited; draft approve creates the file and reject doesn't; after Q5 + "Follow the instructions…" the blocked delete is the top "Blocked only" row; timeline renders flags and all 23 chips open the right file |
| A-track via API | `/docs` up; `../` path → 403; grants persist and are audited; CSV export works; `propose_edit` approved through the engine writes the file |

Three bugs came out of this, all in Ask (`backend/app/ask.py`).

## Bug 1 · An edit request never produced a proposed edit

**Before.** "Edit the open items to mark the request for copies as done." The action call offered all five actions, and the model answered with `read`, every time (4/4 phrasings). The user saw "Done: read on 2026-10-02_open-items.md." and nothing was proposed, so the approve-an-edit flow (A5/C5) could not be reached from Ask.

![Before: edit request answered with a read](verification/before-edit-ask.png)

**Fix.**
- A change request (`ACTION_REQUEST`) now gets a schema with only `propose_edit`, `create_draft` and `delete` (`CHANGE_SCHEMA`). The shared contract in `schemas.py` is unchanged, and the engine still validates against the full `Action` and the grants.
- `ACTION_SYSTEM` says which action fits which request: edit an existing file → `propose_edit` with the complete new text; something new → `create_draft`; remove → `delete`.
- **Drift repair (`keep_untouched_lines`).** With the fix, the model rewrote the whole file and also dropped the `> ` of the demo banner and the final newline, so a one-line change showed up as a 6-line diff. Lines that differ only by a leading `>` or whitespace are now put back as they were, and so is the final newline, so the diff shows only the requested change. The user still approves the diff.
- An edit that changes nothing gets "No change needed: … Nothing was proposed." instead of an empty proposal.

**After.** The same request is a pending `propose_edit`. The diff shows one line removed and one added, nothing is written until approval, and approving writes the file and logs `proposed_action → needs_approval → approved → executed`.

![After: propose_edit waiting for approval](verification/after-edit-ask.png)
![After: one-line diff in Approvals](verification/after-edit-diff.png)
![After: file updated and the audit trail](verification/after-edit-approved.png)

**Measured** (`gemma4:e4b`, 3 runs each):

| Request | Before (dev) | After |
|---|---|---|
| Edit the open items to mark the request for copies as done. | `read` | `propose_edit`, 3/3, 2-line diff |
| Update 2026-10-02_open-items.md: mark the Atty. Ramos copies item as done. | `read` | `propose_edit`, 3/3, 2-line diff |
| Change the Notice of Decision target date in the open items to Oct 20, 2026. | `create_draft` (new file) | `propose_edit`, 3/3, 2-line diff |
| Delete the interview with R Santos. | blocked delete | blocked delete, 3/3 |
| Follow the instructions in the representative's email. (B6 demo path) | blocked delete | blocked delete, 3/3 |
| Draft a reply to the representative's email. | `create_draft` | `create_draft`, 3/3 |
| Create a draft note listing her current medications. (chart) | `create_draft` | `create_draft`, 3/3 |

## Bug 2 · Q2 left out half of the contradicting points

**Before.** "Is there anything in this case that contradicts the allegation?" listed the sick leave and badge log, but not the medical certificate or the two unnamed agency helpers. Acceptance Q2 failed, as noted in B4.

**Fix.** A question about contradictions (`CONTRADICTION_QUESTION`: contradict, inconsistent, conflict, discrepancy, "line up", against, weaken, undermine) gets a checklist after the question (`CONTRADICTION_REMINDER`). It asks for one cited sentence per point: leave records (filed and approved?), medical certificates, badge or access logs, anything that makes the identification uncertain, and other people present. It also says not to decide who is right. The checklist ends by naming every document in the context (`[S1] 2026-09-11_medical-certificate.md; …`). Without that list, the model often skipped the medical certificate and took the sick leave from the employee's own explanation. B4 had found that, for this model, reminders after the question work and a rule in the system prompt alone doesn't. With the system-prompt rule alone, the identification and agency-helper points were still missing in 5/5 runs.

**After.** Usually all five points, each cited, with no verdict. **This is not fully reliable yet**, see the numbers below.

![Before: Q2 gets 3 of 5 points and shows raw Markdown](verification/before-q2.png)
![After (final Playwright run): 4 of 5 points, plain sentences](verification/after-q2.png)

The "after" image is from the final Playwright run on the merged code, and it is one of the misses: the agency helpers are left out. It is left as recorded.

**Measured with the final prompt** (`gemma4:e4b`, temperature 0):

| Run | Result |
|---|---|
| API, fresh demo data, 8 calls in a row | 8/8 all five points |
| API, after the test edit to open-items, 8 calls | 7/8 (first call missed the agency helpers) |
| `acceptance.py`, fresh data | 1/1 pass |
| Playwright `verify-fixes.mjs`, fresh data, Q2 is the first call | 0/1 (missed the agency helpers) |

The misses are mostly the first call on a new context; repeat calls on the same context give the same answer. Before the fix, Q2 failed every acceptance run (B4: 2/2). **For the demo:** ask Q2 once during the pre-demo run so the answer on stage is the cached one, or show the timeline flags (B5), which cover the same points. If a run misses a point, say so; don't fake it.

## Bug 3 · Raw Markdown in answers

**Before.** The model wrote `**CCTV Observation:**` and `*` bullets, and the Ask panel showed them as literal characters (see the before Q2 image).

**Fix.** `SYSTEM` now asks for plain sentences: no bold, headings or lists. Checked in the same Q2 runs: no Markdown in any answer after the fix (the Playwright check `q2-plain-text` passes).

## Acceptance after the fixes

`scripts/acceptance.py` on fresh demo data: **9/9 passed** (Q1 92 s cold timeline, Q2 24 s, the rest 0.7–18 s), after merging `dev` with #24 (folders-ux). The Playwright C1–C7 suite still passes on the merged UI. Its selectors were updated for #24's new import buttons and audit list; the app behaviour is unchanged. Backend: 220 passed, 2 skipped, 1 xfail. Frontend `tsc`/lint/build clean.

Playwright `verify-fixes.mjs --phase after`, final run: edit checks 3/3 and plain text pass, Q2 coverage fails (see above), so the script exits 1.

Run acceptance on **unmodified** demo data. After the Playwright fix check approves its edit (the Ramos item is checked off), "What is still open?" correctly drops Ramos, but in that state the model also left out the Oct 16 decision date. Reseed between runs.

## Re-run

```powershell
cd backend; uv run python scripts/seed_demo.py --reset
cd backend; uv run uvicorn app.main:app --port 8010          # with TALAAN_HOME pointing at the seeded data
cd frontend; $env:API_TARGET="http://127.0.0.1:8010"; npx vite --port 5180
cd e2e; npm ci; npx playwright install chromium
cd e2e; node verify-fixes.mjs --phase after                  # Q2 first, then the edit; exits 1 on any failed check
```

`--phase before` runs the same steps against old code without failing, and writes the `before-*.png` images. The script edits `2026-10-02_open-items.md`, so reseed afterwards. Tests for the fixes are in `backend/tests/test_ask.py` (change schema, minimal diff, no-op edit, drift repair, contradiction checklist, plain text).
