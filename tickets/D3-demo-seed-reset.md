# D3 · Demo seed and reset script

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track D | P0 | 1h | A2, A3, B3 | D4, D6 |

## Goal
One command to get the demo into a known clean state between rehearsals.

## Tasks
- [ ] `scripts/seed_demo.py` (runs with `uv run`): wipe `~/Talaan` (only after a confirmation flag), copy the four `demo-data/` folders in with the right modes, set default grants, build all indexes
- [ ] `--reset` flag: restore folder files, clear proposals and audit for a fresh run
- [ ] Warm the models (one tiny chat + embed call) so the first demo answer isn't slow
- [ ] Optionally pre-build and cache the timeline (B5)

## Done when
`uv run scripts/seed_demo.py --reset` gets you from any state to demo-ready in under 2 minutes.
