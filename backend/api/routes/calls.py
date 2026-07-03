"""
REST endpoints for call management.

POST  /call/start             — Initiate an outbound AI call
POST  /call/end/{call_id}     — Hang up an active call
GET   /call/status/{call_id}  — Get call status
GET   /call/transcript/{call_id} — Get full call transcript
GET   /call/logs/{call_id}    — Get call event log
GET   /calls/active           — List current active call (if any)
GET   /health                 — Health check
"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status  # noqa: F401
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings, get_settings
from database import (
    create_call,
    finalize_call,
    get_active_call,
    get_all_calls,
    get_call,
    get_session,
    update_call_sid,
)
from database.models.call import CallStatus
from database.schemas.call import (
    CallLogResponse,
    CallStartedResponse,
    CallStatusResponse,
    CallTranscriptResponse,
    EndCallRequest,
    HealthResponse,
    StartCallRequest,
)
from services.livekit.room_manager import LiveKitRoomManager
from utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/call", tags=["calls"])


# ── Dependencies ──────────────────────────────────────────────────────────────

def get_livekit(settings: Annotated[Settings, Depends(get_settings)]) -> LiveKitRoomManager:
    return LiveKitRoomManager(settings)


# ── POST /call/start ──────────────────────────────────────────────────────────

@router.post("/start", response_model=CallStartedResponse, status_code=status.HTTP_201_CREATED)
async def start_call(
    body: StartCallRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    lk: Annotated[LiveKitRoomManager, Depends(get_livekit)],
) -> CallStartedResponse:
    """
    Initiate an outbound AI phone call via LiveKit SIP (Vobiz trunk).

    Flow:
      1. Guard: reject if another call is already active.
      2. Create LiveKit room.
      3. Persist call record in DB.
      4. Dispatch agent worker to LiveKit room.
      5. LiveKit dials the customer via Vobiz SIP trunk.
      6. Return call_id immediately — the rest is async.
    """
    # 1. One-call-at-a-time guard
    active = await get_active_call(session)
    if active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A call is already active: {active.id} ({active.status}). End it before starting a new one.",
        )

    call_id = str(uuid.uuid4())
    room_name = f"call-{call_id[:8]}"

    # 2. Create LiveKit room
    try:
        await lk.create_room(room_name, call_id=call_id)
    except Exception as exc:
        logger.error("livekit.create_room_failed", call_id=call_id, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to create LiveKit room: {exc}",
        )

    # 3. Persist call record
    call = await create_call(
        session,
        customer_name=body.customer_name,
        phone_number=body.phone_number,
        livekit_room_name=room_name,
    )
    # Overwrite the auto-generated ID with our pre-computed one so URLs are consistent
    # (We keep call.id as-is from create_call; room_name references the first 8 chars)

    # 4. Dispatch LiveKit agent
    try:
        dispatch_id = await lk.dispatch_agent(
            room_name,
            call_id=call.id,
            customer_name=body.customer_name,
            phone_number=body.phone_number,
        )
        call.livekit_dispatch_id = dispatch_id
        await session.commit()
    except Exception as exc:
        logger.error("livekit.dispatch_failed", call_id=call.id, error=str(exc))
        await finalize_call(session, call.id, status=CallStatus.FAILED, error_message=str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to dispatch agent: {exc}",
        )

    # 5. Dial customer via LiveKit SIP (Vobiz trunk)
    try:
        participant_id = await lk.create_sip_participant(
            room_name,
            phone_number=body.phone_number,
            customer_name=body.customer_name,
            call_id=call.id,
        )
        await update_call_sid(session, call.id, participant_id)
        logger.info("call.initiated", call_id=call.id, participant_id=participant_id, to=body.phone_number)
    except Exception as exc:
        logger.error("livekit.sip_call_failed", call_id=call.id, error=str(exc))
        await finalize_call(session, call.id, status=CallStatus.FAILED, error_message=str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to initiate call via LiveKit SIP: {exc}",
        )

    return CallStartedResponse(
        call_id=call.id,
        status=CallStatus.DIALING,
        message=f"Outbound call to {body.phone_number} initiated. call_id={call.id}",
    )


# ── POST /call/end/{call_id} ──────────────────────────────────────────────────

@router.post("/end/{call_id}", response_model=CallStatusResponse)
async def end_call(
    call_id: str,
    body: EndCallRequest | None = None,
    session: AsyncSession = Depends(get_session),
    lk: LiveKitRoomManager = Depends(get_livekit),
) -> CallStatusResponse:
    """Terminate an active call by call_id."""
    call = await get_call(session, call_id)
    if not call:
        raise HTTPException(status_code=404, detail=f"Call {call_id} not found")

    terminal = {CallStatus.COMPLETED, CallStatus.FAILED, CallStatus.CANCELLED}
    if call.status in terminal:
        raise HTTPException(
            status_code=409,
            detail=f"Call {call_id} is already in a terminal state: {call.status}",
        )

    # Delete LiveKit room — disconnects agent and SIP participant (customer)
    if call.livekit_room_name:
        await lk.delete_room(call.livekit_room_name)

    updated = await finalize_call(session, call_id, status=CallStatus.CANCELLED)
    return CallStatusResponse.model_validate(updated)


# ── GET /call/status/{call_id} ────────────────────────────────────────────────

@router.get("/status/{call_id}", response_model=CallStatusResponse)
async def get_call_status(
    call_id: str,
    session: AsyncSession = Depends(get_session),
) -> CallStatusResponse:
    call = await get_call(session, call_id)
    if not call:
        raise HTTPException(status_code=404, detail=f"Call {call_id} not found")
    return CallStatusResponse.model_validate(call)


# ── GET /call/transcript/{call_id} ───────────────────────────────────────────

@router.get("/transcript/{call_id}", response_model=CallTranscriptResponse)
async def get_transcript(
    call_id: str,
    session: AsyncSession = Depends(get_session),
) -> CallTranscriptResponse:
    call = await get_call(session, call_id)
    if not call:
        raise HTTPException(status_code=404, detail=f"Call {call_id} not found")
    return CallTranscriptResponse(
        call_id=call.id,
        customer_name=call.customer_name,
        status=call.status,
        transcript=call.get_transcript(),
        summary=call.summary,
    )


# ── GET /call/logs/{call_id} ──────────────────────────────────────────────────

@router.get("/logs/{call_id}", response_model=CallLogResponse)
async def get_logs(
    call_id: str,
    session: AsyncSession = Depends(get_session),
) -> CallLogResponse:
    call = await get_call(session, call_id)
    if not call:
        raise HTTPException(status_code=404, detail=f"Call {call_id} not found")
    return CallLogResponse(call_id=call.id, logs=call.get_logs())


# ── GET /calls/active ─────────────────────────────────────────────────────────

_active_router = APIRouter(prefix="/calls", tags=["calls"])


@_active_router.get("", response_model=list[CallStatusResponse])
async def list_all_calls(
    session: AsyncSession = Depends(get_session),
) -> list[CallStatusResponse]:
    calls = await get_all_calls(session)
    return [CallStatusResponse.model_validate(c) for c in calls]


@_active_router.get("/active", response_model=CallStatusResponse | None)
async def get_active(session: AsyncSession = Depends(get_session)) -> CallStatusResponse | None:
    call = await get_active_call(session)
    if not call:
        return None
    return CallStatusResponse.model_validate(call)
