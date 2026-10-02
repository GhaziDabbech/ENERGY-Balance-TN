"""
J+1 programme: the planned délestage schedule for tomorrow.
DN creates it → CRC splits it → BCCs assign feeders per slot.
"""
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Programme(Base):
    __tablename__ = "programmes"

    id:           Mapped[int]  = mapped_column(Integer, primary_key=True)
    programme_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True, index=True)
    created_by:   Mapped[int]  = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at:   Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # 'draft' | 'validated' | 'active' | 'completed'
    status:       Mapped[str]  = mapped_column(
        Enum("draft", "validated", "active", "completed", name="programme_status"),
        nullable=False,
        default="draft",
    )

    slots:        Mapped[list["ProgrammeSlot"]] = relationship(
        "ProgrammeSlot", back_populates="programme", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Programme {self.programme_date} ({self.status})>"


class ProgrammeSlot(Base):
    """
    One 30-minute time slot in the J+1 programme.
    Each slot has a national MW target, split by CRC and optionally by BCC.
    """
    __tablename__ = "programme_slots"

    id:           Mapped[int]      = mapped_column(Integer, primary_key=True)
    programme_id: Mapped[int]      = mapped_column(
        Integer, ForeignKey("programmes.id", ondelete="CASCADE"), nullable=False
    )

    # Time slot label: '08:00', '08:30', ..., '23:30'
    time_slot:    Mapped[str]      = mapped_column(String(8), nullable=False)

    # MW targets at each level
    mw_national:  Mapped[float]    = mapped_column(Float, nullable=False, default=0.0)
    mw_nord:      Mapped[float]    = mapped_column(Float, nullable=False, default=0.0)
    mw_sud:       Mapped[float]    = mapped_column(Float, nullable=False, default=0.0)

    # BCC-level: null = not yet assigned
    bcc_id:       Mapped[int | None] = mapped_column(
        Integer, ForeignKey("bccs.id"), nullable=True
    )
    mw_bcc:       Mapped[float]    = mapped_column(Float, nullable=False, default=0.0)

    # 'pending' | 'assigned' | 'validated'
    status:       Mapped[str]      = mapped_column(
        Enum("pending", "assigned", "validated", name="slot_status"),
        nullable=False,
        default="pending",
    )

    # Feeder refs assigned to this BCC slot, stored as comma-separated string.
    # e.g. "F07,F11,F14"  — null means no feeder assignment yet.
    feeder_refs:  Mapped[str | None] = mapped_column(Text, nullable=True, default=None)

    programme:    Mapped["Programme"] = relationship("Programme", back_populates="slots")
    bcc:          Mapped["BCC | None"] = relationship("BCC")

    def __repr__(self) -> str:
        return f"<Slot {self.time_slot} — {self.mw_national} MW>"
