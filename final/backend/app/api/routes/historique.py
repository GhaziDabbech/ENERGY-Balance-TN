"""
Historique ENS endpoint — aggregated view for DN dashboard.
Returns per-BCC statistics + cut list filtered by date range.
"""
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.execution import Execution
from app.models.network import BCC, CRC, Feeder
from app.models.user import User

router = APIRouter(prefix="/historique", tags=["historique"])


@router.get("")
def get_historique(
    date_from: date | None = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to:   date | None = Query(None, description="End date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns per-BCC ENS history aggregated for the DN Historique page.
    Any authenticated user can access this (DN, CRC, BCC all need visibility).

    Response shape per BCC:
    {
        bcc_id, bcc_name, crc_name,
        total_cuts, total_ens_mwh, total_duration_h,
        last_cut_date, equity_score (0-100),
        cuts: [{ date, feeder_ref, feeder_nom, started_at, ended_at,
                 duration_min, mw_shed, ens_mwh }]
    }
    """
    # Default: last 30 days
    now     = datetime.now(timezone.utc)
    dt_from = datetime.combine(
        date_from if date_from else (now - timedelta(days=30)).date(),
        datetime.min.time(),
    ).replace(tzinfo=timezone.utc)
    dt_to   = datetime.combine(
        date_to if date_to else now.date(),
        datetime.max.time(),
    ).replace(tzinfo=timezone.utc)

    # ── Fetch all BCCs with their CRC name ────────────────────────────────────
    bccs = db.query(BCC).order_by(BCC.name).all()
    crc_map = {c.id: c.name for c in db.query(CRC).all()}

    result = []

    for bcc in bccs:
        # ── All restored executions in this BCC within the date range ─────────
        execs = (
            db.query(Execution)
            .join(Feeder, Feeder.id == Execution.feeder_id)
            .filter(
                Execution.bcc_id == bcc.id,
                Execution.status == "restored",
                Execution.started_at >= dt_from,
                Execution.started_at <= dt_to,
            )
            .order_by(Execution.started_at.desc())
            .all()
        )

        total_ens      = sum(e.ens_mwh or 0 for e in execs)
        total_dur_min  = sum(e.duration_min or 0 for e in execs)
        last_cut       = execs[0].started_at.date() if execs else None
        days_since     = (now.date() - last_cut).days if last_cut else None

        # ── Equity score: 100 - penalty for over-used feeders ─────────────────
        # Compute per-feeder cut hours in period
        feeder_hours: dict[int, float] = {}
        for e in execs:
            feeder_hours[e.feeder_id] = feeder_hours.get(e.feeder_id, 0) + (e.duration_min or 0) / 60

        equity_score = 100
        if feeder_hours:
            max_h = max(feeder_hours.values())
            min_h = min(feeder_hours.values())
            range_h = max_h - min_h
            if max_h > 0:
                equity_score = max(0, round(100 - (range_h / max_h) * 60))

        # ── Cut list ──────────────────────────────────────────────────────────
        cuts = []
        for e in execs:
            feeder = db.get(Feeder, e.feeder_id)
            cuts.append({
                "execution_id": e.id,
                "date":         e.started_at.strftime("%d/%m/%Y"),
                "feeder_ref":   feeder.ref if feeder else "—",
                "feeder_nom":   feeder.nom if feeder else "—",
                "feeder_prio":  feeder.priority if feeder else "P4",
                "started_at":   e.started_at.strftime("%Hh%M"),
                "ended_at":     e.ended_at.strftime("%Hh%M") if e.ended_at else "—",
                "slot":         (
                    f"{e.started_at.strftime('%Hh%M')} — "
                    f"{e.ended_at.strftime('%Hh%M') if e.ended_at else '?'} "
                    f"({round(e.duration_min or 0)}min)"
                ),
                "duration_min": round(e.duration_min or 0),
                "mw_shed":      e.mw_shed,
                "ens_mwh":      round(e.ens_mwh or 0, 2),
            })

        result.append({
            "bcc_id":         bcc.id,
            "bcc_name":       bcc.name,
            "bcc_zone":       bcc.zone,
            "crc_name":       crc_map.get(bcc.crc_id, "—"),
            "total_cuts":     len(execs),
            "total_ens_mwh":  round(total_ens, 1),
            "total_mw_shed":  round(sum(e.mw_shed for e in execs), 1),
            "total_duration_h": round(total_dur_min / 60, 1),
            "last_cut_date":  last_cut.strftime("%d/%m/%Y") if last_cut else None,
            "days_since_last": days_since,
            "equity_score":   equity_score,
            "cuts":           cuts,
        })

    # ── National totals ───────────────────────────────────────────────────────
    national_ens   = round(sum(b["total_ens_mwh"]    for b in result), 1)
    national_dur   = round(sum(b["total_duration_h"] for b in result), 1)
    national_cuts  = sum(b["total_cuts"] for b in result)
    scores         = [b["equity_score"] for b in result if b["total_cuts"] > 0]
    national_equity = round(sum(scores) / len(scores)) if scores else 100

    return {
        "period":          { "from": dt_from.date().isoformat(), "to": dt_to.date().isoformat() },
        "national_totals": {
            "total_cuts":      national_cuts,
            "total_ens_mwh":   national_ens,
            "total_duration_h": national_dur,
            "equity_score":    national_equity,
        },
        "bccs": result,
    }
