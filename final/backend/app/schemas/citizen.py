"""
Pydantic schemas for citizen-facing auth and profile endpoints.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Register / Login ──────────────────────────────────────────────────────────

class CitizenRegisterRequest(BaseModel):
    first_name: str  = Field(..., min_length=2, max_length=100)
    last_name:  str  = Field(..., min_length=2, max_length=100)
    email:      str  = Field(..., min_length=5, max_length=255)
    password:   str  = Field(..., min_length=6)
    phone:      Optional[str] = Field(None, max_length=30)
    # zone_id is optional — the register endpoint derives it from feeder_id/governorate
    zone_id:    Optional[int] = None
    feeder_id:  Optional[int] = None
    governorate: Optional[str] = None
    address:    Optional[str] = None


class CitizenLoginRequest(BaseModel):
    email:    str
    password: str


class CitizenTokenResponse(BaseModel):
    access_token:  str
    token_type:    str = "bearer"
    citizen_id:    int
    full_name:     str
    zone_id:       int
    zone_name:     str
    feeder_id:     Optional[int] = None
    governorate:   Optional[str] = None


# ── Profile out ───────────────────────────────────────────────────────────────

class CitizenOut(BaseModel):
    id:          int
    first_name:  str
    last_name:   str
    email:       str
    phone:       Optional[str]
    zone_id:     int
    governorate: Optional[str]
    address:     Optional[str]
    is_active:   bool
    created_at:  datetime

    model_config = {"from_attributes": True}


# ── Notifications ─────────────────────────────────────────────────────────────

class NotificationOut(BaseModel):
    id:         int
    title:      str
    message:    str
    created_at: datetime
    is_read:    bool

    model_config = {"from_attributes": True}


class NotificationUnreadCount(BaseModel):
    unread_count: int


# ── Settings update ───────────────────────────────────────────────────────────

class CitizenSettingsUpdate(BaseModel):
    notifications_enabled: Optional[bool] = None
    phone:                 Optional[str]  = None
    address:               Optional[str]  = None
