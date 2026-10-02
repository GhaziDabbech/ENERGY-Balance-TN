"""
KPI aggregation endpoints.
Read-only — all data computed from executions table.
"""
from datetime import date, datetime, timezone, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_bcc, require_crc
from app.core.database import get_db
from app.models.execution import Execution
from app.models.network import BCC, CRC, Feeder
from app.models.order import Order
from app.models.programme import Programme, ProgrammeSlot
from app.models.user import User

router = APIRouter(prefix="/kpis", tags=["kpis"])
TUNIS_TZ = ZoneInfo("Africa/Tunis")


@router.get("/national")
def national_kpis(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """DN-level KPIs: total ENS, active cuts, active orders."""
    total_ens = db.query(func.sum(Execution.ens_mwh)).filter(
        Execution.status == "restored"
    ).scalar() or 0.0

    active_cuts = db.query(func.count(Execution.id)).filter(
        Execution.status == "executing"
    ).scalar() or 0

    active_mw = db.query(func.sum(Execution.mw_shed)).filter(
        Execution.status == "executing"
    ).scalar() or 0.0

    active_orders = db.query(func.count(Order.id)).filter(
        Order.status.in_(["pending", "acknowledged", "executing"])
    ).scalar() or 0

    bccs_in_anomaly = db.query(func.count(BCC.id)).scalar() or 0

    return {
        "total_ens_mwh": round(total_ens, 2),
        "active_cuts_count": active_cuts,
        "active_shedding_mw": round(active_mw, 2),
        "active_orders_count": active_orders,
        "bccs_total": bccs_in_anomaly,
    }


@router.get("/crc/{crc_id}")
def crc_kpis(
    crc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_crc),
):
    """CRC-level KPIs: aggregated from BCCs under this CRC."""
    crc = db.get(CRC, crc_id)
    if not crc:
        return {"error": "CRC introuvable"}

    bcc_ids = [b.id for b in db.query(BCC.id).filter(BCC.crc_id == crc_id).all()]

    active_mw = db.query(func.sum(Execution.mw_shed)).filter(
        Execution.bcc_id.in_(bcc_ids),
        Execution.status == "executing",
    ).scalar() or 0.0

    ens_today = db.query(func.sum(Execution.ens_mwh)).filter(
        Execution.bcc_id.in_(bcc_ids),
        Execution.status == "restored",
    ).scalar() or 0.0

    active_cuts = db.query(func.count(Execution.id)).filter(
        Execution.bcc_id.in_(bcc_ids),
        Execution.status == "executing",
    ).scalar() or 0

    return {
        "crc_id": crc_id,
        "crc_name": crc.name,
        "active_shedding_mw": round(active_mw, 2),
        "ens_mwh": round(ens_today, 2),
        "active_cuts_count": active_cuts,
        "bcc_count": len(bcc_ids),
    }


@router.get("/bcc/{bcc_id}")
def bcc_kpis(
    bcc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_bcc),
):
    """BCC-level KPIs: feeder stats, ENS, equity."""
    # BCC operators only see their own data
    if current_user.role == "BCC" and current_user.bcc_id != bcc_id:
        return {"error": "Accès refusé"}

    active_mw = db.query(func.sum(Execution.mw_shed)).filter(
        Execution.bcc_id == bcc_id,
        Execution.status == "executing",
    ).scalar() or 0.0

    ens_total = db.query(func.sum(Execution.ens_mwh)).filter(
        Execution.bcc_id == bcc_id,
        Execution.status == "restored",
    ).scalar() or 0.0

    total_cuts = db.query(func.count(Execution.id)).filter(
        Execution.bcc_id == bcc_id,
    ).scalar() or 0

    # Per-feeder cumulative cut hours (for equity chart)
    feeder_stats = (
        db.query(
            Execution.feeder_id,
            Feeder.ref,
            Feeder.nom,
            Feeder.priority,
            func.sum(Execution.duration_min).label("total_min"),
            func.sum(Execution.ens_mwh).label("total_ens"),
            func.count(Execution.id).label("cut_count"),
        )
        .join(Feeder, Feeder.id == Execution.feeder_id)
        .filter(Execution.bcc_id == bcc_id, Execution.status == "restored")
        .group_by(Execution.feeder_id, Feeder.ref, Feeder.nom, Feeder.priority)
        .all()
    )

    return {
        "bcc_id": bcc_id,
        "active_shedding_mw": round(active_mw, 2),
        "ens_total_mwh": round(ens_total, 2),
        "total_cuts": total_cuts,
        "feeder_stats": [
            {
                "feeder_id": row.feeder_id,
                "ref": row.ref,
                "nom": row.nom,
                "priority": row.priority,
                "total_hours": round((row.total_min or 0) / 60, 2),
                "total_ens_mwh": round(row.total_ens or 0, 2),
                "cut_count": row.cut_count,
            }
            for row in feeder_stats
        ],
    }


# ── Timeseries endpoint ───────────────────────────────────────────────────────

@router.get("/timeseries")
def get_timeseries(
    target_date: date = Query(default=None, description="Date ISO (default: today in Tunis TZ)"),
    interval_min: int = Query(default=30, ge=15, le=60, description="Slot width in minutes"),
    crc_id: int | None = Query(default=None, description="Filter to one CRC (optional)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return MW shed per time slot for a given day.

    Response shape:
    {
      "date": "2026-09-25",
      "interval_min": 30,
      "slots": [
        {
          "slot":     "00:00",          // slot start HH:MM
          "slot_end": "00:30",          // slot end HH:MM
          "mw_plan":  45.0,             // J-1 consigne for this slot
          "mw_real":  42.3,             // actual MW shed during this slot
          "is_past":  true,             // slot is in the past
          "is_now":   false             // current slot
        },
        ...
      ],
      "total_ens_mwh": 128.4
    }
    """
    if target_date is None:
        target_date = datetime.now(TUNIS_TZ).date()

    # Build slot boundaries in UTC
    day_start_local = datetime(target_date.year, target_date.month, target_date.day,
                                0, 0, 0, tzinfo=TUNIS_TZ)
    day_end_local   = day_start_local + timedelta(days=1)
    day_start_utc   = day_start_local.astimezone(timezone.utc)
    day_end_utc     = day_end_local.astimezone(timezone.utc)
    now_utc         = datetime.now(timezone.utc)

    # Restrict to BCCs of a given CRC if requested
    bcc_filter_ids: list[int] | None = None
    if crc_id is not None:
        bcc_filter_ids = [
            b.id for b in db.query(BCC.id).filter(BCC.crc_id == crc_id).all()
        ]

    _SLOTS_PER_DAY = 24 * 60 // interval_min

    # ── Try to load today's published J+1 programme plan ─────────────────────
    # Look for a programme with status 'active' or 'validated' for target_date.
    # 'active'    = today's live programme running now
    # 'validated' = DN approved it, execution not yet started
    # Falls back to a hardcoded profile when no programme found.
    prog = (
        db.query(Programme)
        .filter(
            Programme.programme_date == target_date,
            Programme.status.in_(["active", "validated"]),
        )
        .order_by(Programme.id.desc())   # latest if duplicates exist
        .first()
    )

    # Resolve CRC object once (used for scale/column selection below)
    crc_obj: CRC | None = db.get(CRC, crc_id) if crc_id is not None else None

    if prog is not None:
        # Build time_slot label → ProgrammeSlot lookup
        # ProgrammeSlot.time_slot is always "HH:MM" with 30-min labels.
        # Only national slots (bcc_id IS NULL) carry mw_nord / mw_sud.
        prog_slot_map = {s.time_slot: s for s in prog.slots if s.bcc_id is None}

        # ── Detect split-key anomaly ──────────────────────────────────────────
        # If the DN submitted the programme with split_nord=0% (mw_nord=0 on all
        # national slots), CRC Nord would get a flat-zero consigne line.
        # In that case fall back to the current settings split key so the chart
        # remains meaningful.  CRC Sud is unaffected (mw_sud == mw_national).
        _is_nord = crc_obj is not None and "Nord" in (crc_obj.name or "")
        _all_nord_zero = _is_nord and all(
            (ps.mw_nord or 0.0) == 0.0
            for ps in prog_slot_map.values()
            if (ps.mw_national or 0.0) > 0
        )

        # Load current split key from settings.json for the fallback
        _fallback_split_nord: float = 0.14   # safe default 14 %
        if _all_nord_zero:
            try:
                import json as _json, os as _os
                _settings_path = _os.path.join(
                    _os.path.dirname(__file__), "..", "..", "..", "data", "settings.json"
                )
                with open(_settings_path) as _f:
                    _settings = _json.load(_f)
                _fallback_split_nord = (_settings.get("split_nord", 14)) / 100
            except Exception:
                pass   # keep default 14 %

        def _plan_mw(slot_idx: int) -> float:
            h = (slot_idx * interval_min) // 60
            m = (slot_idx * interval_min) % 60
            label = f"{h:02d}:{m:02d}"
            ps = prog_slot_map.get(label)
            if ps is None:
                return 0.0
            if crc_obj is not None:
                if _is_nord:
                    # Fallback: if mw_nord is zero but national has a value,
                    # estimate the Nord share using the current split key.
                    if _all_nord_zero and (ps.mw_national or 0.0) > 0:
                        return round((ps.mw_national or 0.0) * _fallback_split_nord, 1)
                    return ps.mw_nord or 0.0
                else:
                    return ps.mw_sud or 0.0
            return ps.mw_national or 0.0

        # Inform the frontend about the data quality
        plan_source = "programme_split_estimated" if _all_nord_zero else "programme"
    else:
        # No programme for this date → no planned shedding.
        # The consigne line stays at 0 MW for the entire day.
        def _plan_mw(slot_idx: int) -> float:
            return 0.0

        plan_source = "no_programme"

    # Query: sum of mw_shed for all executions that were ACTIVE during each slot
    # An execution is active in a slot if started_at < slot_end AND
    # (ended_at IS NULL OR ended_at > slot_start)
    slots_data = []
    total_ens  = 0.0

    for slot_idx in range(_SLOTS_PER_DAY):
        slot_start_utc = day_start_utc + timedelta(minutes=slot_idx * interval_min)
        slot_end_utc   = slot_start_utc + timedelta(minutes=interval_min)

        if slot_start_utc >= day_end_utc:
            break

        q = db.query(func.coalesce(func.sum(Execution.mw_shed), 0.0)).filter(
            Execution.started_at < slot_end_utc,
            (Execution.ended_at == None) | (Execution.ended_at > slot_start_utc),  # noqa: E711
            Execution.started_at >= day_start_utc,
        )
        if bcc_filter_ids is not None:
            q = q.filter(Execution.bcc_id.in_(bcc_filter_ids))

        mw_real = float(q.scalar() or 0.0)
        plan    = round(_plan_mw(slot_idx), 1)

        is_past = slot_end_utc   <= now_utc
        is_now  = slot_start_utc <= now_utc < slot_end_utc

        # ENS contribution for past slots
        if is_past or is_now:
            total_ens += mw_real * (interval_min / 60)

        # Format slot labels in Tunis local time
        slot_local     = slot_start_utc.astimezone(TUNIS_TZ)
        slot_end_local = slot_end_utc.astimezone(TUNIS_TZ)
        slot_label     = slot_local.strftime("%H:%M")
        slot_end_label = slot_end_local.strftime("%H:%M")

        slots_data.append({
            "slot":      slot_label,
            "slot_end":  slot_end_label,
            "slot_idx":  slot_idx,
            "mw_plan":   plan,
            "mw_real":   round(mw_real, 1) if (is_past or is_now) else None,
            "is_past":   is_past,
            "is_now":    is_now,
        })

    return {
        "date":          target_date.isoformat(),
        "interval_min":  interval_min,
        "crc_id":        crc_id,
        "plan_source":   plan_source,   # "programme" | "no_programme"
        "slots":         slots_data,
        "total_ens_mwh": round(total_ens, 2),
    }
