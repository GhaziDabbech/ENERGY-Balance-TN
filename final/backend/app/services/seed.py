"""
Database seeder — populates demo data on first startup.
Idempotent: skips if data already exists.
Admin account password is read from ADMIN_PASSWORD env var — never hardcoded.
"""
import logging
import os

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.network import BCC, CRC, Feeder
from app.models.user import User

logger = logging.getLogger(__name__)


def seed_database(db: Session) -> None:
    # Skip if already seeded
    if db.query(CRC).count() > 0:
        return

    logger.info("Seeding database with demo data...")

    # ── Validate ADMIN_PASSWORD ───────────────────────────────────────────────
    admin_password = settings.ADMIN_PASSWORD.strip()
    if not admin_password:
        raise RuntimeError(
            "ADMIN_PASSWORD is not set in .env — cannot seed the admin account. "
            "Set a strong password in your .env file and restart the server."
        )
    if len(admin_password) < 8:
        raise RuntimeError(
            "ADMIN_PASSWORD must be at least 8 characters. "
            "Set a stronger password in your .env file."
        )

    # ── CRCs ──────────────────────────────────────────────────────────────────
    crc_nord = CRC(name="CRC Nord", city="La Goulette / Tunis", split_pct=67.0)
    crc_sud  = CRC(name="CRC Sud",  city="Thyna / Sfax",        split_pct=33.0)
    db.add_all([crc_nord, crc_sud])
    db.flush()

    # ── BCCs ──────────────────────────────────────────────────────────────────
    bccs_data = [
        dict(name="BCC 1", zone="Tunis Ville & Nord",               crc_id=crc_nord.id, vhf_canal="VHF 04-Nord", phone="+216 71 340 102"),
        dict(name="BCC 2", zone="Tunis Sud & Ben Arous",            crc_id=crc_nord.id, vhf_canal="VHF 04-Nord", phone="+216 71 340 110"),
        dict(name="BCC 3", zone="Nord-Ouest / Béja & Jendouba",     crc_id=crc_nord.id, vhf_canal="VHF 04-Nord", phone="+216 78 452 110"),
        dict(name="BCC 4", zone="Bizerte & Mateur",                 crc_id=crc_nord.id, vhf_canal="VHF 04-Nord", phone="+216 72 431 800"),
        dict(name="BCC 5", zone="Centre / Kairouan & Sidi Bouzid",  crc_id=crc_sud.id,  vhf_canal="VHF 07-Sud",  phone="+216 77 231 445"),
        dict(name="BCC 6", zone="Sahel / Sousse & Monastir",        crc_id=crc_sud.id,  vhf_canal="VHF 07-Sud",  phone="+216 73 221 800"),
        dict(name="BCC 7", zone="Sud / Sfax, Gabès & Médenine",     crc_id=crc_sud.id,  vhf_canal="VHF 09-Sud",  phone="+216 74 220 400"),
    ]
    bccs = {d["name"]: BCC(**d) for d in bccs_data}
    db.add_all(bccs.values())
    db.flush()

    # ── Users ─────────────────────────────────────────────────────────────────
    # Admin account: password from env var, must_change_password=True so admin
    # is forced to set their own password on first login.
    users = [
        User(
            username="admin",
            password_hash=hash_password(admin_password),
            full_name="Administrateur Système STEG",
            role="ADMIN",
            zone=None,
            bcc_id=None,
            must_change_password=True,   # forced password change on first login
        ),
        User(username="dn.admin",  password_hash=hash_password("admin1234"),   full_name="Ing. K. Ben Salem", role="DN",  zone=None,        bcc_id=None),
        User(username="crc.nord",  password_hash=hash_password("crcnord1234"), full_name="Ing. M. Trabelsi",  role="CRC", zone="CRC Nord",   bcc_id=None),
        User(username="crc.sud",   password_hash=hash_password("crcsud1234"),  full_name="Ing. F. Mansour",   role="CRC", zone="CRC Sud",    bcc_id=None),
        User(username="bcc.3",     password_hash=hash_password("bcc31234"),    full_name="Tech. S. Dridi",    role="BCC", zone=None,         bcc_id=bccs["BCC 3"].id),
        User(username="bcc.5",     password_hash=hash_password("bcc51234"),    full_name="Ing. H. Jaziri",    role="BCC", zone=None,         bcc_id=bccs["BCC 5"].id),
    ]
    db.add_all(users)
    db.flush()

    # ── Feeders for BCC 3 ─────────────────────────────────────────────────────
    bcc3_id = bccs["BCC 3"].id
    feeders_bcc3 = [
        Feeder(bcc_id=bcc3_id, ref="F02", nom="Hôpital Régional de Béja",       poste_source="Béja Centre TR1", governorate="Béja",     mw_nominal=4.5, priority="P0"),
        Feeder(bcc_id=bcc3_id, ref="F07", nom="Z.I. Béja Nord",                 poste_source="Béja Centre TR1", governorate="Béja",     mw_nominal=4.2, priority="P3"),
        Feeder(bcc_id=bcc3_id, ref="F08", nom="Medjez El Bab Ville",            poste_source="Béja Centre TR1", governorate="Béja",     mw_nominal=6.5, priority="P3"),
        Feeder(bcc_id=bcc3_id, ref="F11", nom="Testour Bourg",                  poste_source="Béja Centre TR1", governorate="Béja",     mw_nominal=7.0, priority="P3"),
        Feeder(bcc_id=bcc3_id, ref="F14", nom="Station de Pompage SONEDE Béja", poste_source="Béja Est TR2",    governorate="Béja",     mw_nominal=3.2, priority="P0"),
        Feeder(bcc_id=bcc3_id, ref="F18", nom="Nefza Rural",                    poste_source="Béja Est TR2",    governorate="Béja",     mw_nominal=2.6, priority="P2"),
        Feeder(bcc_id=bcc3_id, ref="F09", nom="Faubourg Est & Oueslatia",       poste_source="Béja Est TR2",    governorate="Béja",     mw_nominal=3.8, priority="P4"),
        Feeder(bcc_id=bcc3_id, ref="F21", nom="Amdoun Rural Nord",              poste_source="Béja Est TR2",    governorate="Béja",     mw_nominal=4.8, priority="P4"),
        Feeder(bcc_id=bcc3_id, ref="F28", nom="Goubellat Sud",                  poste_source="Béja Est TR2",    governorate="Béja",     mw_nominal=3.5, priority="P5"),
        Feeder(bcc_id=bcc3_id, ref="F25", nom="Bou Salem Centre",               poste_source="Jendouba N. TR1", governorate="Jendouba", mw_nominal=5.5, priority="P2"),
        Feeder(bcc_id=bcc3_id, ref="F15", nom="Téboursouk Agricole",            poste_source="Jendouba N. TR1", governorate="Béja",     mw_nominal=5.2, priority="P4"),
        Feeder(bcc_id=bcc3_id, ref="F31", nom="Jendouba Centre",                poste_source="Jendouba N. TR1", governorate="Jendouba", mw_nominal=4.1, priority="P3"),
        Feeder(bcc_id=bcc3_id, ref="F33", nom="Oued Meliz",                     poste_source="Jendouba N. TR1", governorate="Jendouba", mw_nominal=3.2, priority="P5"),
        Feeder(bcc_id=bcc3_id, ref="F42", nom="Hôpital Régional Jendouba",      poste_source="Jendouba S. TR2", governorate="Jendouba", mw_nominal=2.8, priority="P0"),
        Feeder(bcc_id=bcc3_id, ref="F36", nom="Ghardimaou Ville",               poste_source="Jendouba S. TR2", governorate="Jendouba", mw_nominal=5.8, priority="P3"),
        Feeder(bcc_id=bcc3_id, ref="F38", nom="Aïn Draham",                     poste_source="Jendouba S. TR2", governorate="Jendouba", mw_nominal=4.4, priority="P4"),
        Feeder(bcc_id=bcc3_id, ref="F40", nom="Fernana Rural",                  poste_source="Jendouba S. TR2", governorate="Jendouba", mw_nominal=3.6, priority="P5"),
        Feeder(bcc_id=bcc3_id, ref="F44", nom="Tabarka Ville",                  poste_source="Tabarka TR1",     governorate="Jendouba", mw_nominal=4.0, priority="P3"),
        Feeder(bcc_id=bcc3_id, ref="F45", nom="Nefza Bourg",                    poste_source="Tabarka TR1",     governorate="Béja",     mw_nominal=3.1, priority="P4"),
        Feeder(bcc_id=bcc3_id, ref="F46", nom="Aïn Snoussi",                    poste_source="Tabarka TR1",     governorate="Jendouba", mw_nominal=2.8, priority="P5"),
    ]
    db.add_all(feeders_bcc3)

    # ── Feeders for BCC 7 (Sud — Sfax, Gabès, Médenine, Tataouine, Kébili, Gafsa) ──
    bcc7_id = bccs["BCC 7"].id
    feeders_bcc7 = [
        # Kébili
        Feeder(bcc_id=bcc7_id, ref="F14", nom="Métlaoui Oasis",          poste_source="Poste BCC 7",    governorate="Kébili",    mw_nominal=134.2, priority="P1"),
        Feeder(bcc_id=bcc7_id, ref="F12", nom="Sessa",                   poste_source="Poste BCC 7",    governorate="Kébili",    mw_nominal=64.8,  priority="P2"),
        Feeder(bcc_id=bcc7_id, ref="F19", nom="Sidi Youssef Centre",     poste_source="sidi youssef",   governorate="Kébili",    mw_nominal=23.4,  priority="P3"),
        Feeder(bcc_id=bcc7_id, ref="F17", nom="Mahres Rural",            poste_source="Poste BCC 7",    governorate="Kébili",    mw_nominal=13.3,  priority="P5"),
        # Gafsa
        Feeder(bcc_id=bcc7_id, ref="F08", nom="Gafsa Mines Nord",        poste_source="sidi youssef",   governorate="Kébili",    mw_nominal=4.2,   priority="P2"),
        # Gabès
        Feeder(bcc_id=bcc7_id, ref="F15", nom="El Rayyen",               poste_source="Jendouba N. TR1",governorate="Gabès",     mw_nominal=30.0,  priority="P2"),
        Feeder(bcc_id=bcc7_id, ref="F01", nom="Le Coin",                 poste_source="sakiet ezzit",   governorate="Gabès",     mw_nominal=25.6,  priority="P3"),
        Feeder(bcc_id=bcc7_id, ref="F10", nom="Gabès Sud Urbain",        poste_source="Poste BCC 7",    governorate="Gabès",     mw_nominal=13.6,  priority="P3"),
        # Médenine
        Feeder(bcc_id=bcc7_id, ref="F00", nom="Coach",                   poste_source="sakiet ezzit",   governorate="Médenine",  mw_nominal=20.0,  priority="P3"),
        Feeder(bcc_id=bcc7_id, ref="F05", nom="Médenine Nekza",          poste_source="Poste BCC 7",    governorate="Médenine",  mw_nominal=15.4,  priority="P3"),
        Feeder(bcc_id=bcc7_id, ref="F47", nom="Aïn Snoussi",             poste_source="Jendouba N. TR1",governorate="Médenine",  mw_nominal=25.2,  priority="P3"),
        Feeder(bcc_id=bcc7_id, ref="GR6", nom="Douira",                  poste_source="Jendouba N. TR1",governorate="Médenine",  mw_nominal=14.0,  priority="P3"),
        # Tataouine
        Feeder(bcc_id=bcc7_id, ref="F11", nom="Herda",                   poste_source="sidi youssef",   governorate="Tataouine", mw_nominal=199.0, priority="P0"),
        Feeder(bcc_id=bcc7_id, ref="F02", nom="Karkar",                  poste_source="Jendouba N. TR1",governorate="Tataouine", mw_nominal=22.0,  priority="P3"),
        Feeder(bcc_id=bcc7_id, ref="F06", nom="Sostal",                  poste_source="sakiet ezzit",   governorate="Tataouine", mw_nominal=26.5,  priority="P3"),
        Feeder(bcc_id=bcc7_id, ref="F07", nom="Mesfar",                  poste_source="sakiet ezzit",   governorate="Tataouine", mw_nominal=17.4,  priority="P3"),
        Feeder(bcc_id=bcc7_id, ref="F09", nom="Nasr",                    poste_source="sakiet ezzit",   governorate="Tataouine", mw_nominal=23.0,  priority="P3"),
    ]
    db.add_all(feeders_bcc7)

    db.commit()
    logger.info(
        "Database seeded — admin account created (must_change_password=True), "
        "%d feeders for BCC 3, %d feeders for BCC 7",
        len(feeders_bcc3),
        len(feeders_bcc7),
    )
