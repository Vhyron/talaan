"""B3: one index per folder; retrieval can't reach another folder."""

import sqlite3

import pytest
from fastapi.testclient import TestClient

from app import index
from app.index import store
from app.llm import client
from app.llm.client import OllamaError
from app.llm.models import EMBED_MODEL
from app.main import app
from app.policy import engine

c = TestClient(app)
F = "Lakbay-Logistics-Inc"
V = "Bayani-Retail-Corp"
R = "Santos-Family-Clinic"
D = "Case 2026-014 Dela Cruz"  # the case inside F
REYES = ("Chart M Reyes",)  # a chat scope inside R
DEMO_IDS = [F, V, R]


def _db(talaan_home, folder_id):
    return sqlite3.connect(talaan_home / "folders" / folder_id / ".talaan" / "index.db")


def test_build_creates_index_inside_the_folder(talaan_home):
    stats = c.post(f"/folders/{F}/index").json()
    assert stats["files"] == 12 and stats["chunks"] == 12 and stats["changed"] == 12
    assert stats["pending_embeddings"] == 0 and stats["errors"] == []
    with _db(talaan_home, F) as db:
        assert db.execute("SELECT COUNT(*) FROM chunks WHERE embedding IS NULL").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM fts").fetchone()[0] == 12
    assert not any(".talaan" in f["path"] for f in c.get(f"/folders/{F}/files").json())


def test_incremental_by_file_hash(talaan_home, monkeypatch):
    first = index.build_index(F)
    assert index.build_index(F)["changed"] == 0
    assert index.index_version(F) == first["version"]

    calls = []
    real = client.embed
    monkeypatch.setattr(client, "embed", lambda texts: calls.append(len(texts)) or real(texts))
    open_items = talaan_home / "folders" / F / D / "2026-10-02_open-items.md"
    open_items.write_text(open_items.read_text(encoding="utf-8") + "\n\nAgency roster received Oct 5.\n", encoding="utf-8")
    (talaan_home / "folders" / F / D / "2026-09-15_notice-to-explain.md").unlink()
    stats = index.build_index(F)
    assert (stats["changed"], stats["removed"], stats["files"]) == (1, 1, 11)
    assert calls == [1]  # only the edited file is re-embedded
    assert index.index_version(F) == first["version"] + 1
    assert all(h.path != f"{D}/2026-09-15_notice-to-explain.md" for h in index.retrieve(F, "notice to explain", k=10))


def test_unchanged_chunks_keep_their_embedding(talaan_home, monkeypatch):
    long = talaan_home / "folders" / F / "notes.md"
    paragraphs = [f"## Note {i}\n\n" + f"Paragraph {i} about the agency roster. " * 60 for i in range(4)]
    long.write_text("\n\n".join(paragraphs), encoding="utf-8")
    index.build_index(F)
    embedded = []
    real = client.embed
    monkeypatch.setattr(client, "embed", lambda texts: embedded.extend(texts) or real(texts))
    long.write_text("\n\n".join(paragraphs[:-1] + ["## Note 3\n\nChanged."]), encoding="utf-8")
    index.build_index(F)
    assert len(embedded) == 1 and "Changed." in embedded[0]


def test_retrieve_is_sealed_to_the_folder():
    for fid in DEMO_IDS:
        index.build_index(fid)
    own = {f["path"] for f in c.get(f"/folders/{F}/files").json()}
    other = {f["path"] for f in c.get(f"/folders/{V}/files").json()}
    hits = index.retrieve(F, "Summarize Ana Villanueva's tardiness", k=20)
    assert hits and {h.path for h in hits} <= own
    assert not {h.path for h in hits} & (other - own)
    assert not any("Villanueva" in h.text for h in hits)
    assert not index.contains(F, "Ana Villanueva") and index.contains(V, "Ana Villanueva")
    assert any("Villanueva" in h.text for h in index.retrieve(V, "Ana Villanueva tardiness"))


def test_keyword_hits_and_scores():
    index.build_index(R)
    hits = index.retrieve(R, "Any allergies before I prescribe an antibiotic?", only=REYES)
    assert hits[0].keyword and "enicillin" in hits[0].text  # porter stemming: allergies ~ allergy
    assert all(h.similarity is not None for h in hits) and all(h.path.startswith("Chart M Reyes/") for h in hits)
    assert hits == sorted(hits, key=lambda h: h.score, reverse=True)
    assert index.contains(R, "penicillin", REYES) and index.contains(R, "PENICILLIN", REYES)
    assert not index.contains(R, "A. Bautista", REYES)  # another chart in the same Space
    assert index.contains(R, "A. Bautista")  # the whole Space does see it


def test_k_none_returns_every_chunk_ranked(monkeypatch):
    index.build_index(F)
    every = index.retrieve(F, "Is there anything in this case that contradicts the allegation?", k=None)
    assert len(every) == 12 and len({(h.path, h.start_line) for h in every}) == 12
    case = index.retrieve(F, "Is there anything in this case that contradicts the allegation?", k=None, only=(D,))
    assert len(case) == 10 and all(h.path.startswith(D + "/") for h in case)

    def down(texts):
        raise OllamaError("down")

    monkeypatch.setattr(client, "embed", down)
    assert all(h.keyword for h in index.retrieve(F, "penicillin agency roster"))  # no padding with k=8
    assert len(index.retrieve(F, "zzz", k=None)) == 12
    assert len(index.retrieve(F, "zzz", k=None, only=(D, "README.md"))) == 11


def test_query_text_cannot_inject_fts_syntax():
    index.build_index(F)
    for q in ['"', "NEAR(a b)", "* OR -", "path:../x", "'; DROP TABLE chunks; --"]:
        index.retrieve(F, q)
    assert index.build_index(F)["chunks"] == 12


def test_ollama_down_keeps_keyword_search(talaan_home, monkeypatch):
    def down(texts):
        raise OllamaError("Ollama is not reachable")

    monkeypatch.setattr(client, "embed", down)
    stats = index.build_index(R)
    assert stats["chunks"] == 10 and stats["pending_embeddings"] == 10 and "not reachable" in stats["errors"][0]
    hits = index.retrieve(R, "penicillin allergy")
    assert hits and hits[0].keyword and hits[0].similarity is None

    # Not monkeypatch.undo(): that would also undo the conftest's TALAAN_HOME and point at the real ~/Talaan.
    from tests.conftest import _fake_embed

    monkeypatch.setattr(client, "embed", _fake_embed)
    assert index.build_index(R)["pending_embeddings"] == 0


def test_new_embedding_model_reembeds_everything(talaan_home):
    index.build_index(R)
    with _db(talaan_home, R) as db:
        db.execute("UPDATE meta SET value = 'old-embedder' WHERE key = 'embed_model'")
    stats = index.build_index(R)
    assert stats["changed"] == 0 and stats["pending_embeddings"] == 0
    with _db(talaan_home, R) as db:
        assert db.execute("SELECT value FROM meta WHERE key = 'embed_model'").fetchone()[0] == EMBED_MODEL


def test_import_refreshes_index():
    index.build_index(F)
    c.post(f"/folders/{F}/import", files={"files": ("agency-roster.md", b"# Roster\n\nTulong Manpower helpers: Ben Cruz.")})
    assert any(h.path == "agency-roster.md" for h in index.retrieve(F, "Tulong Manpower roster"))


def test_approved_draft_is_reindexed():
    index.build_index(F)
    out = engine.handle(F, {"action": "create_draft", "path": "follow-up.md", "content": "Zamboanga follow-up call."})
    assert out.status == "pending"
    assert not index.contains(F, "Zamboanga")
    assert c.post(f"/proposals/{out.proposal_id}/approve").json()["status"] == "executed"
    assert index.contains(F, "Zamboanga")


def test_search_action_uses_the_index():
    index.build_index(F)
    out = engine.handle(F, {"action": "search", "query": "agency roster"})
    assert out.status == "executed" and f"[{D}/2026-10-02_open-items.md:" in out.result


def test_unknown_folder_is_404():
    assert c.post("/folders/../app.db/index").status_code == 404
    assert c.post("/folders/Nope/index").status_code == 404


# --- Live: real embeddings (qwen3-embedding:0.6b through Ollama) ----------------

Q2_XFAIL = pytest.mark.xfail(strict=False, reason=(
    "Q2 is reasoning, not lookup: with real embeddings the medical certificate ranks 8th-10th of 10 "
    "whatever the prompt. B4/B5 send the whole folder (retrieve k=None) when it fits num_ctx."))

LIVE = [
    # (folder, question, expected files, rank they must all be within): measured 2026-10-09, before
    # Spaces. Retrieval is narrowed to the chat's scope (the case or chart, plus the Space README), as ask() does.
    pytest.param(F, "Is there anything in this case that contradicts the allegation?",
                 {"2026-09-11_medical-certificate.md", "2026-09-14_interview_L-Fernandez.md",
                  "2026-09-24_hearing-minutes.md", "2026-09-13_interview_R-Santos.md"}, 8, id="Q2", marks=Q2_XFAIL),
    pytest.param(F, "What is still open?", {"2026-10-02_open-items.md", "2026-09-26_email_from-representative.md"}, 2, id="Q3"),
    pytest.param(F, "Summarize the representative's email.", {"2026-09-26_email_from-representative.md"}, 1, id="Q5"),
    pytest.param(R, "What medication changes happened since August?", {"2026-08-31_visit.md"}, 2, id="Q6"),
    pytest.param(R, "Any allergies before I prescribe an antibiotic?", {"00_intake_2026-08-03.md", "2026-09-28_referral-letter.md"}, 2, id="Q7"),
    pytest.param(R, "Why was she referred?", {"2026-09-28_visit.md", "2026-09-28_referral-letter.md"}, 2, id="Q8"),
]
LIVE_SCOPE = {F: D, R: REYES[0]}


def _ollama_ready() -> bool:
    return any(m == EMBED_MODEL or m.startswith(EMBED_MODEL + ":") for m in client.installed_models())


@pytest.mark.live
@pytest.mark.skipif(not _ollama_ready(), reason=f"Ollama with {EMBED_MODEL} not available")
@pytest.mark.parametrize("folder,question,expected,within", LIVE)
def test_live_retrieval_finds_expected_sources(folder, question, expected, within):
    index.build_index(folder)
    scope = LIVE_SCOPE[folder]
    ranked = [h.path for h in index.retrieve(folder, question, only=(scope, "README.md"))]
    assert {f"{scope}/{p}" for p in expected} <= set(ranked[:within]), ranked
