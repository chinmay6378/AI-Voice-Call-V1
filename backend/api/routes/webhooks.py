"""
SignalWire webhook endpoints.

SignalWire POSTs to these URLs during a call's lifecycle:

  POST /webhooks/swml/{call_id}     — Called when the outbound call connects.
                                      Returns SWML JSON to control call flow
                                      (AMD detect → LiveKit SIP or voicemail).

  POST /webhooks/amd/{call_id}      — Async AMD (answering machine detection)
                                      result. Fires while the call is in progress.

  POST /webhooks/status/{call_id}   — Call lifecycle status updates
                                      (initiated, ringing, answered, completed…).

All endpoints return 200 so SignalWire doesn't retry.
SWML endpoints return application/json; others return plain 200.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Form, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings, get_settings
from database import (
    finalize_call,
    get_call,
    get_call_by_sid,
    get_session,
    mark_call_answered,
    mark_call_voicemail,
    update_call_status,
)
from database.models.call import CallStatus
from services.livekit.room_manager import LiveKitRoomManager
from services.llm.groq_client import GroqClient
from services.signalwire.swml import (
    build_amd_routing_swml,
    build_hangup_swml,
    build_voicemail_swml,
)
from utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])


# ── SWML endpoint — call routing ──────────────────────────────────────────────

@router.post("/swml/{call_id}")
async def swml_handler(
    call_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> Response:
    """
    Called by SignalWire when the dialled number answers (or the call connects).
    Returns a SWML document that:
      1. Runs AMD detection synchronously.
      2. If human → connects to LiveKit via SIP.
      3. If machine → plays voicemail + hangs up.

    Signature: SignalWire sends form-encoded POST params including CallSid,
    CallStatus, From, To, etc.
    """
    form = await request.form()
    call_sid = form.get("CallSid", "")
    call_status = form.get("CallStatus", "")
    to_number = form.get("To", "")
    from_number = form.get("From", "")

    logger.info(
        "webhook.swml",
        call_id=call_id,
        call_sid=call_sid,
        call_status=call_status,
        to=to_number,
    )

    call = await get_call(session, call_id)
    if not call:
        logger.warning("webhook.swml.call_not_found", call_id=call_id)
        return Response(content=build_hangup_swml(), media_type="application/json")

    # Persist the SignalWire SID if not already stored
    if call_sid and not call.signalwire_call_sid:
        call.signalwire_call_sid = call_sid
        call.append_log("webhook.swml_received", {"call_status": call_status})
        await session.commit()

    # Return AMD-aware SWML
    swml = build_amd_routing_swml(settings, call.livekit_room_name or call_id, call_id)
    return Response(content=swml, media_type="application/json")


# ── AMD callback ──────────────────────────────────────────────────────────────

@router.post("/amd/{call_id}")
async def amd_callback(
    call_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    lk: LiveKitRoomManager = Depends(lambda s=Depends(get_settings): LiveKitRoomManager(s)),
) -> Response:
    """
    Async AMD result from SignalWire.

    AnsweredBy values:
      human          — real person picked up
      machine_start  — voicemail greeting started (machine_detection=Enable)
      machine_end_beep   — heard the beep (DetectMessageEnd)
      machine_end_silence — silence after voicemail greeting
      fax            — fax machine
      unknown        — couldn't determine

    When our SWML uses the synchronous `detect` verb this callback is
    still fired but the call routing has already been handled. We use it
    to update our DB and, if needed, disconnect the customer participant
    from the LiveKit room.
    """
    form = await request.form()
    answered_by = form.get("AnsweredBy", "unknown")
    call_sid = form.get("CallSid", "")

    logger.info("webhook.amd", call_id=call_id, answered_by=answered_by, call_sid=call_sid)

    call = await get_call(session, call_id)
    if not call:
        logger.warning("webhook.amd.call_not_found", call_id=call_id)
        return Response(status_code=200)

    call.append_log("amd.result", {"answered_by": answered_by})

    is_machine = answered_by.startswith("machine") or answered_by == "fax"

    if is_machine:
        # SWML detect verb already routed to voicemail section, but we update DB
        await mark_call_voicemail(session, call_id)
        logger.info("amd.voicemail_detected", call_id=call_id, answered_by=answered_by)

        # If somehow the call got to LiveKit, kick the customer participant
        if call.livekit_room_name:
            try:
                await lk.remove_participant(call.livekit_room_name, "customer")
            except Exception:
                pass
    else:
        # Human — SWML detect verb already routed to human section
        await mark_call_answered(session, call_id, answered_by="human")
        logger.info("amd.human_detected", call_id=call_id)

    await session.commit()
    return Response(status_code=200)


# ── Status callback ───────────────────────────────────────────────────────────

@router.post("/status/{call_id}")
async def status_callback(
    call_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> Response:
    """
    SignalWire call lifecycle status updates.

    CallStatus values: initiated, ringing, in-progress, completed,
                       busy, no-answer, failed, canceled
    """
    form = await request.form()
    sw_status = (form.get("CallStatus") or "").lower().replace("-", "_")
    call_sid = form.get("CallSid", "")
    duration = form.get("CallDuration")

    logger.info(
        "webhook.status",
        call_id=call_id,
        sw_status=sw_status,
        call_sid=call_sid,
        duration=duration,
    )

    call = await get_call(session, call_id)
    if not call:
        return Response(status_code=200)

    call.append_log("signalwire.status", {"status": sw_status, "call_sid": call_sid})

    _status_map = {
        "initiated": CallStatus.DIALING,
        "ringing": CallStatus.RINGING,
        "in_progress": CallStatus.IN_PROGRESS,
        "completed": CallStatus.COMPLETED,
        "busy": CallStatus.BUSY,
        "no_answer": CallStatus.NO_ANSWER,
        "failed": CallStatus.FAILED,
        "canceled": CallStatus.CANCELLED,
    }

    new_status = _status_map.get(sw_status)
    if new_status:
        if new_status in (
            CallStatus.COMPLETED,
            CallStatus.BUSY,
            CallStatus.NO_ANSWER,
            CallStatus.FAILED,
            CallStatus.CANCELLED,
        ):
            # Terminal state — generate summary if we have a transcript
            transcript = call.get_transcript()
            summary: str | None = None
            if transcript:
                try:
                    groq = GroqClient(settings)
                    summary = await groq.summarise_transcript(call.customer_name, transcript)
                except Exception as exc:
                    logger.warning("summary.failed", call_id=call_id, error=str(exc))

            extra = {}
            if duration:
                extra["duration_seconds"] = int(duration)
            await finalize_call(
                session,
                call_id,
                status=new_status,
                summary=summary,
                **extra,  # type: ignore[arg-type]
            )
        else:
            call.status = new_status
            await session.commit()

    return Response(status_code=200)
