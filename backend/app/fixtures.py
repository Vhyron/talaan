"""Fixture responses for the A1 stub routes, based on demo-data/.

Each route swaps to a real implementation in its own ticket (A2–A5, B3–B5, D1, D7).
"""

from app.schemas import SystemTier, Tier

_EMBED = "qwen3-embedding:0.6b"
TIER = SystemTier(
    ram_gb=16, gpu=None, free_disk_gb=120, recommended="standard",
    tiers=[
        Tier(id="light", name="Budget", min_ram_gb=8, chat_model="qwen3.5:2b", embed_model=_EMBED, whisper_model="small", fits=True),
        Tier(id="standard", name="Mid", min_ram_gb=12, chat_model="qwen3.5:4b", embed_model=_EMBED, whisper_model="small", fits=True),
        Tier(id="pro", name="High", min_ram_gb=16, chat_model="gemma4:e4b", embed_model=_EMBED, whisper_model="small", fits=True),
    ],
)
