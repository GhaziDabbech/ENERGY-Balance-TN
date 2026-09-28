from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from database import get_db
from models import StaffUser
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