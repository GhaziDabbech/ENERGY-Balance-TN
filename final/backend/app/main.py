import asyncio
import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import decode_token
from app.services.seed import seed_database
from app.services.seed_executions import seed_executions, seed_live_executions
from app.services.seed_citizen import seed_citizen_data
from app.services.seed_timeseries import seed_timeseries
from app.services.websocket import manager
from app.services.auto_exec import run_auto_exec_tick

from app.api.routes import auth, feeders, orders, executions, programmes, kpis, admin, historique, dashboard, citizen, ai
from app.api.routes import settings as settings_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── APScheduler instance (module-level so the toggle API can reference it) ───
scheduler = AsyncIOScheduler(timezone="Africa/Tunis")


def _schedule_auto_exec() -> None:
    """
    Register the auto-exec job on the scheduler.
    Fires at HH:00 and HH:30 every hour (each 30-min slot boundary).
    A 5-second jitter ensures any manual DB commits from the previous slot
    have time to land before we read the state.
    """
    if scheduler.get_job("auto_exec_tick"):
        return
    scheduler.add_job(
        run_auto_exec_tick
        ,CronTrigger(minute="0,30", second=5, timezone="Africa/Tunis")
        ,id="auto_exec_tick"
        ,name="J+1 Auto-Execution Tick"
        ,max_instances=1
        ,misfire_grace_time=60
        ,replace_existing=True
    )
    logger.info("[scheduler] auto_exec_tick registered (cron: */30 min +5s)")


# ── Startup / shutdown ────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    db = SessionLocal()
    try:
        seed_database(db)
        seed_executions(db)
        seed_live_executions(db)
        seed_citizen_data(db)
        seed_timeseries(db)
    finally:
        db.close()

    _schedule_auto_exec()
    scheduler.start()
    logger.info("[scheduler] APScheduler started — next tick at next :00 or :30")

    yield

    scheduler.shutdown(wait=False)
    logger.info("Shutting down STEG Délestage API")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="API nationale de gestion intelligente du délestage tournant — STEG",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────
app.include_router(auth.router,        prefix="/api/v1")
app.include_router(feeders.router,     prefix="/api/v1")
app.include_router(orders.router,      prefix="/api/v1")
app.include_router(executions.router,  prefix="/api/v1")
app.include_router(programmes.router,  prefix="/api/v1")
app.include_router(kpis.router,        prefix="/api/v1")
app.include_router(admin.router,       prefix="/api/v1")
app.include_router(historique.router,  prefix="/api/v1")
app.include_router(dashboard.router,   prefix="/api/v1")
app.include_router(citizen.router,         prefix="/api/v1")
app.include_router(settings_router.router, prefix="/api/v1")
app.include_router(ai.router,              prefix="/api/v1")


# ── WebSocket endpoint ────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(
    ws: WebSocket,
    token: str = Query(..., description="JWT access token"),
):
    """
    Real-time channel for urgence/réalimentation broadcast.
    Client connects with: ws://localhost:8000/ws?token=<jwt>
    """
    try:
        payload = decode_token(token)
    except JWTError:
        await ws.close(code=4001, reason="Token invalide")
        return

    user_info = {
        "user_id": payload.get("sub"),
        "role":    payload.get("role"),
        "zone":    payload.get("zone"),
        "bcc_id":  payload.get("bcc_id"),
    }

    await manager.connect(ws, user_info)

    try:
        # Send connection confirmation
        await ws.send_json({
            "event": "connected",
            "user_id": user_info["user_id"],
            "role": user_info["role"],
            "active_connections": manager.active_count,
        })

        # Keep alive — listen for client pings
        while True:
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_text("pong")

    except WebSocketDisconnect:
        manager.disconnect(ws)
        logger.info("WebSocket client disconnected: user=%s", user_info.get("user_id"))


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["system"])
def health():
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "ws_connections": manager.active_count,
    }


@app.get("/", tags=["system"])
def root():
    return {
        "message": "STEG Délestage API — v1.0.0",
        "docs": "/docs",
        "health": "/health",
    }
