"""
Admin-only routes — user management.
Only ADMIN role can access these endpoints.
No operational data is exposed here — pure user management.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.core.database import get_db
from app.core.security import hash_password, verify_password
from app.models.network import BCC, CRC
from app.models.user import User
from app.schemas.admin import (
    BCCOption,
    ChangePasswordRequest,
    CRCOption,
    ResetPasswordRequest,
    UserAdminOut,
    UserCreateRequest,
    UserUpdateRequest,
)

router = APIRouter(prefix="/admin", tags=["admin"])


def _enrich_user(user: User, db: Session) -> dict:
    """Add bcc_name and crc_name to a user dict for display in the admin panel."""
    bcc_name = None
    crc_name = None
    if user.bcc_id:
        bcc = db.get(BCC, user.bcc_id)
        if bcc:
            bcc_name = bcc.name
            crc = db.get(CRC, bcc.crc_id)
            if crc:
                crc_name = crc.name
    elif user.zone and user.role == "CRC":
        crc_name = user.zone
    return {
        **{c.name: getattr(user, c.name) for c in user.__table__.columns},
        "bcc_name": bcc_name,
        "crc_name": crc_name,
    }


# ── Reference data — used by the Create User form ────────────────────────────

@router.get("/bccs", response_model=list[BCCOption])
def list_bccs(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Return all BCCs with their CRC name — for the BCC assignment dropdown."""
    bccs = db.query(BCC).order_by(BCC.name).all()
    result = []
    for bcc in bccs:
        crc = db.get(CRC, bcc.crc_id)
        result.append(BCCOption(
            id=bcc.id,
            name=bcc.name,
            zone=bcc.zone,
            crc_name=crc.name if crc else "—",
        ))
    return result


@router.get("/crcs", response_model=list[CRCOption])
def list_crcs(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Return all CRCs — for the CRC assignment dropdown."""
    crcs = db.query(CRC).order_by(CRC.name).all()
    return [CRCOption(id=c.id, name=c.name, city=c.city) for c in crcs]


# ── User management ───────────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserAdminOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Return all users with enriched BCC/CRC names."""
    users = db.query(User).order_by(User.role, User.username).all()
    return [_enrich_user(u, db) for u in users]


@router.get("/users/{user_id}", response_model=UserAdminOut)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    return _enrich_user(user, db)


@router.post("/users", response_model=UserAdminOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """
    Create a new operator account.
    Password is set by admin — operator must change it on first login.
    """
    # Check username uniqueness
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=409, detail=f"Identifiant '{body.username}' déjà utilisé")

    # Validate role-specific assignment
    if body.role == "CRC" and not body.zone:
        raise HTTPException(status_code=422, detail="Le champ 'zone' est requis pour le rôle CRC")
    if body.role == "BCC" and not body.bcc_id:
        raise HTTPException(status_code=422, detail="Le champ 'bcc_id' est requis pour le rôle BCC")
    if body.role == "BCC" and body.bcc_id:
        if not db.get(BCC, body.bcc_id):
            raise HTTPException(status_code=404, detail=f"BCC {body.bcc_id} introuvable")

    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        zone=body.zone,
        bcc_id=body.bcc_id,
        is_active=True,
        must_change_password=True,   # always forced on admin-created accounts
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _enrich_user(user, db)


@router.patch("/users/{user_id}", response_model=UserAdminOut)
def update_user(
    user_id: int,
    body: UserUpdateRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Update a user's name, zone or BCC assignment."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if user.role == "ADMIN" and user.id != current_admin.id:
        raise HTTPException(status_code=403, detail="Impossible de modifier un autre compte ADMIN")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)
    return _enrich_user(user, db)


@router.patch("/users/{user_id}/deactivate", response_model=UserAdminOut)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """
    Deactivate a user account — they can no longer log in.
    Never deletes — preserves audit trail.
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if user.id == current_admin.id:
        raise HTTPException(status_code=403, detail="Impossible de désactiver votre propre compte")
    if user.role == "ADMIN":
        raise HTTPException(status_code=403, detail="Impossible de désactiver un compte ADMIN via l'API")

    user.is_active = False
    db.commit()
    db.refresh(user)
    return _enrich_user(user, db)


@router.patch("/users/{user_id}/activate", response_model=UserAdminOut)
def activate_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Re-activate a previously deactivated account."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    user.is_active = True
    db.commit()
    db.refresh(user)
    return _enrich_user(user, db)


@router.patch("/users/{user_id}/reset-password", response_model=UserAdminOut)
def reset_password(
    user_id: int,
    body: ResetPasswordRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """
    Admin resets a user's password.
    Sets must_change_password=True so the operator changes it on next login.
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    user.password_hash        = hash_password(body.new_password)
    user.must_change_password = True
    db.commit()
    db.refresh(user)
    return _enrich_user(user, db)


# ── Self-service: operator changes their own password (forced on first login) ─

@router.post("/change-password")
def change_own_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Any logged-in user can change their own password.
    Required on first login when must_change_password=True.
    """
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")

    current_user.password_hash        = hash_password(body.new_password)
    current_user.must_change_password = False
    db.commit()
    return {"message": "Mot de passe mis à jour avec succès"}


# ── Stats — used by admin dashboard ─────────────────────────────────────────

@router.get("/stats")
def admin_stats(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Quick stats for the admin dashboard header."""
    total       = db.query(User).count()
    active      = db.query(User).filter(User.is_active == True).count()
    inactive    = total - active
    by_role     = {}
    for role in ("DN", "CRC", "BCC"):
        by_role[role] = db.query(User).filter(User.role == role).count()
    pending_pwd = db.query(User).filter(
        User.must_change_password == True,
        User.role != "ADMIN",
    ).count()

    return {
        "total_users":          total,
        "active_users":         active,
        "inactive_users":       inactive,
        "pending_pwd_change":   pending_pwd,
        "by_role":              by_role,
    }
