"""Fixture responses for the A1 stub routes, based on demo-data/.

Each route swaps to a real implementation in its own ticket (A2–A5, B3–B5, D1, D7).
"""

from datetime import datetime

from app.schemas import (
    Outcome,
    Source, SystemTier, Tier,
)

T = datetime.fromisoformat

OPEN_ITEMS = Source(path="2026-10-02_open-items.md", start=3, end=5, snippet="Agency helper roster … Notice of Decision target date: Oct 16, 2026")
EMAIL = Source(path="2026-09-26_email_from-representative.md", start=3, end=8, snippet="Requesting copies of the incident report and witness statements")

ASK_ANSWER = {
    "answer": "Three items are still open: the agency helper roster for the Sep 11 night shift [S1], "
    "a reply to Atty. Ramos's request for copies [S2], and the Notice of Decision due Oct 16 [S1].",
    "sources": [OPEN_ITEMS, EMAIL],
}

_R = "2026-09-13_interview_R-Santos.md"
BLOCKED_DELETE = Outcome(status="blocked", action="delete", path=_R, reason="Delete is set to Never")

_EMBED = "qwen3-embedding:0.6b"
TIER = SystemTier(
    ram_gb=16, gpu=None, free_disk_gb=120, recommended="standard",
    tiers=[
        Tier(id="light", name="Light", min_ram_gb=8, chat_model="qwen3.5:2b", embed_model=_EMBED, whisper_model="small", fits=True),
        Tier(id="standard", name="Standard", min_ram_gb=16, chat_model="gemma4:e4b", embed_model=_EMBED, whisper_model="small", fits=True),
        Tier(id="pro", name="Pro", min_ram_gb=32, chat_model="gemma4:26b", embed_model=_EMBED, whisper_model="large-v3-turbo", fits=False),
    ],
)
