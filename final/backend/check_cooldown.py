"""Check what hours_since_last_cut the feeders API would return for BCC 5."""
import sys
sys.path.insert(0, '.')
from datetime import datetime, timezone
from sqlalchemy import func
from app.core.database import SessionLocal
from app.models.execution import Execution
from app.models.network import Feeder, BCC

db = SessionLocal()
now = datetime.now(timezone.utc)

# Find BCC 5
bcc = db.query(BCC).filter(BCC.name == 'BCC 5').first()
if not bcc:
    print("BCC 5 not found"); db.close(); sys.exit()

feeders = db.query(Feeder).filter(Feeder.bcc_id == bcc.id).order_by(Feeder.priority, Feeder.ref).all()
feeder_ids = [f.id for f in feeders]

rows = (
    db.query(Execution.feeder_id, func.max(Execution.started_at).label("last_cut"))
    .filter(Execution.feeder_id.in_(feeder_ids))
    .group_by(Execution.feeder_id)
    .all()
)
last_cut_map = {r.feeder_id: r.last_cut for r in rows}

print(f"{'REF':<6} {'NOM':<30} {'PRIORITY':<10} {'HOURS_SINCE':>12}  STATUS vs 8h")
print("-" * 75)
for f in feeders:
    lc = last_cut_map.get(f.id)
    if lc:
        if lc.tzinfo is None:
            lc = lc.replace(tzinfo=timezone.utc)
        hours = (now - lc).total_seconds() / 3600
        flag = "IN COOLDOWN" if hours < 8 else f"ok ({hours:.1f}h)"
    else:
        hours = None
        flag = "never cut"
    print(f"{f.ref:<6} {f.nom:<30} {f.priority:<10} {str(round(hours,1)) if hours else 'None':>12}  {flag}")

db.close()
