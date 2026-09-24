"""Business logic shared by the API (main.py) and the chatbot.

Time convention: every date/time in the database is Tunisia local time (Africa/Tunis, UTC+1).
Schedule statuses: planned (proposed by the engine) -> approved (validated by a BCC operator)
-> active / executed, or cancelled. Citizens only ever see approved/active cuts.
"""
from datetime import date, datetime, time, timedelta, timezone
from statistics import pstdev
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from models import (AuditLog, BCC, ExecutionLog, Feeder, ProgramSchedule, Region, StaffUser, Zone)

TUNIS_TZ = timezone(timedelta(hours=1))  # Tunisia: UTC+1 all year, no daylight saving
CITIZEN_VISIBLE_STATUSES = ("approved", "active")
MAX_CUT_MINUTES = 45
COOLDOWN_HOURS = 4

# Fairness formula weights (team decision): priority 45%, rotation 25%, anti-repetition 20%, load -10%
W_PRIORITY, W_ROTATION, W_REPETITION, W_LOAD = 0.45, 0.25, 0.20, 0.10


# ============================================================
# TIME HELPERS
# ============================================================

def tunis_now() -> datetime:
    return datetime.now(TUNIS_TZ)


def today_tunis() -> date:
    return tunis_now().date()


def as_float(value: Any) -> Optional[float]:
    return None if value is None else float(value)


def hhmm(value: Optional[time]) -> Optional[str]:
    return value.strftime("%H:%M") if value else None


def iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def local(dt: Optional[datetime]) -> Optional[datetime]:
    """DB timestamps are naive Tunisia local time: attach the timezone."""
    if dt is None:
        return None
    return dt.replace(tzinfo=TUNIS_TZ) if dt.tzinfo is None else dt.astimezone(TUNIS_TZ)


def schedule_start(s: ProgramSchedule) -> datetime:
    return datetime.combine(s.scheduled_date, s.start_time, tzinfo=TUNIS_TZ)


def schedule_end(s: ProgramSchedule) -> datetime:
    return datetime.combine(s.scheduled_date, s.end_time, tzinfo=TUNIS_TZ)


def schedule_is_active(s: ProgramSchedule, now: Optional[datetime] = None) -> bool:
    if s.status in ("cancelled", "planned"):
        return False
    now = now or tunis_now()
    return schedule_start(s) <= now < schedule_end(s)


def schedule_is_upcoming_or_active(s: ProgramSchedule, now: Optional[datetime] = None) -> bool:
    return schedule_end(s) > (now or tunis_now())


# ============================================================
# AUDIT TRAIL
# ============================================================

def audit(db: Session, actor, action: str, details: str = "") -> None:
    """Record who did what. Call BEFORE db.commit() so it is saved with the action."""
    if isinstance(actor, StaffUser):
        entry = AuditLog(actor_type="staff", actor_id=actor.id,
                         actor_name=f"{actor.full_name} ({actor.role})", action=action, details=details)
    elif actor is None:
        entry = AuditLog(actor_type="system", action=action, details=details)
    else:
        entry = AuditLog(actor_type="citizen", actor_id=actor.id,
                         actor_name=f"{actor.first_name} {actor.last_name}", action=action, details=details)
    db.add(entry)


# ============================================================
# STAFF SCOPE: which BCCs a staff member is allowed to act on
# ============================================================

def allowed_bcc_ids(db: Session, staff: StaffUser) -> Optional[List[int]]:
    """None = all BCCs (admin, dn). CRC staff: their region's BCCs. BCC operator: their own BCC."""
    if staff.role in ("admin", "dn"):
        return None
    if staff.role in ("crc_nord", "crc_sud"):
        region = staff.role.split("_")[1]
        return [b.id for b in db.query(BCC).filter(BCC.crc == region).all()]
    return [staff.bcc_id] if staff.bcc_id else []


# ============================================================
# CITIZEN-FACING SCHEDULE / STATUS
# ============================================================

def schedule_item(s: ProgramSchedule, now: Optional[datetime] = None) -> Dict[str, Any]:
    active = schedule_is_active(s, now)
    return {
        "id": s.id,
        "date": s.scheduled_date.isoformat(),
        "start": hhmm(s.start_time),
        "end": hhmm(s.end_time),
        "start_time": hhmm(s.start_time),
        "end_time": hhmm(s.end_time),
        "duration": f"{s.duration_minutes} min",
        "duration_minutes": s.duration_minutes,
        "status": "Active now" if active else "Planned",
        "active": active,
        "reason": "Load balancing (supply below demand)",
    }


def zone_citizen_schedules(db: Session, zone_id: int, now: Optional[datetime] = None) -> List[ProgramSchedule]:
    """Today's and tomorrow's cuts a citizen may see: only approved/active ones, not finished yet."""
    now = now or tunis_now()
    rows = (db.query(ProgramSchedule)
            .filter(ProgramSchedule.zone_id == zone_id,
                    ProgramSchedule.scheduled_date >= now.date(),
                    ProgramSchedule.scheduled_date <= now.date() + timedelta(days=1),
                    ProgramSchedule.status.in_(CITIZEN_VISIBLE_STATUSES))
            .order_by(ProgramSchedule.scheduled_date, ProgramSchedule.start_time)
            .all())
    return [s for s in rows if schedule_is_upcoming_or_active(s, now)]


def zone_situation(zone: Zone, active: Optional[ProgramSchedule]) -> Dict[str, str]:
    if active:
        return {"status": "outage", "status_label": "Currently Under Shedding",
                "description": "Your zone is currently experiencing a planned electricity interruption."}
    value = (zone.electricity_status or "").lower()
    if "outage" in value:
        return {"status": "outage", "status_label": zone.electricity_status,
                "description": "Your zone is currently experiencing an electricity interruption."}
    if "demand" in value:
        return {"status": "demand", "status_label": "High Demand",
                "description": "Electricity is available, but demand is high in your zone."}
    if "available" in value:
        return {"status": "available", "status_label": "Power Available",
                "description": "Electricity is currently available in your zone."}
    return {"status": "unknown", "status_label": zone.electricity_status or "Unknown",
            "description": "The current electricity status is not available."}


def citizen_zone_status(db: Session, zone: Zone) -> Dict[str, Any]:
    now = tunis_now()
    schedules = zone_citizen_schedules(db, zone.id, now)
    active = next((s for s in schedules if schedule_is_active(s, now)), None)
    situation = zone_situation(zone, active)
    return {
        "zone": {"id": zone.id, "name": zone.name, "governorate": zone.governorate,
                 "latitude": zone.latitude, "longitude": zone.longitude,
                 "electricity_status": "Currently Under Shedding" if active else zone.electricity_status},
        "current_situation": {**situation, "under_shedding": active is not None,
                              "active_shedding": schedule_item(active, now) if active else None},
        "today_schedule": [schedule_item(s, now) for s in schedules],
    }


# ============================================================
# DN -> CRC -> BCC ALLOCATION
# ============================================================

def estimate_national_deficit(load_forecast: List[float], available: List[float]) -> List[float]:
    if len(load_forecast) != len(available):
        raise ValueError("load_forecast and available_resources must have the same number of slots")
    return [max(0.0, float(l) - float(a)) for l, a in zip(load_forecast, available)]


def build_j1_program(deficits: List[float], target_date: date, step_minutes: int = 30) -> List[Dict[str, Any]]:
    program = []
    for index, deficit in enumerate(deficits):
        start = index * step_minutes
        end = start + step_minutes
        if deficit <= 0 or end > 24 * 60:
            continue
        program.append({
            "slot_index": index, "date": target_date.isoformat(),
            "start_time": f"{start // 60:02d}:{start % 60:02d}",
            "end_time": "23:59" if end == 24 * 60 else f"{end // 60:02d}:{end % 60:02d}",
            "deficit_mw": round(deficit, 2),
        })
    return program


def split_regional_target(db: Session, national_target_mw: float, nord_ratio: Optional[float] = None) -> Dict[str, float]:
    """Default ratio comes from the regions table (about 2/3 North, 1/3 South), and can be overridden."""
    if nord_ratio is None:
        nord = db.query(Region).filter(Region.code == "nord").first()
        nord_ratio = float(nord.target_ratio) if nord else 0.66
    return {"nord": round(national_target_mw * nord_ratio, 2),
            "sud": round(national_target_mw * (1 - nord_ratio), 2),
            "nord_ratio": nord_ratio}


def allocate_to_bcc(crc_target_mw: float, bcc_list: List[BCC]) -> List[Dict[str, Any]]:
    """Split a region's target between its BCCs, proportionally to each BCC's average load."""
    if not bcc_list:
        return []
    total = sum(float(b.avg_load_mw or 0) for b in bcc_list)
    result = []
    for b in bcc_list:
        share = float(b.avg_load_mw or 0) / total if total > 0 else 1 / len(bcc_list)
        result.append({"bcc_id": b.id, "bcc_name": b.name, "crc": b.crc,
                       "target_mw": round(crc_target_mw * share, 2)})
    return result


# ============================================================
# FEEDER SELECTION (fairness formula)
# ============================================================

def days_since_cut(feeder: Feeder, now: datetime) -> Optional[float]:
    last = local(feeder.last_cut_at)
    return None if last is None else max(0.0, (now - last).total_seconds() / 86400)


def fairness_components(feeder: Feeder, max_load: float, now: datetime) -> Dict[str, float]:
    days = days_since_cut(feeder, now)
    rotation = 1.0 if days is None else min(days / 30, 1.0)
    load_ratio = float(feeder.avg_load_mw or 0) / max_load if max_load else 0.0
    parts = {
        "priority": W_PRIORITY * feeder.priority_level / 5,
        "rotation": W_ROTATION * rotation,
        "anti_repetition": W_REPETITION * max(0.0, 1 - feeder.total_cuts_month / 5),
        "load_penalty": -W_LOAD * load_ratio,
    }
    parts["score"] = sum(parts.values())
    return {k: round(v, 4) for k, v in parts.items()}


def reason_string(feeder: Feeder, now: datetime) -> str:
    days = days_since_cut(feeder, now)
    if days is None:
        history = "never cut before"
    elif days < 1:
        history = f"last cut {int(days * 24)} hours ago"
    else:
        history = f"last cut {int(days)} days ago"
    return (f"Priority {feeder.priority_level}/5, {history}, "
            f"{feeder.total_cuts_month} cuts in the last 30 days, load {float(feeder.avg_load_mw):.2f} MW")


def eligible_feeders(feeders: List[Feeder], now: datetime, cooldown_hours: int = COOLDOWN_HOURS) -> List[Feeder]:
    """Hard rules: never priority 0, never inactive, never inside the anti-repetition cooldown."""
    result = []
    for f in feeders:
        if not f.active or f.priority_level <= 0:
            continue
        last = local(f.last_cut_at)
        if last and (now - last).total_seconds() / 3600 < cooldown_hours:
            continue
        result.append(f)
    return result


def select_feeders(target_mw: float, feeders: List[Feeder], cooldown_hours: int = COOLDOWN_HOURS,
                   now: Optional[datetime] = None) -> List[Dict[str, Any]]:
    now = now or tunis_now()
    candidates = eligible_feeders(feeders, now, cooldown_hours)
    if not candidates:
        return []
    max_load = max(float(f.avg_load_mw or 0) for f in candidates)
    ranked = sorted(candidates, key=lambda f: fairness_components(f, max_load, now)["score"], reverse=True)

    selected, total = [], 0.0
    for f in ranked:
        if total >= target_mw:
            break
        selected.append({
            "feeder_id": f.id, "feeder_name": f.name, "zone_id": f.zone_id, "bcc_id": f.bcc_id,
            "priority_level": f.priority_level, "avg_load_mw": float(f.avg_load_mw or 0),
            "score": fairness_components(f, max_load, now)["score"],
            "duration_minutes": MAX_CUT_MINUTES, "reason": reason_string(f, now),
        })
        total += float(f.avg_load_mw or 0)
    return selected


def record_execution_on_feeder(feeder: Feeder, actual_start: datetime) -> None:
    """Keeps the rotation fair: the next selection sees this cut."""
    start = actual_start.astimezone(TUNIS_TZ).replace(tzinfo=None) if actual_start.tzinfo else actual_start
    if feeder.last_cut_at is None or start > feeder.last_cut_at:
        feeder.last_cut_at = start
    feeder.total_cuts_month = (feeder.total_cuts_month or 0) + 1


def feeder_explanation(feeder: Feeder, now: Optional[datetime] = None) -> Dict[str, Any]:
    now = now or tunis_now()
    siblings = [f for f in feeder.bcc.feeders if f.active and f.priority_level > 0] or [feeder]
    max_load = max(float(f.avg_load_mw or 0) for f in siblings)
    days = days_since_cut(feeder, now)
    return {
        "feeder_name": feeder.name, "zone": feeder.zone.name, "bcc": feeder.bcc.name,
        "region": feeder.bcc.crc, "priority_level": feeder.priority_level,
        "never_cut_by_design": feeder.priority_level == 0,
        "days_since_last_cut": "never cut" if days is None else round(days, 1),
        "cuts_last_30_days": feeder.total_cuts_month,
        "avg_load_mw": float(feeder.avg_load_mw or 0),
        "fairness_components": fairness_components(feeder, max_load, now),
        "summary": reason_string(feeder, now),
    }


# ============================================================
# KPI
# ============================================================

def compute_kpi(db: Session, period_start: date, period_end: date,
                region: Optional[str] = None, bcc_ids: Optional[List[int]] = None) -> Dict[str, Any]:
    """ENS and fairness over a period.
    inequality_index = standard deviation of cuts per zone (0 = perfectly fair, higher = less fair).
    fairness_score   = 1 / (1 + inequality_index), from 0 to 1, higher = fairer (easier to display).
    All zones of the scope count, INCLUDING zones never cut: otherwise one zone cut 5 times while
    the others were never cut would look 'perfectly fair'."""
    start_dt = datetime.combine(period_start, time.min)
    end_dt = datetime.combine(period_end + timedelta(days=1), time.min)

    q = (db.query(ExecutionLog, ProgramSchedule, Feeder)
         .join(ProgramSchedule, ExecutionLog.schedule_id == ProgramSchedule.id)
         .join(Feeder, ProgramSchedule.feeder_id == Feeder.id)
         .join(BCC, Feeder.bcc_id == BCC.id)
         .filter(ExecutionLog.actual_start >= start_dt, ExecutionLog.actual_start < end_dt))
    zq = db.query(Zone.id).join(Feeder, Feeder.zone_id == Zone.id).join(BCC, Feeder.bcc_id == BCC.id)
    if region:
        q, zq = q.filter(BCC.crc == region), zq.filter(BCC.crc == region)
    if bcc_ids is not None:
        q, zq = q.filter(BCC.id.in_(bcc_ids)), zq.filter(BCC.id.in_(bcc_ids))

    cuts_per_zone = {zid: 0 for (zid,) in zq.distinct().all()}
    ens = 0.0
    rows = q.all()
    for execution, schedule, feeder in rows:
        hours = (execution.actual_end - execution.actual_start).total_seconds() / 3600
        ens += float(execution.actual_mw_shed or 0) * hours
        cuts_per_zone[schedule.zone_id] = cuts_per_zone.get(schedule.zone_id, 0) + 1

    counts = list(cuts_per_zone.values())
    inequality = pstdev(counts) if len(counts) > 1 else 0.0
    return {
        "region": region, "period_start": period_start.isoformat(), "period_end": period_end.isoformat(),
        "ens_mwh": round(ens, 2), "execution_count": len(rows), "zones_in_scope": len(counts),
        "inequality_index": round(inequality, 3), "fairness_score": round(1 / (1 + inequality), 3),
    }
