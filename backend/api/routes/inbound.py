"""
Inbound call configuration and history.

Actual inbound call routing happens via a LiveKit SIP dispatch rule
(POST /call/inbound/setup), which auto-dispatches the agent to any call
arriving on the configured inbound trunk — no webhook needed.

GET   /inbound/config   — Get current inbound configuration
PUT   /inbound/config   — Save inbound configuration
GET   /inbound/calls    — Recent inbound call history
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from database import (
    get_inbound_calls,
    get_inbound_config,
    get_session,
    save_inbound_config,
)
from database.schemas.call import CallStatusResponse
from utils.logger import get_logger

router = APIRouter(prefix="/inbound", tags=["inbound"])
logger = get_logger(__name__)


# ── Config CRUD ───────────────────────────────────────────────────────────────

@router.get("/config")
async def get_config(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    config = await get_inbound_config(session)
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
