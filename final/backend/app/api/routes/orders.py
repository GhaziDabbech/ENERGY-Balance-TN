from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_bcc, require_crc, require_dn
from app.core.database import get_db
from app.models.order import Order, OrderAck
from app.models.user import User
from app.schemas.order import OrderAckUpdate, OrderCreate, OrderExecuteUpdate, OrderOut
from app.services.websocket import manager

router = APIRouter(prefix="/orders", tags=["orders"])


def _next_ref(order_type: str, db: Session) -> str:
    now = datetime.now(timezone.utc)
    prefix = "URG" if order_type == "urgence" else "REA"
    count = db.query(Order).filter(Order.order_type == order_type).count() + 1
    return f"{prefix}-{now.year}-{now.month:02d}{now.day:02d}-{count:03d}"


@router.get("", response_model=list[OrderOut])
def list_orders(
    order_type: str | None = None,
    status: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Order)
    if order_type:
        q = q.filter(Order.order_type == order_type)
    if status:
        q = q.filter(Order.status == status)
    orders = q.order_by(Order.issued_at.desc()).limit(limit).all()
    result = []
    for o in orders:
        out = OrderOut.model_validate(o)
        out.issued_by_role = o.issued_by_user.role if o.issued_by_user else None
        result.append(out)
    return result


@router.post("", response_model=OrderOut, status_code=201)
async def create_order(
    body: OrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_crc),
):
    """DN or CRC emits an urgence or réalimentation order."""

    # Auto-cancel any previous active orders of the same type from the same issuer.
    # This enforces "one active order at a time per type" — prevents test orders
    # from accumulating and keeps the CRC button animation honest.
    prev_active = (
        db.query(Order)
        .filter(
            Order.order_type == body.order_type,
            Order.status.in_(["pending", "acknowledged", "executing"]),
        )
        .all()
    )
    for prev in prev_active:
        prev.status = "cancelled"
        prev.cancelled_at = datetime.now(timezone.utc)
    if prev_active:
        db.flush()  # write cancellations before inserting the new order
        # Notify all connected clients so their liveStore clears the old orders
        for prev in prev_active:
            await manager.broadcast({
                "event":        "order_cancelled",
                "order_id":     prev.id,
                "order_ref":    prev.order_ref,
                "cancelled_at": prev.cancelled_at.isoformat(),
            })

    order = Order(
        order_ref=_next_ref(body.order_type, db),
        order_type=body.order_type,
        sub_type=body.sub_type,
        mw_total=body.mw_total,
        mw_nord=body.mw_nord,
        mw_sud=body.mw_sud,
        issued_by=current_user.id,
        target_crc_id=body.target_crc_id,
        notes=body.notes,
        status="pending",
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    payload = {
        "event": "new_order",
        "order_id": order.id,
        "order_type": order.order_type,
        "order_ref": order.order_ref,
        "mw_total": order.mw_total,
        "mw_nord": order.mw_nord,
        "mw_sud": order.mw_sud,
        "status": order.status,
        "issued_at": order.issued_at.isoformat(),
        "target_crc_id": order.target_crc_id,
        # Tells the frontend which role created this order so it can
        # apply the correct routing rules:
        #   DN  → only CRCs should display this as an incoming order
        #   CRC → only the targeted BCC(s) under that CRC should display it
        "issued_by_role": current_user.role,
    }

    if current_user.role == "DN":
        # DN orders are addressed to CRCs — BCCs must not receive them directly.
        # BCCs will receive a separate order from their own CRC once the CRC
        # dispatches the MW downstream.
        await manager.broadcast_to_role(payload, "CRC")
    else:
        # CRC-issued orders: broadcast to all BCC operators.
        # BCCOrderPopup already filters by bcc_id zone (mw_nord/mw_sud),
        # and the issued_by_role field lets the frontend ignore DN orders.
        await manager.broadcast_to_role(payload, "BCC")

    out = OrderOut.model_validate(order)
    out.issued_by_role = current_user.role
    return out


@router.get("/{order_id}", response_model=OrderOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Ordre introuvable")
    out = OrderOut.model_validate(order)
    out.issued_by_role = order.issued_by_user.role if order.issued_by_user else None
    return out


@router.patch("/{order_id}/ack", response_model=OrderOut)
async def acknowledge_order(
    order_id: int,
    body: OrderAckUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_bcc),
):
    """CRC or BCC presses Reçu — step 1."""
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Ordre introuvable")
    if order.status not in ("pending", "acknowledged"):
        raise HTTPException(status_code=409, detail=f"Ordre déjà en statut '{order.status}'")

    # Create or update the ack record for this user
    ack = db.query(OrderAck).filter(
        OrderAck.order_id == order_id,
        OrderAck.user_id == current_user.id,
    ).first()

    if not ack:
        ack = OrderAck(
            order_id=order_id,
            user_id=current_user.id,
            bcc_id=body.bcc_id or current_user.bcc_id,
            mw_assigned=body.mw_assigned,
        )
        db.add(ack)

    ack.acked_at = datetime.now(timezone.utc)
    ack.status = "acknowledged"
    order.status = "acknowledged"
    db.commit()
    db.refresh(order)

    # Broadcast ack event
    await manager.broadcast(
        {
            "event": "order_acked",
            "order_id": order_id,
            "order_ref": order.order_ref,
            "user_id": current_user.id,
            "bcc_id": ack.bcc_id,
            "acked_at": ack.acked_at.isoformat(),
        }
    )

    out = OrderOut.model_validate(order)
    out.issued_by_role = order.issued_by_user.role if order.issued_by_user else None
    return out


@router.patch("/{order_id}/execute", response_model=OrderOut)
async def execute_order(
    order_id: int,
    body: OrderExecuteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """BCC confirms execution — step 2."""
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Ordre introuvable")

    ack = db.query(OrderAck).filter(
        OrderAck.order_id == order_id,
        OrderAck.user_id == current_user.id,
    ).first()

    if not ack:
        raise HTTPException(status_code=404, detail="Aucun accusé de réception trouvé pour cet utilisateur")

    ack.executed_at = datetime.now(timezone.utc)
    ack.mw_executed = body.mw_executed
    ack.status = "completed"

    # Check if all acks are completed → mark order as completed
    all_acks = db.query(OrderAck).filter(OrderAck.order_id == order_id).all()
    if all_acks and all(a.status == "completed" for a in all_acks):
        order.status = "completed"
    else:
        order.status = "executing"

    db.commit()
    db.refresh(order)

    # Broadcast execution event
    await manager.broadcast(
        {
            "event": "order_executed",
            "order_id": order_id,
            "order_ref": order.order_ref,
            "bcc_id": current_user.bcc_id,
            "mw_executed": body.mw_executed,
            "executed_at": ack.executed_at.isoformat(),
            "order_status": order.status,
        }
    )

    out = OrderOut.model_validate(order)
    out.issued_by_role = order.issued_by_user.role if order.issued_by_user else None
    return out


@router.patch("/{order_id}/complete", response_model=OrderOut)
async def complete_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """BCC marks an order as completed — does not require a prior ack record.
    Used by the auto-dismiss path when activeMW satisfies the order target."""
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Ordre introuvable")
    if order.status in ("completed", "cancelled"):
        out = OrderOut.model_validate(order)
        out.issued_by_role = order.issued_by_user.role if order.issued_by_user else None
        return out   # idempotent — already done, not an error

    order.status = "completed"
    db.commit()
    db.refresh(order)

    await manager.broadcast(
        {
            "event": "order_executed",
            "order_id": order_id,
            "order_ref": order.order_ref,
            "bcc_id": current_user.bcc_id,
            "mw_executed": 0,
            "executed_at": datetime.now(timezone.utc).isoformat(),
            "order_status": "completed",
        }
    )

    out = OrderOut.model_validate(order)
    out.issued_by_role = order.issued_by_user.role if order.issued_by_user else None
    return out


@router.patch("/{order_id}/cancel", response_model=OrderOut)
async def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dn),
):
    """DN manually cancels an active order."""
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Ordre introuvable")
    if order.status in ("completed", "cancelled"):
        raise HTTPException(status_code=409, detail="Ordre déjà terminé ou annulé")

    order.status = "cancelled"
    order.cancelled_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(order)

    await manager.broadcast(
        {
            "event": "order_cancelled",
            "order_id": order_id,
            "order_ref": order.order_ref,
            "cancelled_at": order.cancelled_at.isoformat(),
        }
    )

    out = OrderOut.model_validate(order)
    out.issued_by_role = order.issued_by_user.role if order.issued_by_user else None
    return out
