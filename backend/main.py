"""
AI Voice Call Backend — FastAPI application entry point.

Processes:
  1. FastAPI server   — REST API + SignalWire webhooks (this file)
  2. Agent worker     — LiveKit agent (services/livekit/agent.py)

Run in development:
  # Terminal 1 — API server
  uvicorn main:app --reload --port 8000

  # Terminal 2 — Agent worker
  python -m services.livekit.agent start

Both processes read the same .env file.
"""
from __future__ import annotations

import os
import subprocess
import sys

from dotenv import load_dotenv
load_dotenv()  # populate os.environ from .env so subprocesses inherit all vars
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.routes.bulk import router as bulk_router
from api.routes.calls import router as call_router, _active_router as active_router
from api.routes.webhooks import router as webhook_router
from config.settings import get_settings
from database.repository import close_db, init_db
from services.campaign_runner import resume_running_campaigns
from database.schemas.call import HealthResponse, ServiceStatus
from utils.logger import configure_logging, get_logger

settings = get_settings()
configure_logging(settings.log_level)
logger = get_logger(__name__)

_agent_proc: subprocess.Popen | None = None  # type: ignore[type-arg]


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    global _agent_proc

    logger.info("app.starting", base_url=settings.app_base_url)

    # Initialise database
    await init_db(settings.database_url)

    # Optionally auto-start the agent worker as a sibling process.
    # Set AUTO_START_AGENT=false to manage the worker yourself.
    if os.getenv("AUTO_START_AGENT", "true").lower() == "true":
        agent_module = os.path.join(os.path.dirname(__file__), "services", "livekit", "agent.py")
        if os.path.exists(agent_module):
            logger.info("agent_worker.starting", module=agent_module)
            _agent_proc = subprocess.Popen(
                [sys.executable, agent_module, "start"],
                env={**os.environ},
                stdout=sys.stdout,
                stderr=sys.stderr,
            )
            logger.info("agent_worker.started", pid=_agent_proc.pid)
        else:
            logger.warning("agent_worker.not_found", path=agent_module)

    resume_running_campaigns(settings)
    logger.info("app.ready", host=settings.app_host, port=settings.app_port)
    yield

    # Shutdown
    if _agent_proc and _agent_proc.poll() is None:
        logger.info("agent_worker.stopping", pid=_agent_proc.pid)
        _agent_proc.terminate()
        try:
            _agent_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _agent_proc.kill()

    await close_db()
    logger.info("app.stopped")


# ── Application factory ───────────────────────────────────────────────────────

app = FastAPI(
    title="AI Voice Call Agent",
    description=(
        "Backend for making AI-powered outbound phone calls using "
        "SignalWire SIP, LiveKit, Deepgram STT, Groq LLM, and ElevenLabs TTS."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Allow all origins in dev — tighten in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────

app.include_router(call_router)
app.include_router(active_router)
app.include_router(webhook_router)
app.include_router(bulk_router)


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health() -> HealthResponse:
    """Health check — returns 200 if the server is running."""
    from database.repository import get_session
    from database.repository import get_active_call as _get_active

    active_count = 0
    try:
        async for db in get_session():
            call = await _get_active(db)
            active_count = 1 if call else 0
            break
    except Exception:
        pass

    def svc(name: str, description: str, configured: bool) -> ServiceStatus:
        return ServiceStatus(
            name=name,
            description=description,
            status="healthy" if configured else "unconfigured",
        )

    services = [
        svc("Backend API", "FastAPI orchestration service", True),
        svc("LiveKit", "Realtime media transport", bool(settings.livekit_api_key)),
        svc("Deepgram", "Speech-to-text transcription", bool(settings.deepgram_api_key)),
        svc("Groq", "LLM inference for dialogue", bool(settings.groq_api_key)),
        svc("ElevenLabs", "Text-to-speech synthesis", bool(settings.elevenlabs_api_key)),
        svc("Vobiz SIP Trunk", "Indian telephony SIP trunk", bool(settings.livekit_sip_trunk_id)),
    ]

    return HealthResponse(active_calls=active_count, services=services)


@app.exception_handler(Exception)
async def global_exception_handler(request, exc: Exception) -> JSONResponse:
    logger.error("unhandled_exception", path=request.url.path, error=str(exc), exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": str(exc)},
    )


# ── Dev entrypoint ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )
