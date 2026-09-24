# ENERGY Balance TN

**National intelligent load-shedding management platform** · PESTGM 7.0 Tech Challenge, Track 2
IEEE IAS/IES/PES ESPRIT Student Branch Joint Chapter × STEG

When electricity demand exceeds supply, STEG must cut power to some areas and rotate the cuts
("délestage tournant"). Today this is coordinated manually between the Dispatching National (DN),
the two regional centres (CRC Nord / CRC Sud) and the 7 local bureaus (BCC). ENERGY Balance TN
digitizes that chain, keeps the rotation fair, keeps a human in control of every cut, and tells each
citizen clearly what is happening in *their* zone.

**Submission documents:** [Technical report (PDF)](docs/Technical_Report.pdf) ·
## What the platform does

```
DN  ── national deficit per time slot (J-1 program)
 │
 ├─ CRC Nord / CRC Sud ── regional split (default 66% / 34%, adjustable)
 │     │
 │     └─ 7 BCC ── fairness engine PROPOSES feeders → operator APPROVES / REJECTS → operator LOGS execution
 │
 └─ Citizens ── own zone only: live status, schedule, map, AI assistant
```

- **Fairness engine**: each feeder gets a score = 45% priority + 25% time since last cut
  + 20% fewer cuts in the last 30 days − 10% load. Hard rules: priority-0 feeders (hospitals, water
  pumping) are never cut, maximum 45 minutes per cut, 4-hour anti-repetition cooldown.
- **Human in the loop**: the engine (or the staff AI assistant) only *proposes* cuts (`planned`). A BCC operator
  approves or rejects each one before it exists for citizens, can cancel an approved cut by typing `I CONFIRM`,
  and logs the execution once the cut has started. Executions update the feeder history, so the rotation really rotates.
  before it exists for citizens. Executions update the feeder history, so the rotation really rotates.
- **Privacy by design**: a citizen logs in and only ever sees their own zone (dashboard, map, chatbot).
  Showing every zone side by side could make fair rotation look unfair, so it is not exposed.
- **Traceability**: every operator has their own login (even on a shared BCC computer) and every
  action is written to the audit log (who, when, what).
- **KPIs**: energy not supplied (ENS) and a fairness score per region.
- **AI assistants** (local model, no cloud, no cost):
  - *Citizen*: "When will my electricity come back?", in French, Arabic, English or Tunisian Derja.
    It has no way to read another zone's data, even if asked.
  - *Staff*: "Which zones are cut now?", "Why was Depart_SfaxCentre_2 chosen?", "Compare nord and sud".
    Answers come only from live platform data, limited to the operator's own BCC or region.
- **No SCADA/EMS/DMS integration** (out of scope by design): execution data is entered by operators.

## Tech stack

| Part | Technology |
|---|---|
| Frontend | React + Vite, Leaflet (OpenStreetMap) |
| Backend | FastAPI (Python), SQLAlchemy |
| Database | PostgreSQL |
| Auth | PBKDF2 password hashing + signed tokens (Python standard library) |
| AI | Ollama running `qwen3:8b` locally, with tool calling |

## Project structure

```
database/
  schema.sql            tables, constraints, indexes
  seed.sql              demo data (generated, see below)
backend/
  main.py               API routes
  logic.py              fairness engine, allocation, KPIs (shared by API and chatbot)
  models.py             database models
  auth.py               passwords, tokens, role checks
  database.py           connection
  chatbot/tools.py      read-only tools the AI can call
  chatbot/chat.py       chat engine (language detection, guards, fallbacks)
  scripts/generate_seed.py   rebuilds database/seed.sql
  scripts/demo_active_cut.py creates a live cut for demos
energy-balance-frontend/
  src/App.jsx           citizen portal
  src/AuthScreen.jsx    entry screen (Citizen / Staff)
  src/StaffConsole.jsx  operator console + staff AI assistant
  src/api.js            backend connection
```

## Run it locally (Windows PowerShell)

**Requirements:** Docker Desktop, Python 3.10+, Node.js 20+, Ollama.

**1. Database** (PostgreSQL in Docker, from the project root)
```powershell
docker run -d --name energy-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=energy_balance_tn -p 5432:5432 postgres:16
docker cp database/schema.sql energy-db:/schema.sql
docker cp database/seed.sql energy-db:/seed.sql
docker exec energy-db psql -U postgres -d energy_balance_tn -f /schema.sql -f /seed.sql
```
If port 5432 is already used on your PC, use `-p 5433:5432` and put `5433` in `DATABASE_URL`.
Next time, just run `docker start energy-db`.

**2. AI model**
```powershell
ollama pull qwen3:8b
```

**3. Backend**
```powershell
cd backend
pip install -r requirements.txt
copy .env.example .env
python -m uvicorn main:app --reload
```
API docs: http://127.0.0.1:8000/docs

**4. Frontend** (new terminal)
```powershell
cd energy-balance-frontend
npm install
npm run dev
```
Open http://localhost:5173

**5. Live cut for a demo** (optional, from `backend`)
```powershell
python scripts/demo_active_cut.py "Sfax Centre"
```

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Citizen (Sfax Centre) | mohamed.ghazi@example.com | Citizen2026! |
| Citizen (Menzah) | idriss@example.com | Citizen2026! |
| Citizen (Gabes Ville) | amina@example.com | Citizen2026! |
| Administrator | admin@steg.tn | Steg2026! |
| Dispatching National | dn@steg.tn | Steg2026! |
| CRC Nord / CRC Sud | crc.nord@steg.tn / crc.sud@steg.tn | Steg2026! |
| BCC Tunis operator | bcc.tunis@steg.tn | Steg2026! |
| BCC Sfax operators (shared PC) | bcc.sfax@steg.tn / bcc.sfax2@steg.tn | Steg2026! |

## Reset the demo data
```powershell
docker exec energy-db psql -U postgres -c "DROP DATABASE energy_balance_tn WITH (FORCE);" -c "CREATE DATABASE energy_balance_tn;"
docker exec energy-db psql -U postgres -d energy_balance_tn -f /schema.sql -f /seed.sql
```
The seed history uses dates relative to the day it is loaded, so it always looks recent.
To change the demo network, edit `backend/scripts/generate_seed.py` and run it again.


