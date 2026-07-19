"""
Settings API — persists API keys and config to the DB so the backend
picks them up on the next get_settings() call without a restart.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import apply_db_overrides, get_settings
from database.repository import get_session, set_db_setting

router = APIRouter(prefix="/settings", tags=["settings"])

# Only expose fields that the UI legitimately needs to set.
ALLOWED_KEYS = {
    "groq_api_key",
    "deepgram_api_key",
    "elevenlabs_api_key",
    "elevenlabs_voice_id",
    "livekit_url",
    "livekit_api_key",
    "livekit_api_secret",
    "livekit_sip_trunk_id",
    "livekit_sip_number",
    "livekit_inbound_sip_trunk_id",
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
async def get_keys() -> dict[str, str]:
    """
    Return the current EFFECTIVE value of every allowed setting — whichever
    of .env or a DB override (already merged by apply_db_overrides on
    startup/save) is currently active. This lets the Settings UI show the
    real credentials in use by default, instead of blank fields until
    someone explicitly saves through the UI.
    """
    settings = get_settings()
    return {k: str(getattr(settings, k, "") or "") for k in ALLOWED_KEYS}


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
