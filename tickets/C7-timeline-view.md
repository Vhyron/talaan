# C7 · Timeline view

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track C | P0 (team of 4) | 1.5h | C2 | — |

## Goal
The hero screen: a vertical case timeline with source chips and flagged contradictions.

## Tasks
- [ ] "Build timeline" button → `POST /timeline`, loading state with elapsed time
- [ ] Vertical list grouped by date; each event has source chips → `openSource`
- [ ] Flags section at the top: "Flagged for your review" in amber, each with sources
- [ ] Wording never says "guilty", "proven" or similar; it surfaces facts only

## Done when
The Case 2026-014 timeline renders with the contradiction flag and every chip opens the right file.
