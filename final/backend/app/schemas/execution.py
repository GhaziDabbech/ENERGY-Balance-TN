from datetime import datetime
from pydantic import BaseModel, Field


class ExecutionCreate(BaseModel):
    feeder_id: int
    mw_shed: float = Field(..., gt=0)
    trigger: str = Field(default="manual", pattern="^(j1|urgence|manual)$")
    order_id: int | None = None
    notes: str | None = None


class ExecutionRestore(BaseModel):
    notes: str | None = None


class ExecutionOut(BaseModel):
    id: int
    feeder_id: int
    bcc_id: int
    operator_id: int
    order_id: int | None
    started_at: datetime
    ended_at: datetime | None
    duration_min: float | None
    mw_shed: float
    ens_mwh: float | None
    trigger: str
    status: str
    notes: str | None

    # Denormalised fields — resolved from relationships so the frontend
    # never needs to maintain a feeder_id → ref mapping locally.
    feeder_ref:    str | None = None
    feeder_nom:    str | None = None
    feeder_poste:  str | None = None   # poste_source e.g. "Béja Centre TR1"
    bcc_name:      str | None = None   # e.g. "BCC 3"
    bcc_zone:      str | None = None   # e.g. "Nord-Ouest / Béja & Jendouba"
    operator_name: str | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_relations(cls, obj) -> "ExecutionOut":
        """Build an ExecutionOut resolving feeder + operator from relationships."""
        data = cls.model_validate(obj)
        if obj.feeder:
            data.feeder_ref   = obj.feeder.ref
            data.feeder_nom   = obj.feeder.nom
            data.feeder_poste = obj.feeder.poste_source
            if obj.feeder.bcc:
                data.bcc_name = obj.feeder.bcc.name
                data.bcc_zone = obj.feeder.bcc.zone
        if obj.operator:
            data.operator_name = obj.operator.full_name
        return data
