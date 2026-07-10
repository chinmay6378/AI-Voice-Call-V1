"""
Settings API — persists API keys and config to the DB so the backend
picks them up on the next get_settings() call without a restart.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import apply_db_overrides
from database.repository import get_all_db_settings, get_session, set_db_setting

router = APIRouter(prefix="/settings", tags=["settings"])

# Only expose fields that the UI legitimately needs to set.
ALLOWED_KEYS = {
    "telephony_provider",
    "groq_api_key",
    "deepgram_api_key",
    "elevenlabs_api_key",
    "elevenlabs_voice_id",
    "livekit_url",
    "livekit_api_key",
    "livekit_api_secret",
    "livekit_sip_trunk_id",
    "livekit_sip_number",
    "livekit_sip_uri",
    "livekit_sip_username",
    "livekit_inbound_sip_trunk_id",
    "signalwire_project_id",
    "signalwire_api_token",
    "signalwire_space_url",
    "signalwire_from_number",
    "agent_name",
    "company_name",
    "agent_initial_greeting",
    "agent_system_prompt",
    "app_base_url",
}


class SaveKeyRequest(BaseModel):
    key: str
    value: str


@router.get("/keys")
async def get_keys(session: AsyncSession = Depends(get_session)) -> dict[str, str]:
    """Return all persisted settings that are in the allowed list."""
    all_settings = await get_all_db_settings(session)
    return {k: v for k, v in all_settings.items() if k in ALLOWED_KEYS}


@router.post("/keys")
async def save_key(
    body: SaveKeyRequest, session: AsyncSession = Depends(get_session)
) -> dict[str, object]:
    """Persist a single setting and apply it immediately to the running process."""
    key = body.key.lower().strip()
    if key not in ALLOWED_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown setting key: {key!r}")
    await set_db_setting(session, key, body.value)
    apply_db_overrides({key: body.value})
    return {"key": key, "saved": True}
