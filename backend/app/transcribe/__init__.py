"""Voice notes: audio -> transcript -> create_draft proposal through the policy engine."""

import re
from datetime import datetime
from pathlib import Path

from app.transcribe import whisper
from app.transcribe.whisper import Transcript

AUDIO_TYPES = {".webm", ".wav", ".m4a", ".mp3", ".ogg"}

# "Bea Lim", "Leo Fernandez", "Atty. Ramos", "Tulong Manpower Services"
_NAME = re.compile(r"\b(?:Atty\.\s|Dr\.\s)?[A-Z][a-z]+(?:\s(?:dela\s|de\s)?[A-Z][a-z]+)+\b")


def folder_vocabulary(texts: list[str], limit: int = 40) -> str:
    """Multi-word proper names from the open folder's own files, most frequent first.

    Only this folder's text is used, so the hint can't carry another client's names.
    """
    counts: dict[str, int] = {}
    for text in texts:
        for m in _NAME.findall(text):
            name = m.strip()
            counts[name] = counts.get(name, 0) + 1
    return ", ".join(sorted(counts, key=lambda n: -counts[n])[:limit])


def _clock(seconds: float) -> str:
    m, s = divmod(int(round(seconds)), 60)
    return f"{m}:{s:02d}"


def to_markdown(t: Transcript, recorded: datetime) -> str:
    lines = [
        f"# Voice note — {recorded.strftime('%b %d, %Y %H:%M')}",
        "",
        f"- **Recorded:** {recorded.strftime('%Y-%m-%d %H:%M')} · **Duration:** {_clock(t.duration)}",
        f"- **Transcribed on this laptop** with {t.model} (language: {t.language})",
        "",
        t.text,
        "",
        "## Timestamps",
        "",
        *[f"- [{_clock(s.start)}] {s.text}" for s in t.segments],
    ]
    return "\n".join(lines) + "\n"


def draft_name(root: Path, recorded: datetime, subdir: str = "") -> str:
    """`2026-10-03_voice-note_1405.md` (inside `subdir` if given), with -2, -3… if that name is taken."""
    prefix = f"{subdir.strip('/')}/" if subdir.strip("/") else ""
    base = f"{prefix}{recorded:%Y-%m-%d}_voice-note_{recorded:%H%M}"
    name, n = f"{base}.md", 1
    while (root / name).exists():
        n += 1
        name = f"{base}-{n}.md"
    return name


__all__ = ["AUDIO_TYPES", "draft_name", "folder_vocabulary", "to_markdown", "whisper"]
