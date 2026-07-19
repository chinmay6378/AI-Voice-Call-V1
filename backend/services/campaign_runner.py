"""
Background campaign runner — calls contacts one-by-one sequentially.

Usage:
    await start_campaign(campaign_id, settings)   # kicks off asyncio task
    await stop_campaign(campaign_id)              # cancels the task
    resume_running_campaigns(settings)            # call on startup to recover
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from database.models.campaign import CampaignStatus, ContactStatus
from database.models.call import CallStatus
from database.repository import (
    create_call,
    get_campaign,
    get_next_pending_contact,
    get_session,
    get_running_campaigns,
    reset_stuck_contacts,
    update_campaign_status,
    update_call_sid,
    update_contact_status,
    get_call,
)
from services.livekit.room_manager import LiveKitRoomManager
from utils.logger import get_logger

if TYPE_CHECKING:
    from config.settings import Settings

logger = get_logger(__name__)

# campaign_id → asyncio.Task
_running: dict[str, asyncio.Task] = {}

_TERMINAL = {
    CallStatus.COMPLETED,
    CallStatus.FAILED,
    CallStatus.NO_ANSWER,
    CallStatus.BUSY,
    CallStatus.VOICEMAIL,
    CallStatus.CANCELLED,
}

_CALL_TO_CONTACT = {
    CallStatus.COMPLETED: ContactStatus.COMPLETED,
    CallStatus.VOICEMAIL: ContactStatus.COMPLETED,
    CallStatus.FAILED: ContactStatus.FAILED,
    CallStatus.NO_ANSWER: ContactStatus.NO_ANSWER,
    CallStatus.BUSY: ContactStatus.BUSY,
    CallStatus.CANCELLED: ContactStatus.FAILED,
}


async def start_campaign(campaign_id: str, settings: "Settings") -> None:
    if campaign_id in _running:
        return
    async for session in get_session():
        await update_campaign_status(session, campaign_id, CampaignStatus.RUNNING)
        break
    task = asyncio.create_task(_run(campaign_id, settings), name=f"campaign-{campaign_id[:8]}")
    _running[campaign_id] = task
    logger.info("campaign.started", campaign_id=campaign_id)


async def stop_campaign(campaign_id: str) -> None:
    task = _running.pop(campaign_id, None)
    if task:
        task.cancel()
    async for session in get_session():
        await update_campaign_status(session, campaign_id, CampaignStatus.STOPPED)
        break
    logger.info("campaign.stopped", campaign_id=campaign_id)


def resume_running_campaigns(settings: "Settings") -> None:
    """Called at backend startup — resume any campaigns interrupted by restart."""
    asyncio.ensure_future(_resume(settings))


async def _resume(settings: "Settings") -> None:
    async for session in get_session():
        campaigns = await get_running_campaigns(session)
        for campaign in campaigns:
            await reset_stuck_contacts(session, campaign.id)
        break

    async for session in get_session():
        campaigns = await get_running_campaigns(session)
        for campaign in campaigns:
            if campaign.id not in _running:
                logger.info("campaign.resuming", campaign_id=campaign.id)
                task = asyncio.create_task(
                    _run(campaign.id, settings), name=f"campaign-{campaign.id[:8]}"
                )
                _running[campaign.id] = task
        break


async def _run(campaign_id: str, settings: "Settings") -> None:
    lk = LiveKitRoomManager(settings)

    try:
        while True:
            # Check campaign wasn't stopped externally
            async for session in get_session():
                campaign = await get_campaign(session, campaign_id)
                if not campaign or campaign.status == CampaignStatus.STOPPED:
                    return
                break

            # Get next pending contact
            contact = None
            async for session in get_session():
                contact = await get_next_pending_contact(session, campaign_id)
                break

            if contact is None:
                async for session in get_session():
                    await update_campaign_status(session, campaign_id, CampaignStatus.COMPLETED)
                    break
                logger.info("campaign.completed", campaign_id=campaign_id)
                return

            # Mark contact as calling
            async for session in get_session():
                await update_contact_status(session, contact.id, ContactStatus.CALLING)
                break

            # Make the call
            call_id = None
            try:
                call_id = await _make_call(lk, settings, contact.name, contact.phone_number, campaign_id)
                async for session in get_session():
                    await update_contact_status(session, contact.id, ContactStatus.CALLING, call_id=call_id)
                    break
            except Exception as exc:
                logger.error("campaign.call_failed", campaign_id=campaign_id, contact=contact.name, error=str(exc))
                async for session in get_session():
                    await update_contact_status(session, contact.id, ContactStatus.FAILED)
                    break
                await asyncio.sleep(2)
                continue

            # Wait for the call to finish
            final_status = await _wait_for_call(call_id)

            contact_status = _CALL_TO_CONTACT.get(final_status, ContactStatus.FAILED)
            async for session in get_session():
                await update_contact_status(session, contact.id, contact_status, call_id=call_id)
                break

            logger.info(
                "campaign.contact_done",
                campaign_id=campaign_id,
                contact=contact.name,
                call_status=final_status,
            )

            # Brief pause between calls
            await asyncio.sleep(3)

    except asyncio.CancelledError:
        logger.info("campaign.cancelled", campaign_id=campaign_id)
    finally:
        _running.pop(campaign_id, None)


async def _make_call(
    lk: LiveKitRoomManager,
    settings: "Settings",
    customer_name: str,
    phone_number: str,
    campaign_id: str,
) -> str:
    call_id_holder: list[str] = []
    room_name = f"call-{str(uuid.uuid4())[:8]}"

    await lk.create_room(room_name, call_id=campaign_id)

    async for session in get_session():
        call = await create_call(
            session,
            customer_name=customer_name,
            phone_number=phone_number,
            livekit_room_name=room_name,
        )
        call_id_holder.append(call.id)
        # fix room_name to use actual call id prefix
        break

    call_id = call_id_holder[0]

    await lk.dispatch_agent(
        room_name,
        call_id=call_id,
        customer_name=customer_name,
        phone_number=phone_number,
    )

    participant_id = await lk.create_sip_participant(
        room_name,
        phone_number=phone_number,
        customer_name=customer_name,
        call_id=call_id,
    )
    async for session in get_session():
        await update_call_sid(session, call_id, participant_id)
        break

    return call_id


async def _wait_for_call(call_id: str, *, poll_interval: float = 4.0, max_wait: float = 660.0) -> CallStatus:
    waited = 0.0
    while waited < max_wait:
        await asyncio.sleep(poll_interval)
        waited += poll_interval
        async for session in get_session():
            call = await get_call(session, call_id)
            if call and call.status in _TERMINAL:
                return call.status
            break
    # Timeout — treat as failed
    return CallStatus.FAILED


def is_running(campaign_id: str) -> bool:
    return campaign_id in _running
