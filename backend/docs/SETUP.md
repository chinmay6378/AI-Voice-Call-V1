# Setup Guide

Complete step-by-step guide to getting all credentials and running the system.

---

## Prerequisites

- Python 3.12+
- A **SignalWire** account with a phone number
- A **LiveKit Cloud** account (or self-hosted LiveKit server)
- A **Deepgram** account
- A **Groq** account
- An **ElevenLabs** account
- `ngrok` (for local development webhook exposure)

---

## Step 1 — Clone and Install

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
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

### 2d. Configure the Number (Optional)
For the POC the number just needs to be owned by your project.
SignalWire will call your SWML webhook URL when outbound calls connect.

---

## Step 3 — LiveKit Setup

### 3a. Create Project
Sign up at [livekit.io](https://livekit.io) and create a new project.

### 3b. Get API Credentials
Dashboard → Settings → API Keys:
- **URL** → `LIVEKIT_URL` (e.g., `wss://myproject.livekit.cloud`)
- **API Key** → `LIVEKIT_API_KEY`
- **API Secret** → `LIVEKIT_API_SECRET`

### 3c. Configure SIP (Required for Phone Calls)

LiveKit SIP bridges the PSTN call from SignalWire into a LiveKit room.

**Create a SIP Trunk:**
1. Dashboard → SIP → Trunks → New Trunk
2. Set the outbound/inbound SIP credentials to your SignalWire SIP gateway:
   - SIP Server: `sip.signalwire.com` (or your space's SIP domain)
   - Auth Username: `SIGNALWIRE_SIP_USERNAME`
   - Auth Password: `SIGNALWIRE_SIP_PASSWORD`
3. Copy the **Trunk ID** → `LIVEKIT_SIP_TRUNK_ID`

**Get Inbound SIP URI:**
1. Dashboard → SIP → Inbound
2. Copy the SIP URI domain → `LIVEKIT_SIP_URI`
   (e.g., `xxxx.pstn.livekit.cloud`)

**Create a Dispatch Rule:**
1. Dashboard → SIP → Dispatch Rules → New Rule
2. Rule type: "Direct to room"
3. Room prefix: `call-`
4. This routes `sip:call-XXXX@livekit-sip-domain` to room `call-XXXX`

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

---

## Step 8 — Start the Application

```bash
# Terminal 1 — API Server (also spawns agent worker automatically)
uvicorn main:app --reload --port 8000

# OR manage processes separately:
# Terminal 1 — API Server
AUTO_START_AGENT=false uvicorn main:app --reload --port 8000

# Terminal 2 — Agent Worker  
python -m services.livekit.agent start
```

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
  "message": "Outbound call to +15551234567 initiated."
}
```

Check status:
```bash
curl http://localhost:8000/call/status/{call_id}
```

View transcript after call:
```bash
curl http://localhost:8000/call/transcript/{call_id}
```

---

## Docker Deployment

```bash
# Build
docker build -t ai-voice-agent ./backend

# Run
docker run -p 8000:8000 \
  --env-file backend/.env \
  -v $(pwd)/data:/app/data \
  ai-voice-agent
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `signalwire.call_failed` | Check Project ID, API Token, Space URL, From Number |
| `livekit.create_room_failed` | Check LiveKit URL, API Key, Secret |
| `livekit.dispatch_failed` | Agent worker may not be running; check logs |
| SWML webhook not fired | Check APP_BASE_URL is publicly accessible (ngrok) |
| No audio from agent | Check Deepgram + ElevenLabs + Groq API keys |
| Call goes to voicemail always | AMD may be mis-detecting; try `AMD_TIMEOUT_SECONDS=45` |
