# B2 · Text extraction and chunking

| Owner | Priority | Estimate | Depends on | Blocks |
|---|---|---|---|---|
| Track B | P0 | 1h | A1 | B3 |

## Goal
Turn `.md`, `.txt` and `.pdf` files into chunks that carry enough position info for citations.

## Tasks
- [x] `index/extract.py`: md/txt as UTF-8 text; pdf via PyMuPDF, page by page
- [x] `index/chunk.py`: split on headings/paragraphs, target ~400–600 tokens with small overlap
- [x] Each chunk: `path`, `start_line`/`end_line` (or `page` for PDF), `text`
- [x] Keep HTML comments in the text (the injection test depends on the model seeing them)
- [x] Tests on the demo folders: no empty chunks, positions map back to the right text

## Done when
Every demo-data file chunks cleanly, and each chunk's position opens the matching text.

## Outcome (2026-10-09)
- `app/index/extract.py` and `app/index/chunk.py`; `Chunk(path, start_line, end_line, text, page)`. Line numbers split on `\n` like the file viewer, so CRLF files cite the lines the user sees.
- A chunk's text is exactly its lines, so a citation opens the matching text. Blank lines inside an HTML comment don't split it: the injection stays whole in one chunk.
- Demo files are small (~100–190 tokens), so each is one chunk. Longer files break at headings (~460 tokens) with a short-paragraph overlap; over-long single lines are cut on words.
- PDFs: one set of chunks per page, `page` set and lines counted within the page. `Source` has no page field yet; B3/B4 decide how a PDF citation maps to it.
- Added `pymupdf` (disclosure list updated). Tests: `tests/test_chunk.py`.
