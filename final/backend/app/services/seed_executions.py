"""
Fake execution seeder — generates 30 days of realistic délestage history.
Called once after the main seed. Idempotent: skips if executions already exist.
"""
import logging
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.execution import Execution
from app.models.network import BCC, Feeder
from app.models.user import User

logger = logging.getLogger(__name__)

# ── Feeder catalogue per BCC (ref, nom, mw_nominal, priority) ────────────────
# P0 feeders are excluded — they are never cut
FEEDERS_BY_BCC = {
    "BCC 1": [
        ("F03", "Zone Portuaire Radès",         4.5, "P3"),
        ("F05", "Le Kram Centre",               3.2, "P4"),
        ("F08", "La Marsa Résidentiel",         2.8, "P2"),
        ("F10", "Ariana Ville",                 5.1, "P3"),
        ("F13", "Manouba Périurbain",            3.6, "P4"),
    ],
    "BCC 2": [
        ("F04", "ZI Ben Arous Ouest",           5.1, "P3"),
        ("F06", "Mornag Sud",                   3.4, "P2"),
        ("F11", "Fouchana Péri-urbain",          4.0, "P4"),
        ("F15", "Naassen Rural",                2.7, "P5"),
    ],
    "BCC 3": [
        ("F07", "Z.I. Béja Nord",               4.2, "P3"),
        ("F08", "Medjez El Bab Ville",           6.5, "P3"),
        ("F09", "Faubourg Est",                  3.8, "P4"),
        ("F18", "Nefza Rural",                   2.6, "P2"),
        ("F25", "Bou Salem Centre",              5.5, "P2"),
    ],
    "BCC 4": [
        ("F04", "Mateur Sud Agglomération",      3.1, "P3"),
        ("F06", "Tindja ZI",                     2.9, "P2"),
        ("F08", "Menzel Bourguiba Centre",        3.8, "P3"),
    ],
    "BCC 5": [
        ("F03", "Sidi Bouzid Ville",             4.6, "P2"),
        ("F05", "Kairouan Ouest Agricole",        5.2, "P1"),
        ("F08", "Régueb Stations Forages",        3.8, "P3"),
        ("F11", "Haffouz Rural",                  3.1, "P2"),
        ("F14", "Nasrallah Centre",               2.9, "P4"),
    ],
    "BCC 6": [
        ("F07", "Zone Hôtelière Port El Kantaoui",4.8, "P3"),
        ("F09", "Kalâa Kébira Centre",            3.5, "P2"),
        ("F12", "Moknine Artisanat",              2.7, "P4"),
        ("F15", "Sahline Rural",                  3.1, "P5"),
    ],
    "BCC 7": [
        ("F05", "Sfax Poudrière Industrielle",    5.4, "P3"),
        ("F08", "Gafsa Mines Nord",               4.2, "P2"),
        ("F10", "Gabès Sud Urbain",               3.6, "P3"),
        ("F14", "Métlaoui Oasis",                 2.9, "P1"),
        ("F17", "Mahres Rural",                   3.3, "P5"),
    ],
}

# ── How many cuts per BCC per week (realistic load) ──────────────────────────
CUTS_PER_WEEK = {
    "BCC 1": 2,
    "BCC 2": 2,
    "BCC 3": 4,   # most stressed
    "BCC 4": 1,
    "BCC 5": 5,   # most stressed
    "BCC 6": 3,
    "BCC 7": 4,
}


def seed_executions(db: Session) -> None:
    """Generate 30 days of fake executions for all 7 BCCs. Idempotent."""
    if db.query(Execution).count() > 0:
        return

    logger.info("Seeding fake executions (30 days)...")

    now    = datetime.now(timezone.utc)
    today  = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Get BCC objects and a DN user as fallback operator
    bccs     = {b.name: b for b in db.query(BCC).all()}
    dn_user  = db.query(User).filter(User.role == "DN").first()
    if not dn_user:
        logger.warning("No DN user found — skipping execution seed")
        return

    # Get or create feeders per BCC
    feeder_map: dict[str, list[Feeder]] = {}
    for bcc_name, specs in FEEDERS_BY_BCC.items():
        bcc = bccs.get(bcc_name)
        if not bcc:
            continue
        feeders = []
        for ref, nom, mw, prio in specs:
            # Try to find existing feeder first
            f = db.query(Feeder).filter(
                Feeder.bcc_id == bcc.id,
                Feeder.ref == ref,
            ).first()
            if not f:
                f = Feeder(
                    bcc_id=bcc.id,
                    ref=ref,
                    nom=nom,
                    poste_source=f"Poste {bcc_name}",
                    zone=nom.split()[0],
                    mw_nominal=mw,
                    priority=prio,
                    statut="Actif",
                )
                db.add(f)
            feeders.append(f)
        feeder_map[bcc_name] = feeders

    db.flush()   # get feeder IDs

    executions_created = 0
    rng = random.Random(42)   # deterministic seed for reproducibility

    for bcc_name, feeders in feeder_map.items():
        bcc = bccs.get(bcc_name)
        if not bcc or not feeders:
            continue

        cuts_per_week = CUTS_PER_WEEK.get(bcc_name, 2)

        # Generate cuts across the last 30 days
        # Spread across weekdays, cluster around 11:00–16:00 (peak délestage window)
        for day_offset in range(30):
            day = today - timedelta(days=day_offset)

            # Skip some days randomly — not every day has délestage
            if rng.random() > (cuts_per_week / 7.0):
                continue

            # Pick 1–3 feeders to cut that day (not the same ones every day — rotation)
            n_cuts = rng.randint(1, min(3, len(feeders)))
            chosen = rng.sample(feeders, n_cuts)

            for feeder in chosen:
                # Start time: between 10:00 and 14:00
                start_hour   = rng.randint(10, 14)
                start_minute = rng.choice([0, 15, 30, 45])
                started_at   = day.replace(hour=start_hour, minute=start_minute)

                # Duration: 1.5 to 5.5 hours (in minutes)
                duration_min = rng.randint(90, 330)
                ended_at     = started_at + timedelta(minutes=duration_min)

                # Don't create future executions
                if started_at > now:
                    continue

                mw_shed = round(feeder.mw_nominal * rng.uniform(0.85, 1.05), 2)
                ens_mwh = round(mw_shed * duration_min / 60, 2)

                execution = Execution(
                    feeder_id=feeder.id,
                    bcc_id=bcc.id,
                    operator_id=dn_user.id,   # fake — DN as placeholder
                    order_id=None,
                    started_at=started_at,
                    ended_at=ended_at,
                    duration_min=round(duration_min, 1),
                    mw_shed=mw_shed,
                    ens_mwh=ens_mwh,
                    trigger="j1",
                    status="restored",
                    notes="Données simulées — séquence de démonstration",
                )
                db.add(execution)
                executions_created += 1

    db.commit()
    logger.info("Fake executions seeded: %d records across 7 BCCs (30 days)", executions_created)


def seed_live_executions(db: Session) -> None:
    """
    Seed a realistic set of CURRENTLY-EXECUTING cuts for today.
    These represent the 'live' délestage that just started this afternoon.
    Idempotent: skips if any executing records already exist.
    """
    from app.models.execution import Execution as Exec2
    if db.query(Exec2).filter(Exec2.status == "executing").count() > 0:
        return

    logger.info("Seeding live (executing) cuts for today's dashboard...")

    now    = datetime.now(timezone.utc)
    bccs   = {b.name: b for b in db.query(BCC).all()}
    dn_user = db.query(User).filter(User.role == "DN").first()
    if not dn_user:
        return

    # Today's active cuts — represent a realistic peak délestage session
    # MW values are boosted to match the consigne targets for each BCC
    LIVE_CUTS = [
        # BCC 1 — consigne 110 MW — 4 feeders to reach ~105 MW
        ("BCC 1", "F03", "Zone Portuaire Radès",          28.5, 90),
        ("BCC 1", "F05", "Le Kram Centre",                 26.2, 45),
        ("BCC 1", "F08", "La Marsa Résidentiel",           22.8, 75),
        ("BCC 1", "F10", "Ariana Ville",                   28.1, 60),
        # BCC 2 — consigne 90 MW — 3 feeders to reach ~88 MW
        ("BCC 2", "F04", "ZI Ben Arous Ouest",             31.5, 75),
        ("BCC 2", "F06", "Mornag Sud",                     28.4, 50),
        ("BCC 2", "F11", "Fouchana Péri-urbain",            27.0, 40),
        # BCC 3 — consigne 50 MW — 3 feeders, under-delivering intentionally
        ("BCC 3", "F07", "Z.I. Béja Nord",                 13.2, 120),  # overdue!
        ("BCC 3", "F09", "Faubourg Est",                    11.8, 85),
        ("BCC 3", "F18", "Nefza Rural",                     12.6, 50),
        # BCC 4 — consigne 50 MW — 2 feeders, attention
        ("BCC 4", "F04", "Mateur Sud Agglomération",        22.1, 40),
        ("BCC 4", "F06", "Tindja ZI",                       19.9, 35),
        # BCC 5 — consigne 50 MW — CRITIQUE, under-delivering badly
        ("BCC 5", "F03", "Sidi Bouzid Ville",               11.6, 180),  # 3h — critical!
        ("BCC 5", "F05", "Kairouan Ouest Agricole",          10.2, 150),
        # BCC 6 — consigne 60 MW — 3 feeders conforme
        ("BCC 6", "F07", "Zone Hôtelière Port El Kantaoui",  21.8, 55),
        ("BCC 6", "F09", "Kalâa Kébira Centre",              20.5, 30),
        ("BCC 6", "F12", "Moknine Artisanat",                18.7, 25),
        # BCC 7 — consigne 40 MW — attention
        ("BCC 7", "F05", "Sfax Poudrière Industrielle",      19.4, 95),
        ("BCC 7", "F08", "Gafsa Mines Nord",                 15.6, 70),
    ]

    for bcc_name, f_ref, f_nom, mw, mins_ago in LIVE_CUTS:
        bcc = bccs.get(bcc_name)
        if not bcc:
            continue
        # Get or create feeder
        feeder = db.query(Feeder).filter(
            Feeder.bcc_id == bcc.id, Feeder.ref == f_ref
        ).first()
        if not feeder:
            feeder = Feeder(
                bcc_id=bcc.id, ref=f_ref, nom=f_nom,
                poste_source=f"Poste {bcc_name}", zone=f_nom.split()[0],
                mw_nominal=mw, priority="P3", statut="Actif",
            )
            db.add(feeder)
            db.flush()

        started_at = now - timedelta(minutes=mins_ago)
        execution  = Execution(
            feeder_id=feeder.id,
            bcc_id=bcc.id,
            operator_id=dn_user.id,
            order_id=None,
            started_at=started_at,
            ended_at=None,
            duration_min=None,
            mw_shed=round(mw * 0.95, 2),
            ens_mwh=None,
            trigger="j1",
            status="executing",
            notes="Délestage en cours — simulation demo",
        )
        db.add(execution)

    db.commit()
    logger.info("Live executing cuts seeded: %d cuts active now", len(LIVE_CUTS))
