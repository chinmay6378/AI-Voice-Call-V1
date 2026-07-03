"""
Standalone ElevenLabs TTS client.

Used for:
  - Pre-generating voicemail audio files
  - Generating one-shot audio outside the LiveKit pipeline

Inside the LiveKit pipeline the livekit-plugins-elevenlabs plugin handles
all real-time streaming TTS — this module is not needed there.
"""
from __future__ import annotations

import asyncio
from pathlib import Path

from elevenlabs.client import ElevenLabs
from elevenlabs import VoiceSettings

from config.settings import Settings
from utils.logger import get_logger

logger = get_logger(__name__)


class ElevenLabsTTS:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = ElevenLabs(api_key=settings.elevenlabs_api_key)

    async def synthesise(self, text: str, *, output_path: str | None = None) -> bytes:
        """
        Convert text to speech.
        Returns raw MP3 bytes; optionally writes to output_path.
        """
        logger.debug("elevenlabs.synthesise", chars=len(text))

        def _generate() -> bytes:
            audio_iter = self._client.text_to_speech.convert(
                voice_id=self._settings.elevenlabs_voice_id,
                model_id=self._settings.elevenlabs_model_id,
                text=text,
                voice_settings=VoiceSettings(
                    stability=0.5,
                    similarity_boost=0.75,
                    style=0.0,
                    use_speaker_boost=True,
                ),
                output_format="mp3_44100_128",
            )
            return b"".join(audio_iter)

        audio_bytes = await asyncio.get_event_loop().run_in_executor(None, _generate)
        logger.info("elevenlabs.synthesised", bytes=len(audio_bytes))

        if output_path:
            Path(output_path).write_bytes(audio_bytes)
            logger.info("elevenlabs.saved", path=output_path)

        return audio_bytes

    async def generate_voicemail(self, output_dir: str = "data") -> str:
        """Generate voicemail audio and save it. Returns the file path."""
        path = Path(output_dir) / "voicemail.mp3"
        await self.synthesise(self._settings.agent_voicemail_message, output_path=str(path))
        return str(path)
