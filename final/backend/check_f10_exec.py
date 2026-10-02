"""
Check current execution status of F10 for BCC 7
"""
from app.core.database import get_db
from app.models.execution import Execution
from app.models.network import Feeder

db = next(get_db())

f10 = db.query(Feeder).filter(Feeder.id == 44).first()
print(f'Feeder: id={f10.id} ref={f10.ref} nom={f10.nom} statut={f10.statut}')

execs = db.query(Execution).filter(Execution.feeder_id == 44).order_by(Execution.started_at.desc()).limit(5).all()
print(f'\nLast 5 executions for F10 (id=44):')
for e in execs:
    print(f'  exec_id={e.id}  status={e.status}  started={e.started_at}  ended={e.ended_at}  mw={e.mw_shed}')

# Check if any is currently executing
active = db.query(Execution).filter(
    Execution.feeder_id == 44,
    Execution.status.in_(['executing', 'pending'])
).all()
print(f'\nActive executions: {len(active)}')
for e in active:
    print(f'  exec_id={e.id}  status={e.status}  started={e.started_at}')
