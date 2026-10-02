# STEG Délestage — Intelligent Load-Shedding Management System

> A full-stack SCADA platform for managing Tunisia's national rotating power cuts (délestage tournant), used by operators at every level of the grid hierarchy: DN → CRC → BCC → Citizens.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Docker (recommended)](#docker-recommended)
  - [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [User Roles](#user-roles)
- [Key Concepts](#key-concepts)
- [API Reference](#api-reference)
- [AI Assistant](#ai-assistant)
- [Screenshots](#screenshots)

---

## Overview

STEG Délestage is a real-time operations platform that digitises the full lifecycle of a load-shedding event on the Tunisian interconnected grid:

1. **DN** (Direction Nationale) submits a J+1 programme — the national MW shed plan for the next day.
2. **CRC Nord / CRC Sud** split that plan by region and distribute MW targets to BCCs under their supervision.
3. **BCCs** (Bureaux de Commande et de Contrôle) assign specific HTA feeders to each 30-minute slot and execute cuts in real time.
4. **Citizens** check their outage schedule and receive in-app notifications through a separate public portal.

The system also provides an automated execution engine that fires every 30 minutes aligned to the clock, a full audit trail of every maneuver, ENS/KPI analytics, an interactive geographic map, and a local AI assistant powered by Ollama.

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                      Docker Compose                        │
│                                                            │
│  ┌──────────────┐   ┌──────────────────┐                   │
│  │  SCADA UI    │   │  Citizen Portal  │                   │
│  │  React/Vite  │   │  React/Vite      │                   │
│  │  :5173       │   │  :5174           │                   │
│  └──────┬───────┘   └────────┬─────────┘                   │
│         │                    │                             │
│  ┌──────▼───────┐   ┌────────▼─────────┐                   │
│  │  Internal    │   │  Public          │                   │
│  │  SCADA API   │   │  Citizen API     │                   │
│  │  FastAPI :8000│   │  FastAPI :8001  │                   │
│  └──────┬───────┘   └────────┬─────────┘                   │
│         │                    │                             │
│  ┌──────▼────────────────────▼─────────┐                   │
│  │          PostgreSQL :5432           │                   │
│  │          (steg_delestage)           │                   │
│  └─────────────────────────────────────┘                   │
│  ┌──────────────────────────────────────┐                  │
│  │          Redis :6379                 │                  │
│  │     (citizen API response cache)     │                  │
│  └──────────────────────────────────────┘                  │
└────────────────────────────────────────────────────────────┘
```

The internal API exposes a WebSocket endpoint (`/ws`) for real-time broadcast of emergency orders, execution events, and missed-slot alerts. Every BCC operator interface subscribes to this channel automatically.

---

## Features

### Operations

| Feature | Description |
|---|---|
| **J+1 Programme** | DN creates the next-day national shedding schedule (48 × 30-min slots). CRC splits by region, BCCs assign feeders and validate slots. |
| **Emergency Orders** | DN issues urgency orders to CRCs or specific BCCs. Acknowledged in real time via WebSocket. |
| **Execution Tracking** | BCC operators record feeder cuts and restorations. Duration and ENS (Energy Not Supplied) are computed and stored automatically. |
| **Auto-Execution** | Per-BCC toggle — when enabled, the scheduler applies the validated J+1 plan automatically at each 30-min boundary (ruleset R1–R10). |
| **Priority System** | Feeders carry P0–P5 priorities. P0 feeders (hospitals, water stations) are hard-blocked from ever being shed. |

### Analytics

| Feature | Description |
|---|---|
| **DN Dashboard** | National KPIs: total MW shed, cumulative ENS, active executions across all BCCs, missed-slot alerts. |
| **CRC Dashboard** | Regional view scoped to Nord or Sud. |
| **BCC Dashboard** | Per-BCC real-time feed of active cuts, slot countdown, MW obligation vs actual. |
| **ENS History** | Time-series charts per BCC/feeder with date-range filtering. |
| **Geographic Map** | Interactive Leaflet map showing BCC coverage areas and live feeder status. |

### Citizen Portal

- Public outage schedule by zone/governorate
- Citizen registration and login
- In-app notifications when a cut starts or ends in the citizen's zone
- AI chatbot for citizen queries (zone-scoped, no operational data exposed)

### AI Assistant

- Role-aware chatbot powered by a local **Ollama** instance (`qwen3:8b`)
- Context is automatically built from the DB: active cuts, recent history, J+1 slot, feeder list
- Separate context builders for BCC, CRC, DN, and citizen roles
- Deterministic AI-assisted feeder assignment algorithm with equity scoring (ENS balancing across feeders)

---

## Tech Stack

### Backend

| Library | Version | Role |
|---|---|---|
| FastAPI | 0.115.5 | REST API + WebSocket |
| SQLAlchemy | 2.0.36 | ORM |
| Alembic | 1.14.0 | Database migrations |
| PostgreSQL | 16 | Primary database |
| Redis | 7 | Citizen API caching |
| APScheduler | 3.10.4 | Auto-execution cron |
| python-jose | 3.3.0 | JWT authentication |
| passlib / bcrypt | 1.7.4 | Password hashing |
| httpx | 0.27.2 | Ollama HTTP client |
| Pydantic | 2.10.3 | Request/response validation |
| Uvicorn | 0.32.1 | ASGI server |

### Frontend (SCADA — `operators-frontend`)

| Library | Version | Role |
|---|---|---|
| React | 18.3.1 | UI framework |
| Vite | 8.3.0 | Build tool |
| React Router | 6.26.1 | Client-side routing |
| TanStack Query | 5.56.2 | Server state management |
| Zustand | 4.5.5 | Client state (auth) |
| Recharts | 2.12.7 | KPI / ENS charts |
| React Leaflet | 4.2.1 | Interactive map |
| Tailwind CSS | 3.4.11 | Styling |
| Axios | 1.7.4 | HTTP client |

### Frontend (Citizen Portal — `citizen-frontend`)

| Library | Version | Role |
|---|---|---|
| React | 19.2.8 | UI framework |
| Vite | 8.3.0 | Build tool |
| React Router | 6.26.1 | Client-side routing |
| Zustand | 4.5.5 | Client state |
| React Leaflet | 5.0.0 | Zone map |
| Axios | 1.7.4 | HTTP client |
| Lucide React | 1.47.0 | Icon set |

---

## Project Structure

```
final/
├── docker-compose.yml          # Full 6-container stack
├── .env.docker                 # Docker-specific env vars
│
├── backend/                    # FastAPI application
│   ├── app/
│   │   ├── main.py             # App entry point, routes, WebSocket, scheduler
│   │   ├── api/
│   │   │   ├── deps.py         # Auth dependencies
│   │   │   └── routes/         # One file per router
│   │   │       ├── auth.py
│   │   │       ├── programmes.py
│   │   │       ├── orders.py
│   │   │       ├── executions.py
│   │   │       ├── feeders.py
│   │   │       ├── kpis.py
│   │   │       ├── dashboard.py
│   │   │       ├── historique.py
│   │   │       ├── citizen.py
│   │   │       ├── ai.py
│   │   │       ├── admin.py
│   │   │       └── settings.py
│   │   ├── core/
│   │   │   ├── config.py       # Pydantic settings
│   │   │   ├── database.py     # SQLAlchemy engine + session
│   │   │   └── security.py     # JWT helpers
│   │   ├── models/             # SQLAlchemy ORM models
│   │   │   ├── network.py      # CRC, BCC, Feeder
│   │   │   ├── user.py
│   │   │   ├── programme.py    # Programme, ProgrammeSlot
│   │   │   ├── order.py        # Order, OrderAck
│   │   │   ├── execution.py
│   │   │   └── citizen.py      # CitizenZone, Citizen, notifications
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   └── services/
│   │       ├── auto_exec.py    # 30-min execution scheduler (R1-R10)
│   │       ├── ai_service.py   # Ollama integration + context builders
│   │       ├── websocket.py    # WebSocket connection manager
│   │       └── seed*.py        # Development data seeders
│   ├── alembic/                # Migration files
│   └── requirements.txt
│
├── operators-frontend/             # Operator SCADA interface
│   └── src/
│       ├── pages/
│       │   ├── dn/             # DNDashboard, DNMap, HistoriqueENS, SIGEditor, Simulateur
│       │   ├── crc/            # CRCDashboard, CRCHistorique
│       │   ├── bcc/            # BCCDashboard, BCCHistorique, BCCDeparts
│       │   ├── admin/          # AdminDashboard
│       │   └── auth/           # LoginPage, ChangePassword
│       ├── stores/             # Zustand stores
│       └── App.jsx             # Route definitions + role guards
│
└── citizen-frontend/           # Public citizen portal
    └── src/
        └── pages/
            └── citizen/        # CitizenPortal + chatbot
```

---

## Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for the recommended path)
- Or: Python 3.12+, Node.js 20+, PostgreSQL 16, Redis 7 (for local dev)
- [Ollama](https://ollama.com) + `qwen3:8b` model (optional — AI features only)

### Docker (recommended)

```bash
# 1. Clone the repository
git clone <repo-url>
cd final

# 2. Copy and review the environment file
copy .env.docker .env.docker.local   # Windows
# cp .env.docker .env.docker.local   # Linux/macOS

# 3. Build and start all 6 containers
docker compose up --build

# 4. Access the applications
#    SCADA operator UI  →  http://localhost:5173
#    Citizen portal     →  http://localhost:5174
#    Internal API docs  →  http://localhost:8000/docs
#    Public API docs    →  http://localhost:8001/docs
```

The backend automatically runs Alembic migrations and seeds the database with BCCs, feeders, and demo data on the first start.

To stop and wipe all volumes:
```bash
docker compose down -v
```

### Local Development

**Backend**

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux/macOS

# Install dependencies
pip install -r requirements.txt

# Start PostgreSQL and Redis (or use Docker for just those services)
docker compose up postgres redis -d

# Run migrations
alembic upgrade head

# Start the API
uvicorn app.main:app --reload --port 8000
```

**SCADA Frontend**

```bash
cd operators-frontend
npm install
npm run dev          # http://localhost:5173
```

**Citizen Frontend**

```bash
cd citizen-frontend
npm install
npm run dev          # http://localhost:5174
```

**Ollama (AI features)**

```bash
# Install Ollama from https://ollama.com
ollama pull qwen3:8b
ollama serve         # Runs on http://localhost:11434
```

---

## Environment Variables

Copy `backend/.env` and adjust for your environment. All variables are also documented in `.env.docker`.

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://steg_app:...@localhost:5432/steg_delestage` |
| `SECRET_KEY` | JWT signing secret — **change in production** | (see `.env`) |
| `ALGORITHM` | JWT algorithm | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token TTL | `30` |
| `REFRESH_TOKEN_EXPIRE_HOURS` | Refresh token TTL | `8` |
| `ADMIN_PASSWORD` | Password for the default `admin` account | `StegAdmin2026!` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379/0` |
| `CORS_ORIGINS` | JSON array of allowed origins | `["http://localhost:5173","http://localhost:5174"]` |
| `OLLAMA_URL` | Ollama API endpoint | `http://localhost:11434/api/chat` |
| `DEBUG` | Enable debug logging | `false` |

> **Security note:** Always replace `SECRET_KEY` and `ADMIN_PASSWORD` before any deployment. Never commit real secrets to source control.

---

## User Roles

| Role | Scope | Key Permissions |
|---|---|---|
| **ADMIN** | System-wide | Create/deactivate users, reset passwords, manage BCCs and feeders |
| **DN** | National | Submit J+1 programmes, issue emergency orders, view all KPIs and dashboards |
| **CRC** | Regional (Nord or Sud) | Distribute MW targets to BCCs, monitor regional executions |
| **BCC** | Single BCC zone | Assign feeders to slots, execute/restore cuts, use AI assistant |
| **Citizen** | Own zone | View outage schedules, receive notifications, use public chatbot |

Default credentials (seeded on first run):

| Username | Password | Role |
|---|---|---|
| `admin` | `StegAdmin2026!` (from env) | ADMIN |
| `dn_user` | `password123` | DN |
| `crc_nord` | `password123` | CRC Nord |
| `bcc1` … `bcc7` | `password123` | BCC operators |

---

## Key Concepts

### Network Hierarchy

```
DN (national)
  └── CRC Nord  (La Goulette, ~50% of national load)
  │     └── BCC 1 — Béja & Jendouba
  │     └── BCC 2 — Bizerte
  │     └── BCC 3 — ...
  └── CRC Sud  (Sfax)
        └── BCC 4 — ...
```

### J+1 Programme Workflow

```
DN creates programme (draft)
  → DN submits (validated)
  → CRC distributes MW targets per BCC slot (assigned)
  → BCC assigns feeder refs per slot (validated)
  → At slot boundary, auto-exec or manual BCC action fires cuts
```

### Feeder Priorities

| Priority | Meaning |
|---|---|
| P0 | Never shed — hospitals, water stations, national security |
| P1 | Emergency only |
| P2–P4 | Normal délestage candidates |
| P5 | Shed first |

### Auto-Execution Ruleset (R1–R10)

The scheduler fires at `HH:00:05` and `HH:30:05` (Africa/Tunis timezone). Key rules:

- **R1** — J1 feeder already cutting → close old record, open new one (ENS tracked per slot)
- **R2** — Manual/urgence cut running when a planned slot starts → execute planned feeders in parallel; manual cut stays active
- **R5** — P0 feeder in plan → hard-block; skip entire slot, report deficit to DN
- **R7** — Slot MW = 0 → restore only J1 feeders; manual/urgence cuts unaffected
- **R10** — Scheduler fires > 2 min late → skip slot, broadcast `slot_manqué` to all connected clients

### ENS (Energy Not Supplied)

`ENS (MWh) = MW_shed × duration_min / 60`

Stored on every execution record and aggregated on dashboards and KPI endpoints.

---

## API Reference

The API is fully documented via Swagger UI at runtime:

- Internal (operator) API: `http://localhost:8000/docs`
- Public (citizen) API: `http://localhost:8001/docs`

Key endpoint groups:

| Prefix | Description |
|---|---|
| `POST /api/v1/auth/login` | Obtain access + refresh tokens |
| `GET /api/v1/feeders` | List feeders (scoped by BCC for BCC role) |
| `GET/POST /api/v1/programmes` | J+1 programme CRUD |
| `POST /api/v1/orders` | Issue emergency order (DN only) |
| `GET/POST /api/v1/executions` | Record and restore feeder cuts |
| `GET /api/v1/kpis` | Aggregated KPI metrics |
| `GET /api/v1/dashboard` | Role-aware dashboard data |
| `GET /api/v1/historique` | ENS time-series history |
| `POST /api/v1/ai/chat` | AI assistant (role-scoped) |
| `GET /api/v1/citizen/schedule` | Public outage schedule |

WebSocket: `ws://localhost:8000/ws?token=<jwt>`

---

## AI Assistant

Each operator role has a dedicated AI chat endpoint powered by a locally hosted Ollama model (`qwen3:8b`). The context injected into the model is built from live DB data and is strictly scoped to the user's role and BCC:

- **BCC operators** see: their feeders, active cuts, last-24h history, today's J+1 slot, and 7-day ENS summary
- **CRC operators** see: all BCCs in their region, regional MW obligations, and active executions
- **DN users** see: the national programme status, all active executions, and missed-slot alerts
- **Citizens** see: their zone's schedule, notification history — no operational data

The assistant also implements a deterministic feeder assignment algorithm that suggests which feeders to assign to a slot, balancing ENS across feeders while respecting P0 hard-blocks and active-maintenance exclusions.

To use AI features, ensure Ollama is running and the `qwen3:8b` model is downloaded:

```bash
ollama pull qwen3:8b
```

---

## Screenshots

### DN Dashboard
![DN Dashboard](docs/screenshots/dn-dashboard.png)

### BCC Execution Panel
![BCC Execution Panel](docs/screenshots/bcc-execution.png)

### Geographic Map
![Geographic Map](docs/screenshots/geographic-map.png)

### Citizen Portal
![Citizen Portal](docs/screenshots/citizen-portal.png)

---

## License

This project was developed as part of an academic capstone (PES TGM). All rights reserved.
