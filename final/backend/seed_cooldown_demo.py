"""
Set 2-3 feeders per BCC as recently cut (2h ago) so they appear in cooldown.
This makes the unlock button visible for demo purposes.
Only updates the most recent 'restored' execution for those feeders.
"""
import sys
sys.path.insert(0, '.')
from datetime import datetime, timedelta, timezone
from app.core.database import SessionLocal
from app.models.execution import Execution
from app.models.network import Feeder, BCC

db = SessionLocal()
now = datetime.now(timezone.utc)
two_hours_ago = now - timedelta(hours=2)

bccs = db.query(BCC).all()
updated = 0

for bcc in bccs:
    feeders = (
        db.query(Feeder)
        .filter(Feeder.bcc_id == bcc.id, Feeder.priority != 'P0')
        .order_by(Feeder.ref)
        .limit(2)   # first 2 non-P0 feeders per BCC get cooldown treatment
        .all()
    )
    for f in feeders:
        # Find or create a recent restored execution
        exec_ = (
            db.query(Execution)
            .filter(Execution.feeder_id == f.id)
            .order_by(Execution.started_at.desc())
            .first()
        )
        if exec_:
            exec_.started_at = two_hours_ago
            exec_.ended_at   = now - timedelta(minutes=30)
            exec_.status     = 'restored'
            exec_.duration_min = 90
            exec_.ens_mwh    = round(f.mw_nominal * 90 / 60, 2)
        else:
            db.add(Execution(
                feeder_id    = f.id,
                bcc_id       = bcc.id,
                operator_id  = 1,
                started_at   = two_hours_ago,
                ended_at     = now - timedelta(minutes=30),
                duration_min = 90,
                mw_shed      = f.mw_nominal,
                ens_mwh      = round(f.mw_nominal * 90 / 60, 2),
                trigger      = 'manual',
                status       = 'restored',
            ))
        print(f"  {bcc.name} | {f.ref} | {f.nom} → last cut: 2h ago (COOLDOWN)")
        updated += 1

db.commit()
db.close()
print(f"\nDone. {updated} feeders now have last_cut = 2h ago (< 8h threshold → cooldown).")
print("Reload the BCC dashboard to see the cooldown tiles with unlock buttons.")
