# C2 · Folders page, folder view, file viewer

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track C | P0 | 2h | C1 | C3–C7 |

## Goal
Create and open Case/Chart folders, import files, and read them.

## Tasks
- [ ] Folders page: list, "New Case" / "New Chart" (mode label changes the wording everywhere)
- [ ] Folder view layout: file list (left), viewer (center), tabs on the right: Ask · Timeline · Permissions · Approvals · Audit
- [ ] Import: drag-and-drop or file picker for .md/.txt/.pdf, then trigger an index refresh
- [ ] Markdown viewer; `openSource(path, start, end)` scrolls to and highlights the cited lines
- [ ] Show a "Sealed: AI can only see this folder" badge

## Done when
You can create a folder, import the demo files, click any file, and `openSource` highlights a line range.
