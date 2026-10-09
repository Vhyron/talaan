"""Which chat model runs: device tier, what's installed, and the user's choice.

Order, first match wins:
1. `CHAT_MODEL` env var (dev override; must still be in the pinned table)
2. The user's choice from the Setup page, saved in app.db
3. The recommended tier's model, if installed
4. The largest installed pinned model that fits this machine
5. Any installed pinned model
6. The recommended tier's model (not installed: chat errors with the `ollama pull` command)
"""

import logging
from dataclasses import dataclass
from typing import Literal

from app import config
from app.db import connect
from app.llm import client
from app.llm.models import EMBED_MODEL, TIER_BY_ID, TIER_ORDER, TIERS, allowed_chat_models
from app.schemas import ModelOption, SystemTier, Tier
from app.system import tier as hw_tier

log = logging.getLogger(__name__)

Source = Literal["env", "user", "auto"]


@dataclass
class Active:
    tag: str
    source: Source


def _saved_choice() -> str | None:
    with connect() as db:
        row = db.execute("SELECT value FROM settings WHERE key = 'chat_model'").fetchone()
    return row["value"] if row else None


def _save_choice(tag: str | None) -> None:
    with connect() as db:
        if tag is None:
            db.execute("DELETE FROM settings WHERE key = 'chat_model'")
        else:
            db.execute(
                "INSERT INTO settings (key, value) VALUES ('chat_model', ?) "
                "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                (tag,),
            )


def resolve(hw: hw_tier.Hardware, installed: list[str]) -> Active:
    allowed = allowed_chat_models()

    if config.CHAT_MODEL:
        if config.CHAT_MODEL in allowed:
            return Active(config.CHAT_MODEL, "env")
        log.warning("CHAT_MODEL=%s is not a pinned tag; ignoring it", config.CHAT_MODEL)

    saved = _saved_choice()
    if saved in allowed and saved in installed:
        return Active(saved, "user")
    return auto_pick(hw, installed)


def auto_pick(hw: hw_tier.Hardware, installed: list[str]) -> Active:
    """"Automatic": the best of the pinned models that is installed and fits this machine."""
    allowed = allowed_chat_models()
    rec = TIER_BY_ID[hw_tier.recommended(hw)].chat_model
    if rec in installed:
        return Active(rec, "auto")

    # Largest tier first; within a tier, the tier's own model before its alternates.
    by_size = sorted(allowed, key=lambda tag: (-TIER_ORDER.index(allowed[tag]), tag != TIER_BY_ID[allowed[tag]].chat_model))
    for tag in by_size:
        if tag in installed and hw_tier.fits(hw, allowed[tag]):
            return Active(tag, "auto")
    for tag in reversed(by_size):
        if tag in installed:
            return Active(tag, "auto")
    return Active(rec, "auto")


def active_chat_model() -> Active:
    return resolve(hw_tier.detect(), client.installed_models())


def system_tier() -> SystemTier:
    hw = hw_tier.detect()
    installed = client.installed_models()
    active = resolve(hw, installed)
    allowed = allowed_chat_models()
    return SystemTier(
        ram_gb=hw.ram_gb,
        gpu=hw.gpu,
        free_disk_gb=hw.free_disk_gb,
        recommended=hw_tier.recommended(hw),
        tiers=[
            Tier(
                id=t.id, name=t.name, min_ram_gb=t.min_mem_gb, chat_model=t.chat_model,
                embed_model=EMBED_MODEL, whisper_model=t.whisper_model, fits=hw_tier.fits(hw, t.id),
            )
            for t in TIERS
        ],
        ollama_running=bool(installed),
        active_chat_model=active.tag,
        auto_chat_model=auto_pick(hw, installed).tag,
        active_source=active.source,
        embed_installed=EMBED_MODEL in installed,
        models=[
            ModelOption(tag=tag, tier=tier, installed=tag in installed, fits=hw_tier.fits(hw, tier), active=tag == active.tag)
            for tag, tier in sorted(allowed.items(), key=lambda kv: TIER_ORDER.index(kv[1]))
        ],
    )


class ModelChoiceError(ValueError):
    pass


def choose(tag: str | None) -> SystemTier:
    """Switch the chat model (None = back to automatic). Frees the old model, loads the new one."""
    if tag is not None:
        if tag not in allowed_chat_models():
            raise ModelChoiceError(f"{tag} is not a pinned model. Allowed: {', '.join(allowed_chat_models())}")
        if tag not in client.installed_models():
            raise ModelChoiceError(f"{tag} is not installed. Run `ollama pull {tag}` first.")

    before = active_chat_model().tag
    _save_choice(tag)
    after = active_chat_model().tag
    if after != before:
        client.unload(before)
        client.load(after)
    return system_tier()
