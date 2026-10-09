"""Local speech-to-text with faster-whisper (CPU, int8).

The model is loaded for each transcription and released afterwards, so it doesn't
hold memory while the chat model is answering (docs/05-models.md, Light tier).

Pre-download the model once, while online, from the Voice note dialog's
Download button or the terminal:

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


DOWNLOAD_COMMAND = "cd backend; uv run python -m app.transcribe.whisper --download"
# Approximate download sizes (MB) of the CTranslate2 Whisper models.
MODEL_MB = {"tiny": 75, "base": 145, "small": 465, "medium": 1500, "large-v3-turbo": 1600, "large-v3": 3000}


def _size_label(mb: int) -> str:
    return f"{mb / 1000:g} GB" if mb >= 1000 else f"{mb} MB"


# The in-app download (Voice note dialog's Download button): one at a time, in a
# background thread, so the dialog can poll status() for progress.
_download_lock = threading.Lock()
_job: dict = {"running": False, "error": None}


def _cache_dir() -> Path | None:
    """The model's Hugging Face cache folder (it grows while downloading)."""
    from faster_whisper.utils import _MODELS
    from huggingface_hub.constants import HF_HUB_CACHE

    repo_id = _MODELS.get(config.WHISPER_MODEL, config.WHISPER_MODEL)
    if "/" not in repo_id:
        return None
    return Path(HF_HUB_CACHE) / ("models--" + repo_id.replace("/", "--"))


def _downloaded_mb() -> float | None:
    folder = _cache_dir()
    if folder is None or not folder.exists():
        return 0.0 if folder else None
    # blobs/ holds the real bytes, including the .incomplete file being written.
    total = sum(f.stat().st_size for f in folder.rglob("*") if f.is_file() and not f.is_symlink())
    return round(total / 2**20, 1)


def start_download() -> None:
    """Start fetching the model in the background; no-op if a download is running."""
    with _download_lock:
        if _job["running"]:
            return
        _job.update(running=True, error=None)

    def work() -> None:
        from faster_whisper.utils import download_model

        try:
            download_model(config.WHISPER_MODEL)  # files only; doesn't load it into memory
        except Exception:
            _job["error"] = "Couldn't download the speech model. Check the internet connection and try again."
        finally:
            _job["running"] = False

    threading.Thread(target=work, daemon=True, name="whisper-download").start()


def status() -> "VoiceStatus":
    """Whether voice notes can be transcribed here, without loading the model.

    Checks the library imports and the model files are in the local cache
    (faster-whisper's own lookup, offline only). Fast enough to call on every
    dialog open.
    """
    from app.schemas import VoiceStatus

    model = config.WHISPER_MODEL
    try:
        from faster_whisper.utils import download_model
    except ImportError:
        return VoiceStatus(
            ready=False, model=model, problem="library",
            message="The speech-to-text library (faster-whisper) isn't installed.",
            fix="cd backend; uv sync",
        )
    if _job["running"]:
        total = MODEL_MB.get(model)
        done = _downloaded_mb()
        return VoiceStatus(
            ready=False, model=model, problem="model", downloading=True,
            message=f"Downloading the speech model ('{model}'). Keep this laptop online until it finishes.",
            downloaded_mb=min(done, total * 0.99) if done is not None and total else done,
            total_mb=total,
        )
    try:
        download_model(model, local_files_only=True)
    except Exception:
        size = f", about {_size_label(MODEL_MB[model])}" if model in MODEL_MB else ""
        return VoiceStatus(
            ready=False, model=model, problem="model",
            message=f"The speech model ('{model}'{size}) hasn't been downloaded to this laptop yet. "
                    "Download it once while online; after that voice notes work offline.",
            fix=DOWNLOAD_COMMAND,
            total_mb=MODEL_MB.get(model),
            download_error=_job["error"],
        )
    return VoiceStatus(ready=True, model=model)


def _load(local_only: bool = True):
    """Load from the local cache only. Without this, faster-whisper contacts
    Hugging Face on every load to check for updates, even when cached."""
    from faster_whisper import WhisperModel  # heavy import, only when needed

    try:
        return WhisperModel(config.WHISPER_MODEL, device="cpu", compute_type="int8", local_files_only=local_only)
    except Exception as e:
        if local_only:
            raise ModelNotDownloaded(
                f"Speech model '{config.WHISPER_MODEL}' isn't downloaded. Run: {DOWNLOAD_COMMAND}"
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
