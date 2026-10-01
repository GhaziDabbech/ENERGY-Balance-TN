"""
Citizen-facing models — merged from the citizen portal project.

These tables live alongside the operational tables in steg_delestage
but are strictly read-only from the citizen portal's perspective.

Write path:
  BCC executes a cut  →  executions table (operational)
                      →  citizen_zone.electricity_status updated
                      →  citizen_program_schedule status updated

Read path (citizen portal / LLM chatbot):
  citizen_zones, citizen_program_schedule, citizen_execution_log
  — never exposes: orders, grid frequency, operator names, BCC anomalies
"""
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import (
    Boolean, Date, DateTime, Float, ForeignKey,
    Integer, Numeric, String, Text, Time,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CitizenZone(Base):
    """
    A geographic zone visible to citizens.
    Maps roughly to a BCC coverage area but expressed in
    citizen-friendly terms (governorate / neighbourhood).
    """
    __tablename__ = "citizen_zones"

    id:                  Mapped[int]        = mapped_column(Integer, primary_key=True)
    name:                Mapped[str]        = mapped_column(String(150), nullable=False)
    governorate:         Mapped[str]        = mapped_column(String(100), nullable=False)
    latitude:            Mapped[float|None] = mapped_column(Float, nullable=True)
    longitude:           Mapped[float|None] = mapped_column(Float, nullable=True)

    # Current public-facing status — updated when BCC executes a cut
    # Allowed values: 'Power Available' | 'High Demand' | 'Scheduled Outage' | 'Emergency Outage'
    electricity_status:  Mapped[str]        = mapped_column(
        String(50), nullable=False, default="Power Available"
    )

    # Optional link back to the BCC that manages this zone
    bcc_id: Mapped[int|None] = mapped_column(
        Integer, ForeignKey("bccs.id"), nullable=True
    )

    citizens:  Mapped[list["Citizen"]]               = relationship("Citizen",  back_populates="zone")
    schedules: Mapped[list["CitizenProgramSchedule"]] = relationship("CitizenProgramSchedule", back_populates="zone")

    def __repr__(self) -> str:
        return f"<CitizenZone {self.name} ({self.governorate})>"


class Citizen(Base):
    """Registered citizen account — used by the citizen portal login."""
    __tablename__ = "citizens"

    id:            Mapped[int]        = mapped_column(Integer, primary_key=True)
    first_name:    Mapped[str]        = mapped_column(String(100), nullable=False)
    last_name:     Mapped[str]        = mapped_column(String(100), nullable=False)
    email:         Mapped[str]        = mapped_column(String(255), nullable=False, unique=True)
    phone:         Mapped[str|None]   = mapped_column(String(30),  nullable=True)
    password_hash: Mapped[str]        = mapped_column(Text,        nullable=False)
    zone_id:       Mapped[int]        = mapped_column(Integer, ForeignKey("citizen_zones.id"), nullable=False)
    feeder_id:     Mapped[int|None]   = mapped_column(Integer, ForeignKey("feeders.id", ondelete="SET NULL"), nullable=True)
    governorate:   Mapped[str|None]   = mapped_column(String(100), nullable=True)
    address:       Mapped[str|None]   = mapped_column(Text,        nullable=True)
    is_active:     Mapped[bool]       = mapped_column(Boolean,     nullable=False, default=True)
    notifications_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at:    Mapped[datetime]   = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at:    Mapped[datetime]   = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    zone:          Mapped["CitizenZone"]              = relationship("CitizenZone", back_populates="citizens")
    notifications: Mapped[list["CitizenNotification"]] = relationship(
        "CitizenNotification", back_populates="citizen", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Citizen {self.first_name} {self.last_name} ({self.email})>"


class CitizenProgramSchedule(Base):
    """
    Public-facing shedding schedule — what citizens see.
    Created when the DN/CRC programme is published,
    updated to 'executed' or 'cancelled' as BCCs act.
    """
    __tablename__ = "citizen_program_schedule"

    id:               Mapped[int]         = mapped_column(Integer, primary_key=True)
    zone_id:          Mapped[int]         = mapped_column(
        Integer, ForeignKey("citizen_zones.id"), nullable=False
    )
    # Optional link to the operational execution that triggered this entry
    execution_id:     Mapped[int|None]    = mapped_column(
        Integer, ForeignKey("executions.id"), nullable=True
    )

    scheduled_date:   Mapped[date]        = mapped_column(Date,    nullable=False)
    start_time:       Mapped[time]        = mapped_column(Time,    nullable=False)
    end_time:         Mapped[time]        = mapped_column(Time,    nullable=False)
    duration_minutes: Mapped[int]         = mapped_column(Integer, nullable=False, default=45)
    target_mw:        Mapped[Decimal]     = mapped_column(Numeric(10, 2), nullable=False, default=0)

    # 'planned' | 'active' | 'executed' | 'cancelled'
    status:           Mapped[str]         = mapped_column(String(50), nullable=False, default="planned")
    reason:           Mapped[str|None]    = mapped_column(Text, nullable=True)
    created_at:       Mapped[datetime]    = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    zone:             Mapped["CitizenZone"]              = relationship("CitizenZone", back_populates="schedules")
    execution_logs:   Mapped[list["CitizenExecutionLog"]] = relationship(
        "CitizenExecutionLog", back_populates="schedule"
    )

    def __repr__(self) -> str:
        return f"<CitizenProgramSchedule zone={self.zone_id} {self.scheduled_date} {self.start_time}>"


class CitizenExecutionLog(Base):
    """
    Public record of what was actually cut — citizen-visible only.
    Contains no operationally sensitive data (no operator names, no order details).
    """
    __tablename__ = "citizen_execution_log"

    id:             Mapped[int]        = mapped_column(Integer, primary_key=True)
    schedule_id:    Mapped[int]        = mapped_column(
        Integer, ForeignKey("citizen_program_schedule.id"), nullable=False
    )
    actual_start:   Mapped[datetime]   = mapped_column(DateTime, nullable=False)
    actual_end:     Mapped[datetime]   = mapped_column(DateTime, nullable=False)
    actual_mw_shed: Mapped[Decimal]    = mapped_column(Numeric(10, 2), nullable=False, default=0)
    notes:          Mapped[str|None]   = mapped_column(Text, nullable=True)  # citizen-safe notes only

    schedule: Mapped["CitizenProgramSchedule"] = relationship(
        "CitizenProgramSchedule", back_populates="execution_logs"
    )

    def __repr__(self) -> str:
        return f"<CitizenExecutionLog schedule={self.schedule_id} {self.actual_start}>"


class CitizenNotification(Base):
    """
    In-app notifications for citizen accounts.
    Created automatically when a schedule is published for their zone,
    or when an active cut starts/ends in their zone.
    """
    __tablename__ = "citizen_notifications"

    id:         Mapped[int]      = mapped_column(Integer, primary_key=True)
    citizen_id: Mapped[int]      = mapped_column(
        Integer, ForeignKey("citizens.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title:      Mapped[str]      = mapped_column(String(200), nullable=False)
    message:    Mapped[str]      = mapped_column(Text, nullable=False)
    is_read:    Mapped[bool]     = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    citizen: Mapped["Citizen"] = relationship("Citizen", back_populates="notifications")

    def __repr__(self) -> str:
        return f"<CitizenNotification citizen={self.citizen_id} read={self.is_read}>"
