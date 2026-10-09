# C8 · Saved chat sessions per folder

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track C (+ backend) | P2 | 3h | C3, B4 | — |

## Goal
Ask chats no longer disappear when switching cases or charts. Every question and answer is saved per folder in `app.db`, and the user can continue an earlier chat.

## Tasks
- [x] `app.db`: `chat_sessions` + `chat_messages` (replace the unused `conversations` table); `audit.session_id` column
- [x] `app/chats.py`: save each turn from `ask()`, list/search, resume with live proposal status, rename, delete
- [x] Routes: `GET/PATCH/DELETE /folders/{id}/chats[/{sid}]`; `AskRequest`/`AskResponse.session_id`
- [x] Background title from the first question only (local model, thinking off); skipped after a refusal or with Read = Never; a user rename always wins
- [x] Audit: `question`/`answer` rows carry `session_id`; `session_renamed`, `session_deleted` events
- [x] Ask panel: New chat + saved chats (clock) buttons, "Continue last chat" card on an empty chat, chat kept per folder for the browser tab
- [x] Saved chats list: search, rename, delete (with "stays in the audit log" confirmation)
- [x] Demo reset clears saved chats

## Done when
- Ask in the HR case, switch to the clinic chart and back: the chat is still there
- Reload: the "Continue last chat" card restores it with working source chips; a follow-up keeps context
- Q5 in a saved chat reopens as "Blocked by policy"; a draft approved in Approvals reopens as "Approved"
- Deleting a chat logs `session_deleted` and the audit log still has its questions
- `uv run pytest` (incl. `tests/test_chats.py`) and the frontend checks pass

## Notes
- Saved chats are never a source: retrieval still reads only the folder's `index.db`, and history is passed as context exactly as before.
- Chats are per folder only; a chat id from another folder returns 404 on every route.
