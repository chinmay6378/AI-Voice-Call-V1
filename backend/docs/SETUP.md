# Setup Guide — SignalWire (Option B)

This guide covers the **SignalWire** telephony path in detail (`TELEPHONY_PROVIDER=signalwire`).
For the recommended LiveKit-native SIP path (works with Twilio, Telnyx, etc.), see the
[root README's Telephony setup section](../../README.md#telephony-setup) instead — it's simpler
and doesn't need a public webhook URL.

---

## Prerequisites

- Python 3.12+
- A **SignalWire** account with a phone number
- A **LiveKit Cloud** account (or self-hosted LiveKit server)
- A **Deepgram** account
- A **Groq** account
- An **ElevenLabs** account
- `ngrok` (for local development — SignalWire needs a public URL to POST webhooks to)

---

## Step 1 — Install

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

---

## Step 2 — SignalWire Setup

### 2a. Create Account
Sign up at [signalwire.com](https://signalwire.com).

### 2b. Get Credentials
Dashboard → Settings → API:
- **Project ID** → `SIGNALWIRE_PROJECT_ID`
- **API Token** → `SIGNALWIRE_API_TOKEN`
- **Space URL** → `SIGNALWIRE_SPACE_URL` (e.g., `myspace.signalwire.com`)

### 2c. Buy a Phone Number
Phone Numbers → Buy a number. This becomes `SIGNALWIRE_FROM_NUMBER`.

No further per-number configuration is needed — the SWML webhook URL is passed
per-call by the backend when it dials out, so nothing needs to be set on the
number itself for outbound calling.

---

## Step 3 — LiveKit Setup

### 3a. Create Project
Sign up at [livekit.io](https://livekit.io) and create a new project.

### 3b. Get API Credentials
Dashboard → Settings → API Keys:
- **URL** → `LIVEKIT_URL` (e.g., `wss://myproject.livekit.cloud`)
- **API Key** → `LIVEKIT_API_KEY`
- **API Secret** → `LIVEKIT_API_SECRET`

### 3c. Get the Inbound SIP URI

This is the domain SignalWire's SWML `connect` verb bridges the answered call into.

1. Dashboard → **Telephony → SIP trunks** → your inbound trunk (create one if you
   don't have one — direction Inbound, Numbers can be left blank to accept any).
2. Copy its SIP URI → `LIVEKIT_SIP_URI` (e.g. `xxxx.sip.livekit.cloud`).

The backend creates a temporary, per-call SIP dispatch rule automatically before
each SignalWire call is dialed — you don't need to create dispatch rules manually
for this path.

**Known caveat:** getting SignalWire's `connect` verb to successfully bridge into
an arbitrary external SIP domain can run into carrier-side restrictions that
aren't visible from either dashboard (we hit this in practice — the call
connects and completes normally on SignalWire's side, but no participant ever
reaches the LiveKit room). If calls fail silently this way after following this
guide correctly, it's worth confirming with SignalWire support whether your
account needs a "SIP Gateway" resource registered for the destination domain
rather than a bare `sip:` URI in the connect verb.

---

## Step 4 — Deepgram Setup

1. Sign up at [deepgram.com](https://deepgram.com)
2. Dashboard → API Keys → Create Key
3. Copy key → `DEEPGRAM_API_KEY`

---

## Step 5 — Groq Setup

1. Sign up at [console.groq.com](https://console.groq.com)
2. API Keys → Create API Key
3. Copy key → `GROQ_API_KEY`

Default model: `llama-3.3-70b-versatile` — fast and high quality.

---

## Step 6 — ElevenLabs Setup

1. Sign up at [elevenlabs.io](https://elevenlabs.io)
2. Profile → API Key → Copy → `ELEVENLABS_API_KEY`
3. Browse voices at Voice Library → copy the Voice ID → `ELEVENLABS_VOICE_ID`
   (Default: Rachel = `21m00Tcm4TlvDq8ikWAM`)

---

## Step 7 — Expose Webhooks (Development)

SignalWire needs a public URL to POST webhooks to. Use `ngrok`:

```bash
ngrok http 8000
```

Copy the `https://xxxx.ngrok.io` URL into `.env`:
```
APP_BASE_URL=https://xxxx.ngrok.io
```

For production, this should be your real public domain/IP instead.

---

## Step 8 — Start the Application

```bash
# Also spawns the agent worker automatically (AUTO_START_AGENT=true default)
uvicorn main:app --reload --port 8000

# OR manage the two processes yourself:
# Terminal 1
AUTO_START_AGENT=false uvicorn main:app --reload --port 8000
# Terminal 2
python -m services.livekit.agent start
```

Confirm `TELEPHONY_PROVIDER=signalwire` in `.env` (or the Settings UI's Active
Provider dropdown) — otherwise calls will silently use the LiveKit-native path
instead and none of the SignalWire webhook code will run.

---

## Step 9 — Make a Test Call

```bash
curl -X POST http://localhost:8000/call/start \
  -H "Content-Type: application/json" \
  -d '{"customer_name": "John Doe", "phone_number": "+15551234567"}'
```

Response:
```json
{
  "call_id": "uuid-here",
  "status": "dialing",
  "message": "Outbound call to +15551234567 initiated via signalwire. call_id=uuid-here"
}
```

Check status:
```bash
curl http://localhost:8000/call/status/{call_id}
```

View transcript after the call:
```bash
curl http://localhost:8000/call/transcript/{call_id}
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `signalwire.call_failed` | Check Project ID, API Token, Space URL, From Number |
| `livekit.create_room_failed` | Check LiveKit URL, API Key, Secret |
| `livekit.dispatch_failed` | Agent worker may not be running; check `registered worker` appeared in logs |
| Call connects/completes on SignalWire but agent never speaks | The SIP bridge into LiveKit never produced a room participant — see the caveat in Step 3c |
| No audio from agent | Check Deepgram + ElevenLabs + Groq API keys |
| `TELEPHONY_PROVIDER` seems ignored | It defaults to `livekit_sip` if unset or misspelled — confirm it's exactly `signalwire` |
