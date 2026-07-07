"""
Inbound call handling via SignalWire webhook.

POST  /inbound/webhook  — SignalWire calls this when a customer calls in
GET   /inbound/config   — Get current inbound configuration
PUT   /inbound/config   — Save inbound configuration
GET   /inbound/calls    — Recent inbound call history
"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings, get_settings
from database import (
    create_call,
    get_inbound_calls,
    get_inbound_config,
    get_session,
    save_inbound_config,
    update_call_status,
)
from database.models.call import CallStatus
from database.schemas.call import CallStatusResponse
from services.livekit.room_manager import LiveKitRoomManager
from utils.logger import get_logger

router = APIRouter(prefix="/inbound", tags=["inbound"])
logger = get_logger(__name__)


# ── Webhook ───────────────────────────────────────────────────────────────────

@router.post("/webhook")
async def inbound_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> JSONResponse:
    """
    SignalWire calls this endpoint when a customer dials the inbound number.
    Returns SWML JSON that bridges the caller to a LiveKit room where the
    AI agent is waiting.
    """
    form = await request.form()
    caller     = str(form.get("From", "Unknown"))
    called     = str(form.get("To", ""))
    call_sid   = str(form.get("CallSid", str(uuid.uuid4())))

    logger.info("inbound.webhook_received", caller=caller, called=called, call_sid=call_sid)

    # Load inbound config
    config = await get_inbound_config(session)
    if config.get("inbound_enabled", "false").lower() != "true":
        logger.warning("inbound.disabled", caller=caller)
        return JSONResponse(_swml_reject("Inbound calling is not enabled."))

    # Determine caller display name
    customer_name = caller  # use caller's number as name; agent can ask for actual name

    # Create LiveKit room + dispatch agent
    room_name = f"inbound-{uuid.uuid4().hex[:8]}"
    lk = LiveKitRoomManager(settings)

    try:
        await lk.create_room(room_name, call_id=call_sid)
        await lk.dispatch_agent(
            room_name,
            call_id=call_sid,
            customer_name=customer_name,
            phone_number=caller,
        )
    except Exception as exc:
        logger.error("inbound.livekit_setup_failed", error=str(exc), caller=caller)
        return JSONResponse(_swml_reject("We're sorry, our lines are busy. Please try again."))

    # Persist call record
    call = await create_call(
        session,
        customer_name=customer_name,
        phone_number=caller,
        livekit_room_name=room_name,
        direction="inbound",
    )
    call.signalwire_call_sid = call_sid
    await session.commit()
    await update_call_status(session, call.id, CallStatus.RINGING)

    logger.info("inbound.call_created", call_id=call.id, room=room_name, caller=caller)

    # Build SIP URI for LiveKit inbound
    sip_uri = settings.livekit_sip_uri.strip()
    sip_target = f"sip:{room_name}@{sip_uri}" if sip_uri else None

    if not sip_target:
        logger.error("inbound.no_sip_uri_configured", call_id=call.id)
        return JSONResponse(_swml_reject("Service configuration error. Please try again later."))

    swml = {
        "version": "1.0.0",
        "sections": {
            "main": [
                {
                    "connect": {
                        "to": sip_target,
                        "timeout": 30,
                    }
                }
            ]
        }
    }

    logger.info("inbound.swml_connect", call_id=call.id, sip_target=sip_target)
    return JSONResponse(swml)


def _swml_reject(message: str) -> dict:
    return {
        "version": "1.0.0",
        "sections": {
            "main": [
                {"say": {"text": message, "language": "en-US"}},
                {"hangup": {}},
            ]
        }
    }


# ── Config CRUD ───────────────────────────────────────────────────────────────

@router.get("/config")
async def get_config(
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> dict:
    config = await get_inbound_config(session)
    base_url = settings.app_base_url.rstrip("/")
    config["webhook_url"] = f"{base_url}/inbound/webhook"
    config["inbound_enabled"] = config.get("inbound_enabled", "false")
    return config


@router.put("/config")
async def save_config(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    body = await request.json()
    allowed = [
        "inbound_enabled", "inbound_phone_number", "inbound_agent_name",
        "inbound_company_name", "inbound_greeting", "inbound_system_prompt",
        "inbound_livekit_trunk_id",
    ]
    config = {k: str(v) for k, v in body.items() if k in allowed}
    await save_inbound_config(session, config)
    logger.info("inbound.config_saved", keys=list(config.keys()))
    return {"status": "saved"}


# ── Inbound call history ──────────────────────────────────────────────────────

@router.get("/calls", response_model=list[CallStatusResponse])
async def list_inbound_calls(
    session: AsyncSession = Depends(get_session),
) -> list[CallStatusResponse]:
    calls = await get_inbound_calls(session)
    return [CallStatusResponse.model_validate(c) for c in calls]
