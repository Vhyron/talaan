# Project brief: Talaan

## Problem

HR investigators and clinicians are often not allowed to paste client files into cloud AI. Their files carry health data, government ID numbers, witness identities and disciplinary records, which are sensitive personal information under the Philippine Data Privacy Act (RA 10173). So the people with the most reading and summarizing work get the least AI help.

## What Talaan is

- A desktop notes app over plain Markdown folders. Each client folder is a sealed Space.
- A local model (through Ollama) that answers with sources, builds timelines, drafts documents and transcribes voice notes.
- Per-Space permissions the user controls: Read, Suggest edits, Create drafts, Delete.
- A per-Space audit log of every question, proposed action and decision.

## What it is not

- Not a cloud AI wrapper. No cloud fallback. Internet is only used for the one-time model download.
- Not a decision-maker. It surfaces facts and contradictions with sources; a human decides.

## Pitch line

"Cloud AI tells you not to give it sensitive files. Talaan is built for exactly those files."

## Hero demo

HR officer Bea Lim working Case 2026-014 (Dela Cruz): timeline with sources, flagged contradiction, blocked prompt injection, sealing refusal, voice note. Clinic cameo: Chart M. Reyes allergy check.
