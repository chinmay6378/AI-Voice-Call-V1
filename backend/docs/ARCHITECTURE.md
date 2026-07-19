# Architecture Deep-Dive

## System Overview

The backend consists of two cooperating processes:

```
┌─────────────────────────────────┐    ┌──────────────────────────────────┐
│       FastAPI Server             │    │       LiveKit Agent Worker        │
│       (main.py)                  │    │  (services/livekit/agent.py)      │
│                                  │    │                                    │
│  REST API  ◄── HTTP ── Clients   │    │  Subscribes to LiveKit job queue   │
│                                  │    │  Runs VoicePipelineAgent per call  │
│  Depends on:                     │    │  Depends on:                       │
│  • SQLAlchemy (async)            │    │  • livekit-agents framework        │
│  • LiveKit room manager          │    │  • Deepgram STT plugin             │
│  • Groq (post-call summary)      │    │  • Groq LLM (OpenAI-compat)       │
│                                  │    │  • ElevenLabs TTS plugin           │
│                                  │    │  • Silero VAD                      │
└──────────────┬──────────────────┘    └──────────────┬───────────────────┘
               │                                        │
               │  Both connect to LiveKit Cloud         │
               └──────────────┬─────────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │   LiveKit Cloud     │
                    │                     │
                    │  Rooms + SIP bridge │
                    └─────────┬───────────┘
                              │ SIP
                    ┌─────────▼───────────┐
                    │       Twilio         │
                    │                     │
                    │  SIP trunk / PSTN   │
                    └─────────┬───────────┘
                              │ PSTN
                    ┌─────────▼───────────┐
                    │  Customer's Phone   │
                    └─────────────────────┘
```

---

## Call Flow — Sequence Diagram

```
Client          FastAPI         LiveKit (Twilio trunk)     Agent Worker    Customer
  │                │                    │                       │              │
  │ POST /start    │                    │                       │              │
  │───────────────►│                    │                       │              │
  │                │ create_room()      │                       │              │
  │                │───────────────────►│                       │              │
  │                │ ◄──────────────────│                       │              │
  │                │ save Call(PENDING) │                       │              │
  │                │ dispatch_agent()   │                       │              │
  │                │───────────────────►│                       │              │
  │                │ ◄──── dispatch_id ─│                       │              │
  │                │                    │  job dispatch          │              │
  │                │                    │───────────────────────►│              │
  │ 201 call_id    │                    │                       │              │
  │◄───────────────│                    │                       │              │
  │                │ create_sip_participant() (background task) │              │
  │                │───────────────────►│                       │              │
  │                │                    │ dial via Twilio trunk (ringing)      │
  │                │                    │──────────────────────────────────────►
  │                │                    │  sip.callStatus = active (answered)  │
  │                │◄───────────────────│                       │              │
  │                │ update_call_sid()  │                       │              │
  │                │                    │ Customer SIP participant joins       │
  │                │                    │───────────────────────►              │
  │                │                    │  agent connects to room               │
  │                │                    │◄──────────────────────│              │
  │                │                    │  greeting TTS          │              │
  │                │                    │───────────────────────────────────────►
  │                │                    │                       │  "Hello..."   │
  │                │                    │                       │  STT stream  │
  │                │                    │◄──────────────────────────────────────│
  │                │                    │                       │  "Hi there"   │
  │                │                    │  → Deepgram → Groq → ElevenLabs      │
  │                │                    │                       │ TTS response  │
  │                │                    │───────────────────────────────────────►
  │                │                    │                       │   ...         │
  │                │                    │  customer hangs up    │              │
  │                │ generate summary (Groq)                    │              │
  │                │ finalize_call(COMPLETED)                    │              │
```

---

## Module Structure

```
backend/
│
├── main.py                    # FastAPI app + lifespan (starts agent worker subprocess)
│
├── config/
│   └── settings.py            # Pydantic BaseSettings — all env vars in one place
│
├── api/
│   └── routes/
│       ├── calls.py           # REST endpoints: /call/start, /call/end, /call/status, etc.
│       ├── inbound.py         # Inbound config CRUD + call history
│       ├── bulk.py            # Bulk campaign upload/management
│       └── settings_routes.py # Settings UI's persisted API keys/config
│
├── services/
│   ├── livekit/
│   │   ├── room_manager.py    # Room create, agent dispatch, SIP participant, token gen
│   │   └── agent.py           # LiveKit worker process — VoiceCallAgent + entrypoint
│   │
│   ├── deepgram/
│   │   └── stt.py             # Standalone Deepgram client (pre-recorded / URL transcription)
│   │
│   ├── llm/
│   │   └── groq_client.py     # Groq (OpenAI-compat) — completions + transcript summary
│   │
│   └── tts/
│       └── elevenlabs_client.py # Standalone ElevenLabs (voicemail pre-gen, one-shot TTS)
│
├── database/
│   ├── models/call.py         # SQLAlchemy ORM — Call table with helpers
│   ├── schemas/call.py        # Pydantic v2 request/response schemas
│   └── repository.py          # All DB operations (create, read, update, finalize)
│
├── utils/
│   └── logger.py              # structlog JSON logging setup
│
└── tests/
    └── test_calls.py          # pytest + anyio tests (mocked externals)
```

---

## Key Design Decisions

### 1. Two-Process Architecture
The FastAPI server and the LiveKit agent worker must run separately because:
- LiveKit's `cli.run_app()` manages its own event loop.
- The agent worker maintains a persistent WebSocket connection to LiveKit.
- Separating them allows independent scaling and restarts.

In the POC, `AUTO_START_AGENT=true` spawns the worker as a child process for convenience.

### 2. In-Band Voicemail/IVR Detection
Rather than relying on carrier-side answering-machine detection, the agent listens to the first few seconds of live transcribed speech (`_VOICEMAIL_PHRASES` / `_IVR_PHRASES` in `agent.py`) and reacts accordingly — no separate AMD callback or webhook round-trip needed.

### 3. Explicit Agent Dispatch
Instead of relying on automatic room-based dispatch, we use `AgentDispatch.create_dispatch()` with metadata. This ensures:
- The agent knows which call_id it's handling.
- Metadata (customer name, phone) is injected without a separate DB lookup.
- The dispatch is tied to the specific room created for this call.

### 4. One Active Call Constraint
The `/call/start` endpoint checks for active calls before proceeding. This enforces the POC's single-call constraint at the API level, making the limit explicit and testable.

### 5. Async SQLAlchemy
All database operations use SQLAlchemy 2.0 async sessions with `aiosqlite`. This means:
- No blocking I/O on the FastAPI event loop.
- Easy migration to PostgreSQL (change `DATABASE_URL` to `postgresql+asyncpg://...`).

---

## Security Considerations

- **No hardcoded secrets** — all credentials via environment variables.
- **Input validation** — phone numbers validated as E.164; all inputs go through Pydantic.
- **Non-root Docker** — Dockerfile creates a non-root `appuser`.
- **CORS** — currently `allow_origins=["*"]` for development; restrict in production.

---

## Scaling Beyond V1

| Feature | Approach |
|---------|----------|
| Multiple concurrent calls | Switch from one-call guard to call pool; add Redis for distributed state |
| PostgreSQL | Change `DATABASE_URL` to `postgresql+asyncpg://...` |
| Multiple agent workers | Deploy N agent worker containers; LiveKit distributes dispatches |
| Observability | Structured logs → OpenTelemetry → Datadog / Grafana |
| Call recording | Use LiveKit's room recording/egress API; store URL in DB |
| Retry failed calls | Add Celery/ARQ task queue with exponential backoff |
