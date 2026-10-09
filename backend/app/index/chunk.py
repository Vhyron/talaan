"""Chunking for citations: paragraphs and headings grouped into ~400–600 token chunks.

A chunk's text is exactly lines start_line..end_line of its file (or PDF page), so a
citation opens the matching text. The only exception is a single line too long for
one chunk: it is cut at word boundaries and each piece cites that one line.
"""

from dataclasses import dataclass
from pathlib import Path

from app.index.extract import extract, lines_of

MAX_TOKENS = 600
MIN_TOKENS = 400  # at a heading, close the chunk once it has at least this much
OVERLAP_TOKENS = 80  # carry the previous chunk's last paragraph if it's this small


@dataclass
class Chunk:
    path: str  # folder-relative, forward slashes
    start_line: int  # 1-based, inclusive; within the page for PDFs
    end_line: int
    text: str
    page: int | None = None  # 1-based PDF page, None for text files


def tokens(text: str) -> int:
    """Rough token count (~4 chars per token). No tokenizer needed for sizing chunks."""
    return len(text) // 4 + 1


def _comment_open_after(line: str, open_: bool) -> bool:
    """Whether an HTML comment is still open at the end of `line`."""
    i = 0
    while True:
        j = line.find("-->" if open_ else "<!--", i)
        if j < 0:
            return open_
        open_, i = not open_, j + (3 if open_ else 4)


def _blocks(lines: list[str]) -> list[tuple[int, int]]:
    """Paragraphs as 0-based inclusive line ranges. Blank lines split them, except
    inside an HTML comment (a hidden instruction stays whole); headings start a new one."""
    blocks, start, in_comment = [], None, False
    for i, line in enumerate(lines):
        blank = not line.strip()
        if start is not None and not in_comment and (blank or line.startswith("#")):
            blocks.append((start, i - 1))
            start = None
        if start is None and not blank:
            start = i
        in_comment = _comment_open_after(line, in_comment)
    if start is not None:
        end = len(lines) - 1
        while not lines[end].strip():
            end -= 1
        blocks.append((start, end))
    return blocks


def _split_line(line: str) -> list[str]:
    pieces, cur = [], ""
    for word in line.split(" "):
        if cur and tokens(cur + " " + word) > MAX_TOKENS:
            pieces.append(cur)
            cur = word
        else:
            cur = f"{cur} {word}" if cur else word
    return pieces + [cur] if cur.strip() else pieces


def chunk_lines(lines: list[str], path: str, page: int | None = None) -> list[Chunk]:
    def text(a: int, b: int) -> str:
        return "\n".join(lines[a : b + 1])

    chunks: list[Chunk] = []
    cur: list[tuple[int, int]] = []

    def flush() -> None:
        if cur:
            a, b = cur[0][0], cur[-1][1]
            chunks.append(Chunk(path, a + 1, b + 1, text(a, b), page))

    for a, b in _blocks(lines):
        size = tokens(text(a, b))
        if size > MAX_TOKENS:  # one huge paragraph: cut it by lines, then words
            flush()
            cur = []
            for i in range(a, b + 1):
                if not lines[i].strip():
                    continue
                if tokens(lines[i]) > MAX_TOKENS:
                    flush()
                    cur = []
                    chunks += [Chunk(path, i + 1, i + 1, p, page) for p in _split_line(lines[i])]
                elif cur and tokens(text(cur[0][0], i)) > MAX_TOKENS:
                    flush()
                    cur = [(i, i)]
                else:
                    cur = [(cur[0][0] if cur else i, i)]
            flush()
            cur = []
            continue
        if cur:
            cur_size = tokens(text(cur[0][0], cur[-1][1]))
            if lines[a].startswith("#") and cur_size >= MIN_TOKENS:
                flush()
                cur = []
            elif tokens(text(cur[0][0], b)) > MAX_TOKENS:
                flush()
                last = cur[-1]
                cur = [last] if tokens(text(last[0], b)) <= MAX_TOKENS and tokens(text(*last)) <= OVERLAP_TOKENS else []
        cur.append((a, b))
    flush()
    return chunks


def chunk_file(path: Path, rel_path: str) -> list[Chunk]:
    """Extract and chunk one file. `rel_path` is what citations show."""
    out: list[Chunk] = []
    for p in extract(path):
        out += chunk_lines(lines_of(p.text), rel_path, p.page)
    return out
