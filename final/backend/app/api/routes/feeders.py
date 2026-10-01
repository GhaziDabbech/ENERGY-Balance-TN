from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_bcc
from app.core.database import get_db
from app.models.execution import Execution
from app.models.network import Feeder
from app.models.user import User
from app.schemas.feeder import FeederCreate, FeederOut, FeederUpdate

router = APIRouter(prefix="/feeders", tags=["feeders"])


def _get_feeder_or_404(feeder_id: int, db: Session) -> Feeder:
    f = db.get(Feeder, feeder_id)
    if not f:
        raise HTTPException(status_code=404, detail="Départ introuvable")
    return f


def _check_bcc_ownership(feeder: Feeder, user: User) -> None:
    """BCC operators can only touch feeders belonging to their own BCC."""
    if user.role == "BCC" and feeder.bcc_id != user.bcc_id:
        raise HTTPException(status_code=403, detail="Accès refusé — départ d'un autre BCC")


def _annotate_cooldown(feeders: list[Feeder], db: Session) -> list[dict]:
    """
    For each feeder find the most recent cut start time and compute
    hours_since_last_cut.  Returns plain dicts compatible with FeederOut.
    """
    if not feeders:
        return []

    feeder_ids = [f.id for f in feeders]
    now        = datetime.now(timezone.utc)

    # One query: latest started_at per feeder_id across ALL execution statuses
    rows = (
        db.query(
            Execution.feeder_id,
            func.max(Execution.started_at).label("last_cut"),
        )
        .filter(Execution.feeder_id.in_(feeder_ids))
        .group_by(Execution.feeder_id)
        .all()
    )
    last_cut_map: dict[int, datetime] = {r.feeder_id: r.last_cut for r in rows}

    result = []
    for f in feeders:
        # Build dict from ORM columns
        row = {c.key: getattr(f, c.key) for c in f.__table__.columns}

        last_cut = last_cut_map.get(f.id)
        if last_cut:
            if last_cut.tzinfo is None:
                last_cut = last_cut.replace(tzinfo=timezone.utc)
            hours = (now - last_cut).total_seconds() / 3600.0
            row["last_cut_at"]          = last_cut
            row["hours_since_last_cut"] = round(hours, 2)
        else:
            row["last_cut_at"]          = None
            row["hours_since_last_cut"] = None

        result.append(row)
    return result


@router.get("", response_model=list[FeederOut])
def list_feeders(
    bcc_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_bcc),
):
    """
    Return feeders with cooldown info (last_cut_at, hours_since_last_cut).
    BCC operators see only their own BCC's feeders; CRC/DN can filter by bcc_id.
    """
    q = db.query(Feeder)
    if current_user.role == "BCC":
        q = q.filter(Feeder.bcc_id == current_user.bcc_id)
    elif bcc_id:
        q = q.filter(Feeder.bcc_id == bcc_id)
    feeders = q.order_by(Feeder.priority, Feeder.ref).all()
    return _annotate_cooldown(feeders, db)


@router.post("", response_model=FeederOut, status_code=status.HTTP_201_CREATED)
def create_feeder(
    body: FeederCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_bcc),
):
    bcc_id = current_user.bcc_id if current_user.role == "BCC" else None
    if not bcc_id:
        raise HTTPException(status_code=400, detail="bcc_id requis pour les opérateurs DN/CRC")

    exists = db.query(Feeder).filter(
        Feeder.bcc_id == bcc_id, Feeder.ref == body.ref
    ).first()
    if exists:
        raise HTTPException(status_code=409, detail=f"Référence {body.ref} déjà existante pour ce BCC")

    feeder = Feeder(**body.model_dump(), bcc_id=bcc_id)
    db.add(feeder)
    db.commit()
    db.refresh(feeder)
    # Annotate the single new feeder (never cut yet)
    row = {c.key: getattr(feeder, c.key) for c in feeder.__table__.columns}
    row["last_cut_at"]          = None
    row["hours_since_last_cut"] = None
    return row


@router.put("/{feeder_id}", response_model=FeederOut)
def update_feeder(
    feeder_id: int,
    body: FeederUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_bcc),
):
    feeder = _get_feeder_or_404(feeder_id, db)
    _check_bcc_ownership(feeder, current_user)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(feeder, field, value)

    db.commit()
    db.refresh(feeder)
    # Re-annotate after update
    annotated = _annotate_cooldown([feeder], db)
    return annotated[0]


@router.delete("/{feeder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_feeder(
    feeder_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_bcc),
):
    feeder = _get_feeder_or_404(feeder_id, db)
    _check_bcc_ownership(feeder, current_user)
    db.delete(feeder)
    db.commit()
