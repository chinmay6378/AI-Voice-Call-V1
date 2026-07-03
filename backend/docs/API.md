# API Reference

Base URL: `http://localhost:8000` (development)

Interactive docs: `http://localhost:8000/docs` (Swagger UI)

---

## POST /call/start

Initiate an outbound AI phone call.

**Request body** (JSON):
```json
{
  "customer_name": "John Doe",
  "phone_number": "+15551234567"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `customer_name` | string | ✓ | Customer's display name (used in greeting) |
| `phone_number` | string | ✓ | E.164 format (e.g., `+15551234567`) |

**Response 201**:
```json
{
  "call_id": "3f7a2b1c-...",
  "status": "dialing",
  "message": "Outbound call to +15551234567 initiated. call_id=3f7a2b1c-..."
}
```

**Error 409** — a call is already in progress:
```json
{
  "detail": "A call is already active: abc-123 (in_progress). End it before starting a new one."
}
```

**Error 502** — external service failure (SignalWire / LiveKit):
```json
{
  "detail": "Failed to initiate call via SignalWire: ..."
}
```

---

## POST /call/end/{call_id}

Terminate an active call.

**Path params**: `call_id` — UUID returned by `/call/start`

**Request body** (optional JSON):
```json
{
  "reason": "manual"
}
```

**Response 200**:
```json
{
  "call_id": "3f7a2b1c-...",
  "customer_name": "John Doe",
  "phone_number": "+15551234567",
  "status": "cancelled",
  ...
}
```

---

## GET /call/status/{call_id}

Poll the current status of a call.

**Response 200**:
```json
{
  "call_id": "3f7a2b1c-...",
  "customer_name": "John Doe",
  "phone_number": "+15551234567",
  "status": "in_progress",
  "answered_by": "human",
  "signalwire_call_sid": "CA1234567890abcdef",
  "livekit_room_name": "call-3f7a2b1c",
  "created_at": "2026-01-15T10:30:00Z",
  "start_time": "2026-01-15T10:30:01Z",
  "answer_time": "2026-01-15T10:30:08Z",
  "end_time": null,
  "duration_seconds": null,
  "error_message": null
}
```

### Call Status Values

| Status | Description |
|--------|-------------|
| `pending` | Call record created, not yet dialled |
| `dialing` | SignalWire is placing the call |
| `ringing` | Customer's phone is ringing |
| `in_progress` | Human answered, AI conversation active |
| `voicemail` | AMD detected answering machine; voicemail left |
| `completed` | Call ended normally |
| `no_answer` | Nobody picked up |
| `busy` | Customer line was busy |
| `failed` | Technical failure |
| `cancelled` | Manually ended via `/call/end` |

---

## GET /call/transcript/{call_id}

Get the full conversation transcript.

**Response 200**:
```json
{
  "call_id": "3f7a2b1c-...",
  "customer_name": "John Doe",
  "status": "completed",
  "transcript": [
    {
      "role": "agent",
      "text": "Hello John! I'm calling to discuss...",
      "timestamp": "2026-01-15T10:30:08Z"
    },
    {
      "role": "customer",
      "text": "Yes, go ahead.",
      "timestamp": "2026-01-15T10:30:12Z"
    }
  ],
  "summary": "The agent introduced the service. John was receptive and asked for a follow-up email."
}
```

---

## GET /call/logs/{call_id}

Get the event log for a call.

**Response 200**:
```json
{
  "call_id": "3f7a2b1c-...",
  "logs": [
    {"event": "call.created", "timestamp": "2026-01-15T10:30:00Z", "customer_name": "John Doe"},
    {"event": "call.dialing", "timestamp": "2026-01-15T10:30:01Z", "status": "dialing"},
    {"event": "webhook.swml_received", "timestamp": "2026-01-15T10:30:05Z", "call_status": "in-progress"},
    {"event": "amd.result", "timestamp": "2026-01-15T10:30:06Z", "answered_by": "human"},
    {"event": "call.answered", "timestamp": "2026-01-15T10:30:08Z", "status": "in_progress"},
    {"event": "call.ended", "timestamp": "2026-01-15T10:35:22Z", "status": "completed", "duration_seconds": 314}
  ]
}
```

---

## GET /calls/active

Get the currently active call (if any).

**Response 200** — active call exists:
```json
{
  "call_id": "...",
  "status": "in_progress",
  ...
}
```

**Response 200** — no active call:
```json
null
```

---

## GET /health

Health check endpoint.

**Response 200**:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "active_calls": 0
}
```

---

## Webhook Endpoints (SignalWire → Backend)

These are called by SignalWire, not by your application code.

### POST /webhooks/swml/{call_id}
Returns SWML JSON that controls call routing (AMD → LiveKit SIP).

### POST /webhooks/amd/{call_id}
Receives async AMD result. Updates DB and handles machine detection.

### POST /webhooks/status/{call_id}
Receives call lifecycle status updates from SignalWire.
Triggers call summary generation on completion.
