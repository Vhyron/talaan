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


class TooShort(ValueError):
    pass


SAMPLE_RATE = 16_000
MIN_SECONDS = 1.5  # shorter clips make Whisper invent text
# Segment filters against made-up text on unclear audio (Whisper's own scores).
MAX_NO_SPEECH_PROB = 0.6
MIN_AVG_LOGPROB = -1.0


def choose_language(probs: list[tuple[str, float]], allowed: list[str]) -> str:
    """The likeliest language among `allowed`, from Whisper's full ranking."""
    ranked = [(p, lang) for lang, p in probs if lang in allowed]
    return max(ranked)[1] if ranked else allowed[0]


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
    from faster_whisper.audio import decode_audio

    audio = decode_audio(str(path), sampling_rate=SAMPLE_RATE)
    duration = len(audio) / SAMPLE_RATE
    if duration < MIN_SECONDS:
        raise TooShort(f"The recording is too short ({duration:.1f}s). Speak for at least a few seconds.")

    allowed = config.WHISPER_LANGUAGES
    with _lock:
        model = _load()
        try:
            if len(allowed) == 1:
                language = allowed[0]
            else:
                _, _, probs = model.detect_language(audio=audio, vad_filter=True)
                language = choose_language(probs, allowed)
            segments, _ = model.transcribe(
                audio,
                language=language,
                beam_size=5,
                vad_filter=True,
                hotwords=hotwords or None,
                condition_on_previous_text=False,  # stops one bad guess repeating ("味道味道味道")
            )
            segs = [
                Segment(s.start, s.end, s.text.strip())
                for s in segments
                if s.text.strip() and s.no_speech_prob < MAX_NO_SPEECH_PROB and s.avg_logprob > MIN_AVG_LOGPROB
            ]
        finally:
            del model
            gc.collect()
    return Transcript(
        text=" ".join(s.text for s in segs),
        segments=segs,
        duration=duration,
        language=language,
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
