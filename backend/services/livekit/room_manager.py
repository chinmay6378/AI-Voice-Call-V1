"""
LiveKit room and SIP participant management using the LiveKit Server SDK.

Responsibilities:
  - Create rooms for each call
  - Dispatch agent workers to rooms
  - Create SIP outbound participants (alternative to SignalWire-initiated calls)
  - Generate participant tokens for monitoring/debugging
  - Clean up rooms on call end
"""
from __future__ import annotations

import json

from livekit import api as lk_api
from livekit.protocol import room as room_proto
from livekit.protocol import sip as sip_proto

from config.settings import Settings
from utils.logger import get_logger

logger = get_logger(__name__)


class LiveKitRoomManager:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def _get_api(self) -> lk_api.LiveKitAPI:
        """Return a new LiveKitAPI context manager (use as async context manager)."""
        return lk_api.LiveKitAPI(
            url=self._settings.livekit_url,
            api_key=self._settings.livekit_api_key,
            api_secret=self._settings.livekit_api_secret,
        )

    async def create_room(self, room_name: str, *, call_id: str) -> str:
        """
        Create (or return existing) LiveKit room.
        Returns the room name.
        """
        async with self._get_api() as lk:
            room = await lk.room.create_room(
                room_proto.CreateRoomRequest(
                    name=room_name,
                    empty_timeout=120,          # seconds before auto-delete when empty
                    max_participants=5,
                    metadata=json.dumps({"call_id": call_id}),
                )
            )
        logger.info("livekit.room_created", room=room.name, call_id=call_id)
        return room.name

    async def dispatch_agent(
        self,
        room_name: str,
        *,
        call_id: str,
        customer_name: str,
        phone_number: str,
    ) -> str:
        """
        Send an explicit dispatch request so an agent worker picks up this call.
        Returns the dispatch ID.
        """
        metadata = json.dumps(
            {
                "call_id": call_id,
                "customer_name": customer_name,
                "phone_number": phone_number,
            }
        )

        async with self._get_api() as lk:
            dispatch = await lk.agent_dispatch.create_dispatch(
                lk_api.CreateAgentDispatchRequest(
                    agent_name="voice-call-agent",
                    room=room_name,
                    metadata=metadata,
                )
            )

        logger.info(
            "livekit.agent_dispatched",
            dispatch_id=dispatch.id,
            room=room_name,
            call_id=call_id,
        )
        return dispatch.id

    async def create_sip_participant(
        self,
        room_name: str,
        *,
        phone_number: str,
        customer_name: str,
        call_id: str,
    ) -> str:
        """
        Alternative call initiation path: LiveKit creates the outbound SIP call
        directly (bypassing SignalWire's REST API).

        Requires a SIP trunk configured in the LiveKit dashboard that points to
        SignalWire's SIP gateway.

        Returns the participant SID.
        """
        if not self._settings.livekit_sip_trunk_id:
            raise RuntimeError(
                "LIVEKIT_SIP_TRUNK_ID is not configured — "
                "set it in .env or use the SignalWire-initiated call path."
            )

        async with self._get_api() as lk:
            participant = await lk.sip.create_sip_participant(
                sip_proto.CreateSIPParticipantRequest(
                    sip_trunk_id=self._settings.livekit_sip_trunk_id,
                    sip_call_to=phone_number,
                    room_name=room_name,
                    participant_identity="customer",
                    participant_name=customer_name,
                    participant_metadata=json.dumps({"call_id": call_id}),
                    wait_until_answered=False,   # non-blocking; AMD handled by SWML
                )
            )

        logger.info(
            "livekit.sip_participant_created",
            room=room_name,
            phone=phone_number,
            participant_id=participant.participant_id,
        )
        return participant.participant_id

    async def delete_room(self, room_name: str) -> None:
        """Delete room and disconnect all participants."""
        try:
            async with self._get_api() as lk:
                await lk.room.delete_room(
                    room_proto.DeleteRoomRequest(room=room_name)
                )
            logger.info("livekit.room_deleted", room=room_name)
        except Exception as exc:
            logger.warning("livekit.room_delete_failed", room=room_name, error=str(exc))

    async def remove_participant(self, room_name: str, identity: str) -> None:
        """Kick a participant from a room (e.g., after AMD detects voicemail)."""
        try:
            async with self._get_api() as lk:
                await lk.room.remove_participant(
                    room_proto.RoomParticipantIdentity(room=room_name, identity=identity)
                )
            logger.info("livekit.participant_removed", room=room_name, identity=identity)
        except Exception as exc:
            logger.warning(
                "livekit.participant_remove_failed",
                room=room_name,
                identity=identity,
                error=str(exc),
            )

    def generate_token(
        self,
        room_name: str,
        identity: str,
        *,
        can_publish: bool = True,
        can_subscribe: bool = True,
    ) -> str:
        """Generate a JWT participant token (for monitoring/debugging)."""
        token = (
            lk_api.AccessToken(
                self._settings.livekit_api_key,
                self._settings.livekit_api_secret,
            )
            .with_identity(identity)
            .with_name(identity)
            .with_grants(
                lk_api.VideoGrants(
                    room_join=True,
                    room=room_name,
                    can_publish=can_publish,
                    can_subscribe=can_subscribe,
                )
            )
            .to_jwt()
        )
        return token
