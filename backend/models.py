"""SQLAlchemy models. They mirror database/schema.sql exactly."""
from datetime import datetime

from sqlalchemy import (Boolean, Column, Date, DateTime, Float, ForeignKey, Integer,
                        Numeric, String, Text, Time)
from sqlalchemy.orm import relationship

from database import Base


class Region(Base):
    __tablename__ = "regions"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    code = Column(String(50), nullable=False, unique=True)
    target_ratio = Column(Numeric(5, 4), nullable=False, default=0)
    bccs = relationship("BCC", back_populates="region")


class Zone(Base):
    __tablename__ = "zones"
    id = Column(Integer, primary_key=True)
    name = Column(String(150), nullable=False)
    governorate = Column(String(100), nullable=False)
    latitude = Column(Float)
    longitude = Column(Float)
    electricity_status = Column(String(50), nullable=False, default="Power Available")
    citizens = relationship("Citizen", back_populates="zone")
    feeders = relationship("Feeder", back_populates="zone")
    schedules = relationship("ProgramSchedule", back_populates="zone")


class Citizen(Base):
    __tablename__ = "citizens"
    id = Column(Integer, primary_key=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=False, unique=True)
    phone = Column(String(30))
    password_hash = Column(Text, nullable=False)
    zone_id = Column(Integer, ForeignKey("zones.id"), nullable=False)
    governorate = Column(String(100))
    address = Column(Text)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    zone = relationship("Zone", back_populates="citizens")


class BCC(Base):
    __tablename__ = "bcc"
    id = Column(Integer, primary_key=True)
    name = Column(String(150), nullable=False)
    avg_load_mw = Column(Numeric(10, 2), nullable=False, default=0)
    crc = Column(String(50), ForeignKey("regions.code"), nullable=False)
    region = relationship("Region", back_populates="bccs")
    feeders = relationship("Feeder", back_populates="bcc")


class Feeder(Base):
    __tablename__ = "feeders"
    id = Column(Integer, primary_key=True)
    name = Column(String(150), nullable=False)
    bcc_id = Column(Integer, ForeignKey("bcc.id"), nullable=False)
    zone_id = Column(Integer, ForeignKey("zones.id"), nullable=False)
    priority_level = Column(Integer, nullable=False, default=1)
    avg_load_mw = Column(Numeric(10, 2), nullable=False, default=0)
    last_cut_at = Column(DateTime)
    total_cuts_month = Column(Integer, nullable=False, default=0)
    active = Column(Boolean, nullable=False, default=True)
    bcc = relationship("BCC", back_populates="feeders")
    zone = relationship("Zone", back_populates="feeders")
    schedules = relationship("ProgramSchedule", back_populates="feeder")


class ProgramSchedule(Base):
    __tablename__ = "program_schedule"
    id = Column(Integer, primary_key=True)
    feeder_id = Column(Integer, ForeignKey("feeders.id"), nullable=False)
    zone_id = Column(Integer, ForeignKey("zones.id"), nullable=False)
    scheduled_date = Column(Date, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    duration_minutes = Column(Integer, nullable=False, default=45)
    target_mw = Column(Numeric(10, 2), nullable=False, default=0)
    status = Column(String(50), nullable=False, default="planned")
    reason = Column(Text)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    feeder = relationship("Feeder", back_populates="schedules")
    zone = relationship("Zone", back_populates="schedules")
    executions = relationship("ExecutionLog", back_populates="schedule")


class ExecutionLog(Base):
    __tablename__ = "execution_log"
    id = Column(Integer, primary_key=True)
    schedule_id = Column(Integer, ForeignKey("program_schedule.id"), nullable=False)
    actual_start = Column(DateTime, nullable=False)
    actual_end = Column(DateTime, nullable=False)
    actual_mw_shed = Column(Numeric(10, 2), nullable=False, default=0)
    notes = Column(Text)
    schedule = relationship("ProgramSchedule", back_populates="executions")


class NationalTarget(Base):
    __tablename__ = "national_targets"
    id = Column(Integer, primary_key=True)
    target_date = Column(Date, nullable=False)
    target_mw = Column(Numeric(10, 2), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class LoadResourceData(Base):
    __tablename__ = "load_resource_data"
    id = Column(Integer, primary_key=True)
    target_date = Column(Date, nullable=False)
    slot_index = Column(Integer, nullable=False)
    time_step_minutes = Column(Integer, nullable=False, default=30)
    load_mw = Column(Numeric(10, 2), nullable=False)
    available_mw = Column(Numeric(10, 2), nullable=False)


class StaffUser(Base):
    __tablename__ = "staff_users"
    id = Column(Integer, primary_key=True)
    full_name = Column(String(150), nullable=False)
    email = Column(String(255), nullable=False, unique=True)
    password_hash = Column(Text, nullable=False)
    role = Column(String(20), nullable=False)
    bcc_id = Column(Integer, ForeignKey("bcc.id"))
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    bcc = relationship("BCC")


class AuditLog(Base):
    __tablename__ = "audit_log"
    id = Column(Integer, primary_key=True)
    actor_type = Column(String(20), nullable=False)
    actor_id = Column(Integer)
    actor_name = Column(String(255))
    action = Column(String(100), nullable=False)
    details = Column(Text)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
