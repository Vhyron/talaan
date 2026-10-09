# B2 · Text extraction and chunking

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track B | P0 | 1h | A1 | B3 |

## Goal
Turn `.md`, `.txt` and `.pdf` files into chunks that carry enough position info for citations.

## Tasks
- [ ] `index/extract.py`: md/txt as UTF-8 text; pdf via PyMuPDF, page by page
- [ ] `index/chunk.py`: split on headings/paragraphs, target ~400–600 tokens with small overlap
- [ ] Each chunk: `path`, `start_line`/`end_line` (or `page` for PDF), `text`
- [ ] Keep HTML comments in the text (the injection test depends on the model seeing them)
- [ ] Tests on the demo folders: no empty chunks, positions map back to the right text

## Done when
Every demo-data file chunks cleanly, and each chunk's position opens the matching text.
