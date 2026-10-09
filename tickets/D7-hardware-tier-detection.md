# D7 · Hardware tier detection

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track D | P2 | 1h | B1 | — |

## Goal
On first run, detect RAM/GPU, map to Light / Standard / Pro, and show which features are available.

## Tasks
- [ ] `system/tier.py`: total RAM (psutil), Apple Silicon unified memory, NVIDIA/AMD GPU VRAM if detectable
- [ ] Map to the tiers in [docs/05-models.md](../docs/05-models.md)
- [ ] `GET /system/tier` → tier, recommended models, feature availability
- [ ] Small Setup page (or card) in the frontend

## Done when
`/system/tier` reports the demo laptop correctly. Skip if not started by M3.
