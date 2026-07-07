"""SQLAlchemy ORM models for call records."""
import json
from datetime import datetime
from enum import Enum

from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class CallStatus(str, Enum):
    PENDING = "pending"
    DIALING = "dialing"
    RINGING = "ringing"
    IN_PROGRESS = "in_progress"
    VOICEMAIL = "voicemail"
    COMPLETED = "completed"
    FAILED = "failed"
    NO_ANSWER = "no_answer"
    BUSY = "busy"
    CANCELLED = "cancelled"


class AnsweredBy(str, Enum):
    HUMAN = "human"
    MACHINE = "machine"
    UNKNOWN = "unknown"
    FAXMACHINE = "fax"


class Call(Base):
    __tablename__ = "calls"

    # Identity
    id = Column(String(36), primary_key=True)
    customer_name = Column(String(255), nullable=False)
    phone_number = Column(String(20), nullable=False)

    # Status
    status = Column(String(20), nullable=False, default=CallStatus.PENDING)
    answered_by = Column(String(20), nullable=True)

    # External references
    signalwire_call_sid = Column(String(100), nullable=True, index=True)
    livekit_room_name = Column(String(100), nullable=True)
    livekit_dispatch_id = Column(String(100), nullable=True)

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    start_time = Column(DateTime, nullable=True)
    answer_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)

    # Conversation data (stored as JSON text)
    transcript_json = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)

    # Direction
    direction = Column(String(10), nullable=False, default="outbound")

    # Diagnostics
    error_message = Column(Text, nullable=True)
    call_logs_json = Column(Text, nullable=True)   # list of log entry dicts

    # ── helpers ──────────────────────────────────────────────────────────────

    def get_transcript(self) -> list[dict]:
        if not self.transcript_json:
            return []
        return json.loads(self.transcript_json)

    def set_transcript(self, entries: list[dict]) -> None:
        self.transcript_json = json.dumps(entries)

    def append_transcript(self, role: str, text: str) -> None:
        entries = self.get_transcript()
        entries.append({"role": role, "text": text, "timestamp": datetime.utcnow().isoformat()})
        self.set_transcript(entries)

    def get_logs(self) -> list[dict]:
        if not self.call_logs_json:
            return []
        return json.loads(self.call_logs_json)

    def append_log(self, event: str, data: dict | None = None) -> None:
        logs = self.get_logs()
        logs.append(
            {
                "event": event,
                "timestamp": datetime.utcnow().isoformat(),
                **(data or {}),
            }
        )
        self.call_logs_json = json.dumps(logs)

    @property
    def call_id(self) -> str:
        return self.id

    def __repr__(self) -> str:
        return f"<Call id={self.id!r} status={self.status!r} number={self.phone_number!r}>"
