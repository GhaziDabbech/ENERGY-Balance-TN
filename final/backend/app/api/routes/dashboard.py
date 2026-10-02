"""
DN Dashboard KPI endpoint — single call returns everything the dashboard needs.
Includes per-BCC active status, live cuts, and summary totals.
Polled every 30 seconds by the frontend.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.execution import Execution
from app.models.network import BCC, CRC, Feeder
from app.models.user import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# Default consignes — overridden by settings.json via /api/v1/settings/bcc-consignes
_DEFAULT_CONSIGNES = {
    "BCC 1": 110.0, "BCC 2": 90.0, "BCC 3": 50.0, "BCC 4": 50.0,
    "BCC 5": 50.0,  "BCC 6": 60.0, "BCC 7": 40.0,
}

OPERATORS = {
    "BCC 1": "Ing. M. Trabelsi", "BCC 2": "Ing. A. Chahed",  "BCC 3": "Tech. S. Dridi",
    "BCC 4": "Ing. R. Gharbi",   "BCC 5": "Ing. H. Jaziri",  "BCC 6": "Ing. F. Mansour",
    "BCC 7": "Tech. Y. Ayari",
}


def _get_consignes() -> dict[str, float]:
    """Read live consignes from settings.json, fall back to defaults."""
    try:
        from app.api.routes.settings import _load
        data = _load()
        stored = data.get("bcc_consignes", {})
        return {**_DEFAULT_CONSIGNES, **stored}
    except Exception:
        return dict(_DEFAULT_CONSIGNES)


@router.get("")
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Single endpoint for the DN dashboard. Returns:
    - national_kpis: réalisé total, active cuts, zones actives, BCCs en anomalie, ENS today
    - bcc_rows: one row per BCC with live realise/ecart/statut
    - crc_summary: CRC Nord and CRC Sud totals
    - live_cuts: currently executing feeder cuts (for the live shedding tree)
    """
    now = datetime.now(timezone.utc)

    bccs = db.query(BCC).order_by(BCC.name).all()
    crcs = {c.id: c for c in db.query(CRC).all()}

    CONSIGNES = _get_consignes()

    bcc_rows   = []
    live_cuts  = []
    total_real = 0.0
    anomaly_bccs = []
    active_zones = set()

    for bcc in bccs:
        consigne = CONSIGNES.get(bcc.name, 50.0)
        crc_name = crcs[bcc.crc_id].name if bcc.crc_id in crcs else "—"

        # ── Currently executing cuts for this BCC ─────────────────────────────
        executing = (
            db.query(Execution)
            .join(Feeder, Feeder.id == Execution.feeder_id)
            .filter(Execution.bcc_id == bcc.id, Execution.status == "executing")
            .order_by(Execution.started_at.asc())
            .all()
        )

        realise = round(sum(e.mw_shed for e in executing), 1)
        total_real += realise
        ecart  = round(realise - consigne, 1)
        pct    = round((realise / consigne) * 100, 1) if consigne > 0 else 0

        # Status logic
        if len(executing) == 0:
            statut = "INACTIF"
        elif pct >= 98:
            statut = "CONFORME"
        elif pct >= 85:
            statut = "ATTENTION"
        elif pct >= 70:
            statut = "SOUS-CONSIGNE"
        else:
            statut = "CRITIQUE"

        if statut in ("CRITIQUE", "SOUS-CONSIGNE", "ATTENTION"):
            anomaly_bccs.append({"name": bcc.name, "ecart": ecart})

        if len(executing) > 0:
            active_zones.add(crc_name)

        # Last validation time
        last_exec = executing[-1] if executing else None
        validation = last_exec.started_at.strftime("%H:%M:%S") if last_exec else "—"

        bcc_rows.append({
            "id":        bcc.id,
            "name":      bcc.name,
            "zone":      bcc.zone,
            "crc":       crc_name,
            "consigne":  consigne,
            "realise":   realise,
            "ecart":     ecart,
            "pct":       pct,
            "statut":    statut,
            "cuts_count": len(executing),
            "validation": validation,
            "operateur":  OPERATORS.get(bcc.name, "—"),
        })

        # ── Live cuts for this BCC ────────────────────────────────────────────
        for e in executing:
            feeder = db.get(Feeder, e.feeder_id)
            elapsed_min = round((now - e.started_at).total_seconds() / 60, 1)
            live_cuts.append({
                "execution_id": e.id,
                "bcc_id":      bcc.id,
                "bcc_name":    bcc.name,
                "crc_name":    crc_name,
                "feeder_ref":  feeder.ref if feeder else "—",
                "feeder_nom":  feeder.nom if feeder else "—",
                "feeder_prio": feeder.priority if feeder else "—",
                "mw_shed":     e.mw_shed,
                "started_at":  e.started_at.strftime("%Hh%M"),
                "elapsed_min": elapsed_min,
                "overdue":     elapsed_min > 45,
            })

    # ── National totals ───────────────────────────────────────────────────────
    total_consigne = sum(CONSIGNES.values())
    total_deficit  = round(total_real - total_consigne, 1)
    total_pct      = round((total_real / total_consigne) * 100, 1) if total_consigne > 0 else 0

    ens_today = db.query(func.sum(Execution.ens_mwh)).filter(
        Execution.status == "restored",
        func.date(Execution.ended_at) == now.date(),
    ).scalar() or 0.0

    # ── CRC summaries ─────────────────────────────────────────────────────────
    crc_summary = {}
    for crc in crcs.values():
        rows = [r for r in bcc_rows if r["crc"] == crc.name]
        crc_summary[crc.name] = {
            "crc_id":   crc.id,
            "crc_name": crc.name,
            "consigne": round(sum(r["consigne"] for r in rows), 1),
            "realise":  round(sum(r["realise"]  for r in rows), 1),
            "ecart":    round(sum(r["ecart"]    for r in rows), 1),
            "bccs":     rows,
        }

    return {
        "timestamp": now.isoformat(),
        "national": {
            "consigne":   total_consigne,
            "realise":    round(total_real, 1),
            "ecart":      total_deficit,
            "pct":        total_pct,
            "ens_today":  round(ens_today, 1),
            "active_cuts": len(live_cuts),
            "zones_actives": list(active_zones),
        },
        "anomaly_bccs": anomaly_bccs,
        "bcc_rows":     bcc_rows,
        "crc_summary":  crc_summary,
        "live_cuts":    live_cuts,
    }
