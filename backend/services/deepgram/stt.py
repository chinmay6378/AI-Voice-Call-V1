"""
Standalone Deepgram STT client (pre-recorded transcription only).

Used for pre-call audio processing or testing outside the LiveKit pipeline.
Inside the LiveKit pipeline, livekit-plugins-deepgram is used directly.

Uses the Deepgram REST API via httpx to avoid SDK version coupling.
"""
from __future__ import annotations

import asyncio

import httpx

from config.settings import Settings
from utils.logger import get_logger

logger = get_logger(__name__)

_DEEPGRAM_API_BASE = "https://api.deepgram.com/v1"


class DeepgramSTT:
    """Thin async wrapper around the Deepgram pre-recorded REST API."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._headers = {
            "Authorization": f"Token {settings.deepgram_api_key}",
            "Content-Type": "application/json",
        }

    def _params(self) -> dict:
        return {
            "model": self._settings.deepgram_model,
            "language": getattr(self._settings, "deepgram_language", "en"),
            "smart_format": "true",
            "punctuate": "true",
        }

    def _extract(self, data: dict) -> str:
        try:
            return data["results"]["channels"][0]["alternatives"][0]["transcript"]
        except (KeyError, IndexError):
            return ""

    async def transcribe_url(self, audio_url: str) -> str:
        """Pre-recorded transcription from a public URL."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{_DEEPGRAM_API_BASE}/listen",
                headers=self._headers,
                params=self._params(),
                json={"url": audio_url},
            )
            resp.raise_for_status()
            transcript = self._extract(resp.json())

        logger.info("deepgram.transcribed_url", url=audio_url, length=len(transcript))
        return transcript

    async def transcribe_file(self, audio_path: str) -> str:
        """Pre-recorded transcription from a local file."""
        with open(audio_path, "rb") as f:
            audio_bytes = f.read()

        headers = {**self._headers, "Content-Type": "audio/*"}
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{_DEEPGRAM_API_BASE}/listen",
                headers=headers,
                params=self._params(),
                content=audio_bytes,
            )
            resp.raise_for_status()
            transcript = self._extract(resp.json())

        logger.info("deepgram.transcribed_file", path=audio_path, length=len(transcript))
        return transcript
