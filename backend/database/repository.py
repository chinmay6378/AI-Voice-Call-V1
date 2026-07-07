"""
Async data-access layer. All DB operations go through this module.
Uses SQLAlchemy 2.0 async sessions.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import AsyncIterator

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from database.models.call import Base, Call, CallStatus
from database.models.campaign import Campaign, CampaignContact, CampaignStatus, ContactStatus
from database.models.app_setting import AppSetting
from utils.logger import get_logger

logger = get_logger(__name__)


# ── Engine / session factory ──────────────────────────────────────────────────

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


async def init_db(database_url: str) -> None:
    global _engine, _session_factory

    connect_args = {}
    if database_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    _engine = create_async_engine(
        database_url,
        echo=False,
        connect_args=connect_args,
    )
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)

    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # SQLite doesn't add new columns via create_all — run migrations manually
    async with _engine.begin() as conn:
        for stmt in [
            "ALTER TABLE calls ADD COLUMN direction TEXT NOT NULL DEFAULT 'outbound'",
        ]:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass  # column already exists

    logger.info("database.initialized", url=database_url)


async def close_db() -> None:
    global _engine
    if _engine:
        await _engine.dispose()
        logger.info("database.closed")


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency that yields a per-request session."""
    if _session_factory is None:
        raise RuntimeError("Database not initialised — call init_db() first")
    async with _session_factory() as session:
        yield session


# ── Call operations ───────────────────────────────────────────────────────────

async def create_call(
    session: AsyncSession,
    *,
    customer_name: str,
    phone_number: str,
    livekit_room_name: str,
    direction: str = "outbound",
) -> Call:
    call = Call(
        id=str(uuid.uuid4()),
        customer_name=customer_name,
        phone_number=phone_number,
        status=CallStatus.PENDING,
        livekit_room_name=livekit_room_name,
        direction=direction,
        created_at=datetime.utcnow(),
    )
    call.append_log("call.created", {"customer_name": customer_name, "phone": phone_number, "direction": direction})
    session.add(call)
    await session.commit()
    await session.refresh(call)
    logger.info("call.created", call_id=call.id, phone=phone_number, direction=direction)
    return call


async def get_call(session: AsyncSession, call_id: str) -> Call | None:
    result = await session.execute(select(Call).where(Call.id == call_id))
    return result.scalar_one_or_none()


async def get_call_by_sid(session: AsyncSession, sid: str) -> Call | None:
    result = await session.execute(
        select(Call).where(Call.signalwire_call_sid == sid)
    )
    return result.scalar_one_or_none()


async def get_all_calls(session: AsyncSession, limit: int = 200) -> list[Call]:
    result = await session.execute(
        select(Call).order_by(Call.created_at.desc()).limit(limit)
    )
    return list(result.scalars().all())


async def get_inbound_calls(session: AsyncSession, limit: int = 100) -> list[Call]:
    result = await session.execute(
        select(Call)
        .where(Call.direction == "inbound")
        .order_by(Call.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_calls_by_campaign(session: AsyncSession, campaign_id: str) -> list[Call]:
    """Return all calls linked to a campaign via CampaignContact.call_id."""
    result = await session.execute(
        select(Call)
        .join(CampaignContact, CampaignContact.call_id == Call.id)
        .where(CampaignContact.campaign_id == campaign_id)
        .order_by(Call.created_at.desc())
    )
    return list(result.scalars().all())


async def get_active_call(session: AsyncSession) -> Call | None:
    """Return the current in-progress call, if any."""
    active_statuses = [CallStatus.DIALING, CallStatus.RINGING, CallStatus.IN_PROGRESS]
    result = await session.execute(
        select(Call)
        .where(Call.status.in_(active_statuses))
        .order_by(Call.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def update_call_status(
    session: AsyncSession,
    call_id: str,
    status: CallStatus,
    *,
    log_event: str | None = None,
    **extra_fields: object,
) -> Call | None:
    call = await get_call(session, call_id)
    if not call:
        logger.warning("call.not_found", call_id=call_id)
        return None

    call.status = status
    for field, value in extra_fields.items():
        setattr(call, field, value)
    if log_event:
        call.append_log(log_event, {"status": status})

    await session.commit()
    await session.refresh(call)
    logger.info("call.status_updated", call_id=call_id, status=status)
    return call


async def update_call_sid(
    session: AsyncSession, call_id: str, signalwire_call_sid: str
) -> Call | None:
    return await update_call_status(
        session,
        call_id,
        CallStatus.DIALING,
        signalwire_call_sid=signalwire_call_sid,
        start_time=datetime.utcnow(),
        log_event="call.dialing",
    )


async def mark_call_answered(
    session: AsyncSession, call_id: str, answered_by: str
) -> Call | None:
    return await update_call_status(
        session,
        call_id,
        CallStatus.IN_PROGRESS,
        answered_by=answered_by,
        answer_time=datetime.utcnow(),
        log_event="call.answered",
    )


async def mark_call_voicemail(session: AsyncSession, call_id: str) -> Call | None:
    return await update_call_status(
        session,
        call_id,
        CallStatus.VOICEMAIL,
        answered_by="machine",
        log_event="call.voicemail_detected",
    )


async def append_transcript_entry(
    session: AsyncSession, call_id: str, role: str, text: str
) -> None:
    call = await get_call(session, call_id)
    if call:
        call.append_transcript(role, text)
        await session.commit()


async def finalize_call(
    session: AsyncSession,
    call_id: str,
    *,
    status: CallStatus = CallStatus.COMPLETED,
    error_message: str | None = None,
    summary: str | None = None,
    dispatch_id: str | None = None,
) -> Call | None:
    call = await get_call(session, call_id)
    if not call:
        return None

    now = datetime.utcnow()
    call.status = status
    call.end_time = now
    if call.answer_time:
        call.duration_seconds = int((now - call.answer_time).total_seconds())
    if error_message:
        call.error_message = error_message
    if summary:
        call.summary = summary
    if dispatch_id:
        call.livekit_dispatch_id = dispatch_id
    call.append_log(
        "call.ended",
        {"status": status, "duration_seconds": call.duration_seconds},
    )

    await session.commit()
    await session.refresh(call)
    logger.info("call.finalized", call_id=call_id, status=status, duration=call.duration_seconds)
    return call


# ── Campaign operations ───────────────────────────────────────────────────────

async def create_campaign(
    session: AsyncSession,
    *,
    name: str,
    contacts: list[dict],
) -> Campaign:
    campaign = Campaign(
        id=str(uuid.uuid4()),
        name=name,
        status=CampaignStatus.PENDING,
        total_contacts=len(contacts),
        done_contacts=0,
        created_at=datetime.utcnow(),
    )
    session.add(campaign)
    await session.flush()

    for i, c in enumerate(contacts):
        session.add(CampaignContact(
            id=str(uuid.uuid4()),
            campaign_id=campaign.id,
            order_index=i,
            name=c["name"],
            phone_number=c["phone_number"],
            status=ContactStatus.PENDING,
        ))

    await session.commit()
    await session.refresh(campaign)
    logger.info("campaign.created", campaign_id=campaign.id, total=len(contacts))
    return campaign


async def get_campaign(session: AsyncSession, campaign_id: str) -> Campaign | None:
    result = await session.execute(select(Campaign).where(Campaign.id == campaign_id))
    return result.scalar_one_or_none()


async def list_campaigns(session: AsyncSession, limit: int = 50) -> list[Campaign]:
    result = await session.execute(
        select(Campaign).order_by(Campaign.created_at.desc()).limit(limit)
    )
    return list(result.scalars().all())


async def get_campaign_contacts(session: AsyncSession, campaign_id: str) -> list[CampaignContact]:
    result = await session.execute(
        select(CampaignContact)
        .where(CampaignContact.campaign_id == campaign_id)
        .order_by(CampaignContact.order_index)
    )
    return list(result.scalars().all())


async def get_next_pending_contact(session: AsyncSession, campaign_id: str) -> CampaignContact | None:
    result = await session.execute(
        select(CampaignContact)
        .where(
            CampaignContact.campaign_id == campaign_id,
            CampaignContact.status == ContactStatus.PENDING,
        )
        .order_by(CampaignContact.order_index)
        .limit(1)
    )
    return result.scalar_one_or_none()


async def update_campaign_status(
    session: AsyncSession, campaign_id: str, status: CampaignStatus
) -> None:
    campaign = await get_campaign(session, campaign_id)
    if campaign:
        campaign.status = status
        await session.commit()


async def update_contact_status(
    session: AsyncSession,
    contact_id: str,
    status: ContactStatus,
    *,
    call_id: str | None = None,
) -> None:
    result = await session.execute(
        select(CampaignContact).where(CampaignContact.id == contact_id)
    )
    contact = result.scalar_one_or_none()
    if not contact:
        return
    contact.status = status
    if call_id:
        contact.call_id = call_id

    if status not in (ContactStatus.PENDING, ContactStatus.CALLING):
        campaign = await get_campaign(session, contact.campaign_id)
        if campaign:
            campaign.done_contacts = (campaign.done_contacts or 0) + 1

    await session.commit()


async def get_running_campaigns(session: AsyncSession) -> list[Campaign]:
    result = await session.execute(
        select(Campaign).where(Campaign.status == CampaignStatus.RUNNING)
    )
    return list(result.scalars().all())


async def reset_stuck_contacts(session: AsyncSession, campaign_id: str) -> None:
    """Reset any contacts stuck in 'calling' state (from a crashed runner)."""
    result = await session.execute(
        select(CampaignContact).where(
            CampaignContact.campaign_id == campaign_id,
            CampaignContact.status == ContactStatus.CALLING,
        )
    )
    for contact in result.scalars().all():
        contact.status = ContactStatus.PENDING
    await session.commit()


# ── App settings (DB-persisted key-value store) ───────────────────────────────

async def get_all_db_settings(session: AsyncSession) -> dict[str, str]:
    """Return all persisted settings as {key: value}."""
    result = await session.execute(select(AppSetting))
    return {row.key: row.value for row in result.scalars().all()}


async def set_db_setting(session: AsyncSession, key: str, value: str) -> None:
    """Upsert a single setting."""
    existing = await session.get(AppSetting, key)
    if existing:
        existing.value = value
        existing.updated_at = datetime.utcnow()
    else:
        session.add(AppSetting(key=key, value=value, updated_at=datetime.utcnow()))
    await session.commit()


# ── Inbound config (key-value pairs prefixed inbound_) ───────────────────────

_INBOUND_KEYS = [
    "inbound_enabled",
    "inbound_phone_number",
    "inbound_agent_name",
    "inbound_company_name",
    "inbound_greeting",
    "inbound_system_prompt",
    "inbound_livekit_trunk_id",
]

_INBOUND_DEFAULTS: dict[str, str] = {
    "inbound_enabled": "false",
    "inbound_phone_number": "",
    "inbound_agent_name": "Alex",
    "inbound_company_name": "",
    "inbound_greeting": "Thank you for calling {company_name}. My name is {agent_name}, how can I help you today?",
    "inbound_system_prompt": (
        "You are a helpful AI assistant answering inbound calls. "
        "Be friendly, professional, and concise. "
        "Listen carefully and help the caller with their needs."
    ),
    "inbound_livekit_trunk_id": "",
}


async def get_inbound_config(session: AsyncSession) -> dict[str, str]:
    result = await session.execute(
        select(AppSetting).where(AppSetting.key.in_(_INBOUND_KEYS))
    )
    stored = {row.key: row.value for row in result.scalars().all()}
    return {k: stored.get(k, _INBOUND_DEFAULTS.get(k, "")) for k in _INBOUND_KEYS}


async def save_inbound_config(session: AsyncSession, config: dict[str, str]) -> None:
    for key in _INBOUND_KEYS:
        if key in config:
            await set_db_setting(session, key, config[key])
