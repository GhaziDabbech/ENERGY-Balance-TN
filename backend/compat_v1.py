from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from database import get_db
from models import StaffUser, Region, BCC, Feeder, Order, OrderAck
from logic import split_regional_target, audit
from datetime import datetime
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