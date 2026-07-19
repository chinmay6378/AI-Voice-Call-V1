# AI Voice Call Agent — Backend

The FastAPI server + LiveKit voice-agent worker that power outbound and inbound
AI phone calls. For the overall project (including the React frontend) and the
fastest way to get running, see the [root README](../../README.md).

---

## What It Does

1. You POST a customer name and phone number (or use the web UI).
2. The backend dials out via **LiveKit-native SIP**, through a SIP trunk pointing
   at your Twilio account.
3. A **LiveKit agent worker** joins the call once it's genuinely answered and:
   - Transcribes speech in real time with **Deepgram**.
   - Generates responses with **Groq** (Llama 3.3 70B, OpenAI-compatible API).
   - Speaks back using **ElevenLabs** streaming TTS.
   - Detects voicemail/IVR from live transcribed speech and reacts accordingly.
4. Inbound calls to a configured number are auto-dispatched to the same agent
   via a LiveKit SIP dispatch rule — no manual intervention needed per call.
5. The full transcript, call status, and event log are stored in SQLite (or
   Postgres, via `DATABASE_URL`).

See the root README's [Telephony setup](../../README.md#telephony-setup) section
for the full Twilio walkthrough.

---

## Quick Start

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env with your real API credentials

uvicorn main:app --reload --port 8000
```
This also auto-starts the LiveKit agent worker as a child process
(`AUTO_START_AGENT=true` by default) — watch for `registered worker` in the logs.

See the root README's [Telephony setup](../../README.md#telephony-setup) section
for the Twilio walkthrough.

---

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/call/start` | Initiate outbound AI call |
| `POST` | `/call/end/{call_id}` | Hang up an active call |
| `GET`  | `/call/status/{call_id}` | Poll call status |
| `GET`  | `/call/transcript/{call_id}` | Full conversation transcript |
| `GET`  | `/call/logs/{call_id}` | Event log |
| `POST` | `/call/inbound/setup` | (Re)create the inbound SIP dispatch rule |
| `GET`  | `/calls` / `/calls/active` | List calls / currently active call |
| `GET`  | `/settings/keys` / `POST /settings/keys` | Read/write DB-persisted config (used by the Settings UI) |
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
│       └─ 4. Dial the customer via LiveKit SIP (Twilio trunk) │
│                                                             │
│  POST /call/inbound/setup ← one-time inbound rule setup     │
└─────────────────────────────────────────────────────────────┘
         │
         ▼ dials customer via PSTN
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
| Web framework | FastAPI |
| Runtime | Python 3.12, asyncio |
| Telephony | LiveKit SIP → Twilio trunk |
| Real-time audio | LiveKit Agents |
| Speech-to-text | Deepgram nova-2 |
| Language model | Groq / Llama 3.3 70B |
| Text-to-speech | ElevenLabs Turbo v2.5 |
| Database | SQLite (default) or Postgres, via SQLAlchemy 2.0 async |
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
- The included `Dockerfile`/`start.sh` already run the API server and agent
  worker as a supervised pair inside one container (if either process dies,
  the container exits so `restart: unless-stopped` brings both back).
- Use a proper secrets manager (AWS Secrets Manager, Vault) instead of `.env`
  for production credentials.
- Put the API behind a reverse proxy (the included `docker-compose.yml` uses
  Nginx via the frontend container) with TLS in front of it.
