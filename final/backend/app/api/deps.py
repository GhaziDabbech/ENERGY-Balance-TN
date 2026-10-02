from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User
from app.models.citizen import Citizen

bearer_scheme = HTTPBearer()
# Optional bearer — allows unauthenticated requests (returns None instead of 401)
bearer_scheme_optional = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou expiré",
        )

    user_id: int | None = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide")

    user = db.get(User, int(user_id))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur introuvable")

    return user


def require_role(*roles: str):
    """Factory: returns a dependency that enforces one of the given roles."""
    def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Accès refusé — rôle requis : {', '.join(roles)}",
            )
        return current_user
    return _check


# Convenience role dependencies
require_dn    = require_role("DN")
require_crc   = require_role("CRC", "DN")
require_bcc   = require_role("BCC", "CRC", "DN")
require_admin = require_role("ADMIN")


# ── Citizen auth dependency ───────────────────────────────────────────────────

def get_current_citizen(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Citizen:
    """
    Validates a citizen JWT (role='citizen') and returns the Citizen row.
    Raises 401 if the token is missing, invalid, expired, or not a citizen token.
    """
    token = credentials.credentials
    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou expiré",
        )

    if payload.get("role") != "citizen":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token non autorisé pour ce portail",
        )

    citizen_id: int | None = payload.get("sub")
    if citizen_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide")

    citizen = db.get(Citizen, int(citizen_id))
    if citizen is None or not citizen.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Compte citoyen introuvable ou inactif",
        )

    return citizen


def get_current_citizen_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme_optional),
    db: Session = Depends(get_db),
) -> Citizen | None:
    """
    Like get_current_citizen but returns None instead of raising 401 when no token
    is provided.  Useful for endpoints that enrich the response when logged in
    but still work publicly.
    """
    if credentials is None:
        return None
    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        return None

    if payload.get("role") != "citizen":
        return None

    citizen_id = payload.get("sub")
    if citizen_id is None:
        return None

    citizen = db.get(Citizen, int(citizen_id))
    if citizen is None or not citizen.is_active:
        return None

    return citizen
