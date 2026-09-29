from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from database import get_db
import json
from datetime import datetime, timedelta
from models import StaffUser, Region, BCC, Feeder, Order, OrderAck, ProgramSchedule, ExecutionLog
from logic import split_regional_target, audit, tunis_now
from auth import get_current_staff, verify_password, create_token

router = APIRouter(prefix="/api/v1", tags=["compat_v1"])

class LoginRequest(BaseModel):
    username: str
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

def map_staff_to_ahmed(staff: StaffUser) -> dict:
    ahmed_role = "ADMIN"
    zone = None
    if staff.role == "dn":
        ahmed_role = "DN"
    elif staff.role.startswith("crc_"):
        ahmed_role = "CRC"
        zone = "nord" if "nord" in staff.role else "sud"
    elif staff.role == "bcc":
        ahmed_role = "BCC"

    return {
        "id": staff.id,
        "username": staff.email,
        "full_name": staff.full_name,
        "role": ahmed_role,
        "zone": zone,
        "bcc_id": staff.bcc_id,
        "is_active": staff.is_active
    }

@router.post("/auth/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    staff = db.query(StaffUser).filter(StaffUser.email == body.username.lower()).first()
    if not staff or not verify_password(body.password, staff.password_hash):
        raise HTTPException(status_code=401, detail="Identifiant ou mot de passe incorrect")
    if not staff.is_active:
        raise HTTPException(status_code=403, detail="Compte désactivé")

    token = create_token("staff", staff.id)
    return {
        "access_token": token,
        "refresh_token": token,
        "token_type": "bearer",
        "must_change_password": False
    }

@router.post("/auth/refresh")
def refresh(body: RefreshRequest):
    return {
        "access_token": body.refresh_token,
        "refresh_token": body.refresh_token,
        "token_type": "bearer",
        "must_change_password": False
    }

@router.get("/auth/me")
def me(staff: StaffUser = Depends(get_current_staff)):
    return map_staff_to_ahmed(staff)

@router.get("/admin/crcs")
def list_crcs(db: Session = Depends(get_db)):
    regions = db.query(Region).order_by(Region.id).all()
    return [{"id": r.id, "name": f"CRC {r.name.capitalize()}", "city": r.name.capitalize()} for r in regions]

@router.get("/admin/bccs")
def list_bccs(db: Session = Depends(get_db)):
    bccs = db.query(BCC).order_by(BCC.id).all()
    return [{"id": b.id, "name": b.name, "zone": b.crc.capitalize(), "crc_name": f"CRC {b.crc.capitalize()}"} for b in bccs]

@router.get("/feeders")
def list_feeders(bcc_id: Optional[int] = None, db: Session = Depends(get_db), staff: StaffUser = Depends(get_current_staff)):
    q = db.query(Feeder)
    if bcc_id:
        q = q.filter(Feeder.bcc_id == bcc_id)
    elif staff.role == "bcc":
        q = q.filter(Feeder.bcc_id == staff.bcc_id)
        
    feeders = q.order_by(Feeder.priority_level, Feeder.id).all()
    return [{
        "id": f.id,
        "bcc_id": f.bcc_id,
        "ref": f"F-{f.id:03d}",
        "nom": f.name,
        "poste_source": f.bcc.name if f.bcc else "-",
        "zone": f.zone.name if f.zone else "-",
        "mw_nominal": float(f.avg_load_mw),
        "priority": f"P{f.priority_level}",
        "statut": "Actif" if f.active else "Inactif"
    } for f in feeders]
    
    
class OrderCreate(BaseModel):
    order_type: str
    sub_type: Optional[str] = None
    mw_total: float
    mw_nord: float = 0.0
    mw_sud: float = 0.0
    target_crc_id: Optional[int] = None
    notes: Optional[str] = None

def _format_order(order: Order):
    return {
        "id": order.id,
        "order_ref": order.order_ref,
        "order_type": order.order_type,
        "sub_type": order.sub_type,
        "mw_total": float(order.mw_total),
        "mw_nord": float(order.mw_nord),
        "mw_sud": float(order.mw_sud),
        "issued_by": order.issued_by,
        "issued_at": order.issued_at.isoformat() + "Z",
        "target_crc_id": order.target_crc_id,
        "status": order.status,
        "cancelled_by": order.cancelled_by,
        "cancelled_at": order.cancelled_at.isoformat() + "Z" if order.cancelled_at else None,
        "notes": order.notes,
        "acks": [{
            "id": a.id,
            "order_id": a.order_id,
            "user_id": a.user_id,
            "bcc_id": a.bcc_id,
            "mw_assigned": float(a.mw_assigned),
            "mw_executed": float(a.mw_executed),
            "status": a.status,
            "acked_at": a.acked_at.isoformat() + "Z" if a.acked_at else None,
            "executed_at": a.executed_at.isoformat() + "Z" if a.executed_at else None,
        } for a in order.acks]
    }

@router.get("/orders")
def list_orders(limit: int = 50, db: Session = Depends(get_db), staff: StaffUser = Depends(get_current_staff)):
    orders = db.query(Order).order_by(Order.issued_at.desc()).limit(limit).all()
    return [_format_order(o) for o in orders]

@router.post("/orders")
def create_order(body: OrderCreate, db: Session = Depends(get_db), staff: StaffUser = Depends(get_current_staff)):
    mw_nord = body.mw_nord
    mw_sud = body.mw_sud
    
    # Run our engine's regional split if the frontend sent 0
    if mw_nord == 0 and mw_sud == 0:
        split = split_regional_target(db, body.mw_total)
        mw_nord = split.get("nord", 0)
        mw_sud = split.get("sud", 0)

    now = datetime.utcnow()
    count = db.query(Order).filter(Order.order_type == body.order_type).count() + 1
    prefix = "URG" if body.order_type == "urgence" else "REA"
    order_ref = f"{prefix}-{now.year}-{now.month:02d}{now.day:02d}-{count:03d}"

    order = Order(
        order_ref=order_ref,
        order_type=body.order_type,
        sub_type=body.sub_type,
        mw_total=body.mw_total,
        mw_nord=mw_nord,
        mw_sud=mw_sud,
        issued_by=staff.id,
        target_crc_id=body.target_crc_id,
        status="pending",
        notes=body.notes
    )
    db.add(order)
    audit(db, staff, "order_created", f"ref={order_ref} mw={body.mw_total}")
    db.commit()
    db.refresh(order)
    return _format_order(order)


class OrderAckUpdate(BaseModel):
    bcc_id: Optional[int] = None
    mw_assigned: float = 0.0

@router.patch("/orders/{order_id}/ack")
def ack_order(order_id: int, body: OrderAckUpdate, db: Session = Depends(get_db), staff: StaffUser = Depends(get_current_staff)):
    from main import ProposalIn, create_proposal
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
        
    ack = db.query(OrderAck).filter(OrderAck.order_id == order_id, OrderAck.user_id == staff.id).first()
    if not ack:
        ack = OrderAck(order_id=order_id, user_id=staff.id, bcc_id=body.bcc_id or staff.bcc_id, mw_assigned=body.mw_assigned)
        db.add(ack)
        
    ack.acked_at = datetime.utcnow()
    ack.status = "acknowledged"
    order.status = "acknowledged"
    db.commit()

    # Link to our backend's AI load-shedding engine
    if body.mw_assigned > 0 and ack.bcc_id:
        now = tunis_now()
        minute = (now.minute // 5 + 1) * 5
        start_time = (now + timedelta(minutes=minute - now.minute)).time()
        try:
            prop = ProposalIn(bcc_id=ack.bcc_id, target_mw=body.mw_assigned, scheduled_date=now.date(), start_time=start_time, duration_minutes=45)
            res = create_proposal(prop, staff, db)
            created_ids = []
            for item in res["created"]:
                sid = item["schedule_id"]
                created_ids.append(sid)
                s = db.query(ProgramSchedule).get(sid)
                s.status = "approved" # Auto-approve for the compatibility layer
            ack.schedule_ids = json.dumps(created_ids)
            db.commit()
        except Exception as e:
            print("Engine skipped:", e)
            
    return _format_order(order)

class OrderExecuteUpdate(BaseModel):
    mw_executed: float

@router.patch("/orders/{order_id}/execute")
def execute_order(order_id: int, body: OrderExecuteUpdate, db: Session = Depends(get_db), staff: StaffUser = Depends(get_current_staff)):
    order = db.query(Order).filter(Order.id == order_id).first()
    ack = db.query(OrderAck).filter(OrderAck.order_id == order_id, OrderAck.user_id == staff.id).first()
    if ack:
        ack.executed_at = datetime.utcnow()
        ack.mw_executed = body.mw_executed
        ack.status = "completed"
    order.status = "executing"
    db.commit()
    return _format_order(order)

class ExecutionCreate(BaseModel):
    feeder_id: int
    mw_shed: float
    trigger: str = "manual"
    order_id: Optional[int] = None
    notes: Optional[str] = None

@router.post("/executions")
def create_compat_exec(body: ExecutionCreate, db: Session = Depends(get_db), staff: StaffUser = Depends(get_current_staff)):
    from main import ExecutionIn, create_execution
    now = tunis_now()
    s = db.query(ProgramSchedule).filter(ProgramSchedule.feeder_id == body.feeder_id, ProgramSchedule.status == "approved").first()
    if not s:
        s = ProgramSchedule(feeder_id=body.feeder_id, zone_id=db.query(Feeder).get(body.feeder_id).zone_id, scheduled_date=now.date(), start_time=now.time(), end_time=(now + timedelta(minutes=45)).time(), target_mw=body.mw_shed, status="approved", reason="Manual")
        db.add(s)
        db.flush()
        
    ex_in = ExecutionIn(schedule_id=s.id, actual_start=now.replace(tzinfo=None), actual_end=(now + timedelta(minutes=45)).replace(tzinfo=None), actual_mw_shed=body.mw_shed, notes=body.notes)
    res = create_execution(ex_in, staff, db)
    return {"id": res["id"], "feeder_id": body.feeder_id, "bcc_id": staff.bcc_id, "operator_id": staff.id, "order_id": body.order_id, "started_at": res["actual_start"] + "Z", "ended_at": None, "mw_shed": body.mw_shed, "ens_mwh": 0.0, "trigger": body.trigger, "status": "executing", "notes": body.notes}

class ExecutionRestore(BaseModel):
    notes: Optional[str] = None

@router.patch("/executions/{exec_id}/restore")
def restore_compat_exec(exec_id: int, body: ExecutionRestore, db: Session = Depends(get_db), staff: StaffUser = Depends(get_current_staff)):
    e = db.query(ExecutionLog).get(exec_id)
    e.actual_end = datetime.utcnow()
    db.commit()
    return {"id": e.id, "feeder_id": e.schedule.feeder_id, "bcc_id": staff.bcc_id, "operator_id": staff.id, "started_at": e.actual_start.isoformat() + "Z", "ended_at": e.actual_end.isoformat() + "Z", "mw_shed": float(e.actual_mw_shed), "ens_mwh": float(e.actual_mw_shed) * ((e.actual_end - e.actual_start).total_seconds() / 3600), "status": "restored"}

@router.get("/executions")
def list_compat_execs(status: Optional[str] = None, limit: int = 100, db: Session = Depends(get_db), staff: StaffUser = Depends(get_current_staff)):
    now = datetime.utcnow()
    q = db.query(ExecutionLog)
    if status == "executing":
        q = q.filter(ExecutionLog.actual_end > now)
    execs = q.order_by(ExecutionLog.actual_start.desc()).limit(limit).all()
    return [{"id": e.id, "feeder_id": e.schedule.feeder_id, "bcc_id": e.schedule.feeder.bcc_id, "operator_id": staff.id, "started_at": e.actual_start.isoformat() + "Z", "ended_at": None if e.actual_end > now else e.actual_end.isoformat() + "Z", "mw_shed": float(e.actual_mw_shed), "status": "executing" if e.actual_end > now else "restored"} for e in execs]


@router.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db), staff: StaffUser = Depends(get_current_staff)):
    now = tunis_now()
    return {
        "timestamp": now.isoformat() + "Z",
        "national": {
            "consigne": 0.0,
            "realise": 0.0,
            "ecart": 0.0,
            "pct": 0.0,
            "ens_today": 0.0,
            "active_cuts": 0,
            "zones_actives": []
        },
        "anomaly_bccs": [],
        "bcc_rows": [],
        "crc_summary": {},
        "live_cuts": []
    }

@router.get("/kpis/timeseries")
def get_timeseries(interval_min: int = 30, db: Session = Depends(get_db), staff: StaffUser = Depends(get_current_staff)):
    now = tunis_now()
    return {
        "date": now.date().isoformat(),
        "interval_min": interval_min,
        "crc_id": None,
        "slots": [],
        "total_ens_mwh": 0.0
    }

@router.get("/historique")
def get_historique(date_from: Optional[str] = None, date_to: Optional[str] = None, db: Session = Depends(get_db), staff: StaffUser = Depends(get_current_staff)):
    return {
        "period": {"from": date_from, "to": date_to},
        "national_totals": {"total_cuts": 0, "total_ens_mwh": 0.0, "total_duration_h": 0.0, "equity_score": 100},
        "bccs": []
    }

@router.get("/kpis/national")
def get_kpis_national():
    return {"total_ens_mwh": 0.0, "active_cuts_count": 0, "active_shedding_mw": 0.0, "active_orders_count": 0, "bccs_total": 0}

@router.get("/kpis/crc/{crc_id}")
def get_kpis_crc(crc_id: int):
    return {"crc_id": crc_id, "crc_name": f"CRC {crc_id}", "active_shedding_mw": 0.0, "ens_mwh": 0.0, "active_cuts_count": 0, "bcc_count": 0}

@router.get("/kpis/bcc/{bcc_id}")
def get_kpis_bcc(bcc_id: int):
    return {"bcc_id": bcc_id, "active_shedding_mw": 0.0, "ens_total_mwh": 0.0, "total_cuts": 0, "feeder_stats": []}



class ChatIn(BaseModel):
    message: str
    history: Optional[list] = None

@router.post("/chat/admin")
def compat_chat_admin(payload: ChatIn, db: Session = Depends(get_db), staff: StaffUser = Depends(get_current_staff)):
    from chatbot.chat import chat_admin
    from logic import allowed_bcc_ids
    history = [m for m in (payload.history or [])[-6:] if m.get("role") in ("user", "assistant")]
    reply = chat_admin(db, payload.message, history, allowed_bcc_ids(db, staff), staff)
    return {"reply": reply}

