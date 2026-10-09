"""Pinned model tags per hardware tier (docs/05-models.md). The only place model tags live.

Every tag here must be disclosed in the submission. Switching models means picking another
entry from this table; the embedding model is the same on every tier, so indexes never need
rebuilding after a switch.
"""

from dataclasses import dataclass

from app.schemas import TierId

EMBED_MODEL = "qwen3-embedding:0.6b"


@dataclass(frozen=True)
class TierSpec:
    id: TierId
    name: str
    min_mem_gb: int  # unified memory / system RAM, or GPU VRAM on a discrete GPU (see system/tier.py)
    chat_model: str
    whisper_model: str


# Ordered smallest to largest; the order matters for fallback.
TIERS: list[TierSpec] = [
    TierSpec("light", "Light", 8, "qwen3.5:2b", "small"),
    TierSpec("standard", "Standard", 16, "gemma4:e4b", "small"),
    TierSpec("pro", "Pro", 32, "gemma4:26b", "large-v3-turbo"),
]

# Bake-off alternates the user may also pick. Each one counts as the tier it sits under.
ALTERNATES: dict[str, TierId] = {
    "qwen3.5:4b": "standard",
    "qwen3.5:9b": "pro",
}

TIER_BY_ID = {t.id: t for t in TIERS}
TIER_ORDER: list[TierId] = [t.id for t in TIERS]


def allowed_chat_models() -> dict[str, TierId]:
    """Every chat tag the app may run, mapped to the tier it needs."""
    return {**{t.chat_model: t.id for t in TIERS}, **ALTERNATES}
