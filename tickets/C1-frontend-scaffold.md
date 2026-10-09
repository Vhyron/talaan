# C1 · Frontend scaffold and API client

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track C | P0 | 1h | A1 (stubs) | All C tickets, D2 |

## Goal
A running React app wired to the backend, with types mirroring `schemas.py`.

## Tasks
- [ ] `frontend/`: Vite + React + TypeScript + Tailwind
- [ ] Vite proxy `/api` → `http://localhost:8000`
- [ ] `src/api/types.ts` mirroring A1 schemas; `src/api/client.ts` with one function per endpoint
- [ ] App shell: sidebar of folders, main pane, top bar showing "Offline · local model <tag>"
- [ ] Routing: `/` (folders), `/folders/:id` (folder view)

## Done when
`npm run dev` shows the shell listing fixture folders from the A1 stubs.

## Notes
Keep UI simple and clean; demo quality is 15% of the score. No cloud fonts or CDNs: the demo runs offline.
