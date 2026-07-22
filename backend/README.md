# AI Voice Call Agent — Backend

FastAPI server + LiveKit voice-agent worker: place and receive real phone
calls where an AI agent (Deepgram STT → Groq LLM → ElevenLabs/Sarvam TTS)
has a live conversation with the caller.

For the overall project (including the React frontend) and the fastest way
to get running, see the [root README](../README.md).

## Local development

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt

cp .env.example .env
# Edit .env with your real API keys — see .env.example for what each one
# does, and the root README's Telephony setup section for the Twilio walkthrough.

uvicorn main:app --reload --port 8000
```

This single command also starts the LiveKit agent worker as a child process
(`AUTO_START_AGENT=true` by default). Watch for `registered worker` in the
logs — that confirms the agent connected to LiveKit successfully.

## Tests

```bash
pytest tests/ -v
```

Tests mock all external services and set their own dummy credentials via a
fixture — no real `.env` or API keys required. They run fully isolated even
if a real `backend/.env` happens to exist alongside them.

## More docs

- [docs/README.md](docs/README.md) — API overview, tech stack, production notes
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — full architectural deep-dive
- [docs/API.md](docs/API.md) — request/response schemas
