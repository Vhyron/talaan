"""B2: extraction and chunking. Every chunk's position must open the matching text."""

from pathlib import Path

import pymupdf
import pytest

from app.index import chunk_file, extract
from app.index.chunk import MAX_TOKENS, chunk_lines, tokens
from app.index.extract import lines_of

DEMO = Path(__file__).resolve().parents[2] / "demo-data"
DEMO_FILES = sorted(DEMO.glob("*/**/*.md"))
INJECTION = "Lakbay-Logistics-Inc/Case 2026-014 Dela Cruz/2026-09-26_email_from-representative.md"


def _check_positions(chunks, lines):
    for c in chunks:
        assert c.text.strip(), c
        assert 1 <= c.start_line <= c.end_line <= len(lines)
        if c.start_line == c.end_line and c.text != lines[c.start_line - 1]:
            assert c.text in lines[c.start_line - 1]  # a piece of an over-long line
        else:
            assert c.text == "\n".join(lines[c.start_line - 1 : c.end_line])


@pytest.mark.parametrize("path", DEMO_FILES, ids=lambda p: p.name)
def test_demo_files_chunk_cleanly(path):
    chunks = chunk_file(path, path.name)
    lines = lines_of(path.read_text(encoding="utf-8"))
    assert chunks
    _check_positions(chunks, lines)
    assert all(c.path == path.name and c.page is None for c in chunks)
    # Nothing is lost: every non-blank line is in some chunk.
    covered = {i for c in chunks for i in range(c.start_line, c.end_line + 1)}
    assert {i for i, line in enumerate(lines, start=1) if line.strip()} <= covered


def test_demo_line_numbers_ignore_crlf():
    path = DEMO / INJECTION
    raw = path.read_bytes().decode("utf-8")
    assert not any(line.endswith("\r") for c in chunk_file(path, path.name) for line in c.text.split("\n"))
    assert len(lines_of(raw)) == raw.count("\n") + 1  # same numbering as the viewer's split('\n')


def test_html_comment_kept_whole():
    path = DEMO / INJECTION
    hidden = [c for c in chunk_file(path, path.name) if "<!--" in c.text]
    assert len(hidden) == 1 and "-->" in hidden[0].text
    assert "ignore all previous instructions" in hidden[0].text


def test_multiline_comment_with_blank_lines_stays_in_one_chunk():
    filler = ["Paragraph " + "word " * 120, ""] * 6
    lines = filler + ["<!-- hidden", "", "still hidden", "", "-->"] + filler
    chunks = chunk_lines(lines, "x.md")
    _check_positions(chunks, lines)
    with_comment = [c for c in chunks if "<!-- hidden" in c.text]
    assert len(with_comment) == 1 and "still hidden" in with_comment[0].text and "-->" in with_comment[0].text


def test_long_document_splits_near_target_with_overlap():
    lines = []
    for s in range(12):
        lines += [f"## Section {s}", ""]
        for p in range(4):
            lines += [f"Section {s} paragraph {p}. " + "lorem ipsum dolor " * 25, ""]
    chunks = chunk_lines(lines, "long.md")
    _check_positions(chunks, lines)
    assert len(chunks) > 5
    assert all(tokens(c.text) <= MAX_TOKENS + 80 for c in chunks)
    assert all(tokens(c.text) >= 150 for c in chunks[:-1])  # no tiny fragments mid-document
    # Headings start new chunks once a chunk is big enough.
    assert sum(c.text.startswith("## Section") for c in chunks) >= 4


def test_overlap_carries_short_last_paragraph():
    lines = []
    for p in range(10):
        lines += ["Body " + "text " * 150, "", f"Short note {p}.", ""]
    chunks = chunk_lines(lines, "o.md")
    _check_positions(chunks, lines)
    assert any(a.end_line >= b.start_line for a, b in zip(chunks, chunks[1:]))


def test_huge_single_line_is_split_on_words():
    line = " ".join(f"w{i}" for i in range(4000))
    lines = ["# Title", "", line, "", "After."]
    chunks = chunk_lines(lines, "big.md")
    _check_positions(chunks, lines)
    pieces = [c for c in chunks if c.start_line == c.end_line == 3]
    assert len(pieces) > 1 and all(tokens(p.text) <= MAX_TOKENS for p in pieces)
    assert " ".join(p.text for p in pieces) == line


def test_empty_and_blank_files_give_no_chunks(tmp_path):
    for name, body in [("empty.md", ""), ("blank.txt", "\n  \n\t\n")]:
        (tmp_path / name).write_text(body, encoding="utf-8")
        assert chunk_file(tmp_path / name, name) == []


def test_txt_with_bom_and_bad_bytes(tmp_path):
    (tmp_path / "n.txt").write_bytes(b"\xef\xbb\xbfFirst line\nbad \xff byte\n")
    [c] = chunk_file(tmp_path / "n.txt", "n.txt")
    assert c.text.startswith("First line") and "�" in c.text and (c.start_line, c.end_line) == (1, 2)


def test_pdf_page_by_page(tmp_path):
    doc = pymupdf.open()
    for n in (1, 2):
        doc.new_page().insert_text((72, 72), f"Page {n} heading\nPenicillin allergy noted on page {n}.")
    doc.save(tmp_path / "chart.pdf")
    doc.close()

    pages = extract(tmp_path / "chart.pdf")
    assert [p.page for p in pages] == [1, 2]
    chunks = chunk_file(tmp_path / "chart.pdf", "chart.pdf")
    assert [c.page for c in chunks] == [1, 2]
    for c, p in zip(chunks, pages):
        _check_positions([c], lines_of(p.text))
        assert f"page {c.page}." in c.text


def test_rejects_other_types(tmp_path):
    (tmp_path / "a.docx").write_bytes(b"x")
    with pytest.raises(ValueError):
        extract(tmp_path / "a.docx")
