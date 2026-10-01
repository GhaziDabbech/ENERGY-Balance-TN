from datetime import date
from pydantic import BaseModel


class SlotUpdate(BaseModel):
    time_slot: str
    mw_national: float = 0.0
    mw_nord: float = 0.0
    mw_sud: float = 0.0
    bcc_id: int | None = None
    mw_bcc: float = 0.0
    status: str = "pending"


class ProgrammeCreate(BaseModel):
    programme_date: date
    slots: list[SlotUpdate] = []


class SlotOut(BaseModel):
    id: int
    programme_id: int
    time_slot: str
    mw_national: float
    mw_nord: float
    mw_sud: float
    bcc_id: int | None
    mw_bcc: float
    status: str

    model_config = {"from_attributes": True}


class ProgrammeOut(BaseModel):
    id: int
    programme_date: date
    created_by: int
    status: str
    slots: list[SlotOut] = []

    model_config = {"from_attributes": True}
