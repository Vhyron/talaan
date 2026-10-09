"""Local speech-to-text with faster-whisper (CPU, int8).

The model is loaded for each transcription and released afterwards, so it doesn't
hold memory while the chat model is answering (docs/05-models.md, Light tier).

Pre-download the model once, while online:

    uv run python -m app.transcribe.whisper --download
"""

import gc
import sys
import threading
from dataclasses import dataclass
from pathlib import Path

from app import config

# One transcription at a time: two CPU Whisper runs would just fight each other.
_lock = threading.Lock()


@dataclass
class Segment:
    start: float
    end: float
    text: str


@dataclass
class Transcript:
    text: str
    segments: list[Segment]
    duration: float
    language: str
    model: str


class ModelNotDownloaded(RuntimeError):
    pass


def _load(local_only: bool = True):
    """Load from the local cache only. Without this, faster-whisper contacts
    Hugging Face on every load to check for updates, even when cached."""
    from faster_whisper import WhisperModel  # heavy import, only when needed

    try:
        return WhisperModel(config.WHISPER_MODEL, device="cpu", compute_type="int8", local_files_only=local_only)
    except Exception as e:
        if local_only:
            raise ModelNotDownloaded(
                f"Speech model '{config.WHISPER_MODEL}' isn't downloaded. "
                "Run: uv run python -m app.transcribe.whisper --download"
            ) from e
        raise


def transcribe_file(path: Path, hotwords: str | None = None) -> Transcript:
    """`hotwords`: names from the open folder, so they come out spelled as in the case."""
    with _lock:
        model = _load()
        try:
            segments, info = model.transcribe(str(path), beam_size=5, vad_filter=True, hotwords=hotwords or None)
            segs = [Segment(s.start, s.end, s.text.strip()) for s in segments if s.text.strip()]
        finally:
            del model
            gc.collect()
    return Transcript(
        text=" ".join(s.text for s in segs),
        segments=segs,
        duration=info.duration,
        language=info.language,
        model=f"faster-whisper:{config.WHISPER_MODEL}",
    )


def download() -> None:
    """Fetch the model into the local Hugging Face cache so later runs work offline."""
    from huggingface_hub import scan_cache_dir

    _load(local_only=False)
    size = sum(r.size_on_disk for r in scan_cache_dir().repos if config.WHISPER_MODEL in r.repo_id)
    print(f"faster-whisper '{config.WHISPER_MODEL}' cached ({size / 2**20:.0f} MB). Transcription now works offline.")


if __name__ == "__main__":
    if "--download" in sys.argv:
        download()
    else:
        print(__doc__)
