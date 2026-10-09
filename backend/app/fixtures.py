"""Fixture responses for the A1 stub routes, based on demo-data/.

Each route swaps to a real implementation in its own ticket (A2–A5, B3–B5, D1, D7).
"""

from datetime import datetime

from app.schemas import (
    AuditEvent, FileEntry, Folder, Outcome, Proposal, ProposeEditAction,
    Source, SystemTier, Tier, TimelineEvent, TimelineFlag, TimelineResponse,
)

T = datetime.fromisoformat

FOLDERS = [
    Folder(id="Case-2026-014_Dela-Cruz", name="Case 2026-014 · Dela Cruz", mode="case", created_at=T("2026-09-12T09:00:00")),
    Folder(id="Case-2026-019_Villanueva", name="Case 2026-019 · Villanueva", mode="case", created_at=T("2026-10-01T09:00:00")),
    Folder(id="Chart_M-Reyes", name="Chart · M. Reyes", mode="chart", created_at=T("2026-08-03T09:00:00")),
    Folder(id="Chart_A-Bautista", name="Chart · A. Bautista", mode="chart", created_at=T("2026-07-14T09:00:00")),
]

FILES = [
    FileEntry(path=p, size=1200, mtime=T("2026-10-02T17:00:00"))
    for p in [
        "00_case-intake.md",
        "2026-09-11_medical-certificate.md",
        "2026-09-12_incident-report.md",
        "2026-09-13_interview_R-Santos.md",
        "2026-09-14_interview_L-Fernandez.md",
        "2026-09-15_notice-to-explain.md",
        "2026-09-19_employee-explanation.md",
        "2026-09-24_hearing-minutes.md",
        "2026-09-26_email_from-representative.md",
        "2026-10-02_open-items.md",
    ]
]

FILE_CONTENT = """# Open Items — Case 2026-014

- [ ] Agency helper roster for Sep 11 night shift — requested Sep 25, no reply yet
- [ ] Respond to Atty. Ramos's request for copies (Sep 26 email)
- [ ] Notice of Decision target date: Oct 16, 2026
- [x] Hearing held Sep 24
"""

OPEN_ITEMS = Source(path="2026-10-02_open-items.md", start=3, end=5, snippet="Agency helper roster … Notice of Decision target date: Oct 16, 2026")
EMAIL = Source(path="2026-09-26_email_from-representative.md", start=3, end=8, snippet="Requesting copies of the incident report and witness statements")
MED_CERT = Source(path="2026-09-11_medical-certificate.md", start=3, end=6, snippet="Seen 8:30 AM, Sep 11. Advised rest Sep 11–12")
HEARING = Source(path="2026-09-24_hearing-minutes.md", start=10, end=14, snippet="No badge entry for J. Dela Cruz on Sep 11")
SANTOS = Source(path="2026-09-13_interview_R-Santos.md", start=5, end=9, snippet="I think it was Jose, from the way he walked")

ASK_ANSWER = {
    "answer": "Three items are still open: the agency helper roster for the Sep 11 night shift [S1], "
    "a reply to Atty. Ramos's request for copies [S2], and the Notice of Decision due Oct 16 [S1].",
    "sources": [OPEN_ITEMS, EMAIL],
}

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

PROPOSALS = [
    Proposal(
        id="p-demo-1",
        folder_id="Case-2026-014_Dela-Cruz",
        action=ProposeEditAction(
            action="propose_edit", path="2026-10-02_open-items.md", content="...", reason="Add agency name from the Oct 3 call"
        ),
        status="pending",
        reason="Add agency name from the Oct 3 call",
        old_content="- [ ] Agency helper roster for Sep 11 night shift\n",
        new_content="- [ ] Agency helper roster for Sep 11 night shift\n  - Agency: Tulong Manpower Services\n",
        diff="--- a/2026-10-02_open-items.md\n+++ b/2026-10-02_open-items.md\n@@ -1 +1,2 @@\n"
        " - [ ] Agency helper roster for Sep 11 night shift\n+  - Agency: Tulong Manpower Services\n",
        created_at=T("2026-10-03T10:15:00"),
    )
]

_F = "Case-2026-014_Dela-Cruz"
_R = "2026-09-13_interview_R-Santos.md"
AUDIT = [
    AuditEvent(id=3, timestamp=T("2026-10-03T10:02:05"), folder_id=_F, actor="model", event="decision",
               action="delete", path=_R, decision="never", reason="Delete is set to Never", model_tag="gemma4:e4b"),
    AuditEvent(id=2, timestamp=T("2026-10-03T10:02:04"), folder_id=_F, actor="model", event="proposed_action",
               action="delete", path=_R, model_tag="gemma4:e4b"),
    AuditEvent(id=1, timestamp=T("2026-10-03T10:02:00"), folder_id=_F, actor="user", event="question",
               reason="Summarize the representative's email."),
]

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
