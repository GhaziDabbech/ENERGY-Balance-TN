"""ENERGY Balance TN - FastAPI backend.

Run from the backend folder:   uvicorn main:app --reload
Interactive docs:              http://127.0.0.1:8000/docs

Access rules:
- Public: health, zone NAMES for the signup form, login/register.
- Citizen token: only their own profile, their own zone status, the citizen chatbot.
- Staff token: admin endpoints, restricted by role (admin, dn, crc_nord, crc_sud, bcc).
"""
from datetime import date, datetime, time, timedelta
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from auth import (create_token, get_current_citizen, get_current_staff, hash_password,
                  require_roles, verify_password)
from database import get_db
from logic import (MAX_CUT_MINUTES, allocate_to_bcc, allowed_bcc_ids, as_float, audit,
                   build_j1_program, citizen_zone_status, compute_kpi, estimate_national_deficit,
                   feeder_explanation, hhmm, iso, record_execution_on_feeder, schedule_is_active,
                   select_feeders, split_regional_target, today_tunis, tunis_now)
from models import (AuditLog, BCC, Citizen, ExecutionLog, Feeder, LoadResourceData,
                    NationalTarget, ProgramSchedule, Region, StaffUser, Zone)

app = FastAPI(title="ENERGY Balance TN API", version="2.0.0",
              description="Backend of the national intelligent load-shedding platform (PESTGM 7.0, Track 2).")

app.add_middleware(CORSMiddleware,
                   allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

ZONE_STATUSES = {"Power Available", "High Demand", "Scheduled Outage", "Emergency Outage", "Unknown"}


def _bad(status: int, detail: str):
    raise HTTPException(status_code=status, detail=detail)


def _check_bcc_access(db: Session, staff: StaffUser, bcc_id: int) -> None:
    allowed = allowed_bcc_ids(db, staff)
    if allowed is not None and bcc_id not in allowed:
        _bad(403, "You can only act on your own BCC / region.")


# ============================================================
# HEALTH / ROOT
# ============================================================

@app.get("/")
def root():
    return {"project": "ENERGY Balance TN", "status": "running", "docs": "/docs"}


@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        _bad(503, f"Database connection failed: {exc}")
    return {"status": "ok", "database": "connected", "time_tunis": tunis_now().isoformat()}


# ============================================================
# PUBLIC: zone names for the signup form (NO status, NO schedules)
# ============================================================

@app.get("/api/public/zones")
def public_zone_names(db: Session = Depends(get_db)):
    zones = db.query(Zone).order_by(Zone.governorate, Zone.name).all()
    return [{"id": z.id, "name": z.name, "governorate": z.governorate} for z in zones]


# ============================================================
# AUTH
# ============================================================

class LoginIn(BaseModel):
    email: EmailStr
    password: str


class CitizenRegisterIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8)
    zone_id: int
    phone: Optional[str] = None
    address: Optional[str] = None


def _citizen_profile(c: Citizen) -> dict:
    return {"id": c.id, "first_name": c.first_name, "last_name": c.last_name,
            "name": f"{c.first_name} {c.last_name}".strip(), "email": c.email, "phone": c.phone,
            "zone_id": c.zone_id, "zone_name": c.zone.name if c.zone else None,
            "governorate": c.governorate or (c.zone.governorate if c.zone else None), "address": c.address}


@app.post("/api/auth/citizen/register")
def citizen_register(payload: CitizenRegisterIn, db: Session = Depends(get_db)):
    if db.query(Citizen).filter(Citizen.email == payload.email.lower()).first():
        _bad(409, "An account with this email already exists.")
    zone = db.get(Zone, payload.zone_id)
    if not zone:
        _bad(400, "Unknown zone.")
    citizen = Citizen(first_name=payload.first_name, last_name=payload.last_name,
                      email=payload.email.lower(), password_hash=hash_password(payload.password),
                      zone_id=zone.id, governorate=zone.governorate, phone=payload.phone, address=payload.address)
    db.add(citizen)
    db.flush()
    audit(db, citizen, "citizen_registered", f"zone={zone.name}")
    db.commit()
    db.refresh(citizen)
    return {"token": create_token("citizen", citizen.id), "citizen": _citizen_profile(citizen)}


@app.post("/api/auth/citizen/login")
def citizen_login(payload: LoginIn, db: Session = Depends(get_db)):
    citizen = db.query(Citizen).filter(Citizen.email == payload.email.lower()).first()
    if not citizen or not citizen.is_active or not verify_password(payload.password, citizen.password_hash):
        _bad(401, "Wrong email or password.")
    return {"token": create_token("citizen", citizen.id), "citizen": _citizen_profile(citizen)}


@app.post("/api/auth/staff/login")
def staff_login(payload: LoginIn, db: Session = Depends(get_db)):
    staff = db.query(StaffUser).filter(StaffUser.email == payload.email.lower()).first()
    if not staff or not staff.is_active or not verify_password(payload.password, staff.password_hash):
        _bad(401, "Wrong email or password.")
    audit(db, staff, "staff_login")
    db.commit()
    return {"token": create_token("staff", staff.id),
            "staff": {"id": staff.id, "full_name": staff.full_name, "email": staff.email,
                      "role": staff.role, "bcc_id": staff.bcc_id,
                      "bcc_name": staff.bcc.name if staff.bcc else None}}


# ============================================================
# CITIZEN (own zone only - the zone always comes from the token)
# ============================================================

@app.get("/api/citizen/me")
def citizen_me(citizen: Citizen = Depends(get_current_citizen)):
    return _citizen_profile(citizen)


@app.get("/api/citizen/dashboard")
def citizen_dashboard(citizen: Citizen = Depends(get_current_citizen), db: Session = Depends(get_db)):
    status = citizen_zone_status(db, citizen.zone)
    return {"date": today_tunis().isoformat(), "citizen": _citizen_profile(citizen), **status,
            "total_interruptions": len(status["today_schedule"])}


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    history: Optional[List[dict]] = None


@app.post("/api/chat/citizen")
def chat_citizen_endpoint(payload: ChatIn, citizen: Citizen = Depends(get_current_citizen),
                          db: Session = Depends(get_db)):
    from chatbot.chat import chat_citizen
    return {"reply": chat_citizen(db, payload.message, citizen.zone_id)}


# ============================================================
# STAFF: zones, network, data
# ============================================================

def _zone_admin_dict(db: Session, zone: Zone) -> dict:
    now = tunis_now()
    today = (db.query(ProgramSchedule)
             .filter(ProgramSchedule.zone_id == zone.id, ProgramSchedule.scheduled_date == now.date(),
                     ProgramSchedule.status != "cancelled")
             .order_by(ProgramSchedule.start_time).all())
    active = next((s for s in today if schedule_is_active(s, now)), None)
    return {"id": zone.id, "name": zone.name, "governorate": zone.governorate,
            "latitude": zone.latitude, "longitude": zone.longitude,
            "electricity_status": "Currently Under Shedding" if active else zone.electricity_status,
            "under_shedding": active is not None,
            "today": [{"id": s.id, "feeder_id": s.feeder_id, "start": hhmm(s.start_time), "end": hhmm(s.end_time),
                       "status": s.status} for s in today]}


@app.get("/api/admin/zones")
def admin_zones(staff: StaffUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    return [_zone_admin_dict(db, z) for z in db.query(Zone).order_by(Zone.governorate, Zone.name).all()]


class ZoneStatusIn(BaseModel):
    electricity_status: str


@app.patch("/api/admin/zones/{zone_id}/status")
def update_zone_status(zone_id: int, payload: ZoneStatusIn,
                       staff: StaffUser = Depends(require_roles("admin", "dn")), db: Session = Depends(get_db)):
    if payload.electricity_status not in ZONE_STATUSES:
        _bad(400, f"Invalid status. Allowed: {sorted(ZONE_STATUSES)}")
    zone = db.get(Zone, zone_id) or _bad(404, "Zone not found")
    old = zone.electricity_status
    zone.electricity_status = payload.electricity_status
    audit(db, staff, "zone_status_changed", f"{zone.name}: {old} -> {payload.electricity_status}")
    db.commit()
    return _zone_admin_dict(db, zone)


@app.get("/api/admin/regions")
def list_regions(staff: StaffUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    return [{"id": r.id, "name": r.name, "code": r.code, "target_ratio": as_float(r.target_ratio)}
            for r in db.query(Region).order_by(Region.id).all()]


@app.get("/api/admin/bcc")
def list_bcc(staff: StaffUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    allowed = allowed_bcc_ids(db, staff)
    q = db.query(BCC).order_by(BCC.id)
    if allowed is not None:
        q = q.filter(BCC.id.in_(allowed))
    return [{"id": b.id, "name": b.name, "avg_load_mw": as_float(b.avg_load_mw), "crc": b.crc} for b in q.all()]


@app.get("/api/admin/feeders")
def list_feeders(bcc_id: Optional[int] = None, staff: StaffUser = Depends(get_current_staff),
                 db: Session = Depends(get_db)):
    allowed = allowed_bcc_ids(db, staff)
    q = db.query(Feeder).order_by(Feeder.id)
    if allowed is not None:
        q = q.filter(Feeder.bcc_id.in_(allowed))
    if bcc_id:
        q = q.filter(Feeder.bcc_id == bcc_id)
    return [{"id": f.id, "name": f.name, "bcc_id": f.bcc_id, "zone_id": f.zone_id, "zone_name": f.zone.name,
             "priority_level": f.priority_level, "avg_load_mw": as_float(f.avg_load_mw),
             "last_cut_at": iso(f.last_cut_at), "total_cuts_month": f.total_cuts_month, "active": f.active}
            for f in q.all()]


@app.get("/api/admin/feeders/{feeder_id}/explanation")
def explain_feeder(feeder_id: int, staff: StaffUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    feeder = db.get(Feeder, feeder_id) or _bad(404, "Feeder not found")
    _check_bcc_access(db, staff, feeder.bcc_id)
    return feeder_explanation(feeder)


class NationalTargetIn(BaseModel):
    target_date: date
    target_mw: float = Field(ge=0)


@app.get("/api/admin/national-target")
def list_national_targets(staff: StaffUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    rows = db.query(NationalTarget).order_by(NationalTarget.target_date.desc(), NationalTarget.id.desc()).all()
    return [{"id": r.id, "target_date": r.target_date.isoformat(), "target_mw": as_float(r.target_mw)} for r in rows]


@app.post("/api/admin/national-target")
def create_national_target(payload: NationalTargetIn, staff: StaffUser = Depends(require_roles("admin", "dn")),
                           db: Session = Depends(get_db)):
    row = NationalTarget(target_date=payload.target_date, target_mw=payload.target_mw)
    db.add(row)
    audit(db, staff, "national_target_set", f"{payload.target_date}: {payload.target_mw} MW")
    db.commit()
    return {"id": row.id, "target_date": row.target_date.isoformat(), "target_mw": as_float(row.target_mw)}


class LoadResourceIn(BaseModel):
    target_date: date
    slot_index: int = Field(ge=0)
    time_step_minutes: int = Field(default=30, gt=0)
    load_mw: float = Field(ge=0)
    available_mw: float = Field(ge=0)


@app.get("/api/admin/load-resource")
def list_load_resource(target_date: Optional[date] = None, staff: StaffUser = Depends(get_current_staff),
                       db: Session = Depends(get_db)):
    q = db.query(LoadResourceData)
    if target_date:
        q = q.filter(LoadResourceData.target_date == target_date)
    return [{"id": r.id, "target_date": r.target_date.isoformat(), "slot_index": r.slot_index,
             "time_step_minutes": r.time_step_minutes, "load_mw": as_float(r.load_mw),
             "available_mw": as_float(r.available_mw)}
            for r in q.order_by(LoadResourceData.target_date, LoadResourceData.slot_index).all()]


@app.post("/api/admin/load-resource")
def create_load_resource(payload: LoadResourceIn, staff: StaffUser = Depends(require_roles("admin", "dn")),
                         db: Session = Depends(get_db)):
    exists = (db.query(LoadResourceData).filter(LoadResourceData.target_date == payload.target_date,
                                                LoadResourceData.slot_index == payload.slot_index).first())
    if exists:
        _bad(409, "A record already exists for this date and slot.")
    row = LoadResourceData(**payload.model_dump())
    db.add(row)
    db.commit()
    return {"id": row.id, **payload.model_dump(mode="json")}


# ============================================================
# STAFF: DN -> CRC -> BCC planning chain
# ============================================================

@app.post("/api/admin/generate-j1")
def generate_j1(target_date: date, staff: StaffUser = Depends(require_roles("admin", "dn")),
                db: Session = Depends(get_db)):
    rows = (db.query(LoadResourceData).filter(LoadResourceData.target_date == target_date)
            .order_by(LoadResourceData.slot_index).all())
    if not rows:
        _bad(404, "No load/resource data for this date.")
    deficits = estimate_national_deficit([float(r.load_mw) for r in rows], [float(r.available_mw) for r in rows])
    slots = build_j1_program(deficits, target_date, rows[0].time_step_minutes)
    return {"date": target_date.isoformat(), "peak_deficit_mw": round(max(deficits), 2),
            "slots_needing_action": len(slots), "slots": slots}


@app.get("/api/admin/regional-split")
def regional_split(national_target_mw: float = Query(..., ge=0), nord_ratio: Optional[float] = Query(None, ge=0, le=1),
                   staff: StaffUser = Depends(require_roles("admin", "dn", "crc_nord", "crc_sud")),
                   db: Session = Depends(get_db)):
    return split_regional_target(db, national_target_mw, nord_ratio)


@app.get("/api/admin/bcc-allocation")
def bcc_allocation(crc: str = Query(..., pattern="^(nord|sud)$"), target_mw: float = Query(..., ge=0),
                   staff: StaffUser = Depends(require_roles("admin", "dn", "crc_nord", "crc_sud")),
                   db: Session = Depends(get_db)):
    if staff.role.startswith("crc_") and staff.role != f"crc_{crc}":
        _bad(403, "You can only allocate your own region.")
    return allocate_to_bcc(target_mw, db.query(BCC).filter(BCC.crc == crc).order_by(BCC.id).all())


@app.post("/api/admin/select-feeders")
def preview_feeders(bcc_id: int, target_mw: float = Query(..., ge=0), cooldown_hours: int = Query(4, ge=0),
                    staff: StaffUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """Preview only (nothing saved): which feeders the fairness formula would pick."""
    _check_bcc_access(db, staff, bcc_id)
    bcc = db.get(BCC, bcc_id) or _bad(404, "BCC not found")
    selected = select_feeders(target_mw, db.query(Feeder).filter(Feeder.bcc_id == bcc_id).all(), cooldown_hours)
    return {"bcc": {"id": bcc.id, "name": bcc.name, "crc": bcc.crc}, "target_mw": target_mw,
            "selected": selected, "selected_mw": round(sum(s["avg_load_mw"] for s in selected), 2)}


class ProposalIn(BaseModel):
    bcc_id: int
    target_mw: float = Field(gt=0)
    scheduled_date: date
    start_time: time
    duration_minutes: int = Field(default=MAX_CUT_MINUTES, gt=0, le=MAX_CUT_MINUTES)


@app.post("/api/admin/proposals")
def create_proposal(payload: ProposalIn, staff: StaffUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """The engine PROPOSES cuts (status 'planned'). A BCC operator must approve them before they happen."""
    _check_bcc_access(db, staff, payload.bcc_id)
    end_dt = datetime.combine(payload.scheduled_date, payload.start_time) + timedelta(minutes=payload.duration_minutes)
    if datetime.combine(payload.scheduled_date, payload.start_time) < tunis_now().replace(tzinfo=None):
        _bad(400, "This start time is already in the past. Choose a future time.")
    if end_dt.date() != payload.scheduled_date:
        _bad(400, "A cut cannot cross midnight. Choose an earlier start time.")
    overlapping = (db.query(ProgramSchedule).join(Feeder, ProgramSchedule.feeder_id == Feeder.id)
                   .filter(Feeder.bcc_id == payload.bcc_id,
                           ProgramSchedule.scheduled_date == payload.scheduled_date,
                           ProgramSchedule.status.in_(("planned", "approved", "active")),
                           ProgramSchedule.start_time < end_dt.time(),
                           ProgramSchedule.end_time > payload.start_time).all())
    for s in overlapping:
        if s.status == "planned":  # a new run replaces the proposals nobody approved yet
            s.status = "cancelled"
    approved_mw = sum(float(s.target_mw) for s in overlapping if s.status in ("approved", "active"))
    remaining_mw = round(payload.target_mw - approved_mw, 2)
    if remaining_mw <= 0:
        _bad(409, f"Target already covered: {approved_mw:.2f} MW of cuts are already approved for this slot.")
    busy_ids = {s.feeder_id for s in overlapping if s.status in ("approved", "active")}
    feeders = [f for f in db.query(Feeder).filter(Feeder.bcc_id == payload.bcc_id).all()
               if f.id not in busy_ids]
    selected = select_feeders(remaining_mw, feeders)
    if not selected:
        _bad(409, "No eligible feeder (all are critical, inactive or in cooldown).")
    created = []
    for item in selected:
        s = ProgramSchedule(feeder_id=item["feeder_id"], zone_id=item["zone_id"], scheduled_date=payload.scheduled_date,
                            start_time=payload.start_time, end_time=end_dt.time(),
                            duration_minutes=payload.duration_minutes, target_mw=item["avg_load_mw"],
                            status="planned", reason=item["reason"])
        db.add(s)
        created.append(s)
    db.flush()
    audit(db, staff, "proposal_created",
          f"bcc={payload.bcc_id} target={payload.target_mw}MW {payload.scheduled_date} {payload.start_time} "
          f"schedules={[s.id for s in created]}")
    db.commit()
    return {"created": [{"schedule_id": s.id, **item} for s, item in zip(created, selected)],
            "total_mw": round(sum(i["avg_load_mw"] for i in selected), 2)}


class ReviewIn(BaseModel):
    approve_ids: List[int] = []
    reject_ids: List[int] = []


@app.post("/api/admin/schedules/review")
def review_schedules(payload: ReviewIn, staff: StaffUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """Human in the loop: the operator approves or rejects each proposed cut."""
    result = {"approved": [], "cancelled": []}
    for ids, new_status in ((payload.approve_ids, "approved"), (payload.reject_ids, "cancelled")):
        for sid in ids:
            s = db.get(ProgramSchedule, sid) or _bad(404, f"Schedule {sid} not found")
            _check_bcc_access(db, staff, s.feeder.bcc_id)
            if s.status != "planned":
                _bad(409, f"Schedule {sid} is '{s.status}', only 'planned' cuts can be reviewed.")
            s.status = new_status
            result[new_status].append(sid)
    audit(db, staff, "schedules_reviewed", f"approved={result['approved']} cancelled={result['cancelled']}")
    db.commit()
    return result


@app.get("/api/admin/schedules")
def list_schedules(target_date: Optional[date] = None, status: Optional[str] = None,
                   staff: StaffUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    allowed = allowed_bcc_ids(db, staff)
    q = db.query(ProgramSchedule).join(Feeder, ProgramSchedule.feeder_id == Feeder.id)
    if allowed is not None:
        q = q.filter(Feeder.bcc_id.in_(allowed))
    if target_date:
        q = q.filter(ProgramSchedule.scheduled_date == target_date)
    if status:
        q = q.filter(ProgramSchedule.status == status)
    rows = q.order_by(ProgramSchedule.scheduled_date.desc(), ProgramSchedule.start_time).limit(500).all()
    return [{"id": s.id, "feeder_id": s.feeder_id, "feeder_name": s.feeder.name, "zone_id": s.zone_id,
             "zone_name": s.zone.name, "bcc_id": s.feeder.bcc_id, "scheduled_date": s.scheduled_date.isoformat(),
             "start_time": hhmm(s.start_time), "end_time": hhmm(s.end_time), "duration_minutes": s.duration_minutes,
             "target_mw": as_float(s.target_mw), "status": s.status, "reason": s.reason} for s in rows]


class ExecutionIn(BaseModel):
    schedule_id: int
    actual_start: datetime
    actual_end: datetime
    actual_mw_shed: float = Field(ge=0)
    notes: Optional[str] = None


@app.post("/api/admin/execution")
def create_execution(payload: ExecutionIn, staff: StaffUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """BCC operator logs what really happened (no SCADA: manual entry by design)."""
    s = db.get(ProgramSchedule, payload.schedule_id) or _bad(404, "Schedule not found")
    _check_bcc_access(db, staff, s.feeder.bcc_id)
    if s.status not in ("approved", "active"):
        _bad(409, f"Only approved cuts can be executed (this one is '{s.status}').")
    if payload.actual_end <= payload.actual_start:
        _bad(400, "actual_end must be after actual_start.")
        if payload.actual_end.replace(tzinfo=None) > tunis_now().replace(tzinfo=None) + timedelta(minutes=5):
            _bad(409, "This cut has not finished yet. Log the execution after it ends.")
    execution = ExecutionLog(**payload.model_dump())
    s.status = "executed"
    record_execution_on_feeder(s.feeder, payload.actual_start)  # keeps the rotation fair
    db.add(execution)
    audit(db, staff, "execution_logged",
          f"schedule={s.id} feeder={s.feeder.name} {payload.actual_start}->{payload.actual_end} {payload.actual_mw_shed}MW")
    db.commit()
    return {"id": execution.id, "schedule_id": s.id, "actual_start": iso(execution.actual_start),
            "actual_end": iso(execution.actual_end), "actual_mw_shed": as_float(execution.actual_mw_shed),
            "notes": execution.notes}


# ============================================================
# STAFF: KPI, audit, chatbot
# ============================================================

@app.get("/api/admin/kpi")
def kpi(period_start: date, period_end: date, region: Optional[str] = Query(None, pattern="^(nord|sud)$"),
        staff: StaffUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    if period_end < period_start:
        _bad(400, "period_end must be on or after period_start.")
    return compute_kpi(db, period_start, period_end, region, allowed_bcc_ids(db, staff))


@app.get("/api/admin/audit-log")
def audit_log(limit: int = Query(100, ge=1, le=1000), staff: StaffUser = Depends(require_roles("admin", "dn")),
              db: Session = Depends(get_db)):
    rows = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(limit).all()
    return [{"id": r.id, "when": iso(r.created_at), "who": r.actor_name, "actor_type": r.actor_type,
             "action": r.action, "details": r.details} for r in rows]


@app.post("/api/chat/admin")
def chat_admin_endpoint(payload: ChatIn, staff: StaffUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    from chatbot.chat import chat_admin
    history = [m for m in (payload.history or [])[-6:] if m.get("role") in ("user", "assistant")]
    return {"reply": chat_admin(db, payload.message, history, allowed_bcc_ids(db, staff), staff)}
class CancelIn(BaseModel):
    confirmation: str
    reason: Optional[str] = None


@app.post("/api/admin/schedules/{schedule_id}/cancel")
def cancel_schedule(schedule_id: int, payload: CancelIn, staff: StaffUser = Depends(get_current_staff),
                    db: Session = Depends(get_db)):
    """Remove an approved cut before it is executed. The operator must type I CONFIRM."""
    if payload.confirmation.strip().upper() != "I CONFIRM":
        _bad(400, 'Type "I CONFIRM" to cancel this cut.')
    s = db.get(ProgramSchedule, schedule_id) or _bad(404, "Schedule not found")
    _check_bcc_access(db, staff, s.feeder.bcc_id)
    if s.status not in ("approved", "active"):
        _bad(409, f"Only approved cuts can be cancelled (this one is '{s.status}').")
    s.status = "cancelled"
    audit(db, staff, "approved_cut_cancelled", f"schedule={s.id} feeder={s.feeder.name} reason={payload.reason or '-'}")
    db.commit()
    return {"cancelled": s.id}