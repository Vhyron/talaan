# Talaan — project docs

**Local AI for sensitive client files.** Each case or chart is a sealed folder. A local model reads only the folder you open, and only does what you allow. Nothing leaves the laptop.

- **Event:** AppBuildersPH Hackathon 2026 · Theme: Local AI
- **Code freeze and submission:** **10:00 AM, Oct 10, 2026** (no extensions, single submission)
- **Demo Day:** Oct 10, 1:00–7:00 PM, Cyberzone SM Makati · 5 min pitch + 3 min Q&A

## Docs

| File | What's inside |
|---|---|
| [01-product-brief.md](01-product-brief.md) | Problem, users, pitch, competitors, judging fit |
| [02-scope.md](02-scope.md) | Features by priority, cuts, roadmap |
| [03-permissions-and-sealing.md](03-permissions-and-sealing.md) | Permission model, policy engine, audit log, prompt-injection defense |
| [04-architecture.md](04-architecture.md) | Tech stack and why, repo layout, data layout, API, index |
| [05-models.md](05-models.md) | Models per hardware tier, bake-off, gotchas |
| [06-demo-and-pitch.md](06-demo-and-pitch.md) | 5-minute demo script, judge Q&A prep, submission checklist |
| [07-rules-and-compliance.md](07-rules-and-compliance.md) | Hackathon rules that affect us and how we comply |
| [08-open-questions.md](08-open-questions.md) | Decisions still needed before task breakdown |
| [09-runbook.md](09-runbook.md) | Install, run, test, reset demo data, pre-demo checklist, troubleshooting |
| [../demo-data/](../demo-data/README.md) | Synthetic HR and clinic case files plus ground-truth test questions |

## Locked decisions

| Topic | Decision |
|---|---|
| Product | Talaan: local-AI notes app for sensitive client files |
| Primary users | HR investigators and clinicians. Lawyers mentioned as a further market, not the main pitch |
| AI location | **Local only.** No cloud AI for anything, ever |
| Codebase | Built from scratch during the hackathon. Open-source libraries only, all disclosed |
| Core strength | Strict AI permissions per folder, enforced outside the model |
| Model runtime | Ollama |
| Stack | Python + FastAPI backend, React + Vite + Tailwind frontend, plain files + one SQLite per folder |
| Platform | Desktop/laptop, run as a localhost web app |
| Voice | File-based voice transcription in scope. Live meeting transcription is roadmap only |
| Cut | Image generation, live meetings, mobile, editor polish |
