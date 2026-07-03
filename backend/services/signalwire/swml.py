"""
SWML (SignalWire Markup Language) response builder.

SWML is a JSON document returned from a webhook that SignalWire executes
to control call flow. We generate two types:

  1. human_response   — connect the call into the LiveKit SIP room
  2. voicemail_response — play the voicemail message then hang up
  3. amd_response     — AMD-aware routing: branch on human vs machine detection
"""
from __future__ import annotations

import json
from typing import Any

from config.settings import Settings
from utils.logger import get_logger

logger = get_logger(__name__)


def _doc(sections: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    return {"version": "1.0.0", "sections": sections}


def build_amd_routing_swml(
    settings: Settings,
    room_name: str,
    call_id: str,
) -> str:
    """
    Primary SWML response for an outbound call.

    Uses SignalWire's built-in AMD detect verb to branch:
      • human   → connect to LiveKit SIP room
      • machine → play voicemail then hang up

    The `detect` verb executes synchronously inside the SWML engine — no
    extra async AMD webhook is needed for the branching logic.
    """
    sip_destination = _build_sip_uri(settings, room_name)
    voicemail_url = settings.voicemail_audio_url

    human_section: list[dict[str, Any]] = []
    machine_section: list[dict[str, Any]] = []

    # Route human caller to LiveKit
    human_section.append(
        {
            "connect": {
                "from": settings.signalwire_from_number,
                "to": sip_destination,
                "timeout": 30,
                "headers": {
                    "X-Call-ID": call_id,
                    "X-Room-Name": room_name,
                },
            }
        }
    )

    # Leave voicemail for machine
    if voicemail_url:
        machine_section.append({"play": {"url": voicemail_url, "volume": 1.0}})
    else:
        machine_section.append(
            {
                "say": {
                    "text": settings.agent_voicemail_message,
                    "voice": "en-US-Neural2-F",
                    "language": "en-US",
                }
            }
        )
    machine_section.append({"hangup": {}})

    doc = _doc(
        {
            "main": [
                {
                    "detect": {
                        "type": "machine",
                        "timeout": settings.amd_timeout_seconds,
                        "wait": True,
                        "machine_words_threshold": 6,
                        "on_detect": {
                            "human": "human",
                            "machine": "voicemail",
                            "unknown": "human",
                        },
                    }
                }
            ],
            "human": human_section,
            "voicemail": machine_section,
        }
    )

    swml_str = json.dumps(doc, indent=2)
    logger.debug("swml.built", call_id=call_id, room=room_name, sip=sip_destination)
    return swml_str


def build_human_only_swml(
    settings: Settings,
    room_name: str,
    call_id: str,
) -> str:
    """Connect immediately without AMD — useful when AMD is handled externally."""
    sip_destination = _build_sip_uri(settings, room_name)
    doc = _doc(
        {
            "main": [
                {
                    "connect": {
                        "from": settings.signalwire_from_number,
                        "to": sip_destination,
                        "timeout": 30,
                        "headers": {
                            "X-Call-ID": call_id,
                            "X-Room-Name": room_name,
                        },
                    }
                }
            ]
        }
    )
    return json.dumps(doc, indent=2)


def build_voicemail_swml(settings: Settings) -> str:
    """Play voicemail and hang up (used when AMD webhook fires after the fact)."""
    sections: list[dict[str, Any]] = []

    if settings.voicemail_audio_url:
        sections.append({"play": {"url": settings.voicemail_audio_url, "volume": 1.0}})
    else:
        sections.append(
            {
                "say": {
                    "text": settings.agent_voicemail_message,
                    "voice": "en-US-Neural2-F",
                    "language": "en-US",
                }
            }
        )
    sections.append({"hangup": {}})
    return json.dumps(_doc({"main": sections}), indent=2)


def build_hangup_swml() -> str:
    """Immediate hangup."""
    return json.dumps(_doc({"main": [{"hangup": {}}]}), indent=2)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _build_sip_uri(settings: Settings, room_name: str) -> str:
    """
    Build the SIP URI that will route the call into a LiveKit room.

    LiveKit SIP inbound: calls arriving at this URI are placed into a room
    matching the SIP username (room_name).

    If livekit_sip_uri is not configured, falls back to a placeholder that
    must be replaced before production use.
    """
    sip_host = settings.livekit_sip_uri or "sip.livekit.example.com"
    return f"sip:{room_name}@{sip_host}"
