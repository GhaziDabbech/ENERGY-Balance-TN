from datetime import datetime
from pydantic import BaseModel, Field


class FeederBase(BaseModel):
    ref: str = Field(..., max_length=16)
    nom: str = Field(..., max_length=128)
    poste_source: str = Field(..., max_length=64)
    governorate: str | None = Field(None, max_length=100)
    mw_nominal: float = Field(..., gt=0)
    priority: str = Field(..., pattern="^P[0-5]$")
    statut: str = Field(default="Actif")


class FeederCreate(FeederBase):
    pass


class FeederUpdate(BaseModel):
    nom: str | None = None
    poste_source: str | None = None
    governorate: str | None = None
    mw_nominal: float | None = None
    priority: str | None = None
    statut: str | None = None


class FeederOut(FeederBase):
    id: int
    bcc_id: int
    # Cooldown fields — computed from executions table in list_feeders
    last_cut_at:          datetime | None = None   # UTC timestamp of most recent cut start
    hours_since_last_cut: float    | None = None   # hours elapsed since last cut (None = never cut)

    model_config = {"from_attributes": True}
