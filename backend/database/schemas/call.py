"""Pydantic v2 request/response schemas for call-related endpoints."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from database.models.call import CallStatus, AnsweredBy


# ── Request schemas ───────────────────────────────────────────────────────────

class StartCallRequest(BaseModel):
    customer_name: str = Field(..., min_length=1, max_length=255, examples=["John Doe"])
    phone_number: str = Field(..., examples=["+15551234567"])

    @field_validator("phone_number")
    @classmethod
    def validate_e164(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith("+") or not v[1:].isdigit() or not (7 <= len(v) <= 16):
            raise ValueError("phone_number must be in E.164 format (e.g. +15551234567)")
        return v


class EndCallRequest(BaseModel):
    reason: str = Field(default="manual", examples=["manual", "timeout"])


# ── Response schemas ──────────────────────────────────────────────────────────

class CallStartedResponse(BaseModel):
    call_id: str
    status: CallStatus
    message: str


class TranscriptEntry(BaseModel):
    role: str
    text: str
    timestamp: datetime


class CallStatusResponse(BaseModel):
    call_id: str
    customer_name: str
    phone_number: str
    status: CallStatus
    answered_by: AnsweredBy | None = None
    signalwire_call_sid: str | None = None
    livekit_room_name: str | None = None
    created_at: datetime
    start_time: datetime | None = None
    answer_time: datetime | None = None
    end_time: datetime | None = None
    duration_seconds: int | None = None
    error_message: str | None = None

    model_config = {"from_attributes": True}


class CallTranscriptResponse(BaseModel):
    call_id: str
    customer_name: str
    status: CallStatus
    transcript: list[dict[str, Any]]
    summary: str | None = None

    model_config = {"from_attributes": True}


class CallLogResponse(BaseModel):
    call_id: str
    logs: list[dict[str, Any]]

    model_config = {"from_attributes": True}


class ServiceStatus(BaseModel):
    name: str
    description: str
    status: str  # "healthy" | "unconfigured"
    latency: str = "—"


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "1.0.0"
    active_calls: int = 0
    services: list[ServiceStatus] = []
