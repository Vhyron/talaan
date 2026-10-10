# "Built with Talaan" demo

A demo where Talaan is our own team's note taker. The Space [`demo-data/Talaan-Hackathon-Team/`](../demo-data/Talaan-Hackathon-Team/README.md) holds our project brief, requirements, schedule, ticket board and an earlier meeting. It's seeded with the other demo Spaces (setup step 6, or `seed_demo.py --reset`). In the demo we add the notes of our final Discord call as a voice note, then ask Talaan what's left.

This folder holds only the script and a backup transcript, so the model never reads them.

## Setup (before recording)

1. Run the app as in [docs/09-runbook.md](../docs/09-runbook.md). Voice notes model downloaded (Settings).
2. Do a dry run: open the Space, ask the questions below once so the models are warm. Then `cd backend; uv run scripts/seed_demo.py --reset` so the recording starts clean (removes the dry-run voice note, chats and audit rows).
3. Record the Discord call (lines below) as an audio file, or have the team ready to say them live while Talaan records laptop audio + mic.
4. Wi-Fi off.

## Lines for the Discord call (about 35 seconds)

> **Jabez:** Okay, final check before we submit. AI side is done. Ask with sources, the timeline and the prompt-injection block all pass Q1 to Q9.
>
> **Rai:** Frontend and voice notes are done. The recorder can capture the mic, the laptop audio, or both.
>
> **Oniely:** Policy engine, sealing and the audit log are done. Delete stays at Never.
>
> **Vhyron:** Settings and model selection are done. The repo is public and the 1-minute video is recorded.
>
> **Jabez:** So all the requirements are done. The only things left are to submit the entry before ten, then go to Cyberzone SM Makati for registration at twelve. See you all in Makati.

If transcription fails on the day, drag `backup/2026-10-10_discord-final-sync.md` into the Space instead. It's the same call as text.

## 1-minute script

| Time | On screen | Say |
|---|---|---|
| 0:00–0:07 | Talaan home, Wi-Fi icon off | "We built Talaan, and we ran our whole hackathon on it. Wi-Fi is off. Everything you'll see runs on this laptop." |
| 0:07–0:17 | Open `Talaan Hackathon Team` → project, tickets, meetings | "Here are our notes: the brief, the requirements, the schedule and our ticket board, in one sealed Space." |
| 0:17–0:22 | Permission panel | "Talaan can read them. Anything it writes needs our approval. It can never delete." |
| 0:22–0:37 | Voice note → record laptop audio (Discord call plays) → stop → transcript preview → **Approve** | "We just finished our last Discord call. Talaan transcribed it locally with Whisper, and it only saves the notes after we approve." |
| 0:37–0:52 | Ask: **"Based on today's call, what's left for the team?"** Answer with sources | "All requirements are done. What's left: submit before 10, then registration at Cyberzone SM Makati at noon. Every line cites its file." |
| 0:52–1:00 | Audit log (question, draft, approval rows) | "Every question and action is logged in this Space. Cloud AI tells you not to give it sensitive files. Talaan is built for exactly those files." |

Optional second question if there's time on stage: "What changed since the Oct 9 kickoff?" It should contrast the kickoff's open items (voice, seed, tests, video, private repo) with today's call, citing both meeting files.

## Expected answer to the main question

All P0 and P1 requirements are done (per the Oct 10 voice note). Remaining: submit the entry before 10:00 AM, then go to Cyberzone SM Makati for 12:00 PM registration. Sources: the Oct 10 voice note and `project/03-schedule.md`. It may also mention D6 (submission) as `doing` from `tickets/ticket-board.md`.
