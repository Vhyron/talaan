"""Pinned model tags per hardware tier (docs/05-models.md). The only place model tags live.

PINNED by the B1 bake-off, 2026-10-09 (docs/05-models.md#pinned-tags). No changes after midnight.
Every tag here must be disclosed in the submission. Switching models means picking another
entry from this table; the embedding model is the same on every tier, so indexes never need
rebuilding after a switch.
"""

import math
from dataclasses import dataclass

from app.schemas import TierId

EMBED_MODEL = "qwen3-embedding:0.6b"  # digest ac6da0dfba84, tested

# Memory budget, on the generous side: a machine gets a model only if the chat model, the embedding
# model AND everything else on the laptop fit in system RAM at the same time.
EMBED_MEM_GB = 2.5  # qwen3-embedding:0.6b loaded at num_ctx 2048: 2.32 GB in `ollama ps` (2026-10-10)
RESERVE_GB = 6.0  # OS + browser with the web app + backend + faster-whisper small


@dataclass(frozen=True)
class TierSpec:
    id: TierId
    name: str
    chat_mem_gb: float  # chat model loaded at num_ctx 16384: weights (`ollama list`) + context/KV cache, rounded up
    chat_model: str
    whisper_model: str

    @property
    def min_mem_gb(self) -> int:
        """System RAM this class needs: chat model + embedding model + everything else, all at once."""
        return math.ceil(self.chat_mem_gb + EMBED_MEM_GB + RESERVE_GB)


# Ordered smallest to largest; the order matters for fallback. Only bake-off tested models.
# Tier ids stay light/standard/pro in the API; the UI calls them Budget / Mid / High hardware.
TIERS: list[TierSpec] = [
    # needs 13 GB: 2.7 GB weights. The floor: smaller machines still get it, with a "may be slow" warning
    TierSpec("light", "Budget", 4.5, "qwen3.5:2b", "small"),  # digest 0689d44085e0, bake-off 21/27 on 8 GB M2
    # needs 14 GB: 3.3 GB weights
    TierSpec("standard", "Mid", 5.5, "qwen3.5:4b", "small"),  # digest d8b0f5e9760c, bake-off 24/27 on 8 GB M2 (slow there)
    # needs 19 GB: 6.6 GB weights, ~10 GB loaded (docs/05)
    TierSpec("pro", "High", 10.0, "gemma4:e4b", "small"),  # digest dc35e8d9c606, bake-off 23/27 on 32 GB + 4 GB GPU
]

# No alternates: these three are the only chat models the app runs.
ALTERNATES: dict[str, TierId] = {}

TIER_BY_ID = {t.id: t for t in TIERS}
TIER_ORDER: list[TierId] = [t.id for t in TIERS]


def allowed_chat_models() -> dict[str, TierId]:
    """Every chat tag the app may run, mapped to the tier it needs."""
    return {**{t.chat_model: t.id for t in TIERS}, **ALTERNATES}
