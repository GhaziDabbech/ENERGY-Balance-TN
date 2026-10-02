"""
Public citizen API entry point.

Exposes ONLY the citizen router — no operational routes, no WebSocket,
no admin endpoints, no scheduler.  Designed to run on a separate port
(8001) so the internal SCADA API (main.py / port 8000) stays isolated.

Start with:
    uvicorn main_public:app --host 0.0.0.0 --port 8001
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend
from fastapi_cache.backends.inmemory import InMemoryBackend
from redis import asyncio as aioredis

from app.core.config import settings
from app.core.database import SessionLocal
from app.services.seed_citizen import seed_citizen_data
from app.api.routes.citizen import router as citizen_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Seed citizen data (idempotent — safe to call every restart)
    db = SessionLocal()
    try:
        seed_citizen_data(db)
    finally:
        db.close()

    # Connect Redis cache (graceful degradation if Redis is not running)
    redis = None
    try:
        redis = aioredis.from_url(
            settings.REDIS_URL, encoding="utf8", decode_responses=True
        )
        await redis.ping()
        FastAPICache.init(RedisBackend(redis), prefix="steg-citizen-cache")
        logger.info("[public] Redis cache initialised at %s", settings.REDIS_URL)
    except Exception as exc:
        logger.warning(
            "[public] Redis unavailable (%s) — falling back to in-memory cache",
            exc,
        )
        FastAPICache.init(InMemoryBackend(), prefix="steg-citizen-cache")
        redis = None

    yield

    if redis is not None:
        await redis.aclose()
    logger.info("[public] Shutting down STEG Citizen API")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="STEG — Portail Citoyen API",
    version="1.0.0",
    description="API publique du portail citoyen STEG. Données de délestage uniquement.",
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["*"],
)

# ── Routes — citizen only ─────────────────────────────────────────────────────
app.include_router(citizen_router, prefix="/api/v1")


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health", tags=["system"])
def health():
    return {
        "status": "ok",
        "service": "steg-citizen-public",
    }


@app.get("/", tags=["system"])
def root():
    return {
        "message": "STEG Portail Citoyen API — v1.0.0",
        "docs": "/docs",
        "health": "/health",
    }
