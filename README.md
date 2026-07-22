# AI Voice Call Agent

An AI-powered voice calling platform: place and receive real phone calls where an AI agent (speech-to-text → LLM → text-to-speech) has a live conversation with the caller.

- **Backend** (`backend/`) — FastAPI server + a LiveKit voice-agent worker
- **Frontend** (`callflow-ui-main/`) — React dashboard for placing calls, viewing transcripts, running bulk campaigns, and configuring credentials

## How it works

```
                    ┌─────────────────────────────┐
                    │      FastAPI Backend         │
                    │  (call management, webhooks, │
                    │   Settings UI API)            │
                    └───────────────┬───────────────┘
                                    │ dispatches
                                    ▼
                    ┌─────────────────────────────┐
                    │   LiveKit Agent Worker        │
                    │  Deepgram STT → Groq LLM      │
                    │       → ElevenLabs TTS        │
                    └───────────────┬───────────────┘
                                    │ SIP
                                    ▼
                    ┌─────────────────────────────┐
                    │   Twilio (SIP trunk)          │
                    └───────────────┬───────────────┘
                                    │ PSTN
                                    ▼
                              Real phone call
```

The backend and the voice agent are two processes talking to the same LiveKit project and the same database — see `backend/docs/ARCHITECTURE.md` for the full breakdown.

## Prerequisites

**Accounts** (all have free tiers to start with):
- [LiveKit Cloud](https://cloud.livekit.io) — hosts the real-time voice agent
- [Twilio](https://twilio.com) — telephony carrier (see [Telephony setup](#telephony-setup) below)
- [Deepgram](https://deepgram.com) — speech-to-text
- [Groq](https://console.groq.com) — LLM inference
- [ElevenLabs](https://elevenlabs.io) — text-to-speech

**Tooling** — either:
- **Docker** + Docker Compose (recommended — one command, nothing else to install), or
- **Python 3.12** and **Node.js 20** for running the two services directly

## Quickstart (Docker Compose — recommended)

```bash
git clone <this-repo-url>
cd "AI Voice Call V1"

cp backend/.env.example backend/.env
# Edit backend/.env with your real API keys (see backend/.env.example for
# what each one does, and the Telephony setup section below).

docker compose up -d --build
```

The frontend is now at `http://localhost` and the backend API at `http://localhost/health` (proxied through the same port). Open the frontend, go to **Settings**, and fill in/verify your credentials there too — the UI writes to the database and takes priority over `.env` on every restart after that point.

If you're deploying to a server (not your own laptop), set `VITE_API_BASE_URL` before building so the frontend knows its own public address:
```bash
VITE_API_BASE_URL=http://your-server-ip docker compose up -d --build
```
(or put `VITE_API_BASE_URL=http://your-server-ip` in a `.env` file next to `docker-compose.yml`).

To stop everything: `docker compose down`. Your call history/database persists in a Docker volume across restarts.

## Quickstart (manual / local dev, no Docker)

**Backend** (see also [backend/README.md](backend/README.md)):
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt

cp .env.example .env
# Edit .env with your real API keys

uvicorn main:app --reload --port 8000
```
This single command also starts the LiveKit agent worker as a child process (`AUTO_START_AGENT=true` by default). Watch the terminal for `registered worker` — that confirms the agent connected to LiveKit successfully.

**Verify the backend is up**, in a second terminal:
```bash
curl http://localhost:8000/health
```
Should return `{"status":"ok", ...}` with every listed service showing `"healthy"`.

**Frontend** (in a third terminal, see also [callflow-ui-main/README.md](callflow-ui-main/README.md)):
```bash
cd callflow-ui-main
npm install
npm run dev
```
Open the URL Vite prints (typically `http://localhost:8080`) — its dev server already proxies API calls to `http://localhost:8000` automatically, no `.env` needed for local dev.

**Run the backend tests** (optional sanity check — no credentials needed, everything's mocked):
```bash
cd backend
pytest tests/ -v
```

## Telephony setup

Twilio is the only telephony carrier this project supports — LiveKit dials out directly through a SIP trunk pointing at your Twilio account.

**Twilio walkthrough** (fastest path to a working setup):
1. Sign up at [twilio.com](https://twilio.com), buy a phone number.
2. Console → **Elastic SIP Trunking → Trunks → Create New Trunk**.
3. **Termination** tab → set a Termination SIP URI (e.g. `yourname.pstn.twilio.com`) — this is your outbound `Address`.
4. Create a **Credential List** (username/password) under Authentication, and associate your number with the trunk under **Numbers**.
5. LiveKit dashboard → **Telephony → SIP trunks → Create new trunk** (Outbound): Address = your Termination URI, Numbers = your Twilio number, Auth Username/Password = your Credential List.
6. Copy the new trunk's ID into `LIVEKIT_SIP_TRUNK_ID` (or the Settings UI's "SIP Trunk ID" field).

For **inbound** (receiving calls on the same number):
1. Find your LiveKit project's SIP URI: LiveKit dashboard → **Telephony → SIP trunks** (shown at the top of that page, e.g. `sip:xxxxx.sip.livekit.cloud`) — this is a per-project value, the same regardless of which trunk you create.
2. Twilio trunk → **Origination** tab → add an Origination URI with `;transport=tcp` appended: `sip:xxxxx.sip.livekit.cloud;transport=tcp`. Without the transport suffix, inbound calls can fail or behave unpredictably.
3. LiveKit dashboard → **Telephony → SIP trunks → Create new trunk** (Inbound): Numbers = your Twilio number.
4. Copy that inbound trunk's ID into `LIVEKIT_INBOUND_SIP_TRUNK_ID` (or the Settings UI's "Inbound SIP Trunk ID" field), then click **Apply Inbound Rule** in the Settings UI (or `POST /call/inbound/setup`) to wire up the agent dispatch.

Two Twilio-side gotchas worth checking if calls fail with a permission/auth error:
- **Trial accounts** cannot use Elastic SIP Trunking at all until upgraded — this is separate from (and in addition to) the "verified caller ID" restriction.
- **Geographic Permissions** (Console → Voice → Settings → Geo Permissions) block calling countries that aren't explicitly enabled, on every account tier — upgrading out of trial does not auto-enable this.

## Known limitations

- LiveKit's hosted "Phone Numbers" product (buy a number directly through LiveKit) currently only supports **inbound** calling — outbound still requires a SIP trunk, even if you also set `LIVEKIT_SIP_NUMBER`.
- The agent's default conversation prompt/personality is hardcoded in `backend/services/livekit/agent.py` (`REAL_ESTATE_PROMPT`) for campaigns/bulk calls. The Live Calls page's "System Prompt" field lets you override it for a single test call without changing this default. `AGENT_INITIAL_GREETING` and `AGENT_VOICEMAIL_MESSAGE` *are* live-configurable via Settings.
- SQLite is fine for a single-instance/POC deployment; for production scale, swap `DATABASE_URL` for Postgres.

## More docs

- [backend/README.md](backend/README.md) — backend-specific setup and testing
- [callflow-ui-main/README.md](callflow-ui-main/README.md) — frontend-specific setup and building
- `backend/docs/ARCHITECTURE.md` — full architectural deep-dive
- `backend/docs/API.md` — API request/response schemas
