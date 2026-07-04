"""
LiveKit Agent Worker — voice pipeline agent for outbound AI calls.

Run this file as a separate process:
    python -m services.livekit.agent start

The worker registers with LiveKit and receives dispatch requests whenever
a new call room is created via the room_manager.dispatch_agent() call.

Pipeline: Deepgram STT → Groq LLM (via OpenAI-compat API) → ElevenLabs TTS
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import datetime
from typing import Any

# Add backend root to path when run as __main__
if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from livekit import rtc
from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    JobContext,
    WorkerOptions,
    cli,
    llm,
)
from livekit.plugins import deepgram, elevenlabs, openai as lk_openai

from config.settings import get_settings
from database.repository import (
    append_transcript_entry,
    finalize_call,
    get_call,
    get_session,
    init_db,
    mark_call_answered,
    mark_call_voicemail,
    update_call_status,
)
from database.models.call import CallStatus
from services.llm.groq_client import GroqClient
from utils.logger import configure_logging, get_logger

logger = get_logger(__name__)

REAL_ESTATE_PROMPT = """You are Alex, an outbound sales agent for Premier Property Acquisitions calling to ask property owners if they want to sell.

ENGLISH ONLY. No matter what language the customer uses, you ALWAYS reply in English. Never switch to Hindi, Marathi, Gujarati, Tamil, or any other language. If you reply in any language other than English, you have failed.

THE OPENING GREETING HAS ALREADY BEEN SAID FOR YOU. Do NOT say hello, do NOT say "how can I help you", do NOT introduce yourself again. Just wait for the customer's first response, then immediately ask if they have considered selling their property.

CONVERSATION FLOW:
1. Customer responds → ask if they have considered selling their property in the area
2. Interested → ask ONE qualifying question at a time: timeline, expected price, listed or off-market
3. Not interested → thank them, ask if okay to follow up later, end politely
4. Asks to be removed → say "I'll remove you right away" and end the call

RULES:
- Keep every response under 2 sentences
- Never pressure or argue
- Never lie about who you are
- ENGLISH ONLY — every single reply, no exceptions"""


# ── Agent class ───────────────────────────────────────────────────────────────

_GOODBYE_PHRASES = [
    "goodbye", "good bye", "have a great day", "have a good day",
    "take care", "bye", "i'll remove you", "remove you right away",
    "thank you for your time", "thanks for your time",
    "i will let you go", "i'll let you go",
    "have a wonderful", "have a nice", "no longer contact",
]

class VoiceCallAgent(Agent):
    """
    Conversational agent for outbound calls.

    Receives call metadata from the dispatch request, personalises the
    greeting, and manages the conversation until the caller hangs up.
    """

    def __init__(
        self,
        *,
        call_id: str,
        customer_name: str,
        phone_number: str,
        settings: Any,
        disconnect_event: asyncio.Event,
    ) -> None:
        instructions = (
            f"ENGLISH ONLY — every reply must be in English, no exceptions, regardless of what language the customer uses.\n\n"
            + REAL_ESTATE_PROMPT
        )
        super().__init__(instructions=instructions)
        self.call_id = call_id
        self.customer_name = customer_name
        self._settings = settings
        self._session: AgentSession | None = None
        self._disconnect_event = disconnect_event
        self._hangup_scheduled = False

    async def on_enter(self) -> None:
        logger.info("agent.on_enter", call_id=self.call_id)
        await asyncio.sleep(1.0)
        greeting = (
            self._settings.agent_initial_greeting
            .replace("{customer_name}", self.customer_name)
            .replace("{agent_name}", self._settings.agent_name)
            .replace("{company_name}", self._settings.company_name)
        )
        logger.info("agent.saying_greeting", call_id=self.call_id, greeting=greeting[:60])
        await self.session.say(greeting, allow_interruptions=False)

    async def on_user_turn_completed(
        self, turn_ctx: llm.ChatContext, new_message: llm.ChatMessage
    ) -> None:
        if new_message.content:
            text = _extract_text(new_message.content)
            logger.info("transcript.user", call_id=self.call_id, text=text)
            await _save_transcript(self.call_id, "customer", text)
        # Inject English-only rule directly into the turn context — this IS
        # the chat_ctx that llm_node receives, so it's guaranteed to reach the LLM.
        turn_ctx.add_message(
            role="system",
            content="ABSOLUTE RULE: Your response MUST be in English only. Never reply in Hindi, Marathi, or any other language.",
        )

    async def llm_node(  # type: ignore[override]
        self,
        chat_ctx: llm.ChatContext,
        tools: list,
        model_settings: Any,
    ):
        chat_ctx.add_message(
            role="system",
            content="FINAL REMINDER: Respond in English only. No Hindi. No exceptions.",
        )
        async for chunk in Agent.default.llm_node(self, chat_ctx, tools, model_settings):
            yield chunk

    def _on_conversation_item_added(self, ev) -> None:
        """Persist agent responses; skip non-message items like AgentHandoff."""
        msg = ev.item
        if not isinstance(msg, llm.ChatMessage):
            return
        if msg.role == "assistant" and msg.content:
            text = _extract_text(msg.content)
            logger.info("transcript.agent", call_id=self.call_id, text=text)
            asyncio.ensure_future(_save_transcript(self.call_id, "agent", text))

            # Auto-hangup when agent says a goodbye phrase
            lower = text.lower()
            if not self._hangup_scheduled and any(p in lower for p in _GOODBYE_PHRASES):
                logger.info("agent.goodbye_detected", call_id=self.call_id, text=text[:80])
                self._hangup_scheduled = True
                asyncio.ensure_future(self._schedule_hangup(3.5))

    async def _schedule_hangup(self, delay: float) -> None:
        """Wait for TTS to finish the goodbye, then trigger disconnect."""
        await asyncio.sleep(delay)
        logger.info("agent.auto_hangup", call_id=self.call_id)
        self._disconnect_event.set()


# ── Job entrypoint ────────────────────────────────────────────────────────────

async def entrypoint(ctx: JobContext) -> None:
    print(">>> ENTRYPOINT CALLED", flush=True)
    settings = get_settings()
    configure_logging(settings.log_level)
    print(f">>> DB init: {settings.database_url}", flush=True)
    await init_db(settings.database_url)
    print(">>> DB ready", flush=True)

    # Parse metadata passed from dispatch_agent()
    metadata: dict[str, str] = {}
    if ctx.job.metadata:
        try:
            metadata = json.loads(ctx.job.metadata)
        except json.JSONDecodeError:
            logger.warning("agent.bad_metadata", raw=ctx.job.metadata)

    call_id = metadata.get("call_id", "unknown")
    customer_name = metadata.get("customer_name", "Customer")
    phone_number = metadata.get("phone_number", "unknown")

    logger.info(
        "agent.job_started",
        call_id=call_id,
        customer=customer_name,
        room=ctx.room.name,
        llm_model=settings.groq_model,
        tts_voice=settings.elevenlabs_voice_id,
    )

    # Connect to room; subscribe to audio only
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Wait for the customer SIP participant to join
    customer_participant = await _wait_for_customer(ctx, timeout=60)
    if customer_participant is None:
        logger.warning("agent.no_customer_joined", call_id=call_id)
        await _end_call_db(call_id, CallStatus.NO_ANSWER)
        return

    logger.info(
        "agent.customer_joined",
        call_id=call_id,
        identity=customer_participant.identity,
    )

    # Update DB: call is now in progress
    await _mark_in_progress(call_id)

    # Fires when the customer hangs up, room closes, or agent says goodbye
    disconnect_event = asyncio.Event()
    ctx.room.on("disconnected", lambda *_: disconnect_event.set())
    # Fire on ANY remote participant leaving (customer SIP, etc.)
    ctx.room.on("participant_disconnected", lambda p: disconnect_event.set())

    try:
        session = AgentSession(
            stt=deepgram.STT(
                api_key=settings.deepgram_api_key,
                model=settings.deepgram_model,
                language=settings.deepgram_language,
                interim_results=True,
                smart_format=True,
                punctuate=True,
            ),
            llm=lk_openai.LLM(
                base_url=settings.groq_base_url,
                api_key=settings.groq_api_key,
                model=settings.groq_model,
            ),
            tts=elevenlabs.TTS(
                api_key=settings.elevenlabs_api_key,
                voice_id=settings.elevenlabs_voice_id,
                model=settings.elevenlabs_model_id,
                streaming_latency=3,
            ),
            allow_interruptions=True,
            min_endpointing_delay=0.5,
            user_away_timeout=None,   # disable — stops LLM from generating unprompted "how can I help you?" on silence
        )

        agent = VoiceCallAgent(
            call_id=call_id,
            customer_name=customer_name,
            phone_number=phone_number,
            settings=settings,
            disconnect_event=disconnect_event,
        )
        agent._session = session

        session.on("conversation_item_added", agent._on_conversation_item_added)

        await session.start(agent, room=ctx.room, record=False)
        logger.info("agent.session_started", call_id=call_id)

        await asyncio.wait_for(
            disconnect_event.wait(),
            timeout=settings.max_call_duration_seconds,
        )
    except asyncio.TimeoutError:
        logger.info("agent.max_duration_reached", call_id=call_id)
        await session.say(
            "I'm sorry, we've reached our time limit. Thank you for your time. Goodbye!"
        )
        await asyncio.sleep(2)
    finally:
        logger.info("agent.session_ended", call_id=call_id)
        await _end_call_db(call_id, CallStatus.COMPLETED)


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _wait_for_customer(ctx: JobContext, timeout: float = 60) -> rtc.RemoteParticipant | None:
    """Wait until at least one non-agent participant joins the room."""
    deadline = asyncio.get_event_loop().time() + timeout

    while asyncio.get_event_loop().time() < deadline:
        for participant in ctx.room.remote_participants.values():
            # SIP participants typically have identity "customer" or a phone number
            if participant.identity != "agent":
                return participant
        await asyncio.sleep(0.5)

    return None


def _extract_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(
            item if isinstance(item, str) else (item.text if hasattr(item, "text") else "")
            for item in content
        )
    return str(content)


async def _save_transcript(call_id: str, role: str, text: str) -> None:
    try:
        async for session in get_session():
            await append_transcript_entry(session, call_id, role, text)
            break
    except Exception as exc:
        logger.error("transcript.save_failed", call_id=call_id, error=str(exc))


async def _mark_in_progress(call_id: str) -> None:
    try:
        async for session in get_session():
            await mark_call_answered(session, call_id, answered_by="human")
            break
    except Exception as exc:
        logger.error("call.mark_in_progress_failed", call_id=call_id, error=str(exc))


async def _end_call_db(call_id: str, status: CallStatus) -> None:
    try:
        async for session in get_session():
            # Generate AI summary from transcript before finalising
            summary: str | None = None
            try:
                call = await get_call(session, call_id)
                transcript = call.get_transcript() if call else []
                if transcript:
                    groq = GroqClient(get_settings())
                    summary = await groq.summarise_transcript(
                        call.customer_name, transcript
                    )
                    logger.info("call.summary_generated", call_id=call_id, chars=len(summary))
            except Exception as exc:
                logger.error("call.summary_failed", call_id=call_id, error=str(exc))

            await finalize_call(session, call_id, status=status, summary=summary)
            break
    except Exception as exc:
        logger.error("call.finalize_failed", call_id=call_id, error=str(exc))


# ── Worker startup ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    _s = get_settings()
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="voice-call-agent",
            ws_url=_s.livekit_url,
            api_key=_s.livekit_api_key,
            api_secret=_s.livekit_api_secret,
            num_idle_processes=1,   # default 5 is too heavy for a single container
            load_threshold=0.95,    # raise from 0.7 so startup load doesn't mark FULL
        )
    )
