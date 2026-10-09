# A2 · Folders, files and path sealing

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track A | P0 | 2h | A1 | A4, B3, D3 |

## Goal
Real folder and file operations on disk, with every path checked against the folder root.

## Tasks
- [ ] Data layout: `~/Talaan/folders/<folder-id>/` plus `.talaan/` inside each; `~/Talaan/app.db` outside
- [ ] `GET /folders`, `POST /folders` (name, mode case/chart)
- [ ] `GET /folders/{id}/files` (hide `.talaan/`), `GET /folders/{id}/files/{path}` (content)
- [ ] `POST /folders/{id}/import`: multipart upload of `.md`, `.txt`, `.pdf`; reject other types
- [ ] `policy/paths.py` → `resolve_in_folder(folder_root, rel_path)`: resolve, reject `..` escapes, absolute paths, symlinks leaving the root, and anything under `.talaan/`
- [ ] Unit tests for `resolve_in_folder` (`../`, `..%2f`, absolute, symlink, `.talaan/index.db`)

## Done when
Folders and imports work from `/docs`, and every path-escape test is rejected.

## Notes
Every file access in the app (including B and D code) must go through `resolve_in_folder`.
