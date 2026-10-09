"""Pinned model tags per hardware tier (docs/05-models.md). The only place model tags live.

PINNED by the B1 bake-off, 2026-10-09 (docs/05-models.md#pinned-tags). No changes after midnight.
Every tag here must be disclosed in the submission. Switching models means picking another
entry from this table; the embedding model is the same on every tier, so indexes never need
rebuilding after a switch.
"""

from dataclasses import dataclass

from app.schemas import TierId

EMBED_MODEL = "qwen3-embedding:0.6b"  # digest ac6da0dfba84, tested


@dataclass(frozen=True)
class TierSpec:
    id: TierId
    name: str
    min_mem_gb: int  # unified memory / system RAM, or GPU VRAM on a discrete GPU (see system/tier.py)
    chat_model: str
    whisper_model: str


# Ordered smallest to largest; the order matters for fallback. Only bake-off tested models.
# Tier ids stay light/standard/pro in the API; the UI calls them Budget / Mid / High hardware.
TIERS: list[TierSpec] = [
    TierSpec("light", "Budget", 8, "qwen3.5:2b", "small"),  # digest 0689d44085e0, bake-off 21/27 on 8 GB M2
    TierSpec("standard", "Mid", 12, "qwen3.5:4b", "small"),  # digest d8b0f5e9760c, bake-off 24/27 on 8 GB M2 (slow there)
    TierSpec("pro", "High", 16, "gemma4:e4b", "small"),  # digest dc35e8d9c606, bake-off 23/27 on 32 GB + 4 GB GPU
]

# No alternates: these three are the only chat models the app runs.
ALTERNATES: dict[str, TierId] = {}

TIER_BY_ID = {t.id: t for t in TIERS}
TIER_ORDER: list[TierId] = [t.id for t in TIERS]


def allowed_chat_models() -> dict[str, TierId]:
    """Every chat tag the app may run, mapped to the tier it needs."""
    return {**{t.chat_model: t.id for t in TIERS}, **ALTERNATES}
