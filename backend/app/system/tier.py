"""Hardware tier detection (D7): RAM / GPU → Light, Standard or Pro (docs/05-models.md)."""

import platform
import shutil
import subprocess
from dataclasses import dataclass

import psutil

from app import config
from app.llm.models import TIERS
from app.schemas import TierId


@dataclass(frozen=True)
class Hardware:
    ram_gb: int
    gpu: str | None
    vram_gb: int  # 0 when there is no discrete GPU (Apple Silicon shares RAM)
    free_disk_gb: int

    @property
    def model_mem_gb(self) -> int:
        """Memory the models are budgeted against: system RAM only (unified memory on Apple Silicon).

        A discrete GPU makes answers faster but doesn't count as extra room: on a small GPU the model
        spills into RAM anyway (gemma4:e4b on a 4 GB card), so counting it would overcommit the laptop.
        """
        return self.ram_gb


def _nvidia() -> tuple[str, int] | None:
    if not shutil.which("nvidia-smi"):
        return None
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5, check=True,
        ).stdout.strip().splitlines()[0]
        name, mib = (s.strip() for s in out.split(","))
        return name, round(int(mib) / 1024)
    except (subprocess.SubprocessError, ValueError, IndexError, OSError):
        return None


def detect() -> Hardware:
    ram_gb = round(psutil.virtual_memory().total / 2**30)
    config.TALAAN_HOME.mkdir(parents=True, exist_ok=True)
    free_disk_gb = shutil.disk_usage(config.TALAAN_HOME).free // 2**30

    if platform.system() == "Darwin" and platform.machine() == "arm64":
        return Hardware(ram_gb, "Apple Silicon (unified memory)", 0, free_disk_gb)
    if gpu := _nvidia():
        name, vram_gb = gpu
        return Hardware(ram_gb, f"{name} ({vram_gb} GB)", vram_gb, free_disk_gb)
    return Hardware(ram_gb, None, 0, free_disk_gb)


def fits(hw: Hardware, tier: TierId) -> bool:
    spec = next(t for t in TIERS if t.id == tier)
    return hw.model_mem_gb >= spec.min_mem_gb


def recommended(hw: Hardware) -> TierId:
    """The largest tier this machine can hold; Light is the floor."""
    best: TierId = TIERS[0].id
    for t in TIERS:
        if fits(hw, t.id):
            best = t.id
    return best
