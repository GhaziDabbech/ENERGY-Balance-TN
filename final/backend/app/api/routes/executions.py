from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, require_bcc
from app.core.database import get_db
from app.models.citizen import CitizenProgramSchedule, CitizenZone
from app.models.execution import Execution
from app.models.network import BCC, CRC, Feeder
from app.models.user import User
from app.schemas.execution import ExecutionCreate, ExecutionOut, ExecutionRestore
from app.services.websocket import manager

router = APIRouter(prefix="/executions", tags=["executions"])


# ── Citizen write-through helpers ─────────────────────────────────────────────

def _set_zone_status(db: Session, bcc_id: int, new_status: str) -> None:
    """Update all CitizenZones linked to this BCC."""
    zones = db.query(CitizenZone).filter(CitizenZone.bcc_id == bcc_id).all()
    for z in zones:
        z.electricity_status = new_status


def _has_active_cuts(db: Session, bcc_id: int, exclude_execution_id: int | None = None) -> bool:
    """Return True if the BCC still has executing cuts (after excluding one being restored)."""
    q = db.query(Execution).filter(
        Execution.bcc_id == bcc_id,
        Execution.status == "executing",
    )
    if exclude_execution_id:
        q = q.filter(Execution.id != exclude_execution_id)
    return q.count() > 0


def _publish_citizen_schedule(
    db: Session,
    bcc_id: int,
    execution: Execution,
) -> None:
    """
    Create or update a CitizenProgramSchedule entry so the citizen portal
    shows the current shedding window for this BCC's zone(s).
    """
    today = date.today()
    now   = datetime.now(timezone.utc)
    start = execution.started_at.astimezone(timezone.utc)

    # Estimated end: start + 45 min (max rotation)
    from datetime import timedelta
    end_dt = start + timedelta(minutes=45)

    zones = db.query(CitizenZone).filter(CitizenZone.bcc_id == bcc_id).all()
    for zone in zones:
        # Avoid duplicates — check if an active schedule already exists for this zone today
        existing = (
            db.query(CitizenProgramSchedule)
            .filter(
                CitizenProgramSchedule.zone_id == zone.id,
                CitizenProgramSchedule.scheduled_date == today,
                CitizenProgramSchedule.status.in_(["active", "planned"]),
            )
            .first()
        )
        if existing:
            existing.status = "active"
        else:
            schedule = CitizenProgramSchedule(
                zone_id=zone.id,
                execution_id=execution.id,
                scheduled_date=today,
                start_time=start.time(),
                end_time=end_dt.time(),
                duration_minutes=45,
                target_mw=Decimal(str(round(execution.mw_shed, 2))),
                status="active",
                reason="Délestage en cours — programme J-1",
            )
            db.add(schedule)


def _mark_citizen_schedule_executed(
    db: Session,
    bcc_id: int,
    execution: Execution,
) -> None:
    """Mark the matching citizen schedule as executed when cut is restored."""
    zones = db.query(CitizenZone).filter(CitizenZone.bcc_id == bcc_id).all()
    zone_ids = [z.id for z in zones]
    if not zone_ids:
        return

    schedules = (
        db.query(CitizenProgramSchedule)
        .filter(
            CitizenProgramSchedule.zone_id.in_(zone_ids),
            CitizenProgramSchedule.execution_id == execution.id,
        )
        .all()
    )
    for s in schedules:
        s.status = "executed"


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[ExecutionOut])
def list_executions(
    bcc_id:     int | None  = None,
    crc_id:     int | None  = None,
    feeder_id:  int | None  = None,
    status:     str | None  = None,
    today_only: bool        = False,
    limit:      int         = 100,
    db:         Session     = Depends(get_db),
    current_user: User      = Depends(require_bcc),
):
    q = db.query(Execution).options(
        joinedload(Execution.feeder).joinedload(Feeder.bcc),
        joinedload(Execution.operator),
    )

    # ── Scope by role ─────────────────────────────────────────────────────────
    if current_user.role == "BCC":
        # BCC operators only see their own BCC's executions
        q = q.filter(Execution.bcc_id == current_user.bcc_id)

    elif current_user.role == "CRC":
        # CRC operators see all BCCs under their CRC — join via BCC.crc_id
        crc_row = (
            db.query(CRC)
            .filter(CRC.name == current_user.zone)
            .first()
        )
        if crc_row:
            bcc_ids = [b.id for b in db.query(BCC).filter(BCC.crc_id == crc_row.id).all()]
            q = q.filter(Execution.bcc_id.in_(bcc_ids))
        # If an explicit bcc_id filter is also provided, narrow further
        if bcc_id:
            q = q.filter(Execution.bcc_id == bcc_id)

    else:
        # DN / ADMIN — full access; honour optional filters
        if bcc_id:
            q = q.filter(Execution.bcc_id == bcc_id)
        if crc_id:
            bcc_ids = [b.id for b in db.query(BCC).filter(BCC.crc_id == crc_id).all()]
            q = q.filter(Execution.bcc_id.in_(bcc_ids))

    # ── Common filters ────────────────────────────────────────────────────────
    if feeder_id:
        q = q.filter(Execution.feeder_id == feeder_id)
    if status:
        q = q.filter(Execution.status == status)
    if today_only:
        today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
        q = q.filter(Execution.started_at >= today_start)

    rows = q.order_by(Execution.started_at.desc()).limit(limit).all()
    return [ExecutionOut.from_orm_with_relations(r) for r in rows]


@router.post("", response_model=ExecutionOut, status_code=status.HTTP_201_CREATED)
async def create_execution(
    body: ExecutionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_bcc),
):
    """
    BCC records a feeder cut.

    Write-through side-effects (citizen portal):
      1. CitizenZone.electricity_status → 'Scheduled Outage'
      2. CitizenProgramSchedule entry created/updated to 'active'
      3. WebSocket broadcast → new_execution event
    """
    feeder = db.get(Feeder, body.feeder_id)
    if not feeder:
        raise HTTPException(status_code=404, detail="Départ introuvable")
    if current_user.role == "BCC" and feeder.bcc_id != current_user.bcc_id:
        raise HTTPException(status_code=403, detail="Départ appartenant à un autre BCC")
    if feeder.priority == "P0":
        raise HTTPException(
            status_code=422,
            detail="Impossible de délester un départ P0 (infrastructure critique)",
        )

    execution = Execution(
        feeder_id=body.feeder_id,
        bcc_id=feeder.bcc_id,
        operator_id=current_user.id,
        order_id=body.order_id,
        mw_shed=body.mw_shed,
        trigger=body.trigger,
        notes=body.notes,
        status="executing",
    )
    db.add(execution)
    db.flush()  # get id before commit

    # ── Citizen write-through ─────────────────────────────────────────────────
    _set_zone_status(db, feeder.bcc_id, "Scheduled Outage")
    _publish_citizen_schedule(db, feeder.bcc_id, execution)

    db.commit()
    db.refresh(execution)

    # ── Reload with relationships for the response ────────────────────────────
    execution = db.query(Execution).options(
        joinedload(Execution.feeder).joinedload(Feeder.bcc),
        joinedload(Execution.operator),
    ).filter(Execution.id == execution.id).one()

    # ── WebSocket broadcast ───────────────────────────────────────────────────
    await manager.broadcast({
        "event":        "new_execution",
        "execution": {
            "id":         execution.id,
            "feeder_id":  execution.feeder_id,
            "bcc_id":     execution.bcc_id,
            "mw_shed":    execution.mw_shed,
            "started_at": execution.started_at.isoformat(),
            "status":     execution.status,
        },
    })

    return ExecutionOut.from_orm_with_relations(execution)


@router.patch("/{execution_id}/restore", response_model=ExecutionOut)
async def restore_execution(
    execution_id: int,
    body: ExecutionRestore,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_bcc),
):
    """
    BCC records feeder restoration — computes duration and ENS.

    Write-through side-effects (citizen portal):
      1. CitizenProgramSchedule → 'executed'
      2. If no more active cuts for this BCC → CitizenZone → 'Power Available'
      3. WebSocket broadcast → execution_restored event
    """
    execution = db.get(Execution, execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Exécution introuvable")
    if current_user.role == "BCC" and execution.bcc_id != current_user.bcc_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    if execution.status != "executing":
        raise HTTPException(status_code=409, detail="Cette exécution n'est pas en cours")

    now = datetime.now(timezone.utc)
    execution.ended_at     = now
    execution.duration_min = (now - execution.started_at).total_seconds() / 60
    execution.ens_mwh      = execution.mw_shed * execution.duration_min / 60
    execution.status       = "restored"
    if body.notes:
        execution.notes = body.notes

    # ── Citizen write-through ─────────────────────────────────────────────────
    _mark_citizen_schedule_executed(db, execution.bcc_id, execution)

    # Only restore zone status if no other cuts are still active for this BCC
    if not _has_active_cuts(db, execution.bcc_id, exclude_execution_id=execution_id):
        _set_zone_status(db, execution.bcc_id, "Power Available")

    db.commit()
    db.refresh(execution)

    # ── Reload with relationships for the response ────────────────────────────
    execution = db.query(Execution).options(
        joinedload(Execution.feeder).joinedload(Feeder.bcc),
        joinedload(Execution.operator),
    ).filter(Execution.id == execution.id).one()

    # ── WebSocket broadcast ───────────────────────────────────────────────────
    await manager.broadcast({
        "event":        "execution_restored",
        "execution_id": execution.id,
        "bcc_id":       execution.bcc_id,
        "ended_at":     execution.ended_at.isoformat(),
        "ens_mwh":      execution.ens_mwh,
    })

    return ExecutionOut.from_orm_with_relations(execution)


@router.get("/{execution_id}", response_model=ExecutionOut)
def get_execution(
    execution_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_bcc),
):
    execution = db.get(Execution, execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Exécution introuvable")
    return execution
