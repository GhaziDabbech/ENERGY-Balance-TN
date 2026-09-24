"""Chatbot tools: read-only functions the AI model can call. Each returns a small, clear dict.
They reuse the same engine (logic.py) as the API, so the chatbot never disagrees with the dashboard."""
from datetime import date, datetime, timedelta
from typing import List, Optional

from sqlalchemy.orm import Session

from logic import (CITIZEN_VISIBLE_STATUSES, TUNIS_TZ, citizen_zone_status, compute_kpi, days_since_cut,
                   feeder_explanation, hhmm, schedule_end, schedule_is_active, schedule_start, tunis_now)
from models import BCC, Feeder, ProgramSchedule, Zone


def _day_label(d: date, today: date) -> str:
    return {0: "today", 1: "tomorrow"}.get((d - today).days, d.isoformat())


# ---------------- citizen ----------------

def get_zone_schedule(db: Session, zone_id: int) -> dict:
    """Citizen tool. Current or next cut in ONE zone. zone_id always comes from the login token."""
    zone = db.get(Zone, zone_id)
    if not zone:
        return {"error": "Unknown zone"}
    status = citizen_zone_status(db, zone)
    now = tunis_now()
    items = status["today_schedule"]
    if not items:
        return {"zone_name": zone.name, "status": "none",
                "zone_status": status["current_situation"]["status_label"]}
    nxt = items[0]
    start = datetime.fromisoformat(f"{nxt['date']}T{nxt['start']}").replace(tzinfo=TUNIS_TZ)
    end = datetime.fromisoformat(f"{nxt['date']}T{nxt['end']}").replace(tzinfo=TUNIS_TZ)
    view = {"zone_name": zone.name, "status": "active" if nxt["active"] else "scheduled",
            "day": _day_label(start.date(), now.date()), "start_local_time": nxt["start"],
            "estimated_restoration_local_time": nxt["end"], "other_cuts_planned": len(items) - 1,
            "all_cuts": [{"day": _day_label(date.fromisoformat(i["date"]), now.date()), "start": i["start"],
                          "end": i["end"], "active": i["active"]} for i in items]}
    if nxt["active"]:
        view["minutes_until_restoration"] = max(0, int((end - now).total_seconds() // 60))
    else:
        view["minutes_until_cut_starts"] = max(0, int((start - now).total_seconds() // 60))
    return view


# ---------------- admin ----------------

def _scoped_feeders(db: Session, bcc_ids: Optional[List[int]]):
    q = db.query(Feeder).filter(Feeder.active.is_(True), Feeder.priority_level > 0)
    return q.filter(Feeder.bcc_id.in_(bcc_ids)) if bcc_ids is not None else q


def list_active_cuts(db: Session, bcc_ids: Optional[List[int]] = None) -> dict:
    """Cuts happening now or later today/tomorrow (approved/active), plus proposals waiting for validation."""
    now = tunis_now()
    q = (db.query(ProgramSchedule).join(Feeder, ProgramSchedule.feeder_id == Feeder.id)
         .filter(ProgramSchedule.scheduled_date >= now.date(),
                 ProgramSchedule.scheduled_date <= now.date() + timedelta(days=1)))
    if bcc_ids is not None:
        q = q.filter(Feeder.bcc_id.in_(bcc_ids))
    rows = [s for s in q.order_by(ProgramSchedule.scheduled_date, ProgramSchedule.start_time).all()
            if schedule_end(s) > now]
    cuts = [{"zone": s.zone.name, "region": s.feeder.bcc.crc, "bcc": s.feeder.bcc.name, "feeder": s.feeder.name,
             "status": "active now" if schedule_is_active(s, now) else "upcoming",
             "day": _day_label(s.scheduled_date, now.date()), "start": hhmm(s.start_time), "end": hhmm(s.end_time)}
            for s in rows if s.status in CITIZEN_VISIBLE_STATUSES]
    pending = sum(1 for s in rows if s.status == "planned")
    return {"count": len(cuts), "cuts": cuts[:15], "proposals_waiting_for_validation": pending}


def get_selection_reason(db: Session, feeder_name: str, bcc_ids: Optional[List[int]] = None) -> dict:
    q = db.query(Feeder).filter(Feeder.name.ilike(feeder_name))
    feeder = q.first() or db.query(Feeder).filter(Feeder.name.ilike(f"%{feeder_name}%")).first()
    if not feeder:
        return {"error": f"No feeder found with name '{feeder_name}'"}
    if bcc_ids is not None and feeder.bcc_id not in bcc_ids:
        return {"error": "This feeder is outside your BCC / region."}
    return feeder_explanation(feeder)


def get_kpi(db: Session, region: Optional[str], period_start: str, period_end: str,
            bcc_ids: Optional[List[int]] = None) -> dict:
    try:
        start, end = date.fromisoformat(period_start), date.fromisoformat(period_end)
    except ValueError:
        return {"error": "Dates must look like 2026-09-01"}
    return compute_kpi(db, start, end, region if region in ("nord", "sud") else None, bcc_ids)


def list_stale_feeders(db: Session, days: int, bcc_ids: Optional[List[int]] = None, limit: int = 10) -> dict:
    now = tunis_now()
    stale = []
    for f in _scoped_feeders(db, bcc_ids).all():
        d = days_since_cut(f, now)
        if d is None or d >= days:
            stale.append({"feeder": f.name, "zone": f.zone.name, "priority_level": f.priority_level,
                          "days_since_last_cut": "never cut" if d is None else int(d)})
    stale.sort(key=lambda x: (x["days_since_last_cut"] != "never cut",
                              -(x["days_since_last_cut"] if isinstance(x["days_since_last_cut"], int) else 0)))
    return {"total_stale": len(stale), "top": stale[:limit]}


def compare_regions(db: Session, period_start: str, period_end: str) -> dict:
    result = {}
    for region in ("nord", "sud"):
        feeders = (db.query(Feeder).join(BCC, Feeder.bcc_id == BCC.id)
                   .filter(BCC.crc == region, Feeder.active.is_(True), Feeder.priority_level > 0).all())
        cuts = sum(f.total_cuts_month for f in feeders)
        kpi = get_kpi(db, region, period_start, period_end)
        result[region] = {"feeders": len(feeders), "cuts_last_30_days": cuts,
                          "avg_cuts_per_feeder": round(cuts / len(feeders), 2) if feeders else 0,
                          "never_cut": sum(1 for f in feeders if f.last_cut_at is None),
                          "ens_mwh": kpi.get("ens_mwh"), "fairness_score": kpi.get("fairness_score")}
    return result
