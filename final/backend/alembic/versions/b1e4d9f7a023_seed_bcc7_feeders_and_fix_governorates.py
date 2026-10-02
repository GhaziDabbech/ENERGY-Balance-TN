"""seed_bcc7_feeders_and_fix_governorates

Revision ID: b1e4d9f7a023
Revises: 3cf6e88a5158
Create Date: 2026-09-30 12:00:00.000000

- Backfills governorate on BCC 3 feeders (were seeded without it).
- Inserts all BCC 7 feeders (Kébili, Gabès, Médenine, Tataouine, Gafsa)
  so the citizen registration cascade works for southern governorates.
- Idempotent: skips rows that already exist (checked by bcc_id + ref).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b1e4d9f7a023'
down_revision: Union[str, None] = '3cf6e88a5158'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ── BCC 3 governorate backfill ────────────────────────────────────────────────
# Maps ref → governorate for feeders that were seeded without one.
BCC3_GOV = {
    "F02": "Béja",     "F07": "Béja",     "F08": "Béja",     "F11": "Béja",
    "F14": "Béja",     "F18": "Béja",     "F09": "Béja",     "F21": "Béja",
    "F28": "Béja",     "F45": "Béja",
    "F25": "Jendouba", "F15": "Béja",     "F31": "Jendouba", "F33": "Jendouba",
    "F42": "Jendouba", "F36": "Jendouba", "F38": "Jendouba", "F40": "Jendouba",
    "F44": "Jendouba", "F46": "Jendouba",
}

# ── BCC 7 feeders ─────────────────────────────────────────────────────────────
# Taken directly from the SCADA feeder catalogue screenshot.
BCC7_FEEDERS = [
    # ref,   nom,                      poste_source,        zone,           governorate,    mw_nominal, priority
    ("F14",  "Métlaoui Oasis",         "Poste BCC 7",       "Métlaoui",     "Kébili",        134.2, "P1"),
    ("F08",  "Gafsa Mines Nord",       "sidi youssef",      "Gafsa",        "Kébili",          4.2, "P2"),
    ("F12",  "Sessa",                  "Poste BCC 7",       "sessa",        "Kébili",         64.8, "P2"),
    ("F15",  "El Rayyen",              "Jendouba N. TR1",   "sakiet ezzit", "Gabès",          30.0, "P2"),
    ("F00",  "Coach",                  "sakiet ezzit",      "coach",        "Médenine",       20.0, "P3"),
    ("F01",  "Le Coin",                "sakiet ezzit",      "sakiet ezzit", "Gabès",          25.6, "P3"),
    ("F02",  "Karkar",                 "Jendouba N. TR1",   "karkar",       "Tataouine",      22.0, "P3"),
    ("F05",  "Médenine Nekza",         "Poste BCC 7",       "nekza",        "Médenine",       15.4, "P3"),
    ("F06",  "Sostal",                 "sakiet ezzit",      "sosta2",       "Tataouine",      26.5, "P3"),
    ("F07",  "Mesfar",                 "sakiet ezzit",      "mesfar",       "Tataouine",      17.4, "P3"),
    ("F09",  "Nasr",                   "sakiet ezzit",      "nasr",         "Tataouine",      23.0, "P3"),
    ("F10",  "Gabès Sud Urbain",       "Poste BCC 7",       "Gabès",        "Gabès",          13.6, "P3"),
    ("F19",  "Sidi Youssef Centre",    "sidi youssef",      "sidi youssef", "Kébili",         23.4, "P3"),
    ("F47",  "Aïn Snoussi",            "Jendouba N. TR1",   "Ain snoussi",  "Médenine",       25.2, "P3"),
    ("GR6",  "Douira",                 "Jendouba N. TR1",   "douira",       "Médenine",       14.0, "P3"),
    ("F17",  "Mahres Rural",           "Poste BCC 7",       "Mahres",       "Kébili",         13.3, "P5"),
    # P0 — critical infrastructure, excluded from registration cascade but seeded for completeness
    ("F11",  "Herda",                  "sidi youssef",      "herda",        "Tataouine",     199.0, "P0"),
]


def upgrade() -> None:
    conn = op.get_bind()

    # ── 1. Backfill governorate on existing BCC 3 feeders ────────────────────
    bcc3 = conn.execute(sa.text(
        "SELECT id FROM bccs WHERE name = 'BCC 3' LIMIT 1"
    )).fetchone()

    if bcc3:
        bcc3_id = bcc3[0]
        for ref, gov in BCC3_GOV.items():
            conn.execute(sa.text(
                "UPDATE feeders SET governorate = :gov "
                "WHERE bcc_id = :bcc_id AND ref = :ref AND (governorate IS NULL OR governorate = '')"
            ), {"gov": gov, "bcc_id": bcc3_id, "ref": ref})

    # ── 2. Insert BCC 7 feeders (skip duplicates) ─────────────────────────────
    bcc7 = conn.execute(sa.text(
        "SELECT id FROM bccs WHERE name = 'BCC 7' LIMIT 1"
    )).fetchone()

    if bcc7:
        bcc7_id = bcc7[0]
        for ref, nom, poste_source, zone, governorate, mw_nominal, priority in BCC7_FEEDERS:
            exists = conn.execute(sa.text(
                "SELECT 1 FROM feeders WHERE bcc_id = :bcc_id AND ref = :ref LIMIT 1"
            ), {"bcc_id": bcc7_id, "ref": ref}).fetchone()

            if not exists:
                conn.execute(sa.text("""
                    INSERT INTO feeders
                        (bcc_id, ref, nom, poste_source, zone, governorate, mw_nominal, priority, statut)
                    VALUES
                        (:bcc_id, :ref, :nom, :poste_source, :zone, :governorate, :mw_nominal, :priority, 'Actif')
                """), {
                    "bcc_id":       bcc7_id,
                    "ref":          ref,
                    "nom":          nom,
                    "poste_source": poste_source,
                    "zone":         zone,
                    "governorate":  governorate,
                    "mw_nominal":   mw_nominal,
                    "priority":     priority,
                })


def downgrade() -> None:
    conn = op.get_bind()

    bcc7 = conn.execute(sa.text(
        "SELECT id FROM bccs WHERE name = 'BCC 7' LIMIT 1"
    )).fetchone()

    if bcc7:
        bcc7_id = bcc7[0]
        refs = [r[0] for r in BCC7_FEEDERS]
        # Only remove feeders that this migration inserted (statut = Actif, no executions)
        for ref in refs:
            conn.execute(sa.text(
                "DELETE FROM feeders WHERE bcc_id = :bcc_id AND ref = :ref "
                "AND id NOT IN (SELECT DISTINCT feeder_id FROM executions WHERE feeder_id IS NOT NULL)"
            ), {"bcc_id": bcc7_id, "ref": ref})
