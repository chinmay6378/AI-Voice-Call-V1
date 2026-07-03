"""SQLAlchemy ORM models for bulk call campaigns."""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from database.models.call import Base


class CampaignStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    STOPPED = "stopped"


class ContactStatus(str, Enum):
    PENDING = "pending"
    CALLING = "calling"
    COMPLETED = "completed"
    FAILED = "failed"
    NO_ANSWER = "no_answer"
    BUSY = "busy"


class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    status = Column(String(20), nullable=False, default=CampaignStatus.PENDING)
    total_contacts = Column(Integer, default=0)
    done_contacts = Column(Integer, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class CampaignContact(Base):
    __tablename__ = "campaign_contacts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id = Column(String(36), ForeignKey("campaigns.id"), nullable=False, index=True)
    order_index = Column(Integer, nullable=False)
    name = Column(String(255), nullable=False)
    phone_number = Column(String(20), nullable=False)
    status = Column(String(20), nullable=False, default=ContactStatus.PENDING)
    call_id = Column(String(36), nullable=True)
