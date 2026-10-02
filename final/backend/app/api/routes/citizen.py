"""
Citizen portal API.

Public endpoints  — no token required:
  GET  /citizen/health
  GET  /citizen/zones
  GET  /citizen/zones/{zone_id}
  GET  /citizen/virtual-check
  GET  /citizen/schedules
  GET  /citizen/ai/status

Auth endpoints  — returns citizen JWT:
  POST /citizen/register
  POST /citizen/login

Protected endpoints  — citizen JWT required:
  GET   /citizen/me
  PATCH /citizen/me
  GET   /citizen/dashboard/me
  GET   /citizen/feeder-schedule          ← NEW: feeder-level personal schedule
  GET   /citizen/notifications
  GET   /citizen/notifications/unread-count
  PATCH /citizen/notifications/{notification_id}/read
  PATCH /citizen/notifications/read-all

Base prefix: /api/v1/citizen  (registered in main.py)
"""
from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.models.citizen import (
    Citizen,
    CitizenExecutionLog,
    CitizenNotification,
    CitizenProgramSchedule,
    CitizenZone,
)
from app.models.execution import Execution
from app.models.programme import Programme, ProgrammeSlot
from app.api.deps import get_current_citizen
from app.schemas.citizen import (
    CitizenLoginRequest,
    CitizenOut,
    CitizenRegisterRequest,
    CitizenSettingsUpdate,
    CitizenTokenResponse,
    NotificationOut,
    NotificationUnreadCount,
)

router = APIRouter(prefix="/citizen", tags=["citizen-portal"])

TUNIS_TZ = ZoneInfo("Africa/Tunis")

# Citizen tokens live 7 days (public portal; not an operator console)
CITIZEN_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7


# ── Time helpers ──────────────────────────────────────────────────────────────

def tunis_now() -> datetime:
    return datetime.now(TUNIS_TZ)


def today_tunis() -> date:
    return tunis_now().date()


def as_float(value: Any) -> Optional[float]:
    return None if value is None else float(value)


def time_to_str(t: Optional[time]) -> Optional[str]:
    return t.strftime("%H:%M") if t else None


def dt_to_iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def schedule_datetime(d: date, t: time) -> datetime:
    return datetime(d.year, d.month, d.day, t.hour, t.minute, t.second, tzinfo=TUNIS_TZ)


# ── Schedule helpers ──────────────────────────────────────────────────────────

def schedule_is_active(s: CitizenProgramSchedule, now: Optional[datetime] = None) -> bool:
    if s.status == "cancelled":
        return False
    now = now or tunis_now()
    if s.scheduled_date != now.date():
        return False
    start = schedule_datetime(s.scheduled_date, s.start_time)
    end   = schedule_datetime(s.scheduled_date, s.end_time)
    return start <= now < end


def schedule_upcoming_or_active(s: CitizenProgramSchedule, now: Optional[datetime] = None) -> bool:
    if s.status == "cancelled":
        return False
    now = now or tunis_now()
    if s.scheduled_date != now.date():
        return False
    end = schedule_datetime(s.scheduled_date, s.end_time)
    return end > now


def schedule_to_item(s: CitizenProgramSchedule, now: Optional[datetime] = None) -> dict:
    now    = now or tunis_now()
    active = schedule_is_active(s, now)
    return {
        "id":               s.id,
        "start":            time_to_str(s.start_time),
        "end":              time_to_str(s.end_time),
        "start_time":       time_to_str(s.start_time),
        "end_time":         time_to_str(s.end_time),
        "duration":         f"{s.duration_minutes} min",
        "duration_minutes": s.duration_minutes,
        "status":           "Active now" if active else "Planned",
        "active":           active,
        "target_mw":        as_float(s.target_mw),
        "reason":           s.reason,
    }


def zone_today_schedules(db: Session, zone_id: int) -> list[CitizenProgramSchedule]:
    return (
        db.query(CitizenProgramSchedule)
        .filter(
            CitizenProgramSchedule.zone_id == zone_id,
            CitizenProgramSchedule.scheduled_date == today_tunis(),
            CitizenProgramSchedule.status != "cancelled",
        )
        .order_by(CitizenProgramSchedule.start_time.asc())
        .all()
    )


def zone_status_dict(zone: CitizenZone, active_schedule: Optional[CitizenProgramSchedule]) -> dict:
    if active_schedule:
        return {
            "status":       "outage",
            "status_label": "Coupure en cours",
            "description":  "Votre zone est actuellement en délestage planifié.",
        }
    raw = (zone.electricity_status or "").lower()
    if "outage" in raw or "scheduled" in raw or "emergency" in raw:
        return {
            "status":       "outage",
            "status_label": zone.electricity_status,
            "description":  "Une interruption est en cours dans votre zone.",
        }
    if "demand" in raw:
        return {
            "status":       "demand",
            "status_label": "Demande élevée",
            "description":  "L'électricité est disponible mais la demande est forte.",
        }
    return {
        "status":       "available",
        "status_label": "Alimentation normale",
        "description":  "L'électricité est disponible dans votre zone.",
    }


def zone_to_dict(db: Session, zone: CitizenZone, include_schedule: bool = True) -> dict:
    now       = tunis_now()
    schedules = zone_today_schedules(db, zone.id) if include_schedule else []
    active    = next((s for s in schedules if schedule_is_active(s, now)), None)
    situation = zone_status_dict(zone, active)
    return {
        "id":                  zone.id,
        "name":                zone.name,
        "governorate":         zone.governorate,
        "latitude":            zone.latitude,
        "longitude":           zone.longitude,
        "electricity_status":  "Coupure en cours" if active else zone.electricity_status,
        "currentStatus":       situation["status"],
        "currentStatusLabel":  situation["status_label"],
        "currentDescription":  situation["description"],
        "shedding": [
            schedule_to_item(s, now)
            for s in schedules
            if schedule_upcoming_or_active(s, now)
        ],
    }


def _make_citizen_token(citizen: Citizen, zone_name: str) -> CitizenTokenResponse:
    token_data = {
        "sub":     str(citizen.id),
        "role":    "citizen",
        "zone_id": citizen.zone_id,
    }
    from datetime import timedelta
    from app.core.config import settings
    from jose import jwt

    expire = tunis_now() + timedelta(minutes=CITIZEN_TOKEN_EXPIRE_MINUTES)
    payload = {**token_data, "exp": expire, "type": "access"}
    access_token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

    return CitizenTokenResponse(
        access_token=access_token,
        citizen_id=citizen.id,
        full_name=f"{citizen.first_name} {citizen.last_name}".strip(),
        zone_id=citizen.zone_id,
        zone_name=zone_name,
        feeder_id=citizen.feeder_id,
        governorate=citizen.governorate,
    )


def _notify_zone_citizens(
    db: Session,
    zone_id: int,
    title: str,
    message: str,
) -> None:
    citizens = (
        db.query(Citizen)
        .filter(
            Citizen.zone_id == zone_id,
            Citizen.is_active == True,
            Citizen.notifications_enabled == True,
        )
        .all()
    )
    for c in citizens:
        db.add(CitizenNotification(
            citizen_id=c.id,
            title=title,
            message=message,
        ))


# ── Registration helpers (public) ─────────────────────────────────────────────

@router.get("/governorates")
def list_governorates(db: Session = Depends(get_db)):
    """
    Distinct governorates that have at least one active feeder.
    Powers the first dropdown of the citizen registration cascade.
    No auth required.
    """
    from app.models.network import Feeder as FeederModel
    rows = (
        db.query(FeederModel.governorate)
        .filter(
            FeederModel.governorate.isnot(None),
            FeederModel.statut == "Actif",
        )
        .distinct()
        .order_by(FeederModel.governorate.asc())
        .all()
    )
    return [r.governorate for r in rows]


@router.get("/localities")
def list_localities(governorate: str, db: Session = Depends(get_db)):
    from app.models.network import Feeder as FeederModel
    rows = (
        db.query(FeederModel.id, FeederModel.nom, FeederModel.poste_source)
        .filter(
            FeederModel.governorate == governorate,
            FeederModel.statut == "Actif",
            FeederModel.priority != "P0",
        )
        .order_by(FeederModel.nom.asc())
        .all()
    )
    seen: set[str] = set()
    result = []
    for r in rows:
        if r.nom not in seen:
            seen.add(r.nom)
            result.append({
                "feeder_id":    r.id,
                "nom":          r.nom,
                "poste_source": r.poste_source,
            })
    return result


@router.get("/poste-sources")
def list_poste_sources(governorate: str, db: Session = Depends(get_db)):
    from app.models.network import Feeder as FeederModel
    rows = (
        db.query(FeederModel.poste_source)
        .filter(
            FeederModel.governorate == governorate,
            FeederModel.statut == "Actif",
            FeederModel.priority != "P0",
            FeederModel.poste_source.isnot(None),
        )
        .distinct()
        .order_by(FeederModel.poste_source.asc())
        .all()
    )
    return [r.poste_source for r in rows]


@router.get("/departes")
def list_departes(
    governorate:  str,
    poste_source: str,
    db: Session = Depends(get_db),
):
    from app.models.network import Feeder as FeederModel
    rows = (
        db.query(FeederModel)
        .filter(
            FeederModel.governorate == governorate,
            FeederModel.poste_source == poste_source,
            FeederModel.statut == "Actif",
            FeederModel.priority != "P0",
        )
        .order_by(FeederModel.ref.asc())
        .all()
    )
    return [
        {
            "feeder_id": r.id,
            "ref":       r.ref,
            "nom":       r.nom,   # libellé — used as display name in the dropdown
        }
        for r in rows
    ]


# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/health")
def health():
    return {
        "status": "ok",
        "date":   today_tunis().isoformat(),
        "time":   tunis_now().isoformat(),
    }


# ── Auth ──────────────────────────────────────────────────────────────────────

@router.post("/register", response_model=CitizenTokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: CitizenRegisterRequest, db: Session = Depends(get_db)):
    """Register a new citizen account and return a JWT immediately."""
    from app.models.network import Feeder as FeederModel

    zone_id = body.zone_id
    zone_resolved = False

    if body.feeder_id:
        feeder = db.get(FeederModel, body.feeder_id)
        if feeder and feeder.bcc_id:
            zone_via_bcc = (
                db.query(CitizenZone)
                .filter(CitizenZone.bcc_id == feeder.bcc_id)
                .first()
            )
            if zone_via_bcc:
                zone_id = zone_via_bcc.id
                zone_resolved = True

    if not zone_resolved and body.governorate:
        matched = (
            db.query(CitizenZone)
            .filter(CitizenZone.governorate.ilike(f"%{body.governorate}%"))
            .first()
        )
        if matched:
            zone_id = matched.id
            zone_resolved = True

    zone = db.get(CitizenZone, zone_id)
    if not zone:
        fallback = db.get(CitizenZone, 1)
        if fallback:
            zone_id = 1
            zone = fallback
        else:
            raise HTTPException(status_code=404, detail="Zone introuvable")

    existing = db.query(Citizen).filter(Citizen.email == body.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Un compte avec cet e-mail existe déjà",
        )

    citizen = Citizen(
        first_name=body.first_name,
        last_name=body.last_name,
        email=body.email,
        phone=body.phone,
        password_hash=hash_password(body.password),
        zone_id=zone_id,
        feeder_id=body.feeder_id,
        governorate=body.governorate or zone.governorate,
        address=body.address,
        is_active=True,
    )
    db.add(citizen)
    db.flush()

    db.add(CitizenNotification(
        citizen_id=citizen.id,
        title="Bienvenue sur STEG Portail Citoyen",
        message=(
            f"Bienvenue {citizen.first_name}. Votre compte est associé à la zone "
            f"« {zone.name} » ({zone.governorate}). "
            "Vous recevrez ici les alertes de délestage pour votre zone."
        ),
    ))
    db.commit()
    db.refresh(citizen)

    return _make_citizen_token(citizen, zone.name)


@router.post("/login", response_model=CitizenTokenResponse)
def login(body: CitizenLoginRequest, db: Session = Depends(get_db)):
    """Citizen login — returns a JWT valid for 7 days."""
    citizen = db.query(Citizen).filter(Citizen.email == body.email).first()

    if not citizen or not verify_password(body.password, citizen.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou mot de passe incorrect",
        )
    if not citizen.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte inactif — contacter STEG",
        )

    zone = db.get(CitizenZone, citizen.zone_id)
    zone_name = zone.name if zone else "Zone inconnue"

    return _make_citizen_token(citizen, zone_name)


# ── Zones (public) ────────────────────────────────────────────────────────────

@router.get("/zones")
def get_zones(db: Session = Depends(get_db)):
    """All zones with today's public schedule — used by the map. No auth required."""
    zones = (
        db.query(CitizenZone)
        .order_by(CitizenZone.governorate.asc(), CitizenZone.name.asc())
        .all()
    )
    return [zone_to_dict(db, z) for z in zones]


@router.get("/zones/{zone_id}")
def get_zone(zone_id: int, db: Session = Depends(get_db)):
    zone = db.get(CitizenZone, zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail="Zone introuvable")
    return zone_to_dict(db, zone)


# ── Virtual check (public) ────────────────────────────────────────────────────

@router.get("/virtual-check")
def virtual_check(zone_id: int = Query(..., ge=1), db: Session = Depends(get_db)):
    """Check electricity status for any zone without authentication."""
    zone = db.get(CitizenZone, zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail="Zone introuvable")

    now          = tunis_now()
    schedules    = zone_today_schedules(db, zone.id)
    active_sched = next((s for s in schedules if schedule_is_active(s, now)), None)
    situation    = zone_status_dict(zone, active_sched)
    today_items  = [
        schedule_to_item(s, now)
        for s in schedules
        if schedule_upcoming_or_active(s, now)
    ]

    return {
        "date": today_tunis().isoformat(),
        "zone": {
            "id":                  zone.id,
            "name":                zone.name,
            "governorate":         zone.governorate,
            "latitude":            zone.latitude,
            "longitude":           zone.longitude,
            "electricity_status":  "Coupure en cours" if active_sched else zone.electricity_status,
            "currentStatus":       situation["status"],
            "currentStatusLabel":  situation["status_label"],
            "currentDescription":  situation["description"],
        },
        "current_situation": {
            **situation,
            "under_shedding":  active_sched is not None,
            "active_shedding": schedule_to_item(active_sched, now) if active_sched else None,
        },
        "upcoming_shedding_today": today_items,
        "total_interruptions":     len(today_items),
    }


# ── Schedules (public) ────────────────────────────────────────────────────────

@router.get("/schedules")
def list_schedules(
    target_date: Optional[date] = None,
    zone_id:     Optional[int]  = None,
    db: Session = Depends(get_db),
):
    q = db.query(CitizenProgramSchedule)
    if target_date:
        q = q.filter(CitizenProgramSchedule.scheduled_date == target_date)
    if zone_id:
        q = q.filter(CitizenProgramSchedule.zone_id == zone_id)
    rows = q.order_by(
        CitizenProgramSchedule.scheduled_date.asc(),
        CitizenProgramSchedule.start_time.asc(),
    ).all()
    return [schedule_to_item(s) for s in rows]


# ── Citizen profile (protected) ───────────────────────────────────────────────

@router.get("/me", response_model=CitizenOut)
def get_me(citizen: Citizen = Depends(get_current_citizen)):
    """Return the authenticated citizen's profile."""
    return citizen


@router.patch("/me", response_model=CitizenOut)
def update_me(
    body:    CitizenSettingsUpdate,
    citizen: Citizen = Depends(get_current_citizen),
    db:      Session = Depends(get_db),
):
    """Update citizen settings (phone, address, notifications_enabled)."""
    if body.notifications_enabled is not None:
        citizen.notifications_enabled = body.notifications_enabled
    if body.phone is not None:
        citizen.phone = body.phone
    if body.address is not None:
        citizen.address = body.address
    db.commit()
    db.refresh(citizen)
    return citizen


# ── Citizen dashboard (protected) ─────────────────────────────────────────────

@router.get("/dashboard/me")
def citizen_dashboard_me(
    citizen: Citizen = Depends(get_current_citizen),
    db:      Session = Depends(get_db),
):
    zone = db.get(CitizenZone, citizen.zone_id)
    if not zone:
        raise HTTPException(status_code=409, detail="Zone introuvable")

    now            = tunis_now()
    schedules      = zone_today_schedules(db, zone.id)
    active_sched   = next((s for s in schedules if schedule_is_active(s, now)), None)
    situation      = zone_status_dict(zone, active_sched)
    today_schedule = [
        schedule_to_item(s, now)
        for s in schedules
        if schedule_upcoming_or_active(s, now)
    ]
    unread_count = (
        db.query(CitizenNotification)
        .filter(
            CitizenNotification.citizen_id == citizen.id,
            CitizenNotification.is_read == False,
        )
        .count()
    )

    return {
        "date": today_tunis().isoformat(),
        "citizen": {
            "id":          citizen.id,
            "first_name":  citizen.first_name,
            "last_name":   citizen.last_name,
            "name":        f"{citizen.first_name} {citizen.last_name}".strip(),
            "email":       citizen.email,
            "phone":       citizen.phone,
            "zone_id":     citizen.zone_id,
            "governorate": citizen.governorate or zone.governorate,
            "address":     citizen.address,
        },
        "zone": {
            "id":                 zone.id,
            "name":               zone.name,
            "governorate":        zone.governorate,
            "latitude":           zone.latitude,
            "longitude":          zone.longitude,
            "electricity_status": "Coupure en cours" if active_sched else zone.electricity_status,
        },
        "current_situation": {
            **situation,
            "under_shedding":  active_sched is not None,
            "active_shedding": schedule_to_item(active_sched, now) if active_sched else None,
        },
        "today_schedule":       today_schedule,
        "total_interruptions":  len(today_schedule),
        "unread_notifications": unread_count,
    }


# ── Legacy dashboard by ID (backwards compat) ────────────────────────────────

@router.get("/dashboard/{citizen_id}")
def citizen_dashboard_by_id(citizen_id: int, db: Session = Depends(get_db), me: Citizen = Depends(get_current_citizen)):
    if me.id != citizen_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    citizen = db.get(Citizen, citizen_id)
    if not citizen:
        raise HTTPException(status_code=404, detail="Citoyen introuvable")
    if not citizen.is_active:
        raise HTTPException(status_code=403, detail="Compte inactif")

    zone = db.get(CitizenZone, citizen.zone_id)
    if not zone:
        raise HTTPException(status_code=409, detail="Zone du citoyen introuvable")

    now            = tunis_now()
    schedules      = zone_today_schedules(db, zone.id)
    active_sched   = next((s for s in schedules if schedule_is_active(s, now)), None)
    situation      = zone_status_dict(zone, active_sched)
    today_schedule = [
        schedule_to_item(s, now)
        for s in schedules
        if schedule_upcoming_or_active(s, now)
    ]

    return {
        "date": today_tunis().isoformat(),
        "citizen": {
            "id":          citizen.id,
            "first_name":  citizen.first_name,
            "last_name":   citizen.last_name,
            "name":        f"{citizen.first_name} {citizen.last_name}".strip(),
            "email":       citizen.email,
            "phone":       citizen.phone,
            "zone_id":     citizen.zone_id,
            "governorate": citizen.governorate or zone.governorate,
            "address":     citizen.address,
        },
        "zone": {
            "id":                 zone.id,
            "name":               zone.name,
            "governorate":        zone.governorate,
            "latitude":           zone.latitude,
            "longitude":          zone.longitude,
            "electricity_status": "Coupure en cours" if active_sched else zone.electricity_status,
        },
        "current_situation": {
            **situation,
            "under_shedding":  active_sched is not None,
            "active_shedding": schedule_to_item(active_sched, now) if active_sched else None,
        },
        "today_schedule":      today_schedule,
        "total_interruptions": len(today_schedule),
    }


# ── Feeder-level personal schedule (protected) ────────────────────────────────

@router.get("/feeder-schedule")
def feeder_schedule(
    target_date: Optional[date] = None,
    citizen:     Citizen        = Depends(get_current_citizen),
    db:          Session        = Depends(get_db),
):
    """
    Returns the full daily shedding schedule for the authenticated citizen's
    specific HTA feeder (départ), merging two sources read directly from the DB:

      1. J+1 programme slots where this feeder's ref appears in the BCC's
         validated feeder_refs column  →  planned cuts.
      2. Actual Execution rows for this feeder today  →  live / historical cuts.

    The citizen portal reads the same shared database as the SCADA backend but
    only exposes citizen-safe fields — no operator names, no order IDs.

    Falls back to zone-level CitizenProgramSchedule if the citizen has no feeder_id.
    """
    from app.models.network import Feeder as FeederModel

    use_date = target_date or today_tunis()
    now      = tunis_now()

    # ── Resolve feeder ────────────────────────────────────────────────────────
    feeder = db.get(FeederModel, citizen.feeder_id) if citizen.feeder_id else None

    # ── Fallback: zone-level schedules ────────────────────────────────────────
    if not feeder:
        zone = db.get(CitizenZone, citizen.zone_id)
        if not zone:
            return {
                "date": use_date.isoformat(), "feeder": None,
                "source": "none", "slots": [], "total": 0, "has_active": False,
            }
        zone_slots = (
            db.query(CitizenProgramSchedule)
            .filter(
                CitizenProgramSchedule.zone_id        == zone.id,
                CitizenProgramSchedule.scheduled_date == use_date,
                CitizenProgramSchedule.status         != "cancelled",
            )
            .order_by(CitizenProgramSchedule.start_time.asc())
            .all()
        )
        items = []
        for s in zone_slots:
            item = schedule_to_item(s, now)
            item["source"] = "zone"
            items.append(item)
        return {
            "date": use_date.isoformat(), "feeder": None,
            "source": "zone", "slots": items,
            "total": len(items), "has_active": any(i["active"] for i in items),
        }

    feeder_info = {
        "id":           feeder.id,
        "ref":          feeder.ref,
        "nom":          feeder.nom,
        "poste_source": feeder.poste_source,
        "governorate":  feeder.governorate,
        "priority":     feeder.priority,
    }

    # ── 1. Planned slots from J+1 programme ───────────────────────────────────
    programme_items: list[dict] = []
    prog = (
        db.query(Programme)
        .filter(Programme.programme_date == use_date)
        .first()
    )
    if prog:
        bcc_slots = (
            db.query(ProgrammeSlot)
            .filter(
                ProgrammeSlot.programme_id == prog.id,
                ProgrammeSlot.bcc_id       == feeder.bcc_id,
                ProgrammeSlot.feeder_refs.isnot(None),
            )
            .order_by(ProgrammeSlot.time_slot.asc())
            .all()
        )
        for slot in bcc_slots:
            refs = [r.strip() for r in (slot.feeder_refs or "").split(",") if r.strip()]
            if feeder.ref not in refs:
                continue
            try:
                h, m  = map(int, slot.time_slot.split(":"))
                end_m = (h * 60 + m + 30) % (24 * 60)
            except (ValueError, AttributeError):
                continue

            start_str = f"{h:02d}:{m:02d}"
            end_str   = f"{end_m // 60:02d}:{end_m % 60:02d}"
            start_dt  = datetime(use_date.year, use_date.month, use_date.day, h, m, tzinfo=TUNIS_TZ)
            end_dt    = datetime(use_date.year, use_date.month, use_date.day, end_m // 60, end_m % 60, tzinfo=TUNIS_TZ)
            is_active = start_dt <= now < end_dt
            is_past   = end_dt <= now

            if is_active:
                slot_status = "Active now"
            elif is_past:
                slot_status = "Executed"
            else:
                slot_status = "Planned"

            programme_items.append({
                "id":               f"prog-{prog.id}-{slot.id}",
                "start":            start_str,
                "end":              end_str,
                "start_time":       start_str,
                "end_time":         end_str,
                "duration_minutes": 30,
                "duration":         "30 min",
                "status":           slot_status,
                "active":           is_active,
                "source":           "programme",
                "mw_planned":       float(slot.mw_bcc) if slot.mw_bcc else None,
                "reason":           None,
            })

    # ── 2. Actual executions on this feeder today ─────────────────────────────
    day_start = datetime(use_date.year, use_date.month, use_date.day,  0,  0, 0, tzinfo=TUNIS_TZ)
    day_end   = datetime(use_date.year, use_date.month, use_date.day, 23, 59, 59, tzinfo=TUNIS_TZ)

    exec_rows = (
        db.query(Execution)
        .filter(
            Execution.feeder_id == feeder.id,
            Execution.status.in_(["executing", "restored"]),
            Execution.started_at >= day_start,
            Execution.started_at <= day_end,
        )
        .order_by(Execution.started_at.asc())
        .all()
    )

    execution_items: list[dict] = []
    for ex in exec_rows:
        started_local = ex.started_at.astimezone(TUNIS_TZ)
        if ex.ended_at:
            ended_local = ex.ended_at.astimezone(TUNIS_TZ)
            dur_min     = max(1, int((ex.ended_at - ex.started_at).total_seconds() / 60))
        else:
            ended_local = now
            dur_min     = max(1, int((now - ex.started_at).total_seconds() / 60))

        is_active = ex.status == "executing"
        execution_items.append({
            "id":               ex.id,
            "start":            started_local.strftime("%H:%M"),
            "end":              ended_local.strftime("%H:%M"),
            "start_time":       started_local.strftime("%H:%M"),
            "end_time":         ended_local.strftime("%H:%M"),
            "duration_minutes": dur_min,
            "duration":         f"{dur_min} min",
            "status":           "Active now" if is_active else "Executed",
            "active":           is_active,
            "source":           "execution",
            "mw_planned":       float(ex.mw_shed) if ex.mw_shed else None,
            "reason":           ex.notes,
        })

    # ── 3. Merge: executions take priority; programme fills the gaps ──────────
    def slot_window(start_str: str) -> int:
        try:
            h, m = map(int, start_str.split(":"))
            return (h * 60 + m) // 30
        except (ValueError, AttributeError):
            return -1

    covered = {slot_window(e["start"]) for e in execution_items}
    raw: list[dict] = list(execution_items)
    for p in programme_items:
        if slot_window(p["start"]) not in covered:
            raw.append(p)

    raw.sort(key=lambda x: x["start"])

    # ── 4. Consolidate consecutive 30-min windows into single blocks ──────────
    # Two slots are consecutive when the first slot's end == the second slot's
    # start AND they share the same status group (past/active/future).
    # MW is averaged across the merged block; id becomes a range string.

    def status_group(s: str) -> str:
        """Reduce the four statuses to three merge-compatible groups."""
        if s == "Active now":
            return "active"
        if s == "Executed":
            return "past"
        return "future"   # Planned or Cancelled

    def merge_consecutive(slots: list[dict]) -> list[dict]:
        if not slots:
            return []

        result: list[dict] = []
        cur = dict(slots[0])  # work on a copy
        mw_list: list[float] = [cur["mw_planned"]] if cur["mw_planned"] is not None else []

        for nxt in slots[1:]:
            # Consecutive = cur.end == nxt.start  AND  same status group
            same_group  = status_group(cur["status"]) == status_group(nxt["status"])
            end_eq_start = cur["end"] == nxt["start"]

            if same_group and end_eq_start:
                # Extend the current block
                cur["end"]              = nxt["end"]
                cur["end_time"]         = nxt["end_time"]
                cur["duration_minutes"] = cur["duration_minutes"] + nxt["duration_minutes"]
                cur["duration"]         = f"{cur['duration_minutes']} min"
                # Keep the "worst" status within the group
                # (Active now > Executed > Planned — active always wins)
                if nxt["status"] == "Active now":
                    cur["status"] = "Active now"
                    cur["active"] = True
                # Accumulate MW for averaging later
                if nxt["mw_planned"] is not None:
                    mw_list.append(nxt["mw_planned"])
                # Composite id
                cur["id"] = f"{cur['id']}+{nxt['id']}"
            else:
                # Flush current block
                cur["mw_planned"] = round(sum(mw_list) / len(mw_list), 1) if mw_list else None
                result.append(cur)
                cur     = dict(nxt)
                mw_list = [nxt["mw_planned"]] if nxt["mw_planned"] is not None else []

        # Flush last block
        cur["mw_planned"] = round(sum(mw_list) / len(mw_list), 1) if mw_list else None
        result.append(cur)
        return result

    consolidated = merge_consecutive(raw)

    # ── 5. Re-evaluate status after merging ───────────────────────────────────
    # Merging can inherit a stale "Planned" from a sub-slot that was already in
    # the past.  Recompute each block's status against the current time so that
    # any merged block whose end has passed is shown as "Executed".
    for block in consolidated:
        try:
            bh, bm = map(int, block["start"].split(":"))
            eh, em = map(int, block["end"].split(":"))
        except (ValueError, AttributeError):
            continue

        block_start = datetime(use_date.year, use_date.month, use_date.day, bh, bm, tzinfo=TUNIS_TZ)
        # end "00:00" means midnight = start of next day
        if eh == 0 and em == 0:
            from datetime import timedelta
            block_end = datetime(use_date.year, use_date.month, use_date.day, tzinfo=TUNIS_TZ) + timedelta(days=1)
        else:
            block_end = datetime(use_date.year, use_date.month, use_date.day, eh, em, tzinfo=TUNIS_TZ)

        if block_start <= now < block_end:
            block["status"] = "Active now"
            block["active"] = True
        elif block_end <= now:
            block["status"] = "Executed"
            block["active"] = False
        else:
            if block["status"] not in ("Cancelled",):
                block["status"] = "Planned"
            block["active"] = False

    return {
        "date":       use_date.isoformat(),
        "feeder":     feeder_info,
        "source":     "feeder",
        "slots":      consolidated,
        "total":      len(consolidated),
        "has_active": any(s["active"] for s in consolidated),
    }


# ── Notifications (protected) ─────────────────────────────────────────────────

@router.get("/notifications", response_model=list[NotificationOut])
def get_notifications(
    unread_only: bool = Query(False, description="Return only unread notifications"),
    citizen: Citizen = Depends(get_current_citizen),
    db:      Session = Depends(get_db),
):
    """List the authenticated citizen's notifications, newest first."""
    q = (
        db.query(CitizenNotification)
        .filter(CitizenNotification.citizen_id == citizen.id)
    )
    if unread_only:
        q = q.filter(CitizenNotification.is_read == False)
    return q.order_by(CitizenNotification.created_at.desc()).all()


@router.get("/notifications/unread-count", response_model=NotificationUnreadCount)
def get_unread_count(
    citizen: Citizen = Depends(get_current_citizen),
    db:      Session = Depends(get_db),
):
    count = (
        db.query(CitizenNotification)
        .filter(
            CitizenNotification.citizen_id == citizen.id,
            CitizenNotification.is_read == False,
        )
        .count()
    )
    return NotificationUnreadCount(unread_count=count)


@router.patch("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    citizen: Citizen = Depends(get_current_citizen),
    db:      Session = Depends(get_db),
):
    notif = db.get(CitizenNotification, notification_id)
    if not notif or notif.citizen_id != citizen.id:
        raise HTTPException(status_code=404, detail="Notification introuvable")
    notif.is_read = True
    db.commit()
    return {"ok": True, "id": notification_id}


@router.patch("/notifications/read-all")
def mark_all_read(
    citizen: Citizen = Depends(get_current_citizen),
    db:      Session = Depends(get_db),
):
    (
        db.query(CitizenNotification)
        .filter(
            CitizenNotification.citizen_id == citizen.id,
            CitizenNotification.is_read == False,
        )
        .update({"is_read": True})
    )
    db.commit()
    return {"ok": True}


# ── Citizens read (legacy, no auth) ──────────────────────────────────────────

@router.get("/citizens/{citizen_id}")
def get_citizen(citizen_id: int, db: Session = Depends(get_db), me: Citizen = Depends(get_current_citizen)):
    if me.id != citizen_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    citizen = db.get(Citizen, citizen_id)
    if not citizen:
        raise HTTPException(status_code=404, detail="Citoyen introuvable")
    if not citizen.is_active:
        raise HTTPException(status_code=403, detail="Compte inactif")
    zone = db.get(CitizenZone, citizen.zone_id)
    if not zone:
        raise HTTPException(status_code=409, detail="Zone du citoyen introuvable")
    return {
        "id":          citizen.id,
        "first_name":  citizen.first_name,
        "last_name":   citizen.last_name,
        "name":        f"{citizen.first_name} {citizen.last_name}".strip(),
        "email":       citizen.email,
        "phone":       citizen.phone,
        "zone_id":     citizen.zone_id,
        "governorate": citizen.governorate or zone.governorate,
        "address":     citizen.address,
        "is_active":   citizen.is_active,
    }


# ── Notify zone helper (called by executions route) ───────────────────────────

def notify_zone_on_schedule(
    db:      Session,
    zone_id: int,
    title:   str,
    message: str,
) -> None:
    _notify_zone_citizens(db, zone_id, title, message)


# ── Governorate-level shedding status (public) ───────────────────────────────

@router.get("/governorate-status")
def governorate_status(db: Session = Depends(get_db)):
    """
    Returns live shedding status for every governorate that has at least one
    active feeder.  Data is read directly from the shared database — this
    endpoint is entirely independent of the SCADA backend.

    Response shape (array):
      [
        {
          "governorate": "Béja",
          "total":       12,          # active feeders in this governorate
          "executing":   3,           # feeders currently executing a cut
          "ratio":       0.25,        # executing / total  (0 → 1)
          "status":      "demand",    # "available" | "demand" | "outage"
          "postes": [
            {
              "name":    "Béja Centre TR1",
              "feeders": [
                {
                  "feeder_id": 7,
                  "ref":       "F07",
                  "nom":       "Z.I. Béja Nord",
                  "zone":      "Béja",
                  "priority":  "P3",
                  "state":     "executing"  # "executing" | "normal" | "protected"
                }
              ]
            }
          ]
        }
      ]

    Status derivation:
      ratio == 0          → "available"
      0 < ratio ≤ 0.60   → "demand"
      ratio > 0.60        → "outage"
    """
    from app.models.network import Feeder as FeederModel

    # ── 1. All active feeders ─────────────────────────────────────────────────
    feeders = (
        db.query(FeederModel)
        .filter(
            FeederModel.statut == "Actif",
            FeederModel.governorate.isnot(None),
            FeederModel.priority != "P0",
        )
        .order_by(FeederModel.governorate.asc(), FeederModel.poste_source.asc(), FeederModel.ref.asc())
        .all()
    )

    # ── 2. Currently-executing feeder IDs (single query) ─────────────────────
    executing_ids: set[int] = {
        row.feeder_id
        for row in db.query(Execution.feeder_id)
        .filter(Execution.status == "executing")
        .all()
    }

    # ── 3. Group feeders → postes → governorates ──────────────────────────────
    #  govs[gov_name] = {"total": int, "executing": int, "postes": {poste_name: [feeder_dict]}}
    from collections import defaultdict

    govs: dict[str, dict] = {}

    for f in feeders:
        gov = f.governorate
        if gov not in govs:
            govs[gov] = {"total": 0, "executing": 0, "postes": defaultdict(list)}

        # Determine per-feeder state
        if f.priority == "P0":
            state = "protected"
        elif f.id in executing_ids:
            state = "executing"
        else:
            state = "normal"

        govs[gov]["total"] += 1
        if state == "executing":
            govs[gov]["executing"] += 1

        govs[gov]["postes"][f.poste_source or "Inconnu"].append({
            "feeder_id": f.id,
            "ref":       f.ref,
            "nom":       f.nom,
            "zone":      f.governorate,
            "priority":  f.priority,
            "state":     state,
        })

    # ── 4. Build output list ──────────────────────────────────────────────────
    result = []
    for gov, data in sorted(govs.items()):
        total     = data["total"]
        executing = data["executing"]
        ratio     = executing / total if total > 0 else 0.0

        if ratio == 0:
            status = "available"
        elif ratio <= 0.60:
            status = "demand"
        else:
            status = "outage"

        postes_list = [
            {"name": poste_name, "feeders": feeder_list}
            for poste_name, feeder_list in sorted(data["postes"].items())
        ]

        result.append({
            "governorate": gov,
            "total":       total,
            "executing":   executing,
            "ratio":       round(ratio, 4),
            "status":      status,
            "postes":      postes_list,
        })

    return result


# ── AI status ────────────────────────────────────────────────────────────────

@router.get("/ai/status")
def ai_status():
    return {
        "enabled":  True,
        "provider": "ollama",
        "model":    "qwen3:8b",
        "message":  "L'assistant citoyen est connecté et opérationnel.",
    }


# ── AI citizen chat (protected) ───────────────────────────────────────────────

class CitizenChatMessage(BaseModel):
    role:    str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=2000)


class CitizenChatRequest(BaseModel):
    messages: list[CitizenChatMessage] = Field(
        ...,
        min_length=1,
        max_length=20,
        description="Conversation history — last message must be role=user",
    )


class CitizenChatResponse(BaseModel):
    reply: str
    model: str = "qwen3:8b"


from app.services.ai_service import chat_with_citizen_context

@router.post("/ai/chat", response_model=CitizenChatResponse)
async def citizen_ai_chat(
    body:    CitizenChatRequest,
    citizen: Citizen = Depends(get_current_citizen),
    db:      Session = Depends(get_db),
):
    import logging as _logging
    _log = _logging.getLogger(__name__)

    if body.messages[-1].role != "user":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Le dernier message doit être de rôle 'user'.",
        )

    _log.info("[AI/citizen] chat — citizen_id=%s", citizen.id)

    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    try:
        reply = await chat_with_citizen_context(
            citizen_id = citizen.id,
            messages   = messages,
            db         = db,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )

    return CitizenChatResponse(reply=reply)
