# B5 · Case timeline with contradictions

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track B | P0 (team of 4) | 2h | B3 | C7 |

## Goal
The hero demo: a dated timeline where every event links to a file, and contradictions are flagged, not decided.

## Tasks
- [x] `POST /folders/{id}/timeline`
- [x] Pass all chunks per file (the case is small) or map-reduce per file if context is tight
- [x] Structured output: `events[{date, time?, description, sources[]}]`, `flags[{description, sources[]}]`
- [x] Sort by date/time in code, not by the model
- [x] Drop any event without a valid source
- [x] Cache the result per folder index version, so the demo re-run is instant

## Done when
Q1 matches the expected timeline closely, and the flags include the sick leave, medical certificate and badge-log contradiction (Q2).

## Notes
Thinking mode may help here; measure the time. Timeline must finish in under ~30s on the demo laptop.

## Outcome (2026-10-09)
- `app/timeline.py`, wired into `POST /folders/{id}/timeline` (`?refresh=true` rebuilds). The fixture is gone.
- **Input:** every chunk of the open folder (`index.all_chunks`), each wrapped as untrusted `<source id="S#">` with file line numbers. One call when it fits `num_ctx`; otherwise consecutive batches, which can miss contradictions across batches. The demo case is ~2.7k prompt tokens, so it's one call.
- **The model proposes, code checks:** the JSON schema asks for `events[{date, time, description, cite["S#:line"]}]` and `flags[{description, cite}]`. Code normalises dates and times ("9:40 PM" → 21:40), maps each cite to a `Source` with the exact line and snippet, and drops any event or flag without a valid date or source. Inline `S#` ids are stripped from descriptions. Sorting is done in code.
- **Date grounding:** if the cited lines name exactly one date and it isn't the model's, the cited line wins. Live `gemma4:e4b` put the 8:30 consult on Sep 12 and the Oct 16 target on Oct 2; both are now corrected. The count of corrections is in the audit entry.
- **Cache:** `.talaan/timeline.json`, keyed by index version, chat model and a prompt hash. Any file change, model switch or prompt edit rebuilds it. Model replies that aren't valid timeline JSON are not cached.
- **Grants and audit:** Read set to Never → 403 with no model call, and the question is logged as `never`. Every build logs `question` (user) and `answer` (model, `model_tag`, event and flag counts, drops and corrections).
- **Measured** (dev machine, GTX 1050 Ti 4 GB, `gemma4:e4b`, thinking off, 6 runs after the final prompt): **89–104 s** cold (~1.5k output tokens at ~17 tok/s), **0.1 s** cached. The ~30 s budget is not met on 4 GB. Build the timeline once before the demo, and the click on stage is instant. Thinking mode wasn't tried: it only adds output tokens, and output is the bottleneck here.
- **Quality across those runs:** 17–18 events with correct dates, every one sourced to the right line. Every run flagged the sick leave, medical certificate and badge log against the supervisor's identification (face not visible), so Q2 is covered. The 8 PM agency helpers appear in about 2 of 3 runs. **The Sep 10 last badge swipe was never listed** as an event: it shares a line with the Sep 11 badge fact. It is still cited inside a flag's source snippet. `scripts/acceptance.py --only 1` passes.
