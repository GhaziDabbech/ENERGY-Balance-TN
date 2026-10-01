"""
Simulate what GET /api/v1/feeders returns for a BCC 7 user,
including the cooldown annotation.
"""
from datetime import datetime, timezone
from sqlalchemy import func
from app.core.database import get_db
from app.models.network import BCC, Feeder
from app.models.execution import Execution
from app.models.user import User

db = next(get_db())

# Find bcc.ahmed user
user = db.query(User).filter(User.username == 'bcc.ahmed').first()
if not user:
    print('bcc.ahmed not found, trying bcc.7')
    user = db.query(User).filter(User.username == 'bcc.7').first()

if not user:
    print('No BCC 7 user found')
    exit(1)

print(f'User: {user.username}, role={user.role}, bcc_id={user.bcc_id}')

feeders = db.query(Feeder).filter(Feeder.bcc_id == user.bcc_id).order_by(Feeder.priority, Feeder.ref).all()
print(f'\nTotal feeders for bcc_id={user.bcc_id}: {len(feeders)}')

# Replicate _annotate_cooldown logic
feeder_ids = [f.id for f in feeders]
now = datetime.now(timezone.utc)

rows = (
    db.query(
        Execution.feeder_id,
        func.max(Execution.started_at).label("last_cut"),
    )
    .filter(Execution.feeder_id.in_(feeder_ids))
    .group_by(Execution.feeder_id)
    .all()
)
last_cut_map = {r.feeder_id: r.last_cut for r in rows}

# Get cooldown threshold from settings JSON file
import json
from pathlib import Path
settings_path = Path(__file__).parent / 'app' / 'data' / 'settings.json'
try:
    with open(settings_path) as sf:
        cooldown_h = json.load(sf).get('intervalle_min_heures', 8)
except Exception:
    cooldown_h = 8

print(f'Cooldown threshold: {cooldown_h}h')
print()
print(f'{"ID":>4}  {"REF":<6}  {"PRIORITY":<8}  {"HOURS_AGO":>10}  {"COOLDOWN":>10}  {"STATUS":<12}  NOM')
print('-' * 90)

for f in feeders:
    last_cut = last_cut_map.get(f.id)
    if last_cut:
        if last_cut.tzinfo is None:
            last_cut = last_cut.replace(tzinfo=timezone.utc)
        hours = (now - last_cut).total_seconds() / 3600.0
    else:
        hours = None

    if f.priority == 'P0':
        status = 'locked'
        in_cooldown = False
    elif hours is not None and hours < cooldown_h:
        status = 'cooldown'
        in_cooldown = True
    else:
        status = 'available'
        in_cooldown = False

    hours_str = f'{hours:.1f}h' if hours is not None else 'never'
    remaining = f'{cooldown_h - hours:.1f}h' if in_cooldown else '-'
    print(f'{f.id:>4}  {f.ref:<6}  {f.priority:<8}  {hours_str:>10}  {remaining:>10}  {status:<12}  {f.nom}')
