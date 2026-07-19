"""
Application settings loaded from environment variables via pydantic-settings.
All secrets must be provided in .env — no defaults for credentials.
"""
from functools import lru_cache
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────────────────
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    app_base_url: str = "http://localhost:8000"  # Public URL this app is reachable at (informational)
    debug: bool = False
    log_level: str = "INFO"

    # ── LiveKit ───────────────────────────────────────────────────────────────
    livekit_url: str                   # e.g. "wss://myproject.livekit.cloud"
    livekit_api_key: str
    livekit_api_secret: str
    livekit_sip_trunk_id: str = ""          # Outbound SIP trunk ID (LiveKit → Twilio)
    livekit_inbound_sip_trunk_id: str = ""  # Inbound SIP trunk ID (Twilio → LiveKit), e.g. "ST_a8Gf2xHxzGAX"
    livekit_sip_number: str = ""            # Hosted LiveKit phone number to dial FROM (bypasses sip_trunk_id)

    # ── Deepgram ─────────────────────────────────────────────────────────────
    deepgram_api_key: str
    deepgram_model: str = "nova-2"
    deepgram_language: str = "en-US"

    # ── Groq (OpenAI-compatible) ──────────────────────────────────────────────
    groq_api_key: str
    groq_model: str = "llama-3.3-70b-versatile"
    groq_base_url: str = "https://api.groq.com/openai/v1"

    # ── ElevenLabs ───────────────────────────────────────────────────────────
    elevenlabs_api_key: str
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"   # Rachel (default)
    elevenlabs_model_id: str = "eleven_turbo_v2_5"

    # ── Database ─────────────────────────────────────────────────────────────
    database_url: str = "sqlite+aiosqlite:///./data/calls.db"

    # ── AI Agent Identity ─────────────────────────────────────────────────────
    agent_name: str = "Alex"
    company_name: str = "Premier Property Acquisitions"

    # ── AI Agent Behavior ─────────────────────────────────────────────────────
    agent_system_prompt: str = (
        "You are a professional AI voice assistant making outbound phone calls on behalf of a company. "
        "Be polite, concise, and natural. Listen carefully and respond appropriately. "
        "If the person is not interested or asks to be removed from contact, politely acknowledge and end the call. "
        "Keep responses short — no more than 2-3 sentences unless detailed information is needed."
    )
    agent_initial_greeting: str = (
        "Hello! This is an AI assistant calling. I hope I'm not catching you at a bad time. "
        "How are you today?"
    )
    agent_voicemail_message: str = (
        "Hello, we tried to reach you but were unable to connect. "
        "We will try again at a more convenient time. Thank you and have a wonderful day."
    )
    voicemail_audio_url: str = ""      # Optional: URL to pre-recorded voicemail MP3

    # ── Call Constraints ──────────────────────────────────────────────────────────
    max_call_duration_seconds: int = 600     # 10-minute hard limit
    amd_timeout_seconds: int = 30            # AMD detection timeout

    @field_validator("livekit_url")
    @classmethod
    def ensure_wss(cls, v: str) -> str:
        if v.startswith("http://"):
            return v.replace("http://", "ws://")
        if v.startswith("https://"):
            return v.replace("https://", "wss://")
        return v


@lru_cache()
def get_settings() -> Settings:
    return Settings()


def invalidate_settings_cache() -> None:
    get_settings.cache_clear()


def apply_db_overrides(overrides: dict[str, str]) -> None:
    """Write non-empty DB settings into os.environ, then clear the lru_cache
    so the next get_settings() call picks them up."""
    import os
    for key, value in overrides.items():
        if value:
            os.environ[key.upper()] = value
    get_settings.cache_clear()
