"""
Settings route — lightweight key/value store backed by a JSON file.

Endpoints:
  GET  /api/v1/settings/crc-split         → { split_nord, split_sud, intervalle_min_heures }
  PUT  /api/v1/settings/crc-split         → { split_nord?, intervalle_min_heures? }  (DN only)
  GET  /api/v1/settings/auto-exec         → { bccs: [{id, name, auto_mode}] }
  POST /api/v1/settings/auto-exec/{bcc_id} → toggle auto_mode on/off (DN only)
"""
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_dn
from app.core.database import get_db
from app.models.network import BCC
from app.models.user import User

router = APIRouter(prefix="/settings", tags=["settings"])

# ── Persistence ───────────────────────────────────────────────────────────────
_SETTINGS_PATH = Path(__file__).parent.parent.parent / "data" / "settings.json"

_DEFAULTS: dict[str, Any] = {
    "split_nord":            67,   # % allocated to CRC Nord
    "intervalle_min_heures":  8,   # minimum hours between cuts for same feeder
    "bcc_consignes": {             # MW target per BCC — editable by DN
        "BCC 1": 110.0,
        "BCC 2":  90.0,
        "BCC 3":  50.0,
        "BCC 4":  50.0,
        "BCC 5":  50.0,
        "BCC 6":  60.0,
        "BCC 7":  40.0,
    },
}


def _load() -> dict[str, Any]:
    try:
        if _SETTINGS_PATH.exists():
            with open(_SETTINGS_PATH, "r", encoding="utf-8") as f:
                return {**_DEFAULTS, **json.load(f)}
    except Exception:
        pass
    return dict(_DEFAULTS)


def _save(data: dict[str, Any]) -> None:
    _SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(_SETTINGS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# ── Schemas ───────────────────────────────────────────────────────────────────
class SettingsIn(BaseModel):
    split_nord:            int | None = Field(None, ge=0, le=100)
    intervalle_min_heures: int | None = Field(None, ge=1, le=168,
                                               description="Cooldown en heures (1–168h = 1 semaine)")


class SettingsOut(BaseModel):
    split_nord:            int
    split_sud:             int
    intervalle_min_heures: int


class BccConsignesOut(BaseModel):
    consignes: dict[str, float]   # { "BCC 1": 110.0, ... }


class BccConsignesIn(BaseModel):
    consignes: dict[str, float]   # partial update — only provided keys are updated


# ── Endpoints ─────────────────────────────────────────────────────────────────
@router.get("/crc-split", response_model=SettingsOut)
def get_settings(current_user: User = Depends(get_current_user)) -> SettingsOut:
    """Return all operational settings."""
    data = _load()
    nord = int(data.get("split_nord", _DEFAULTS["split_nord"]))
    return SettingsOut(
        split_nord            = nord,
        split_sud             = 100 - nord,
        intervalle_min_heures = int(data.get("intervalle_min_heures",
                                             _DEFAULTS["intervalle_min_heures"])),
    )


@router.put("/crc-split", response_model=SettingsOut)
def update_settings(
    body: SettingsIn,
    current_user: User = Depends(require_dn),
) -> SettingsOut:
    """DN updates operational settings (partial update)."""
    data = _load()
    if body.split_nord            is not None:
        data["split_nord"]            = body.split_nord
    if body.intervalle_min_heures is not None:
        data["intervalle_min_heures"] = body.intervalle_min_heures
    _save(data)
    nord = int(data["split_nord"])
    return SettingsOut(
        split_nord            = nord,
        split_sud             = 100 - nord,
        intervalle_min_heures = int(data["intervalle_min_heures"]),
    )


# ── BCC consignes endpoints ───────────────────────────────────────────────────

@router.get("/bcc-consignes", response_model=BccConsignesOut)
def get_bcc_consignes(
    current_user: User = Depends(get_current_user),
) -> BccConsignesOut:
    """Return MW consigne per BCC. Readable by all roles."""
    data = _load()
    return BccConsignesOut(
        consignes={**_DEFAULTS["bcc_consignes"], **data.get("bcc_consignes", {})}
    )


@router.put("/bcc-consignes", response_model=BccConsignesOut)
def update_bcc_consignes(
    body: BccConsignesIn,
    current_user: User = Depends(require_dn),
) -> BccConsignesOut:
    """DN updates one or more BCC MW consignes (partial update)."""
    data = _load()
    stored = {**_DEFAULTS["bcc_consignes"], **data.get("bcc_consignes", {})}
    for bcc_name, mw in body.consignes.items():
        if mw >= 0:
            stored[bcc_name] = float(mw)
    data["bcc_consignes"] = stored
    _save(data)
    return BccConsignesOut(consignes=stored)


# ── Auto-exec toggle endpoints ────────────────────────────────────────────────

class AutoExecBccStatus(BaseModel):
    id:        int
    name:      str
    zone:      str
    auto_mode: bool


class AutoExecStatusOut(BaseModel):
    bccs: list[AutoExecBccStatus]


class AutoExecToggleIn(BaseModel):
    auto_mode: bool


@router.get("/auto-exec", response_model=AutoExecStatusOut)
def get_auto_exec_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AutoExecStatusOut:
    """Return auto_mode status for all BCCs."""
    bccs = db.query(BCC).order_by(BCC.id).all()
    return AutoExecStatusOut(
        bccs=[
            AutoExecBccStatus(
                id=b.id, name=b.name, zone=b.zone, auto_mode=b.auto_mode
            )
            for b in bccs
        ]
    )


# ── Manual auto-exec trigger — MUST be declared BEFORE /{bcc_id} ─────────────
# FastAPI matches routes in declaration order; "trigger-now" must come first
# or it would be swallowed by the /{bcc_id} integer route (422 error).

@router.post("/auto-exec/trigger-now")
async def trigger_auto_exec_now(
    current_user: User = Depends(require_dn),
) -> dict:
    """
    DN triggers an immediate auto-exec tick, ignoring the late-slot guard.
    Useful when the scheduler missed a slot (server restart, latency, etc.).
    The tick runs for the current local-time slot on all BCCs with auto_mode=True.
    """
    from app.services.auto_exec import run_auto_exec_tick_forced
    result = await run_auto_exec_tick_forced()
    return {
        "status":          "ok",
        "slot":            result.get("slot"),
        "bccs_processed":  result.get("bccs_processed", 0),
    }


@router.post("/auto-exec/{bcc_id}", response_model=AutoExecBccStatus)
async def toggle_auto_exec(
    bcc_id: int,
    body: AutoExecToggleIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AutoExecBccStatus:
    """
    BCC operator enables or disables automatic execution for their own BCC.
    DN can toggle any BCC.
    Broadcasts a WebSocket event so dashboards update in real time.
    """
    from app.services.websocket import manager as ws_manager

    # Access control: BCC operators can only toggle their own BCC
    if current_user.role == "BCC":
        if current_user.bcc_id != bcc_id:
            raise HTTPException(
                status_code=403,
                detail="Vous ne pouvez modifier que le mode automatique de votre propre BCC."
            )
    elif current_user.role not in ("DN", "ADMIN"):
        raise HTTPException(status_code=403, detail="Accès refusé.")

    bcc = db.get(BCC, bcc_id)
    if not bcc:
        raise HTTPException(status_code=404, detail=f"BCC id={bcc_id} introuvable")

    bcc.auto_mode = body.auto_mode
    db.commit()
    db.refresh(bcc)

    event = {
        "event":      "auto_exec_toggled"
        ,"bcc_id":    bcc.id
        ,"bcc_name":  bcc.name
        ,"auto_mode": bcc.auto_mode
        ,"changed_by":current_user.username
    }
    await ws_manager.broadcast_to_bcc(event, bcc.id)
    await ws_manager.broadcast_to_role(event, "DN", "CRC")

    return AutoExecBccStatus(
        id=bcc.id, name=bcc.name, zone=bcc.zone, auto_mode=bcc.auto_mode
    )
