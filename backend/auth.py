"""Password hashing and login tokens, using only the Python standard library.

- Passwords: PBKDF2-SHA256 with a random salt (never stored in clear).
- Tokens: signed with HMAC-SHA256 and AUTH_SECRET, expire after TOKEN_HOURS.
  A citizen token can only be used on citizen routes, a staff token only on staff routes.
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from database import get_db
from models import Citizen, StaffUser

PBKDF2_ITERATIONS = 200_000
TOKEN_HOURS = 8
AUTH_SECRET = os.getenv("AUTH_SECRET", "dev-only-secret-change-me")

bearer = HTTPBearer(auto_error=False)


# ---------------- passwords ----------------

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt, expected = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iterations))
        return hmac.compare_digest(digest.hex(), expected)
    except (ValueError, AttributeError):
        return False


# ---------------- tokens ----------------

def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(payload: str) -> str:
    return _b64(hmac.new(AUTH_SECRET.encode(), payload.encode(), hashlib.sha256).digest())


def create_token(kind: str, user_id: int) -> str:
    payload = _b64(json.dumps({"k": kind, "id": user_id,
                               "exp": int(time.time()) + TOKEN_HOURS * 3600}).encode())
    return f"{payload}.{_sign(payload)}"


def decode_token(token: str):
    try:
        payload, signature = token.split(".")
        if not hmac.compare_digest(signature, _sign(payload)):
            return None
        data = json.loads(_unb64(payload))
        return data if data.get("exp", 0) > time.time() else None
    except (ValueError, json.JSONDecodeError):
        return None


def _token_for(kind: str, credentials) -> dict:
    data = decode_token(credentials.credentials) if credentials else None
    if not data or data.get("k") != kind:
        raise HTTPException(status_code=401, detail="Please log in again.")
    return data


# ---------------- FastAPI dependencies ----------------

def get_current_citizen(credentials: HTTPAuthorizationCredentials = Depends(bearer),
                        db: Session = Depends(get_db)) -> Citizen:
    data = _token_for("citizen", credentials)
    citizen = db.get(Citizen, data["id"])
    if not citizen or not citizen.is_active:
        raise HTTPException(status_code=401, detail="Account not found or inactive.")
    return citizen


def get_current_staff(credentials: HTTPAuthorizationCredentials = Depends(bearer),
                      db: Session = Depends(get_db)) -> StaffUser:
    data = _token_for("staff", credentials)
    staff = db.get(StaffUser, data["id"])
    if not staff or not staff.is_active:
        raise HTTPException(status_code=401, detail="Account not found or inactive.")
    return staff


def require_roles(*roles):
    """Staff dependency that also checks the role, e.g. require_roles('admin', 'dn')."""
    def checker(staff: StaffUser = Depends(get_current_staff)) -> StaffUser:
        if staff.role not in roles:
            raise HTTPException(status_code=403, detail="Your role cannot do this action.")
        return staff
    return checker
