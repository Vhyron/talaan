# B5 · Case timeline with contradictions

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track B | P0 (team of 4) | 2h | B3 | C7 |

## Goal
The hero demo: a dated timeline where every event links to a file, and contradictions are flagged, not decided.

## Tasks
- [ ] `POST /folders/{id}/timeline`
- [ ] Pass all chunks per file (the case is small) or map-reduce per file if context is tight
- [ ] Structured output: `events[{date, time?, description, sources[]}]`, `flags[{description, sources[]}]`
- [ ] Sort by date/time in code, not by the model
- [ ] Drop any event without a valid source
- [ ] Cache the result per folder index version, so the demo re-run is instant

## Done when
Q1 matches the expected timeline closely, and the flags include the sick leave, medical certificate and badge-log contradiction (Q2).

## Notes
Thinking mode may help here; measure the time. Timeline must finish in under ~30s on the demo laptop.
