"""Creates an APPROVED cut happening right now (started 10 min ago, ends in 35 min) in one zone,
so the citizen dashboard, the maps and both chatbots have a live outage to show in a demo.

Usage (from the backend folder):
    python scripts/demo_active_cut.py "Sfax Centre"
"""
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from database import SessionLocal  # noqa: E402
from logic import audit, reason_string, tunis_now  # noqa: E402
from models import Feeder, ProgramSchedule, Zone  # noqa: E402

zone_name = sys.argv[1] if len(sys.argv) > 1 else "Sfax Centre"
db = SessionLocal()
zone = db.query(Zone).filter(Zone.name.ilike(zone_name)).first()
if not zone:
    sys.exit(f"Zone '{zone_name}' not found. Names: {[z.name for z in db.query(Zone).all()]}")
feeder = (db.query(Feeder).filter(Feeder.zone_id == zone.id, Feeder.priority_level > 0, Feeder.active.is_(True))
          .order_by(Feeder.priority_level.desc()).first())
if not feeder:
    sys.exit(f"No cuttable feeder in {zone.name}.")

now = tunis_now().replace(tzinfo=None, second=0, microsecond=0)
start, end = now - timedelta(minutes=10), now + timedelta(minutes=35)
if start.date() != end.date():
    sys.exit("Too close to midnight for a demo cut, try again after 00:15.")
s = ProgramSchedule(feeder_id=feeder.id, zone_id=zone.id, scheduled_date=start.date(), start_time=start.time(),
                    end_time=end.time(), duration_minutes=45, target_mw=feeder.avg_load_mw,
                    status="approved", reason=reason_string(feeder, tunis_now()))
db.add(s)
audit(db, None, "demo_cut_created", f"{zone.name} / {feeder.name} {start:%H:%M}-{end:%H:%M}")
db.commit()
print(f"Active cut created in {zone.name} ({feeder.name}) from {start:%H:%M} to {end:%H:%M} (Tunisia time).")
