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
from typing import Any

from livekit import api as lk_api
from livekit.protocol import agent_dispatch as agent_dispatch_proto
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
        system_prompt: str | None = None,
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
                "system_prompt": system_prompt or "",
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

        Requires an outbound SIP trunk (LIVEKIT_SIP_TRUNK_ID) configured in the
        LiveKit dashboard — confirmed via a live test that LiveKit's server
        rejects CreateSIPParticipant with "missing sip trunk id" if sip_trunk_id
        is omitted, even when sip_number is set. LIVEKIT_SIP_NUMBER (if set) is
        passed alongside it as the caller-ID number to present, not a substitute
        for the trunk.

        wait_until_answered=True blocks this call until the phone is genuinely
        answered (or busy/fails) — with False, the SIP participant appeared in
        the room the instant dialing started (not when answered), so the agent
        greeted calls nobody had picked up yet. Caller (calls.py) must run this
        in a background task since it can now take as long as the phone rings.

        Returns the participant SID.
        """
        sip_trunk_id = self._settings.livekit_sip_trunk_id
        sip_number = self._settings.livekit_sip_number
        if not sip_trunk_id:
            raise RuntimeError(
                "LIVEKIT_SIP_TRUNK_ID is not configured — "
                "set it in .env or use the SignalWire-initiated call path."
            )

        request_kwargs: dict[str, Any] = dict(
            sip_trunk_id=sip_trunk_id,
            sip_call_to=phone_number,
            room_name=room_name,
            participant_identity="customer",
            participant_name=customer_name,
            participant_metadata=json.dumps({"call_id": call_id}),
            wait_until_answered=True,
        )
        if sip_number:
            request_kwargs["sip_number"] = sip_number

        async with self._get_api() as lk:
            participant = await lk.sip.create_sip_participant(
                sip_proto.CreateSIPParticipantRequest(**request_kwargs)
            )

        logger.info(
            "livekit.sip_participant_created",
            room=room_name,
            phone=phone_number,
            participant_id=participant.participant_id,
        )
        return participant.participant_id

    async def create_call_dispatch_rule(self, room_name: str, *, inbound_trunk_id: str = "") -> str:
        """
        Create a per-call SIP dispatch rule that routes incoming SIP calls
        into the LiveKit room where the agent is already waiting.
        Cleans up stale rules first so only one rule exists at a time.
        Returns the dispatch rule ID (store it so you can delete it later).
        """
        async with self._get_api() as lk:
            # Delete any leftover rules from previous crashed/failed calls.
            # With a fixed SIP username all rules match all calls, so stale
            # rules cause LiveKit to route to the wrong (empty) room.
            try:
                existing = await lk.sip.list_dispatch_rule(
                    sip_proto.ListSIPDispatchRuleRequest()
                )
                for rule in existing.items:
                    try:
                        await lk.sip.delete_dispatch_rule(
                            sip_proto.DeleteSIPDispatchRuleRequest(
                                sip_dispatch_rule_id=rule.sip_dispatch_rule_id
                            )
                        )
                        logger.info("livekit.dispatch_rule_stale_deleted", rule_id=rule.sip_dispatch_rule_id)
                    except Exception as del_exc:
                        logger.warning("livekit.dispatch_rule_stale_delete_failed", rule_id=rule.sip_dispatch_rule_id, error=str(del_exc))
            except Exception as list_exc:
                logger.warning("livekit.dispatch_rule_list_failed", error=str(list_exc))

            # No trunk_ids filter — matching all trunks is required.
            # With trunk_ids set, LiveKit rejects in ~2s because it can't
            # attribute the incoming SignalWire SIP INVITE to that specific
            # trunk ID. Without the filter, LiveKit finds the rule and
            # processes the INVITE into the room (4-5s path, closer to working).
            req = sip_proto.CreateSIPDispatchRuleRequest(
                rule=sip_proto.SIPDispatchRule(
                    dispatch_rule_direct=sip_proto.SIPDispatchRuleDirect(
                        room_name=room_name,
                    ),
                ),
            )
            result = await lk.sip.create_dispatch_rule(req)
        logger.info("livekit.dispatch_rule_created", room=room_name, rule_id=result.sip_dispatch_rule_id)
        return result.sip_dispatch_rule_id

    async def create_inbound_dispatch_rule(self, *, inbound_trunk_id: str = "") -> str:
        """
        Create (or recreate) the permanent inbound SIP dispatch rule.

        Uses Individual routing so each caller gets their own room named
        'inbound-<caller-number>'.  Auto-dispatches voice-call-agent so no
        explicit dispatch is needed when an inbound call arrives.

        If inbound_trunk_id is set, the rule is scoped to that trunk only
        (via trunk_ids) — otherwise it matches inbound calls on ANY trunk in
        the project, which also picks up unrelated/leftover trunks.

        Call this once via POST /call/inbound/setup; the rule persists
        across calls.  Safe to call again — deletes any existing rule
        named 'inbound-calls' before creating a fresh one.
        """
        async with self._get_api() as lk:
            try:
                existing = await lk.sip.list_dispatch_rule(sip_proto.ListSIPDispatchRuleRequest())
                for rule in existing.items:
                    if rule.name == "inbound-calls":
                        await lk.sip.delete_dispatch_rule(
                            sip_proto.DeleteSIPDispatchRuleRequest(
                                sip_dispatch_rule_id=rule.sip_dispatch_rule_id
                            )
                        )
                        logger.info("livekit.inbound_dispatch_rule_old_deleted", rule_id=rule.sip_dispatch_rule_id)
            except Exception as exc:
                logger.warning("livekit.inbound_rule_cleanup_failed", error=str(exc))

            req = sip_proto.CreateSIPDispatchRuleRequest(
                rule=sip_proto.SIPDispatchRule(
                    dispatch_rule_individual=sip_proto.SIPDispatchRuleIndividual(
                        room_prefix="inbound-",
                    ),
                ),
                name="inbound-calls",
                room_config=room_proto.RoomConfiguration(
                    agents=[
                        agent_dispatch_proto.RoomAgentDispatch(agent_name="voice-call-agent")
                    ]
                ),
            )
            if inbound_trunk_id:
                req.trunk_ids.append(inbound_trunk_id)
            result = await lk.sip.create_dispatch_rule(req)
        logger.info(
            "livekit.inbound_dispatch_rule_created",
            rule_id=result.sip_dispatch_rule_id,
            trunk_id=inbound_trunk_id or "all",
        )
        return result.sip_dispatch_rule_id

    async def delete_call_dispatch_rule(self, rule_id: str) -> None:
        """Delete a per-call SIP dispatch rule by ID."""
        try:
            async with self._get_api() as lk:
                await lk.sip.delete_dispatch_rule(
                    sip_proto.DeleteSIPDispatchRuleRequest(sip_dispatch_rule_id=rule_id)
                )
            logger.info("livekit.dispatch_rule_deleted", rule_id=rule_id)
        except Exception as exc:
            logger.warning("livekit.dispatch_rule_delete_failed", rule_id=rule_id, error=str(exc))

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
