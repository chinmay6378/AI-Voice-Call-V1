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

import json
from datetime import datetime

from fastapi import APIRouter, Depends, Form, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings, get_settings
from database import (
    create_call,
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
    build_hangup_swml,
    build_human_only_swml,
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
    try:
        form = await request.form()
        call_sid = form.get("CallSid", "")
        call_status = form.get("CallStatus", "")
        to_number = form.get("To", "")

        logger.info("webhook.swml", call_id=call_id, call_sid=call_sid, call_status=call_status, to=to_number)

        call = await get_call(session, call_id)
        if not call:
            logger.warning("webhook.swml.call_not_found", call_id=call_id)
            return Response(content=build_hangup_swml(), media_type="application/json")

        if call_sid and not call.signalwire_call_sid:
            call.signalwire_call_sid = call_sid
            call.append_log("webhook.swml_received", {"call_status": call_status})
            await session.commit()

        # Create a per-call SIP dispatch rule so LiveKit routes the bridged SIP
        # call into the existing room where the agent is already waiting.
        room_name = call.livekit_room_name or call_id
        if not call.livekit_sip_rule_id and settings.livekit_sip_uri:
            try:
                lk = LiveKitRoomManager(settings)
                rule_id = await lk.create_call_dispatch_rule(room_name)
                call.livekit_sip_rule_id = rule_id
                await session.commit()
                logger.info("webhook.swml.dispatch_rule_created", call_id=call_id, rule_id=rule_id)
            except Exception as exc:
                logger.warning("webhook.swml.dispatch_rule_failed", call_id=call_id, error=str(exc))

        # SignalWire POSTs AnsweredBy when MachineDetection: DetectMessageEnd completes
        # before fetching this SWML URL. Use that result directly — no need to re-run AMD.
        answered_by_raw = (form.get("AnsweredBy") or "").lower()
        is_machine = answered_by_raw.startswith("machine") or answered_by_raw == "fax"
        logger.info(
            "webhook.swml.answered_by",
            call_id=call_id,
            answered_by=answered_by_raw,
            is_machine=is_machine,
        )

        if is_machine:
            swml = build_voicemail_swml(settings)
        else:
            swml = build_human_only_swml(settings, room_name, call_id)
        return Response(content=swml, media_type="application/json")
    except Exception as exc:
        logger.error("webhook.swml.error", call_id=call_id, error=str(exc), exc_info=True)
        return Response(content=build_hangup_swml(), media_type="application/json")


# ── AMD callback ──────────────────────────────────────────────────────────────

@router.post("/amd/{call_id}")
async def amd_callback(
    call_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    lk: LiveKitRoomManager = Depends(lambda s=Depends(get_settings): LiveKitRoomManager(s)),
) -> Response:
    try:
        form = await request.form()
        answered_by = str(form.get("AnsweredBy", "unknown"))
        call_sid = form.get("CallSid", "")

        logger.info("webhook.amd", call_id=call_id, answered_by=answered_by, call_sid=call_sid)

        call = await get_call(session, call_id)
        if not call:
            logger.warning("webhook.amd.call_not_found", call_id=call_id)
            return Response(status_code=200)

        call.append_log("amd.result", {"answered_by": answered_by})
        is_machine = answered_by.startswith("machine") or answered_by == "fax"

        if is_machine:
            await mark_call_voicemail(session, call_id)
            logger.info("amd.voicemail_detected", call_id=call_id, answered_by=answered_by)
            if call.livekit_room_name:
                try:
                    await lk.remove_participant(call.livekit_room_name, "customer")
                except Exception:
                    pass
        else:
            await mark_call_answered(session, call_id, answered_by="human")
            logger.info("amd.human_detected", call_id=call_id)

        await session.commit()
    except Exception as exc:
        logger.error("webhook.amd.error", call_id=call_id, error=str(exc), exc_info=True)
    return Response(status_code=200)


# ── Status callback ───────────────────────────────────────────────────────────

@router.post("/status/{call_id}")
async def status_callback(
    call_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> Response:
    try:
        form = await request.form()
        sw_status = (form.get("CallStatus") or "").lower().replace("-", "_")
        call_sid = str(form.get("CallSid") or "")
        duration_raw = form.get("CallDuration")

        logger.info("webhook.status", call_id=call_id, sw_status=sw_status, call_sid=call_sid, duration=duration_raw)

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
            if new_status in (CallStatus.COMPLETED, CallStatus.BUSY, CallStatus.NO_ANSWER, CallStatus.FAILED, CallStatus.CANCELLED):
                transcript = call.get_transcript()
                summary: str | None = None
                if transcript:
                    try:
                        groq = GroqClient(settings)
                        summary = await groq.summarise_transcript(call.customer_name, transcript)
                    except Exception as exc:
                        logger.warning("summary.failed", call_id=call_id, error=str(exc))

                duration_seconds: int | None = None
                if duration_raw:
                    try:
                        duration_seconds = int(duration_raw)
                    except (ValueError, TypeError):
                        logger.warning("webhook.status.bad_duration", call_id=call_id, raw=duration_raw)

                await finalize_call(
                    session,
                    call_id,
                    status=new_status,
                    summary=summary,
                    **({"duration_seconds": duration_seconds} if duration_seconds is not None else {}),
                )
                # Clean up the per-call SIP dispatch rule
                if call.livekit_sip_rule_id:
                    lk = LiveKitRoomManager(settings)
                    await lk.delete_call_dispatch_rule(call.livekit_sip_rule_id)
            else:
                call.status = new_status
                await session.commit()
    except Exception as exc:
        logger.error("webhook.status.error", call_id=call_id, error=str(exc), exc_info=True)
    return Response(status_code=200)


# ── Inbound call webhooks ─────────────────────────────────────────────────────

@router.post("/inbound/swml")
async def inbound_swml_handler(
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> Response:
    """
    Called by SignalWire when someone dials the inbound number.
    Creates a call record for tracking and returns SWML that bridges
    the call into LiveKit via SIP.  The permanent Individual dispatch
    rule (created via POST /call/inbound/setup) handles room creation
    and auto-dispatches the agent — no explicit dispatch needed here.
    """
    try:
        form = await request.form()
        from_number = str(form.get("From") or "Unknown")
        call_sid = str(form.get("CallSid") or "")

        logger.info("webhook.inbound.swml", from_number=from_number, call_sid=call_sid)

        # Predict the room LiveKit will create: inbound-<caller-number>
        room_name = f"inbound-{from_number}"

        call = await create_call(
            session,
            customer_name=from_number,
            phone_number=from_number,
            livekit_room_name=room_name,
            direction="inbound",
        )
        if call_sid:
            call.signalwire_call_sid = call_sid
            call.status = CallStatus.IN_PROGRESS
            call.answer_time = datetime.utcnow()
            call.append_log("inbound.call_connected", {"from": from_number})
            await session.commit()

        # Bridge call into LiveKit via SIP.
        # Use username "inbound" (not a phone number) so SignalWire routes
        # it externally.  The LiveKit trunk must have Numbers cleared so it
        # accepts any SIP username.
        raw = settings.livekit_sip_uri or ""
        sip_host = raw.removeprefix("sip:").removeprefix("sips:").strip()
        swml = {
            "version": "1.0.0",
            "sections": {
                "main": [{
                    "connect": {
                        "to": f"sip:inbound@{sip_host}",
                        "timeout": 30,
                    }
                }]
            },
        }
        return Response(content=json.dumps(swml), media_type="application/json")
    except Exception as exc:
        logger.error("webhook.inbound.swml.error", error=str(exc), exc_info=True)
        return Response(content=build_hangup_swml(), media_type="application/json")


@router.post("/inbound/status")
async def inbound_status_handler(
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> Response:
    """
    SignalWire status callback for inbound calls.
    Looks up the call by SID (not call_id) since we don't know call_id
    when configuring the phone number's status callback URL in SignalWire.
    Configure SignalWire phone number status callback to:
      <APP_BASE_URL>/webhooks/inbound/status
    """
    try:
        form = await request.form()
        call_sid = str(form.get("CallSid") or "")
        sw_status = (form.get("CallStatus") or "").lower().replace("-", "_")
        duration_raw = form.get("CallDuration")

        logger.info("webhook.inbound.status", call_sid=call_sid, sw_status=sw_status)

        call = await get_call_by_sid(session, call_sid)
        if not call:
            return Response(status_code=200)

        call.append_log("signalwire.inbound.status", {"status": sw_status})

        terminal_map = {
            "completed": CallStatus.COMPLETED,
            "busy": CallStatus.BUSY,
            "no_answer": CallStatus.NO_ANSWER,
            "failed": CallStatus.FAILED,
            "canceled": CallStatus.CANCELLED,
        }
        new_status = terminal_map.get(sw_status)
        if new_status:
            duration_seconds: int | None = None
            if duration_raw:
                try:
                    duration_seconds = int(duration_raw)
                except (ValueError, TypeError):
                    pass

            transcript = call.get_transcript()
            summary: str | None = None
            if transcript:
                try:
                    groq = GroqClient(settings)
                    summary = await groq.summarise_transcript(call.customer_name, transcript)
                except Exception as exc:
                    logger.warning("inbound.summary.failed", call_id=call.id, error=str(exc))

            await finalize_call(
                session,
                call.id,
                status=new_status,
                summary=summary,
                **({"duration_seconds": duration_seconds} if duration_seconds is not None else {}),
            )
    except Exception as exc:
        logger.error("webhook.inbound.status.error", error=str(exc), exc_info=True)
    return Response(status_code=200)
