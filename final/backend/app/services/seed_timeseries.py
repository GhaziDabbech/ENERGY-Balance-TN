"""
Seed realistic today timeseries data for the DN and CRC charts.

Creates completed (status='restored') Execution rows spread across today
covering the morning and afternoon shedding windows. This gives the
/api/v1/kpis/timeseries endpoint real data to aggregate.

Idempotent: skips if today's timeseries executions already exist.
Called from lifespan startup in main.py.
"""
from datetime import date, datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import random
import logging

from sqlalchemy.orm import Session

from app.models.execution import Execution
from app.models.network import BCC, Feeder

logger   = logging.getLogger(__name__)
TUNIS_TZ = ZoneInfo("Africa/Tunis")

# ---------------------------------------------------------------------------
# Realistic daily load pattern for Tunisia (national total MW shed per window)
# Each window: (hour_start, hour_end, mw_national, label)
# ---------------------------------------------------------------------------
WINDOWS = [
    # Night / early morning — light shedding
    (0,  2,  80,  "Fenetre nuit"),
    (2,  5,  60,  "Fenetre nuit profonde"),
    (5,  7, 100,  "Fenetre aube"),
    # Morning ramp-up
    (7,  9, 180,  "Fenetre matinale"),
    (9, 11, 320,  "Fenetre avant-midi"),
    # Afternoon peak — heaviest shedding
    (11, 13, 400, "Fenetre midi"),
    (13, 15, 450, "Fenetre pointe apres-midi"),
    (15, 17, 380, "Fenetre apres-midi"),
    # Evening
    (17, 19, 300, "Fenetre crepuscule"),
    (19, 21, 420, "Fenetre soiree"),
    (21, 23, 250, "Fenetre nuit tardive"),
    (23, 24,  90, "Fenetre fin de nuit"),
]

# BCC ids and their share of national shedding (must sum to 1.0)
BCC_SHARES = {
    1: 0.17,   # BCC 1 — Tunis Nord
    2: 0.16,   # BCC 2 — Tunis Sud
    3: 0.14,   # BCC 3 — Nord-Ouest
    4: 0.12,   # BCC 4 — Bizerte
    5: 0.15,   # BCC 5 — Centre
    6: 0.14,   # BCC 6 — Sahel
    7: 0.12,   # BCC 7 — Sud
}

# Random seed for reproducibility
random.seed(42)


def _now_tunis() -> datetime:
    return datetime.now(TUNIS_TZ)


def _today_start_utc() -> datetime:
    today = _now_tunis().date()
    return datetime(today.year, today.month, today.day, 0, 0, 0,
                    tzinfo=TUNIS_TZ).astimezone(timezone.utc)


def seed_timeseries(db: Session) -> None:
    """Idempotent — skips if today's data already exists."""
    today     = _now_tunis().date()
    now_utc   = datetime.now(timezone.utc)
    day_start = _today_start_utc()

    # Check if we already have today's timeseries executions
    existing = db.query(Execution).filter(
        Execution.started_at >= day_start,
        Execution.trigger == "j1",
        Execution.status   == "restored",
    ).count()

    if existing > 0:
        logger.info("Timeseries seed: today's data already exists (%d rows) — skipping", existing)
        return

    logger.info("Seeding today's timeseries data...")

    # Get operator id — use the first user with role BCC (any will do for seeding)
    from app.models.user import User
    operator = db.query(User).filter(User.role == "BCC").first()
    if not operator:
        logger.warning("No BCC user found — cannot seed timeseries")
        return

    total_created = 0

    for bcc_id, share in BCC_SHARES.items():
        # Get feeders for this BCC (non-P0 only)
        feeders = (
            db.query(Feeder)
            .filter(Feeder.bcc_id == bcc_id, Feeder.priority != "P0")
            .order_by(Feeder.priority.asc())   # P1 first (highest priority)
            .all()
        )
        if not feeders:
            continue

        for (h_start, h_end, mw_national, label) in WINDOWS:
            window_start_utc = day_start + timedelta(hours=h_start)
            window_end_utc   = day_start + timedelta(hours=h_end)

            # Only seed past windows (don't create future data)
            if window_start_utc >= now_utc:
                continue

            # Clip window end to now so we don't create "future" executions
            effective_end = min(window_end_utc, now_utc - timedelta(minutes=2))
            if effective_end <= window_start_utc:
                continue

            target_mw = mw_national * share

            # Pick 1–4 feeders to cover target_mw
            selected = []
            cumulative = 0.0
            shuffled = feeders[:]
            random.shuffle(shuffled)
            for f in shuffled:
                if cumulative >= target_mw * 0.9:
                    break
                selected.append(f)
                cumulative += (f.mw_nominal or 5.0)

            if not selected:
                selected = [feeders[0]]

            # Spread cuts across the window with small offsets
            window_duration = (effective_end - window_start_utc).total_seconds()
            slice_sec = window_duration / max(len(selected), 1)

            for i, feeder in enumerate(selected):
                started = window_start_utc + timedelta(seconds=i * slice_sec)
                dur_min = random.uniform(28, 43)
                ended   = started + timedelta(minutes=dur_min)
                if ended > effective_end:
                    ended = effective_end

                if (ended - started).total_seconds() < 60:
                    continue

                dur_min_actual = (ended - started).total_seconds() / 60
                mw             = feeder.mw_nominal or 5.0
                ens            = mw * dur_min_actual / 60

                exec_row = Execution(
                    feeder_id=feeder.id,
                    bcc_id=bcc_id,
                    operator_id=operator.id,
                    order_id=None,
                    mw_shed=mw,
                    trigger="j1",
                    status="restored",
                    started_at=started,
                    ended_at=ended,
                    duration_min=round(dur_min_actual, 2),
                    ens_mwh=round(ens, 4),
                    notes=f"J-1 {label} — BCC {bcc_id}",
                )
                db.add(exec_row)
                total_created += 1

    db.commit()
    logger.info("Timeseries seed complete: %d execution rows created for %s",
                total_created, today.isoformat())
