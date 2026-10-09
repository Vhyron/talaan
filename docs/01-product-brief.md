# 01 · Product brief

## The problem

Professionals who handle case files (HR investigators, clinicians, lawyers) are often **not allowed** to paste client material into cloud AI. Their files carry health data, government ID numbers, witness identities and disciplinary records. Under the Philippine Data Privacy Act (RA 10173), health records and government-issued ID numbers are sensitive personal information.

So the people with the most reading and summarizing work get the least AI help. Today they read scattered files by hand, or they upload them to cloud AI and take the risk.

## Who it's for

| Priority | User | Their file | Why local matters |
|---|---|---|---|
| **Primary** | HR officer running an investigation | Case: incident reports, witness interviews, NTE, hearing minutes, medical certificates, IDs | Disciplinary and health data. Due process needs accurate, sourced facts |
| **Primary** | Clinician in a small clinic or private practice | Chart: intake, SOAP notes, labs, prescriptions, referrals | Health data, allergies, family history |
| Further market | Lawyers, social workers, auditors | Case files | Privilege and confidentiality duties |

**Hero persona for the demo:** an HR officer working Case 2026-014. The clinic appears as a short cameo to show the same engine generalizes.

## Pitch

> Cloud AI tells you not to give it sensitive files. Talaan is built for exactly those files.

Slide 8 of the briefing asks us to show what is "difficult, expensive, slow, private, or impossible" with cloud-only AI. For our users, cloud AI is **impossible**: they're not allowed to use it on these files.

## What it is

- A desktop app over plain Markdown folders, one folder per client (**Case** in HR mode, **Chart** in clinic mode)
- A local model that answers with sources, builds timelines, drafts documents and transcribes voice notes
- A permission layer the user controls per folder: what the AI may read, suggest, create or delete
- A per-folder audit log of every AI question and action

## What it is not

- Not a cloud AI wrapper, and no "cloud fallback"
- Not a decision-maker. It surfaces facts and contradictions with sources; a human decides
- Not a better general-purpose editor than Obsidian. We don't compete there

## Competitors and how we differ

| Product | What it does | Gap we fill |
|---|---|---|
| Obsidian + plugins (Copilot, Vault Coach) | Local models and folder-scoped Q&A, for technical users who assemble it | One-click setup, scoping that can't be switched off, no cloud option to misconfigure, audit log, case workflows |
| Claude Cowork | Cloud agent working on local folders | Inference runs in the cloud; its own page advises against granting access to sensitive files like financial documents |
| marka.md | Local markdown editor that bundles notes to paste into cloud AI | No built-in AI; the copy-to-cloud step is what our users can't do |
| Elephas | Offline AI writing and knowledge app marketed to HR | General-purpose, not organized around sealed cases |
| Yaps and self-hosted setups for therapists | Offline dictation, or DIY Ollama + Open WebUI | Rough tooling; no per-client sealing or Q&A with sources |
| Cloud AI scribes | Record the session and upload it | The upload is the problem |

**Positioning line:** Obsidian proves the demand. Talaan is the version an HR officer can install and a compliance officer can approve.

## Judging fit

| Criterion | Weight | How we score |
|---|---|---|
| Problem & usefulness | 25% | Clear user (HR investigator), real legal constraint, real workflow (twin-notice due process) |
| Local AI implementation | 25% | Every AI feature runs locally; without the model there is no Q&A, timeline or transcription |
| Technical execution | 20% | Pinned models, schema-checked actions, rehearsed offline demo |
| Innovation | 15% | Policy engine outside the model; prompt-injection defense shown live |
| Product & demo quality | 15% | Focused UI: folders, ask, approvals, audit log |
