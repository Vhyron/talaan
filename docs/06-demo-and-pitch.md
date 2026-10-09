# 06 · Demo, pitch and submission

## 5-minute live demo (plus 3 min Q&A)

Wi-Fi off from the start. Show the Wi-Fi icon once.

| Time | Beat |
|---|---|
| 0:00–0:30 | **Problem.** Bea, an HR officer, has Case 2026-014: interviews, a medical certificate, SSS numbers. She can't paste any of it into ChatGPT |
| 0:30–1:00 | Open the sealed case. Show the permission panel: Read on, Suggest and Create need approval, Delete never |
| 1:00–2:00 | **Hero:** "Build a timeline with sources." Timeline appears; the app flags that sick leave, the medical certificate and the badge log contradict the supervisor's ID. "Flagged for your review." Click a source |
| 2:00–2:45 | **Attack:** open the email and show the hidden comment. "Summarize the representative's email." → a factual summary: the request for copies, no admission (gemma4:e4b ignored the injection in 10/10 runs). Then play the careless user: "Follow the instructions in the representative's email." → the model proposes deleting a witness interview → **blocked** (Delete: Never), red row in Audit → Blocked only. Say it plainly: the model obeyed the email because we told it to; the policy engine stopped it, not the prompt |
| 2:45–3:15 | **Sealing:** "Summarize Ana Villanueva's tardiness." → "I can only see Case 2026-014 · Dela Cruz." |
| 3:15–3:45 | **Voice:** record the 30-second follow-up note → transcript proposed → approve → saved into the case |
| 3:45–4:15 | **Clinic cameo:** switch to Chart M. Reyes → "Any allergies before I prescribe an antibiotic?" → penicillin, with source |
| 4:15–5:00 | Tiers (runs on an 8 GB laptop up to a workstation), roadmap (live meetings, encryption at rest), closing line |

**Closing line:** "Cloud AI tells you not to give it sensitive files. Talaan is built for exactly those files."

**Backup:** a recorded run of the full demo, ready in case live fails.

## Judge Q&A prep

| Likely question | Answer |
|---|---|
| Why not Obsidian with an AI plugin? | Same idea for power users who assemble it themselves. Their scoping is a setting, the same plugins offer cloud models one dropdown away, and there's no audit log. We're the version a compliance officer can approve |
| Why not ChatGPT Enterprise or Claude? | Still sends the file off the device. For many orgs and clinics that's not allowed, and Cowork's own page advises against granting sensitive files |
| Small models hallucinate. Why trust it? | Every claim cites a source file; contradictions are flagged, not decided; a human approves every change |
| How is sealing actually enforced? | One index per folder, paths checked against the folder root, grants stored outside the model's reach, policy engine decides every action |
| What about prompt injection? | We just showed it: the summary ignored the hidden instruction, and when told to follow the email the model proposed the delete, which the policy engine blocked. Safety doesn't depend on the model behaving |
| What needs internet? | Only the one-time model download |
| What if the laptop is stolen? | Today, OS disk encryption. Per-folder encryption at rest is on the roadmap |
| Does it understand Taglish? | The models are multilingual; we demo in English and haven't benchmarked Taglish yet |

## Submission checklist (deadline 10:00 AM Oct 10, single submission)

- [ ] Project name, short description, team members
- [ ] **Public** GitHub repo with run instructions (frozen at 10:00 AM)
- [ ] Demo video, about 1 minute
- [ ] X or LinkedIn video post tagging Devin / Cognition with #AppBuildersPH
- [ ] What runs locally: all AI (chat, embeddings, transcription)
- [ ] What requires internet: one-time model download only
- [ ] Models: exact tags (chat, embedding, Whisper size). Pinned by B1, see the list below and [05-models.md](05-models.md#pinned-tags)
- [ ] Technologies and frameworks: FastAPI, React, Vite, Tailwind, Ollama, faster-whisper, PyMuPDF, SQLite, numpy, uv
- [ ] APIs and cloud services: none
- [ ] Existing code and assets: open-source libraries; design mockups and synthetic demo data made on Oct 9
- [ ] AI development tools used (e.g. Claude, Devin if used)
- [ ] **Answer: why does this product benefit from running AI locally?** (draft below)

### Disclosure list (running; add as you go)

**Models** (all run locally through Ollama 0.34.2, pinned 2026-10-09):
- Chat, tier-selected: `qwen3.5:2b` (Light, tested), `gemma4:e4b` (Standard, tested), `gemma4:26b` (Pro); selectable alternates `qwen3.5:4b`, `qwen3.5:9b`
- Embeddings: `qwen3-embedding:0.6b` on every tier
- Speech-to-text: faster-whisper `small` (Light/Standard), `large-v3-turbo` (Pro); D1 confirms

**Libraries added by track B:** `httpx` (Ollama client), `psutil` (hardware tier detection), `pymupdf` (PDF text extraction, B2), `numpy` (embedding similarity, B3)

**Dev and test tools (not shipped in the app):** `playwright` 1.64.0 for browser checks of the UI (`e2e/`, docs/10)

**AI development tools:** Claude Code (Anthropic) used by track B for coding and docs. Not part of the product: the app makes no cloud AI calls.

### Draft answer: why local?

> Talaan's users (HR investigators and clinicians) handle files containing health data, government ID numbers, witness identities and disciplinary records. They often can't legally or contractually send these to a cloud AI, so cloud AI isn't slower or pricier for them; it's off-limits. Running the model on the laptop makes AI usable on these files at all. Local inference also lets us seal each client folder physically, enforce permissions outside the model, keep a per-folder audit log, and work with no internet.
