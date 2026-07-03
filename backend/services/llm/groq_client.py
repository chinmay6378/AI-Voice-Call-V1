"""
Standalone Groq LLM client (OpenAI-compatible API).

Used for:
  - Generating call summaries after a call ends
  - Pre/post-call text processing
  - Testing prompts outside the LiveKit pipeline

Inside the LiveKit pipeline the livekit-plugins-openai plugin is pointed
at Groq's base URL and this module is not needed.
"""
from __future__ import annotations

from openai import AsyncOpenAI

from config.settings import Settings
from utils.logger import get_logger

logger = get_logger(__name__)


class GroqClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = AsyncOpenAI(
            api_key=settings.groq_api_key,
            base_url=settings.groq_base_url,
        )

    async def complete(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.7,
    ) -> str:
        """Single-shot completion. Returns the assistant message text."""
        model = model or self._settings.groq_model
        logger.debug("groq.completing", model=model, msg_count=len(messages))

        response = await self._client.chat.completions.create(
            model=model,
            messages=messages,  # type: ignore[arg-type]
            max_tokens=max_tokens,
            temperature=temperature,
        )
        text = response.choices[0].message.content or ""
        logger.debug("groq.completed", tokens=response.usage.total_tokens if response.usage else 0)
        return text

    async def summarise_transcript(
        self,
        customer_name: str,
        transcript: list[dict[str, str]],
    ) -> str:
        """Generate a brief summary of a completed call transcript."""
        transcript_text = "\n".join(
            f"{entry.get('role', 'unknown').upper()}: {entry.get('text', '')}"
            for entry in transcript
        )
        messages = [
            {
                "role": "system",
                "content": (
                    "You are an assistant that summarises sales/service phone call transcripts. "
                    "Write a 2-3 sentence summary covering: the purpose of the call, "
                    "the customer's reaction, and any action items or outcomes. "
                    "Be factual and concise."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Customer: {customer_name}\n\n"
                    f"Transcript:\n{transcript_text}\n\n"
                    "Please summarise this call."
                ),
            },
        ]
        return await self.complete(messages, max_tokens=256, temperature=0.3)
