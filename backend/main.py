from __future__ import annotations

from datetime import date, datetime, time, timedelta
from statistics import pstdev
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    create_engine,
    text,
)
from sqlalchemy.orm import Session, declarative_base, relationship, sessionmaker

load_dotenv()

# ============================================================
# CONFIGURATION
# ============================================================

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is missing. Add it to backend/.env, for example:\n"
        "DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/energy_balance_tn"
    )

TUNIS_TZ = ZoneInfo("Africa/Tunis")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)

Base = declarative_base()


# ============================================================
# DATABASE MODELS
# These models match the PostgreSQL SQL schema.
# ============================================================

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
    electricity_status = Column(
        String(50),
        nullable=False,
        default="Power Available",
    )

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
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
    )

    zone = relationship("Zone", back_populates="citizens")


class BCC(Base):
    __tablename__ = "bcc"

    id = Column(Integer, primary_key=True)
    name = Column(String(150), nullable=False)
    avg_load_mw = Column(Numeric(10, 2), nullable=False, default=0)
    crc = Column(
        String(50),
        ForeignKey("regions.code"),
        nullable=False,
    )

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
    feeder_id = Column(
        Integer,
        ForeignKey("feeders.id"),
        nullable=False,
    )
    zone_id = Column(
        Integer,
        ForeignKey("zones.id"),
        nullable=False,
    )
    scheduled_date = Column(Date, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    duration_minutes = Column(
        Integer,
        nullable=False,
        default=45,
    )
    target_mw = Column(
        Numeric(10, 2),
        nullable=False,
        default=0,
    )
    status = Column(
        String(50),
        nullable=False,
        default="planned",
    )
    reason = Column(Text)
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
    )

    feeder = relationship("Feeder", back_populates="schedules")
    zone = relationship("Zone", back_populates="schedules")
    executions = relationship(
        "ExecutionLog",
        back_populates="schedule",
    )


class ExecutionLog(Base):
    __tablename__ = "execution_log"

    id = Column(Integer, primary_key=True)
    schedule_id = Column(
        Integer,
        ForeignKey("program_schedule.id"),
        nullable=False,
    )
    actual_start = Column(DateTime, nullable=False)
    actual_end = Column(DateTime, nullable=False)
    actual_mw_shed = Column(
        Numeric(10, 2),
        nullable=False,
        default=0,
    )
    notes = Column(Text)

    schedule = relationship(
        "ProgramSchedule",
        back_populates="executions",
    )


class NationalTarget(Base):
    __tablename__ = "national_targets"

    id = Column(Integer, primary_key=True)
    target_date = Column(Date, nullable=False)
    target_mw = Column(Numeric(10, 2), nullable=False)
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
    )


class LoadResourceData(Base):
    __tablename__ = "load_resource_data"

    id = Column(Integer, primary_key=True)
    target_date = Column(Date, nullable=False)
    slot_index = Column(Integer, nullable=False)
    time_step_minutes = Column(
        Integer,
        nullable=False,
        default=30,
    )
    load_mw = Column(Numeric(10, 2), nullable=False)
    available_mw = Column(Numeric(10, 2), nullable=False)


# ============================================================
# FASTAPI / CORS
# ============================================================

app = FastAPI(
    title="ENERGY Balance TN API",
    version="1.0.0",
    description=(
        "Backend API for the ENERGY Balance TN "
        "electricity management platform."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# DATABASE DEPENDENCY
# ============================================================

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============================================================
# GENERAL HELPERS
# ============================================================

def tunis_now() -> datetime:
    return datetime.now(TUNIS_TZ)


def today_tunis() -> date:
    return tunis_now().date()


def as_float(value: Any) -> Optional[float]:
    return None if value is None else float(value)


def time_to_string(value: Optional[time]) -> Optional[str]:
    return value.strftime("%H:%M") if value else None


def datetime_to_iso(
    value: Optional[datetime],
) -> Optional[str]:
    return value.isoformat() if value else None


def schedule_datetime(
    scheduled_date: date,
    schedule_time: time,
) -> datetime:
    return datetime(
        scheduled_date.year,
        scheduled_date.month,
        scheduled_date.day,
        schedule_time.hour,
        schedule_time.minute,
        schedule_time.second,
        tzinfo=TUNIS_TZ,
    )


def schedule_is_active(
    schedule: ProgramSchedule,
    now: Optional[datetime] = None,
) -> bool:
    if schedule.status == "cancelled":
        return False

    now = now or tunis_now()

    if schedule.scheduled_date != now.date():
        return False

    start = schedule_datetime(
        schedule.scheduled_date,
        schedule.start_time,
    )
    end = schedule_datetime(
        schedule.scheduled_date,
        schedule.end_time,
    )

    return start <= now < end


def schedule_is_upcoming_or_active(
    schedule: ProgramSchedule,
    now: Optional[datetime] = None,
) -> bool:
    if schedule.status == "cancelled":
        return False

    now = now or tunis_now()

    if schedule.scheduled_date != now.date():
        return False

    end = schedule_datetime(
        schedule.scheduled_date,
        schedule.end_time,
    )

    return end > now


def status_key(status: str) -> str:
    value = (status or "").strip().lower()

    if (
        "scheduled" in value
        or "emergency" in value
        or "outage" in value
    ):
        return "outage"

    if "demand" in value:
        return "demand"

    if (
        "available" in value
        or "normal" in value
    ):
        return "available"

    return "unknown"


def status_label_and_description(
    zone: Zone,
    active_schedule: Optional[ProgramSchedule],
) -> Dict[str, str]:
    if active_schedule:
        return {
            "status": "outage",
            "status_label": "Currently Under Shedding",
            "description": (
                "This location is currently experiencing "
                "a planned electricity interruption."
            ),
        }

    key = status_key(zone.electricity_status)

    if key == "outage":
        return {
            "status": "outage",
            "status_label": zone.electricity_status,
            "description": (
                "This location is currently experiencing "
                "an electricity interruption."
            ),
        }

    if key == "demand":
        return {
            "status": "demand",
            "status_label": "High Demand",
            "description": (
                "Electricity is currently available, "
                "but demand is high in this location."
            ),
        }

    if key == "available":
        return {
            "status": "available",
            "status_label": "Power Available",
            "description": (
                "Electricity is currently available "
                "in this location."
            ),
        }

    return {
        "status": "unknown",
        "status_label": zone.electricity_status or "Unknown",
        "description": (
            "The current electricity status "
            "is not available."
        ),
    }


def zone_today_schedules(
    db: Session,
    zone_id: int,
) -> List[ProgramSchedule]:
    today = today_tunis()

    return (
        db.query(ProgramSchedule)
        .filter(
            ProgramSchedule.zone_id == zone_id,
            ProgramSchedule.scheduled_date == today,
            ProgramSchedule.status != "cancelled",
        )
        .order_by(
            ProgramSchedule.start_time.asc(),
            ProgramSchedule.id.asc(),
        )
        .all()
    )


def schedule_to_frontend_item(
    schedule: ProgramSchedule,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    now = now or tunis_now()
    active = schedule_is_active(schedule, now)

    return {
        "id": schedule.id,
        "start": time_to_string(schedule.start_time),
        "end": time_to_string(schedule.end_time),
        "start_time": time_to_string(schedule.start_time),
        "end_time": time_to_string(schedule.end_time),
        "duration": f"{schedule.duration_minutes} min",
        "duration_minutes": schedule.duration_minutes,
        "status": (
            "Active now"
            if active
            else "Planned"
        ),
        "active": active,
        "target_mw": as_float(schedule.target_mw),
        "reason": schedule.reason,
    }


def zone_to_dict(
    db: Session,
    zone: Zone,
    include_schedule: bool = True,
) -> Dict[str, Any]:
    now = tunis_now()

    schedules = (
        zone_today_schedules(db, zone.id)
        if include_schedule
        else []
    )

    active = next(
        (
            item
            for item in schedules
            if schedule_is_active(item, now)
        ),
        None,
    )

    situation = status_label_and_description(
        zone,
        active,
    )

    return {
        "id": zone.id,
        "name": zone.name,
        "governorate": zone.governorate,
        "latitude": zone.latitude,
        "longitude": zone.longitude,
        "electricity_status": (
            "Currently Under Shedding"
            if active
            else zone.electricity_status
        ),
        "currentStatus": situation["status"],
        "currentStatusLabel": situation["status_label"],
        "currentDescription": situation["description"],
        "shedding": [
            schedule_to_frontend_item(
                item,
                now,
            )
            for item in schedules
            if schedule_is_upcoming_or_active(
                item,
                now,
            )
        ],
    }


# ============================================================
# HEALTH
# ============================================================

@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))

        return {
            "status": "ok",
            "database": "connected",
            "date": today_tunis().isoformat(),
            "time": tunis_now().isoformat(),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Database connection failed: {exc}",
        )


# ============================================================
# ZONES
# Used by App.jsx:
#   GET /api/zones
# ============================================================

@app.get("/api/zones")
def get_zones(
    db: Session = Depends(get_db),
):
    zones = (
        db.query(Zone)
        .order_by(
            Zone.governorate.asc(),
            Zone.name.asc(),
        )
        .all()
    )

    return [
        zone_to_dict(
            db,
            zone,
            include_schedule=True,
        )
        for zone in zones
    ]


@app.get("/api/zones/{zone_id}")
def get_zone(
    zone_id: int,
    db: Session = Depends(get_db),
):
    zone = db.get(Zone, zone_id)

    if not zone:
        raise HTTPException(
            status_code=404,
            detail="Zone not found",
        )

    return zone_to_dict(
        db,
        zone,
        include_schedule=True,
    )


# ============================================================
# CITIZENS
# ============================================================

@app.get("/api/citizens/{citizen_id}")
def get_citizen(
    citizen_id: int,
    db: Session = Depends(get_db),
):
    citizen = db.get(Citizen, citizen_id)

    if not citizen:
        raise HTTPException(
            status_code=404,
            detail="Citizen not found",
        )

    if not citizen.is_active:
        raise HTTPException(
            status_code=403,
            detail="Citizen account is inactive",
        )

    zone = db.get(Zone, citizen.zone_id)

    if not zone:
        raise HTTPException(
            status_code=409,
            detail=(
                "Citizen is linked to a zone "
                "that does not exist"
            ),
        )

    return {
        "id": citizen.id,
        "first_name": citizen.first_name,
        "last_name": citizen.last_name,
        "name": (
            f"{citizen.first_name} "
            f"{citizen.last_name}"
        ).strip(),
        "email": citizen.email,
        "phone": citizen.phone,
        "zone_id": citizen.zone_id,
        "governorate": (
            citizen.governorate
            or zone.governorate
        ),
        "address": citizen.address,
        "is_active": citizen.is_active,
    }


# ============================================================
# CITIZEN DASHBOARD
# Used by App.jsx:
#   GET /api/citizen/dashboard/1
# ============================================================

@app.get("/api/citizen/dashboard/{citizen_id}")
def get_citizen_dashboard(
    citizen_id: int,
    db: Session = Depends(get_db),
):
    citizen = db.get(Citizen, citizen_id)

    if not citizen:
        raise HTTPException(
            status_code=404,
            detail="Citizen not found",
        )

    if not citizen.is_active:
        raise HTTPException(
            status_code=403,
            detail="Citizen account is inactive",
        )

    zone = db.get(Zone, citizen.zone_id)

    if not zone:
        raise HTTPException(
            status_code=409,
            detail=(
                "Citizen is linked to a zone "
                "that does not exist"
            ),
        )

    now = tunis_now()

    schedules = zone_today_schedules(
        db,
        zone.id,
    )

    active_schedule = next(
        (
            item
            for item in schedules
            if schedule_is_active(
                item,
                now,
            )
        ),
        None,
    )

    situation = status_label_and_description(
        zone,
        active_schedule,
    )

    today_schedule = [
        schedule_to_frontend_item(
            item,
            now,
        )
        for item in schedules
        if schedule_is_upcoming_or_active(
            item,
            now,
        )
    ]

    return {
        "date": today_tunis().isoformat(),

        "citizen": {
            "id": citizen.id,
            "first_name": citizen.first_name,
            "last_name": citizen.last_name,
            "name": (
                f"{citizen.first_name} "
                f"{citizen.last_name}"
            ).strip(),
            "email": citizen.email,
            "phone": citizen.phone,
            "zone_id": citizen.zone_id,
            "governorate": (
                citizen.governorate
                or zone.governorate
            ),
            "address": citizen.address,
        },

        "zone": {
            "id": zone.id,
            "name": zone.name,
            "governorate": zone.governorate,
            "latitude": zone.latitude,
            "longitude": zone.longitude,
            "electricity_status": (
                "Currently Under Shedding"
                if active_schedule
                else zone.electricity_status
            ),
        },

        "current_situation": {
            **situation,
            "under_shedding": (
                active_schedule is not None
            ),
            "active_shedding": (
                schedule_to_frontend_item(
                    active_schedule,
                    now,
                )
                if active_schedule
                else None
            ),
        },

        "today_schedule": today_schedule,
        "total_interruptions": len(
            today_schedule
        ),
    }


# ============================================================
# VIRTUAL CHECK
# Used by App.jsx:
#   GET /api/virtual-check?zone_id=<id>
# ============================================================

@app.get("/api/virtual-check")
def virtual_check(
    zone_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    zone = db.get(Zone, zone_id)

    if not zone:
        raise HTTPException(
            status_code=404,
            detail="Zone not found",
        )

    now = tunis_now()

    schedules = zone_today_schedules(
        db,
        zone.id,
    )

    active_schedule = next(
        (
            item
            for item in schedules
            if schedule_is_active(
                item,
                now,
            )
        ),
        None,
    )

    situation = status_label_and_description(
        zone,
        active_schedule,
    )

    today_items = [
        schedule_to_frontend_item(
            item,
            now,
        )
        for item in schedules
        if schedule_is_upcoming_or_active(
            item,
            now,
        )
    ]

    return {
        "date": today_tunis().isoformat(),

        "zone": {
            "id": zone.id,
            "name": zone.name,
            "governorate": zone.governorate,
            "latitude": zone.latitude,
            "longitude": zone.longitude,
            "electricity_status": (
                "Currently Under Shedding"
                if active_schedule
                else zone.electricity_status
            ),
            "currentStatus": situation["status"],
            "currentStatusLabel": (
                situation["status_label"]
            ),
            "currentDescription": (
                situation["description"]
            ),
        },

        "current_situation": {
            **situation,
            "under_shedding": (
                active_schedule is not None
            ),
            "active_shedding": (
                schedule_to_frontend_item(
                    active_schedule,
                    now,
                )
                if active_schedule
                else None
            ),
        },

        "upcoming_shedding_today": today_items,
        "total_interruptions": len(
            today_items
        ),
    }


# ============================================================
# ADMIN MODELS
# ============================================================

class RegionCreate(BaseModel):
    name: str
    code: str
    target_ratio: float = Field(
        default=0,
        ge=0,
        le=1,
    )


class ZoneCreate(BaseModel):
    name: str
    governorate: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    electricity_status: str = "Power Available"


class ZoneStatusUpdate(BaseModel):
    electricity_status: str


class CitizenCreate(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    password_hash: str
    zone_id: int
    governorate: Optional[str] = None
    address: Optional[str] = None


class NationalTargetCreate(BaseModel):
    target_date: date
    target_mw: float = Field(ge=0)


class LoadResourceCreate(BaseModel):
    target_date: date
    slot_index: int = Field(ge=0)
    time_step_minutes: int = Field(
        default=30,
        gt=0,
    )
    load_mw: float = Field(ge=0)
    available_mw: float = Field(ge=0)


class ExecutionCreate(BaseModel):
    schedule_id: int
    actual_start: datetime
    actual_end: datetime
    actual_mw_shed: float = Field(ge=0)
    notes: Optional[str] = None


# ============================================================
# REGIONS
# ============================================================

@app.get("/api/regions")
@app.get("/api/admin/regions")
def list_regions(
    db: Session = Depends(get_db),
):
    regions = (
        db.query(Region)
        .order_by(Region.id.asc())
        .all()
    )

    return [
        {
            "id": item.id,
            "name": item.name,
            "code": item.code,
            "target_ratio": as_float(
                item.target_ratio
            ),
        }
        for item in regions
    ]


@app.post("/api/admin/regions")
def create_region(
    payload: RegionCreate,
    db: Session = Depends(get_db),
):
    existing = (
        db.query(Region)
        .filter(
            Region.code == payload.code
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=409,
            detail="Region code already exists",
        )

    region = Region(
        name=payload.name,
        code=payload.code,
        target_ratio=payload.target_ratio,
    )

    db.add(region)
    db.commit()
    db.refresh(region)

    return {
        "id": region.id,
        "name": region.name,
        "code": region.code,
        "target_ratio": as_float(
            region.target_ratio
        ),
    }


# ============================================================
# ZONE ADMINISTRATION
# ============================================================

@app.post("/api/admin/zones")
def create_zone(
    payload: ZoneCreate,
    db: Session = Depends(get_db),
):
    allowed_statuses = {
        "Power Available",
        "High Demand",
        "Scheduled Outage",
        "Emergency Outage",
        "Unknown",
    }

    if payload.electricity_status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid electricity_status. "
                f"Allowed values: {sorted(allowed_statuses)}"
            ),
        )

    zone = Zone(
        name=payload.name,
        governorate=payload.governorate,
        latitude=payload.latitude,
        longitude=payload.longitude,
        electricity_status=payload.electricity_status,
    )

    db.add(zone)
    db.commit()
    db.refresh(zone)

    return zone_to_dict(db, zone)


@app.patch("/api/admin/zones/{zone_id}/status")
def update_zone_status(
    zone_id: int,
    payload: ZoneStatusUpdate,
    db: Session = Depends(get_db),
):
    allowed_statuses = {
        "Power Available",
        "High Demand",
        "Scheduled Outage",
        "Emergency Outage",
        "Unknown",
    }

    if payload.electricity_status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Invalid electricity status",
        )

    zone = db.get(Zone, zone_id)

    if not zone:
        raise HTTPException(
            status_code=404,
            detail="Zone not found",
        )

    zone.electricity_status = (
        payload.electricity_status
    )

    db.commit()
    db.refresh(zone)

    return zone_to_dict(db, zone)


# ============================================================
# BCC
# ============================================================

@app.get("/api/admin/bcc")
@app.get("/api/bcc")
def list_bcc(
    db: Session = Depends(get_db),
):
    rows = (
        db.query(BCC)
        .order_by(BCC.id.asc())
        .all()
    )

    return [
        {
            "id": row.id,
            "name": row.name,
            "avg_load_mw": as_float(
                row.avg_load_mw
            ),
            "crc": row.crc,
        }
        for row in rows
    ]


# ============================================================
# FEEDERS
# ============================================================

@app.get("/api/admin/feeders")
@app.get("/api/feeders")
def list_feeders(
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Feeder)
        .order_by(Feeder.id.asc())
        .all()
    )

    return [
        {
            "id": row.id,
            "name": row.name,
            "bcc_id": row.bcc_id,
            "zone_id": row.zone_id,
            "priority_level": row.priority_level,
            "avg_load_mw": as_float(
                row.avg_load_mw
            ),
            "last_cut_at": datetime_to_iso(
                row.last_cut_at
            ),
            "total_cuts_month": (
                row.total_cuts_month
            ),
            "active": row.active,
        }
        for row in rows
    ]


# ============================================================
# NATIONAL TARGETS
# ============================================================

@app.get("/api/admin/national-target")
@app.get("/api/national-target")
def list_national_targets(
    db: Session = Depends(get_db),
):
    rows = (
        db.query(NationalTarget)
        .order_by(
            NationalTarget.target_date.desc(),
            NationalTarget.id.desc(),
        )
        .all()
    )

    return [
        {
            "id": row.id,
            "target_date": (
                row.target_date.isoformat()
            ),
            "target_mw": as_float(
                row.target_mw
            ),
            "created_at": datetime_to_iso(
                row.created_at
            ),
        }
        for row in rows
    ]


@app.post("/api/admin/national-target")
def create_national_target(
    payload: NationalTargetCreate,
    db: Session = Depends(get_db),
):
    row = NationalTarget(
        target_date=payload.target_date,
        target_mw=payload.target_mw,
    )

    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "id": row.id,
        "target_date": (
            row.target_date.isoformat()
        ),
        "target_mw": as_float(
            row.target_mw
        ),
        "created_at": datetime_to_iso(
            row.created_at
        ),
    }


# ============================================================
# LOAD / RESOURCE DATA
# ============================================================

@app.get("/api/admin/load-resource")
@app.get("/api/load-resource")
def list_load_resource(
    target_date: Optional[date] = None,
    db: Session = Depends(get_db),
):
    query = db.query(LoadResourceData)

    if target_date:
        query = query.filter(
            LoadResourceData.target_date
            == target_date
        )

    rows = (
        query.order_by(
            LoadResourceData.target_date.asc(),
            LoadResourceData.slot_index.asc(),
        )
        .all()
    )

    return [
        {
            "id": row.id,
            "target_date": (
                row.target_date.isoformat()
            ),
            "slot_index": row.slot_index,
            "time_step_minutes": (
                row.time_step_minutes
            ),
            "load_mw": as_float(
                row.load_mw
            ),
            "available_mw": as_float(
                row.available_mw
            ),
        }
        for row in rows
    ]


@app.post("/api/admin/load-resource")
def create_load_resource(
    payload: LoadResourceCreate,
    db: Session = Depends(get_db),
):
    existing = (
        db.query(LoadResourceData)
        .filter(
            LoadResourceData.target_date
            == payload.target_date,
            LoadResourceData.slot_index
            == payload.slot_index,
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=409,
            detail=(
                "A load/resource record already exists "
                "for this date and slot"
            ),
        )

    row = LoadResourceData(
        target_date=payload.target_date,
        slot_index=payload.slot_index,
        time_step_minutes=(
            payload.time_step_minutes
        ),
        load_mw=payload.load_mw,
        available_mw=payload.available_mw,
    )

    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "id": row.id,
        "target_date": (
            row.target_date.isoformat()
        ),
        "slot_index": row.slot_index,
        "time_step_minutes": (
            row.time_step_minutes
        ),
        "load_mw": as_float(
            row.load_mw
        ),
        "available_mw": as_float(
            row.available_mw
        ),
    }


# ============================================================
# SCHEDULING BUSINESS LOGIC
# ============================================================

def split_regional_target(
    national_target_mw: float,
    ratio: float = 0.66,
) -> Dict[str, float]:
    return {
        "nord": national_target_mw * ratio,
        "sud": national_target_mw * (1 - ratio),
    }


def allocate_to_bcc(
    crc_target_mw: float,
    bcc_list: List[BCC],
) -> Dict[int, float]:
    if not bcc_list:
        return {}

    total_load = sum(
        float(item.avg_load_mw or 0)
        for item in bcc_list
    )

    if total_load <= 0:
        equal_target = (
            crc_target_mw / len(bcc_list)
        )

        return {
            item.id: equal_target
            for item in bcc_list
        }

    return {
        item.id: (
            crc_target_mw
            * float(item.avg_load_mw or 0)
            / total_load
        )
        for item in bcc_list
    }


def build_reason_string(
    feeder: Feeder,
    days_since_cut: float,
    load_weight: float,
) -> str:
    if feeder.last_cut_at is None:
        history = "never cut before"
    else:
        history = (
            f"last cut {days_since_cut:.1f} days ago"
        )

    return (
        f"Priority {feeder.priority_level}/5, "
        f"{history}, "
        f"{feeder.total_cuts_month} cuts this month, "
        f"load share {load_weight:.1%}"
    )


def select_feeders(
    bcc_target_mw: float,
    feeder_list: List[Feeder],
    cooldown_hours: int = 4,
    current_time: Optional[datetime] = None,
) -> List[Dict[str, Any]]:
    current_time = (
        current_time
        or tunis_now()
    )

    candidates = []

    for feeder in feeder_list:
        if not feeder.active:
            continue

        if feeder.priority_level <= 0:
            continue

        if feeder.last_cut_at:
            last_cut = feeder.last_cut_at

            if last_cut.tzinfo is None:
                last_cut = (
                    last_cut.replace(
                        tzinfo=TUNIS_TZ
                    )
                )

            hours_since = (
                current_time - last_cut
            ).total_seconds() / 3600

            if hours_since < cooldown_hours:
                continue

        candidates.append(feeder)

    if not candidates:
        return []

    max_load = max(
        float(item.avg_load_mw or 0)
        for item in candidates
    )

    total_bcc_load = sum(
        float(item.avg_load_mw or 0)
        for item in candidates
    )

    scored = []

    for feeder in candidates:
        if feeder.last_cut_at is None:
            days_since_cut = 999.0
        else:
            last_cut = feeder.last_cut_at

            if last_cut.tzinfo is None:
                last_cut = (
                    last_cut.replace(
                        tzinfo=TUNIS_TZ
                    )
                )

            days_since_cut = max(
                0.0,
                (
                    current_time - last_cut
                ).total_seconds() / 86400,
            )

        load = float(
            feeder.avg_load_mw or 0
        )

        score = (
            0.45
            * (feeder.priority_level / 5)
            + 0.25
            * min(
                days_since_cut / 30,
                1,
            )
            + 0.20
            * max(
                0,
                1
                - feeder.total_cuts_month
                / 5,
            )
            - 0.10
            * (
                load / max_load
                if max_load
                else 0
            )
        )

        load_weight = (
            load / total_bcc_load
            if total_bcc_load > 0
            else 0
        )

        scored.append(
            (
                score,
                feeder,
                days_since_cut,
                load_weight,
            )
        )

    scored.sort(
        key=lambda item: item[0],
        reverse=True,
    )

    selected = []
    accumulated_mw = 0.0

    for (
        score,
        feeder,
        days_since_cut,
        load_weight,
    ) in scored:

        selected.append(
            {
                "feeder_id": feeder.id,
                "feeder_name": feeder.name,
                "zone_id": feeder.zone_id,
                "priority_level": (
                    feeder.priority_level
                ),
                "avg_load_mw": float(
                    feeder.avg_load_mw or 0
                ),
                "score": round(
                    score,
                    6,
                ),
                "duration_minutes": 45,
                "reason": build_reason_string(
                    feeder,
                    days_since_cut,
                    load_weight,
                ),
            }
        )

        accumulated_mw += float(
            feeder.avg_load_mw or 0
        )

        if accumulated_mw >= bcc_target_mw:
            break

    return selected


def estimate_national_deficit(
    load_forecast: List[float],
    available_resources: List[float],
) -> List[float]:
    return [
        max(
            0.0,
            float(load) - float(available),
        )
        for load, available in zip(
            load_forecast,
            available_resources,
        )
    ]


def build_j1_program(
    deficit_per_slot: List[float],
    target_date: date,
    time_step_minutes: int = 30,
) -> List[Dict[str, Any]]:
    program = []

    for index, deficit in enumerate(
        deficit_per_slot
    ):
        if deficit <= 0:
            continue

        start_minutes = (
            index * time_step_minutes
        )

        end_minutes = (
            start_minutes
            + time_step_minutes
        )

        start_hour = start_minutes // 60
        start_minute = start_minutes % 60
        end_hour = end_minutes // 60
        end_minute = end_minutes % 60

        if start_hour >= 24:
            break

        program.append(
            {
                "slot_index": index,
                "date": (
                    target_date.isoformat()
                ),
                "start_time": (
                    f"{start_hour:02d}:"
                    f"{start_minute:02d}"
                ),
                "end_time": (
                    f"{end_hour % 24:02d}:"
                    f"{end_minute:02d}"
                ),
                "deficit_mw": round(
                    deficit,
                    2,
                ),
            }
        )

    return program


# ============================================================
# ADMIN: GENERATE J1
# ============================================================

@app.post("/api/admin/generate-j1")
def generate_j1_program(
    target_date: date,
    db: Session = Depends(get_db),
):
    rows = (
        db.query(LoadResourceData)
        .filter(
            LoadResourceData.target_date
            == target_date
        )
        .order_by(
            LoadResourceData.slot_index.asc()
        )
        .all()
    )

    if not rows:
        raise HTTPException(
            status_code=404,
            detail=(
                "No load/resource data found "
                "for the requested date"
            ),
        )

    deficits = estimate_national_deficit(
        [
            float(row.load_mw)
            for row in rows
        ],
        [
            float(row.available_mw)
            for row in rows
        ],
    )

    program = build_j1_program(
        deficits,
        target_date,
        rows[0].time_step_minutes,
    )

    return {
        "date": target_date.isoformat(),
        "total_national_deficit_mw": round(
            sum(deficits),
            2,
        ),
        "slots": program,
    }


# ============================================================
# ADMIN: SELECT FEEDERS
# ============================================================

@app.post("/api/admin/select-feeders")
def admin_select_feeders(
    bcc_id: int,
    target_mw: float = Query(
        ...,
        ge=0,
    ),
    cooldown_hours: int = Query(
        4,
        ge=0,
    ),
    db: Session = Depends(get_db),
):
    bcc = db.get(BCC, bcc_id)

    if not bcc:
        raise HTTPException(
            status_code=404,
            detail="BCC not found",
        )

    feeders = (
        db.query(Feeder)
        .filter(
            Feeder.bcc_id == bcc_id
        )
        .order_by(Feeder.id.asc())
        .all()
    )

    selected = select_feeders(
        target_mw,
        feeders,
        cooldown_hours=cooldown_hours,
    )

    return {
        "bcc": {
            "id": bcc.id,
            "name": bcc.name,
            "crc": bcc.crc,
        },
        "target_mw": target_mw,
        "selected": selected,
        "selected_mw": round(
            sum(
                item["avg_load_mw"]
                for item in selected
            ),
            2,
        ),
    }


# ============================================================
# SCHEDULE READ API
# ============================================================

def schedule_to_dict(
    schedule: ProgramSchedule,
) -> Dict[str, Any]:
    return {
        "id": schedule.id,
        "feeder_id": schedule.feeder_id,
        "zone_id": schedule.zone_id,
        "scheduled_date": (
            schedule.scheduled_date.isoformat()
        ),
        "start_time": time_to_string(
            schedule.start_time
        ),
        "end_time": time_to_string(
            schedule.end_time
        ),
        "duration_minutes": (
            schedule.duration_minutes
        ),
        "target_mw": as_float(
            schedule.target_mw
        ),
        "status": schedule.status,
        "reason": schedule.reason,
        "created_at": datetime_to_iso(
            schedule.created_at
        ),
    }


@app.get("/api/schedules")
@app.get("/api/admin/schedules")
def list_schedules(
    target_date: Optional[date] = None,
    zone_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = db.query(ProgramSchedule)

    if target_date:
        query = query.filter(
            ProgramSchedule.scheduled_date
            == target_date
        )

    if zone_id:
        query = query.filter(
            ProgramSchedule.zone_id
            == zone_id
        )

    rows = (
        query.order_by(
            ProgramSchedule.scheduled_date.asc(),
            ProgramSchedule.start_time.asc(),
            ProgramSchedule.id.asc(),
        )
        .all()
    )

    return [
        schedule_to_dict(row)
        for row in rows
    ]


# ============================================================
# EXECUTION LOG
# ============================================================

@app.post("/api/admin/execution")
def create_execution(
    payload: ExecutionCreate,
    db: Session = Depends(get_db),
):
    schedule = db.get(
        ProgramSchedule,
        payload.schedule_id,
    )

    if not schedule:
        raise HTTPException(
            status_code=404,
            detail="Schedule not found",
        )

    if (
        payload.actual_end
        <= payload.actual_start
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "actual_end must be after "
                "actual_start"
            ),
        )

    execution = ExecutionLog(
        schedule_id=payload.schedule_id,
        actual_start=payload.actual_start,
        actual_end=payload.actual_end,
        actual_mw_shed=payload.actual_mw_shed,
        notes=payload.notes,
    )

    schedule.status = "executed"

    db.add(execution)
    db.commit()
    db.refresh(execution)

    return {
        "id": execution.id,
        "schedule_id": (
            execution.schedule_id
        ),
        "actual_start": datetime_to_iso(
            execution.actual_start
        ),
        "actual_end": datetime_to_iso(
            execution.actual_end
        ),
        "actual_mw_shed": as_float(
            execution.actual_mw_shed
        ),
        "notes": execution.notes,
    }


# ============================================================
# KPI
# ============================================================

def compute_ens_and_equity(
    execution_records: List[
        Dict[str, Any]
    ],
) -> Dict[str, float]:
    ens_mwh = 0.0
    cuts_by_zone: Dict[int, int] = {}

    for record in execution_records:
        actual_start = record[
            "actual_start"
        ]
        actual_end = record[
            "actual_end"
        ]
        actual_mw_shed = float(
            record[
                "actual_mw_shed"
            ]
            or 0
        )

        duration_hours = (
            actual_end
            - actual_start
        ).total_seconds() / 3600

        ens_mwh += (
            actual_mw_shed
            * duration_hours
        )

        zone_id = record["zone_id"]

        cuts_by_zone[zone_id] = (
            cuts_by_zone.get(
                zone_id,
                0,
            )
            + 1
        )

    counts = list(
        cuts_by_zone.values()
    )

    equity_index = (
        pstdev(counts)
        if len(counts) > 1
        else 0.0
    )

    return {
        "ens_mwh": round(
            ens_mwh,
            4,
        ),
        "equity_index": round(
            equity_index,
            4,
        ),
    }


@app.get("/api/kpi")
def get_kpi(
    period_start: date,
    period_end: date,
    region: Optional[str] = None,
    db: Session = Depends(get_db),
):
    if period_end < period_start:
        raise HTTPException(
            status_code=400,
            detail=(
                "period_end must be greater "
                "than or equal to period_start"
            ),
        )

    query = (
        db.query(
            ExecutionLog,
            ProgramSchedule,
            Feeder,
            Zone,
            BCC,
        )
        .join(
            ProgramSchedule,
            ExecutionLog.schedule_id
            == ProgramSchedule.id,
        )
        .join(
            Feeder,
            ProgramSchedule.feeder_id
            == Feeder.id,
        )
        .join(
            Zone,
            ProgramSchedule.zone_id
            == Zone.id,
        )
        .join(
            BCC,
            Feeder.bcc_id
            == BCC.id,
        )
        .filter(
            ExecutionLog.actual_start
            >= datetime.combine(
                period_start,
                time.min,
            ),
            ExecutionLog.actual_start
            < datetime.combine(
                period_end
                + timedelta(days=1),
                time.min,
            ),
        )
    )

    if region:
        query = query.filter(
            BCC.crc == region
        )

    rows = query.all()

    execution_records = [
        {
            "actual_start": execution.actual_start,
            "actual_end": execution.actual_end,
            "actual_mw_shed": (
                execution.actual_mw_shed
            ),
            "zone_id": zone.id,
        }
        for (
            execution,
            schedule,
            feeder,
            zone,
            bcc,
        ) in rows
    ]

    result = compute_ens_and_equity(
        execution_records
    )

    return {
        "region": region,
        "period_start": (
            period_start.isoformat()
        ),
        "period_end": (
            period_end.isoformat()
        ),
        **result,
        "execution_count": len(
            execution_records
        ),
    }


# ============================================================
# FEEDER EXPLANATION
# ============================================================

@app.get("/api/feeders/{feeder_id}/explanation")
def feeder_explanation(
    feeder_id: int,
    db: Session = Depends(get_db),
):
    feeder = db.get(
        Feeder,
        feeder_id,
    )

    if not feeder:
        raise HTTPException(
            status_code=404,
            detail="Feeder not found",
        )

    now = tunis_now()

    if feeder.last_cut_at is None:
        days_since_cut = None
        history = "never cut before"
    else:
        last_cut = feeder.last_cut_at

        if last_cut.tzinfo is None:
            last_cut = (
                last_cut.replace(
                    tzinfo=TUNIS_TZ
                )
            )

        days_since_cut = max(
            0,
            (
                now - last_cut
            ).total_seconds() / 86400,
        )

        history = (
            f"last cut "
            f"{days_since_cut:.1f} days ago"
        )

    bcc = feeder.bcc

    bcc_total_load = sum(
        float(item.avg_load_mw or 0)
        for item in bcc.feeders
        if item.active
    )

    load_weight = (
        float(
            feeder.avg_load_mw or 0
        )
        / bcc_total_load
        if bcc_total_load > 0
        else 0
    )

    return {
        "feeder": {
            "id": feeder.id,
            "name": feeder.name,
            "priority_level": (
                feeder.priority_level
            ),
            "avg_load_mw": as_float(
                feeder.avg_load_mw
            ),
            "last_cut_at": datetime_to_iso(
                feeder.last_cut_at
            ),
            "total_cuts_month": (
                feeder.total_cuts_month
            ),
            "bcc_id": feeder.bcc_id,
            "zone_id": feeder.zone_id,
        },
        "explanation": {
            "history": history,
            "days_since_cut": (
                days_since_cut
            ),
            "load_weight": round(
                load_weight,
                4,
            ),
            "priority_component": round(
                0.45
                * (
                    feeder.priority_level
                    / 5
                ),
                4,
            ),
            "rotation_component": round(
                0.25
                * min(
                    (
                        days_since_cut
                        if days_since_cut
                        is not None
                        else 999
                    )
                    / 30,
                    1,
                ),
                4,
            ),
            "anti_repetition_component": round(
                0.20
                * max(
                    0,
                    1
                    - feeder.total_cuts_month
                    / 5,
                ),
                4,
            ),
            "load_protection_penalty": round(
                0.10
                * load_weight,
                4,
            ),
        },
    }


# ============================================================
# AI PLACEHOLDER
# OpenRouter / Nemotron is intentionally not connected yet.
# ============================================================

@app.get("/api/ai/status")
def ai_status():
    return {
        "enabled": False,
        "provider": None,
        "model": None,
        "message": (
            "The AI assistant endpoint is reserved. "
            "OpenRouter/Nemotron integration will be "
            "added later."
        ),
    }


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():
    return {
        "project": "ENERGY Balance TN",
        "status": "running",
        "api": "/docs",
        "frontend": "http://localhost:5173",
        "database": "PostgreSQL",
    }
