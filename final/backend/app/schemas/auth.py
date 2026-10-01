from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token:         str
    refresh_token:        str
    token_type:           str  = "bearer"
    must_change_password: bool = False


class RefreshRequest(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    zone: str | None
    bcc_id: int | None
    bcc_name: str | None   # e.g. "BCC 3"
    bcc_zone: str | None   # e.g. "Nord-Ouest / Béja & Jendouba"
    is_active: bool

    model_config = {"from_attributes": True}
