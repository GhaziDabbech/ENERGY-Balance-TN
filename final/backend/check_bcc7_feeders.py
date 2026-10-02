from app.core.database import get_db
from app.models.network import BCC, Feeder

db = next(get_db())

bcc7 = db.query(BCC).filter(BCC.name == 'BCC 7').first()
if bcc7:
    print(f'BCC 7 found: id={bcc7.id}, zone={bcc7.zone}')
    feeders = db.query(Feeder).filter(Feeder.bcc_id == bcc7.id).all()
    print(f'Feeders count: {len(feeders)}')
    for f in feeders:
        print(f'  id={f.id}  ref={f.ref}  nom={f.nom}  priority={f.priority}  poste={f.poste_source}')
else:
    print('BCC 7 NOT FOUND in database')
