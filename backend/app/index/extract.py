"""Text extraction: .md/.txt as UTF-8, .pdf page by page via PyMuPDF.

Text is kept verbatim, HTML comments included: the prompt-injection test needs
the model to see hidden text exactly as a reader of the raw file would.
"""

from dataclasses import dataclass
from pathlib import Path

import pymupdf

TEXT_TYPES = {".md", ".txt"}
INDEXED_TYPES = TEXT_TYPES | {".pdf"}


@dataclass
class Page:
    """One extractable unit of a file. `page` is 1-based for PDFs, None for text files."""

    text: str
    page: int | None = None


def lines_of(text: str) -> list[str]:
    """Split like the file viewer does (on \\n), so line numbers match what the user sees."""
    return [line.rstrip("\r") for line in text.split("\n")]


def extract(path: Path) -> list[Page]:
    suffix = path.suffix.lower()
    if suffix in TEXT_TYPES:
        # utf-8-sig drops a BOM; bad bytes become U+FFFD rather than failing the whole index.
        return [Page(path.read_bytes().decode("utf-8-sig", errors="replace"))]
    if suffix == ".pdf":
        with pymupdf.open(path) as doc:
            return [Page(p.get_text("text"), page=i) for i, p in enumerate(doc, start=1)]
    raise ValueError(f"Not an indexed file type: {path.name}")
