"""Fixture responses for the A1 stub routes, based on demo-data/.

Each route swaps to a real implementation in its own ticket (A2–A5, B3–B5, D1, D7).
"""

from datetime import datetime

from app.schemas import (
    Source, SystemTier, Tier, TimelineEvent, TimelineFlag, TimelineResponse,
)

T = datetime.fromisoformat

OPEN_ITEMS = Source(path="2026-10-02_open-items.md", start=3, end=5, snippet="Agency helper roster … Notice of Decision target date: Oct 16, 2026")
MED_CERT = Source(path="2026-09-11_medical-certificate.md", start=3, end=6, snippet="Seen 8:30 AM, Sep 11. Advised rest Sep 11–12")
HEARING = Source(path="2026-09-24_hearing-minutes.md", start=10, end=14, snippet="No badge entry for J. Dela Cruz on Sep 11")
SANTOS = Source(path="2026-09-13_interview_R-Santos.md", start=5, end=9, snippet="I think it was Jose, from the way he walked")

TIMELINE = TimelineResponse(
    events=[
        TimelineEvent(date="2026-09-11", time="08:30", description="Clinic consult; sick leave filed 7:50 AM", sources=[MED_CERT]),
        TimelineEvent(date="2026-09-11", time="21:40", description="Carton removal on CCTV", sources=[SANTOS]),
        TimelineEvent(date="2026-09-24", description="Administrative hearing", sources=[HEARING]),
        TimelineEvent(date="2026-10-16", description="Notice of Decision target", sources=[OPEN_ITEMS]),
    ],
    flags=[
        TimelineFlag(
            description="Approved sick leave, the medical certificate and no badge entry on Sep 11 do not match "
            "the supervisor's identification. Flagged for your review.",
            sources=[MED_CERT, HEARING, SANTOS],
        )
    ],
)

_EMBED = "qwen3-embedding:0.6b"
TIER = SystemTier(
    ram_gb=16, gpu=None, free_disk_gb=120, recommended="standard",
    tiers=[
        Tier(id="light", name="Light", min_ram_gb=8, chat_model="qwen3.5:2b", embed_model=_EMBED, whisper_model="small", fits=True),
        Tier(id="standard", name="Standard", min_ram_gb=16, chat_model="gemma4:e4b", embed_model=_EMBED, whisper_model="small", fits=True),
        Tier(id="pro", name="Pro", min_ram_gb=32, chat_model="gemma4:26b", embed_model=_EMBED, whisper_model="large-v3-turbo", fits=False),
    ],
)
