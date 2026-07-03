# AI Voice Call Agent — Backend POC

A production-quality backend for making **AI-powered outbound phone calls**.  
One call at a time. No frontend required.

---

## What It Does

1. You POST a customer name and phone number.
2. The backend dials the customer via **SignalWire SIP**.
3. **Answering machine detection (AMD)** runs automatically:
   - **Human answers** → conversation starts with your AI agent.
   - **Voicemail detected** → a pre-recorded (or TTS) message is left.
4. The AI agent:
   - Streams audio through **LiveKit**.
   - Transcribes speech in real time with **Deepgram**.
   - Generates natural responses with **Groq (Llama 3.3 70B)**.
   - Speaks back using **ElevenLabs** streaming TTS.
5. The full transcript, call status, and logs are stored in **SQLite**.

---

## Quick Start

```bash
# 1. Clone / enter the backend directory
cd backend

# 2. Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env
# Edit .env with your real API credentials

# 5. Expose localhost for SignalWire webhooks (dev only)
ngrok http 8000
# Copy the https URL into APP_BASE_URL in .env

# 6. Start the server (also auto-starts the agent worker)
uvicorn main:app --reload --port 8000
```

See [SETUP.md](SETUP.md) for detailed credential setup instructions.

---

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/call/start` | Initiate outbound AI call |
| `POST` | `/call/end/{call_id}` | Hang up an active call |
| `GET`  | `/call/status/{call_id}` | Poll call status |
| `GET`  | `/call/transcript/{call_id}` | Full conversation transcript |
| `GET`  | `/call/logs/{call_id}` | Event log |
| `GET`  | `/calls/active` | Currently active call |
| `GET`  | `/health` | Health check |
| `GET`  | `/docs` | Interactive Swagger UI |

See [API.md](API.md) for full request/response schemas.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     FastAPI Server                          │
│  POST /call/start                                          │
│       │                                                     │
│       ├─ 1. Create LiveKit room                             │
│       ├─ 2. Persist Call record (SQLite)                    │
│       ├─ 3. Dispatch agent worker to room                   │
│       └─ 4. Tell SignalWire to dial customer                │
│                                                             │
│  POST /webhooks/swml/{call_id}  ← SignalWire calls this     │
│       └─ Returns SWML: detect AMD → route to LiveKit SIP    │
│                                                             │
│  POST /webhooks/amd/{call_id}   ← AMD result callback       │
│  POST /webhooks/status/{call_id} ← call lifecycle updates   │
└─────────────────────────────────────────────────────────────┘
         │
         ▼ SignalWire dials customer via PSTN
┌────────────────────┐
│   Customer Phone   │
└────────┬───────────┘
         │ SIP / PSTN
         ▼
┌─────────────────────────────────────────────────────────────┐
│                      LiveKit Room                           │
│                                                             │
│  Customer SIP participant ◄──────► AI Agent participant     │
│                                          │                  │
│                               ┌──────────┴──────────┐      │
│                               │   Voice Pipeline     │      │
│                               │                      │      │
│                          Deepgram STT                │      │
│                               │                      │      │
│                          Groq LLM                    │      │
│                          (Llama 3.3 70B)             │      │
│                               │                      │      │
│                          ElevenLabs TTS              │      │
│                               └──────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full architectural deep-dive.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Web framework | FastAPI 0.115+ |
| Runtime | Python 3.12, asyncio |
| Telephony | SignalWire SIP + SWML |
| Real-time audio | LiveKit Agents 0.11+ |
| Speech-to-text | Deepgram nova-2 |
| Language model | Groq / Llama 3.3 70B |
| Text-to-speech | ElevenLabs Turbo v2.5 |
| Database | SQLite + SQLAlchemy 2.0 async |
| Logging | structlog |

---

## Running Tests

```bash
cd backend
pytest tests/ -v
```

Tests mock all external services — no credentials required.

---

## Production Notes

- Replace SQLite with PostgreSQL for multi-instance deployments.
- Run the API server and agent worker as separate containers/processes.
- Use a proper secrets manager (AWS Secrets Manager, Vault) instead of .env.
- Put the API behind a reverse proxy (nginx / Caddy) with TLS.
- Configure SignalWire webhook authentication (X-SignalWire-Signature) for security.
