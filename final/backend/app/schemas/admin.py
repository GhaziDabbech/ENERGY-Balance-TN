from datetime import datetime
from pydantic import BaseModel, Field


class UserCreateRequest(BaseModel):
    username:   str   = Field(..., min_length=3, max_length=64)
    full_name:  str   = Field(..., min_length=2, max_length=128)
    password:   str   = Field(..., min_length=8)
    role:       str   = Field(..., pattern="^(DN|CRC|BCC)$")   # ADMIN can't be created via API
    zone:       str | None = None     # required when role=CRC ('CRC Nord' | 'CRC Sud')
    bcc_id:     int | None = None     # required when role=BCC


class UserUpdateRequest(BaseModel):
    full_name:  str | None = Field(None, min_length=2, max_length=128)
    zone:       str | None = None
    bcc_id:     int | None = None


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8)


class ChangePasswordRequest(BaseModel):
    """Used by the operator themselves on forced first-login change."""
    current_password: str
    new_password:     str = Field(..., min_length=8)


class UserAdminOut(BaseModel):
    id:                   int
    username:             str
    full_name:            str
    role:                 str
    zone:                 str | None
    bcc_id:               int | None
    bcc_name:             str | None   # resolved BCC name for display
    crc_name:             str | None   # resolved CRC name via BCC hierarchy
    is_active:            bool
    must_change_password: bool
    created_at:           datetime
    last_login:           datetime | None

    model_config = {"from_attributes": True}


class BCCOption(BaseModel):
    id:       int
    name:     str
    zone:     str
    crc_name: str

    model_config = {"from_attributes": True}


class CRCOption(BaseModel):
    id:   int
    name: str
    city: str

    model_config = {"from_attributes": True}
