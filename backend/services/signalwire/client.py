"""
SignalWire REST API client (Twilio-compatible API).
Wraps the signalwire-python SDK with async support and structured logging.
"""
from __future__ import annotations

import asyncio
from functools import cached_property
from typing import Any

from signalwire.rest import Client as SWClient

from config.settings import Settings
from utils.logger import get_logger

logger = get_logger(__name__)


class SignalWireClient:
    """Thread-safe async wrapper around the synchronous SignalWire REST client."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    @cached_property
    def _client(self) -> SWClient:
        return SWClient(
            self._settings.signalwire_project_id,
            self._settings.signalwire_api_token,
            signalwire_space_url=self._settings.signalwire_space_url,
        )

    async def _run_sync(self, func: Any, *args: Any, **kwargs: Any) -> Any:
        """Run a blocking SDK call in the default thread executor."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, lambda: func(*args, **kwargs))

    async def create_outbound_call(
        self,
        *,
        to: str,
        swml_webhook_url: str,
        status_callback_url: str,
        amd_callback_url: str,
    ) -> str:
        """
        Initiate an outbound call and return the SignalWire Call SID.

        AMD is enabled with DetectMessageEnd so we get the full voicemail greeting
        before the beep — best for leaving a voicemail message.
        """
        logger.info(
            "signalwire.create_call",
            to=to,
            from_=self._settings.signalwire_from_number,
            swml_url=swml_webhook_url,
        )

        call = await self._run_sync(
            self._client.calls.create,
            to=to,
            from_=self._settings.signalwire_from_number,
            url=swml_webhook_url,
            method="POST",
            # Async AMD — callback fires separately, call continues normally
            machine_detection="DetectMessageEnd",
            machine_detection_timeout=self._settings.amd_timeout_seconds,
            async_amd_status_callback=amd_callback_url,
            async_amd_status_callback_method="POST",
            # Status lifecycle callbacks
            status_callback=status_callback_url,
            status_callback_method="POST",
            status_callback_event=["initiated", "ringing", "answered", "completed"],
        )

        logger.info("signalwire.call_created", call_sid=call.sid, status=call.status)
        return call.sid

    async def end_call(self, call_sid: str) -> bool:
        """Hang up an active call. Returns True on success."""
        logger.info("signalwire.end_call", call_sid=call_sid)
        try:
            call = await self._run_sync(
                self._client.calls(call_sid).update, status="completed"
            )
            logger.info("signalwire.call_ended", call_sid=call_sid, status=call.status)
            return True
        except Exception as exc:
            logger.error("signalwire.end_call_failed", call_sid=call_sid, error=str(exc))
            return False

    async def get_call_status(self, call_sid: str) -> dict[str, Any]:
        """Fetch raw call details from SignalWire."""
        call = await self._run_sync(self._client.calls(call_sid).fetch)
        return {
            "sid": call.sid,
            "status": call.status,
            "direction": call.direction,
            "duration": call.duration,
            "answered_by": getattr(call, "answered_by", None),
        }
