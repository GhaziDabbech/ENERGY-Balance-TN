"""
Seed citizen demo data into steg_delestage.

Creates:
  - 1 CitizenZone per BCC coverage area (7 zones)
  - 14 sample citizens spread across all zones (2 per zone)
  - Today's programme schedule entries matching the live shedding windows
    already seeded in the executions table

Run automatically at startup (called from seed_database in seed.py).
Idempotent — safe to call multiple times.
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal
import logging

from sqlalchemy.orm import Session

from app.models.citizen import (
    Citizen,
    CitizenExecutionLog,
    CitizenNotification,
    CitizenProgramSchedule,
    CitizenZone,
)
from app.core.security import hash_password

logger = logging.getLogger(__name__)

# ── Zone definitions — one per BCC ───────────────────────────────────────────
# bcc_id matches the BCC ids confirmed from the DB (1-7)
ZONE_DEFS = [
    {
        "bcc_id":    1,
        "name":      "Tunis Ville & Ariana",
        "governorate": "Tunis",
        "latitude":  36.8065,
        "longitude": 10.1815,
    },
    {
        "bcc_id":    2,
        "name":      "Tunis Sud & Ben Arous",
        "governorate": "Ben Arous",
        "latitude":  36.7538,
        "longitude": 10.2280,
    },
    {
        "bcc_id":    3,
        "name":      "Nord-Ouest / Béja & Jendouba",
        "governorate": "Béja",
        "latitude":  36.7333,
        "longitude": 9.1833,
    },
    {
        "bcc_id":    4,
        "name":      "Bizerte & Mateur",
        "governorate": "Bizerte",
        "latitude":  37.2744,
        "longitude": 9.8739,
    },
    {
        "bcc_id":    5,
        "name":      "Centre / Kairouan & Sidi Bouzid",
        "governorate": "Kairouan",
        "latitude":  35.6781,
        "longitude": 10.0963,
    },
    {
        "bcc_id":    6,
        "name":      "Sahel / Sousse & Monastir",
        "governorate": "Sousse",
        "latitude":  35.8256,
        "longitude": 10.6369,
    },
    {
        "bcc_id":    7,
        "name":      "Sud / Sfax, Gabès & Médenine",
        "governorate": "Sfax",
        "latitude":  34.7406,
        "longitude": 10.7603,
    },
]

# ── Sample citizens — 2 per zone ─────────────────────────────────────────────
# Default demo password: "citizen1234"
# Hashed with bcrypt at seed time so verify_password() works on login.
_DEMO_PASSWORD = "citizen1234"

CITIZEN_DEFS = [
    # zone index 0 → BCC 1 / Tunis
    {"first_name": "Anis",    "last_name": "Trabelsi", "email": "anis.trabelsi@demo.tn",    "phone": "+216 71 123 001", "zone_idx": 0, "governorate": "Tunis",    "address": "12 Rue de Carthage, Tunis"},
    {"first_name": "Salma",   "last_name": "Chabbi",   "email": "salma.chabbi@demo.tn",     "phone": "+216 71 123 002", "zone_idx": 0, "governorate": "Ariana",   "address": "5 Avenue Bourguiba, Ariana"},
    # zone index 1 → BCC 2 / Ben Arous
    {"first_name": "Mohamed", "last_name": "Gharbi",   "email": "m.gharbi@demo.tn",         "phone": "+216 71 234 001", "zone_idx": 1, "governorate": "Ben Arous","address": "Av. de l'Indépendance, Ben Arous"},
    {"first_name": "Ines",    "last_name": "Mejri",    "email": "ines.mejri@demo.tn",       "phone": "+216 71 234 002", "zone_idx": 1, "governorate": "Ben Arous","address": "Cité El Mourouj, Ben Arous"},
    # zone index 2 → BCC 3 / Béja
    {"first_name": "Karim",   "last_name": "Dridi",    "email": "karim.dridi@demo.tn",      "phone": "+216 78 345 001", "zone_idx": 2, "governorate": "Béja",    "address": "Rue Hédi Chaker, Béja"},
    {"first_name": "Rania",   "last_name": "Hamdi",    "email": "rania.hamdi@demo.tn",      "phone": "+216 78 345 002", "zone_idx": 2, "governorate": "Jendouba","address": "Avenue Jendouba, Jendouba"},
    # zone index 3 → BCC 4 / Bizerte
    {"first_name": "Yassine", "last_name": "Bouzid",   "email": "yassine.bouzid@demo.tn",   "phone": "+216 72 456 001", "zone_idx": 3, "governorate": "Bizerte", "address": "Port de Bizerte, Bizerte"},
    {"first_name": "Nour",    "last_name": "Mansour",  "email": "nour.mansour@demo.tn",     "phone": "+216 72 456 002", "zone_idx": 3, "governorate": "Bizerte", "address": "Route de Mateur, Bizerte"},
    # zone index 4 → BCC 5 / Kairouan
    {"first_name": "Hedi",    "last_name": "Jaziri",   "email": "hedi.jaziri@demo.tn",      "phone": "+216 77 567 001", "zone_idx": 4, "governorate": "Kairouan","address": "Médina de Kairouan"},
    {"first_name": "Fatma",   "last_name": "Ayari",    "email": "fatma.ayari@demo.tn",      "phone": "+216 77 567 002", "zone_idx": 4, "governorate": "Sidi Bouzid","address": "Rue de la Révolution, Sidi Bouzid"},
    # zone index 5 → BCC 6 / Sousse
    {"first_name": "Sami",    "last_name": "Karray",   "email": "sami.karray@demo.tn",      "phone": "+216 73 678 001", "zone_idx": 5, "governorate": "Sousse",  "address": "Corniche de Sousse"},
    {"first_name": "Amira",   "last_name": "Ben Salem", "email": "amira.bensalem@demo.tn",  "phone": "+216 73 678 002", "zone_idx": 5, "governorate": "Monastir","address": "Avenue Habib Bourguiba, Monastir"},
    # zone index 6 → BCC 7 / Sfax
    {"first_name": "Tarek",   "last_name": "Sfaxsi",   "email": "tarek.sfaxsi@demo.tn",     "phone": "+216 74 789 001", "zone_idx": 6, "governorate": "Sfax",    "address": "Rue de la République, Sfax"},
    {"first_name": "Leila",   "last_name": "Gargouri",  "email": "leila.gargouri@demo.tn",  "phone": "+216 74 789 002", "zone_idx": 6, "governorate": "Gabès",   "address": "Oasis de Gabès, Gabès"},
]

# ── Today's demo schedules — 3 shedding windows spread across the day ─────────
# Zone indices that are scheduled for each window
SCHEDULE_DEFS = [
    # Morning window: zones 2,3,4 (BCC 3,4,5)
    {"hour_start": 8,  "hour_end": 9,  "zone_idxs": [2, 3, 4], "mw": 12.0, "reason": "Délestage planifié J-1 — fenêtre matinale"},
    # Afternoon window: zones 0,1,5 (BCC 1,2,6)
    {"hour_start": 14, "hour_end": 15, "zone_idxs": [0, 1, 5], "mw": 18.0, "reason": "Délestage planifié J-1 — fenêtre de pointe"},
    # Evening window: zones 2,4,6 (BCC 3,5,7)
    {"hour_start": 19, "hour_end": 20, "zone_idxs": [2, 4, 6], "mw": 15.0, "reason": "Délestage planifié J-1 — fenêtre soirée"},
]


def seed_citizen_data(db: Session) -> None:
    """Idempotent — skips if data already exists."""

    # ── Zones ──────────────────────────────────────────────────────────────────
    existing_zones = db.query(CitizenZone).count()
    if existing_zones > 0:
        logger.info("Citizen zones already seeded (%d zones) — skipping", existing_zones)
        zone_objects = db.query(CitizenZone).order_by(CitizenZone.id).all()
    else:
        logger.info("Seeding %d citizen zones...", len(ZONE_DEFS))
        zone_objects = []
        for z in ZONE_DEFS:
            zone = CitizenZone(
                name=z["name"],
                governorate=z["governorate"],
                latitude=z["latitude"],
                longitude=z["longitude"],
                electricity_status="Power Available",
                bcc_id=z["bcc_id"],
            )
            db.add(zone)
            zone_objects.append(zone)
        db.flush()  # get IDs without committing
        logger.info("  Created %d citizen zones", len(zone_objects))

    # ── Citizens ───────────────────────────────────────────────────────────────
    existing_citizens = db.query(Citizen).count()
    if existing_citizens > 0:
        logger.info("Citizens already seeded (%d) — skipping", existing_citizens)
    else:
        logger.info("Seeding %d demo citizens...", len(CITIZEN_DEFS))
        demo_hash = hash_password(_DEMO_PASSWORD)
        for c in CITIZEN_DEFS:
            citizen = Citizen(
                first_name=c["first_name"],
                last_name=c["last_name"],
                email=c["email"],
                phone=c["phone"],
                password_hash=demo_hash,
                zone_id=zone_objects[c["zone_idx"]].id,
                governorate=c["governorate"],
                address=c["address"],
                is_active=True,
            )
            db.add(citizen)
        logger.info("  Created %d citizens", len(CITIZEN_DEFS))

    # ── Programme schedules ────────────────────────────────────────────────────
    today = date.today()
    existing_schedules = (
        db.query(CitizenProgramSchedule)
        .filter(CitizenProgramSchedule.scheduled_date == today)
        .count()
    )
    if existing_schedules > 0:
        logger.info("Today's citizen schedules already exist (%d) — skipping", existing_schedules)
    else:
        logger.info("Seeding today's citizen schedules...")
        count = 0
        for sched in SCHEDULE_DEFS:
            t_start = time(sched["hour_start"], 0)
            t_end   = time(sched["hour_end"],   0)
            dur_min = (sched["hour_end"] - sched["hour_start"]) * 60
            for idx in sched["zone_idxs"]:
                ps = CitizenProgramSchedule(
                    zone_id=zone_objects[idx].id,
                    scheduled_date=today,
                    start_time=t_start,
                    end_time=t_end,
                    duration_minutes=dur_min,
                    target_mw=Decimal(str(sched["mw"])),
                    status="planned",
                    reason=sched["reason"],
                )
                db.add(ps)
                count += 1
        logger.info("  Created %d schedule entries for %s", count, today.isoformat())

    db.commit()
    logger.info("Citizen seed complete.")
