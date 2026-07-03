"""Pydantic schemas for bulk campaign endpoints."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ContactIn(BaseModel):
    name: str
    phone_number: str


class ContactStatusResponse(BaseModel):
    id: str
    order_index: int
    name: str
    phone_number: str
    status: str
    call_id: str | None = None

    model_config = {"from_attributes": True}


class CampaignResponse(BaseModel):
    id: str
    name: str
    status: str
    total_contacts: int
    done_contacts: int
    created_at: datetime
    contacts: list[ContactStatusResponse] = []

    model_config = {"from_attributes": True}


class UploadPreviewResponse(BaseModel):
    campaign_id: str
    name: str
    total: int
    contacts: list[ContactIn]
    errors: list[str] = []
