"""
Execution: a BCC operator records a feeder cut and its restoration.
This is the core audit trail — every maneuver is recorded here.
"""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Execution(Base):
    __tablename__ = "executions"

    id:           Mapped[int]      = mapped_column(Integer, primary_key=True)
    feeder_id:    Mapped[int]      = mapped_column(Integer, ForeignKey("feeders.id"), nullable=False)
    bcc_id:       Mapped[int]      = mapped_column(Integer, ForeignKey("bccs.id"), nullable=False)
    operator_id:  Mapped[int]      = mapped_column(Integer, ForeignKey("users.id"), nullable=False)

    # Optional link to the order that triggered this cut
    order_id:     Mapped[int | None] = mapped_column(
        Integer, ForeignKey("orders.id"), nullable=True
    )

    # Cut timestamps
    started_at:   Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    ended_at:     Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Duration in minutes (computed on restoration, stored for fast queries)
    duration_min: Mapped[float | None] = mapped_column(Float, nullable=True)

    # MW actually shed (may differ slightly from feeder nominal)
    mw_shed:      Mapped[float]    = mapped_column(Float, nullable=False)

    # ENS = mw_shed * duration_min / 60  (stored for fast aggregation)
    ens_mwh:      Mapped[float | None] = mapped_column(Float, nullable=True)

    # 'j1'      = planned J-1 programme
    # 'urgence' = emergency order
    # 'manual'  = BCC operator manual action
    trigger:      Mapped[str]      = mapped_column(
        Enum("j1", "urgence", "manual", name="execution_trigger"),
        nullable=False,
        default="manual",
    )

    # 'executing' | 'restored' | 'cancelled'
    status:       Mapped[str]      = mapped_column(
        Enum("executing", "restored", "cancelled", name="execution_status"),
        nullable=False,
        default="executing",
    )

    notes:        Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    feeder:       Mapped["Feeder"] = relationship("Feeder", back_populates="executions")
    bcc:          Mapped["BCC"]    = relationship("BCC", back_populates="executions")
    operator:     Mapped["User"]   = relationship("User", back_populates="executions")

    def __repr__(self) -> str:
        return f"<Execution feeder={self.feeder_id} bcc={self.bcc_id} ({self.status})>"
