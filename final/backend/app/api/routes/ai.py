"""
AI chat route — BCC-scoped assistant powered by local Ollama.

Security:
  - bcc_id is ALWAYS taken from the JWT (current_user.bcc_id), never from the
    request body.  A BCC operator cannot request data for another BCC by
    manipulating the payload.
  - CRC and DN users are explicitly blocked from this endpoint (require_role BCC).
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.user import User
from app.services.ai_service import chat_with_bcc_context, fill_programme_with_ai, chat_with_crc_context, suggest_crc_distribution, chat_with_dn_context

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["ai"])

# Only BCC operators can use this endpoint
_require_bcc_only = require_role("BCC")


# ── Request / response schemas ────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role:    str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=4000)


class BccChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(
        ...,
        min_length=1,
        max_length=20,
        description="Conversation history — last message must be role=user",
    )
    think: bool = Field(
        False,
        description="Enable Qwen3 thinking mode — slower but deeper reasoning",
    )


class BccChatResponse(BaseModel):
    reply:    str
    bcc_name: str
    model:    str = "qwen3:8b"


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post(
    "/bcc/chat",
    response_model=BccChatResponse,
    summary="BCC AI assistant — scoped to the operator's own BCC",
)
async def bcc_chat(
    body:         BccChatRequest,
    current_user: User    = Depends(_require_bcc_only),
    db:           Session = Depends(get_db),
):
    """
    Accepts the conversation history and returns the next assistant message.
    All DB queries inside the service are filtered by the JWT's bcc_id —
    the model can only reason over data belonging to this BCC.
    """
    logger.info("[AI] BCC chat request — user=%s bcc_id=%s", current_user.id, current_user.bcc_id)

    if not current_user.bcc_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Votre compte n'est pas associé à un BCC.",
        )

    # Validate last message is from the user
    if body.messages[-1].role != "user":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Le dernier message doit être de rôle 'user'.",
        )

    # Convert pydantic models to plain dicts for the service
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    try:
        reply = await chat_with_bcc_context(
            bcc_id   = current_user.bcc_id,
            bcc_name = current_user.bcc_name or f"BCC {current_user.bcc_id}",
            bcc_zone = current_user.bcc_zone or "—",
            messages = messages,
            think    = body.think,
            db       = db,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )

    return BccChatResponse(
        reply    = reply,
        bcc_name = current_user.bcc_name or f"BCC {current_user.bcc_id}",
    )


# ── Fill-programme schemas ─────────────────────────────────────────────────────

class SlotInput(BaseModel):
    time_slot: str
    mw_bcc:    float

class FeederInput(BaseModel):
    ref:        str
    nom:        str
    mw:         float
    priority:   str  = "P4"
    locked:     bool = False
    days_since: float | None = None

class FillProgrammeRequest(BaseModel):
    slots:   list[SlotInput]   = Field(..., min_length=1, max_length=48)
    feeders: list[FeederInput] = Field(..., min_length=1, max_length=60)

class FillProgrammeResponse(BaseModel):
    assignments: dict[str, list[str]]  # { "00:00": ["F05","F07"], ... }
    explanation: str
    bcc_name:    str


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post(
    "/bcc/fill-programme",
    response_model=FillProgrammeResponse,
    summary="AI fills all 48 J+1 slots with feeder assignments",
)
async def bcc_fill_programme(
    body:         FillProgrammeRequest,
    current_user: User    = Depends(_require_bcc_only),
    db:           Session = Depends(get_db),
):
    """
    The AI generates a complete feeder assignment for all J+1 slots,
    respecting MW targets and territorial equity rules.
    Returns the assignments map + a plain-French explanation.
    """
    logger.info(
        "[AI] fill-programme request — user=%s bcc_id=%s slots=%d feeders=%d",
        current_user.id, current_user.bcc_id, len(body.slots), len(body.feeders),
    )

    if not current_user.bcc_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Votre compte n'est pas associé à un BCC.",
        )

    slots_dicts   = [s.model_dump() for s in body.slots]
    feeders_dicts = [f.model_dump() for f in body.feeders]

    try:
        result = await fill_programme_with_ai(
            bcc_id   = current_user.bcc_id,
            bcc_name = current_user.bcc_name or f"BCC {current_user.bcc_id}",
            bcc_zone = current_user.bcc_zone or "—",
            slots    = slots_dicts,
            feeders  = feeders_dicts,
            db       = db,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )

    return FillProgrammeResponse(
        assignments = result["assignments"],
        explanation = result["explanation"],
        bcc_name    = current_user.bcc_name or f"BCC {current_user.bcc_id}",
    )


# ══════════════════════════════════════════════════════════════════════════════
# CRC AI endpoints
# ══════════════════════════════════════════════════════════════════════════════

_require_crc = require_role("CRC", "DN")


# ── CRC chat ──────────────────────────────────────────────────────────────────

class CrcChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=20)
    think:    bool              = Field(False)


class CrcChatResponse(BaseModel):
    reply:    str
    crc_name: str
    model:    str = "qwen3:8b"


@router.post(
    "/crc/chat",
    response_model=CrcChatResponse,
    summary="CRC AI assistant — scoped to the operator's own CRC zone",
)
async def crc_chat(
    body:         CrcChatRequest,
    current_user: User    = Depends(_require_crc),
    db:           Session = Depends(get_db),
):
    crc_zone = current_user.zone
    if not crc_zone:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Votre compte n'est pas associé à une CRC.",
        )

    if body.messages[-1].role != "user":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Le dernier message doit être de rôle 'user'.",
        )

    logger.info("[AI] CRC chat — user=%s zone=%s", current_user.id, crc_zone)

    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    try:
        reply = await chat_with_crc_context(
            crc_zone = crc_zone,
            messages = messages,
            think    = body.think,
            db       = db,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))

    return CrcChatResponse(reply=reply, crc_name=crc_zone)


# ── CRC distribution suggestion (urgence / réalimentation) ───────────────────

class BccCapacityInput(BaseModel):
    id:          int
    label:       str
    capacity_mw: float = Field(..., gt=0)


class CrcDistributionRequest(BaseModel):
    order_type: str   = Field(..., pattern="^(urgence|realim)$")
    mw_total:   float = Field(..., gt=0)
    bccs:       list[BccCapacityInput] = Field(..., min_length=1, max_length=10)


class CrcDistributionResponse(BaseModel):
    distribution: dict[str, float]   # bcc_id (as str) → MW
    explanation:  str
    crc_name:     str


@router.post(
    "/crc/suggest-distribution",
    response_model=CrcDistributionResponse,
    summary="AI suggests MW distribution across BCCs for urgence or réalimentation",
)
async def crc_suggest_distribution(
    body:         CrcDistributionRequest,
    current_user: User    = Depends(_require_crc),
    db:           Session = Depends(get_db),
):
    crc_zone = current_user.zone
    if not crc_zone:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Votre compte n'est pas associé à une CRC.",
        )

    logger.info(
        "[AI] CRC suggest-distribution — user=%s zone=%s type=%s mw=%.1f",
        current_user.id, crc_zone, body.order_type, body.mw_total,
    )

    bccs_dicts = [b.model_dump() for b in body.bccs]

    try:
        result = await suggest_crc_distribution(
            crc_zone   = crc_zone,
            order_type = body.order_type,
            mw_total   = body.mw_total,
            bccs       = bccs_dicts,
            db         = db,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))

    # Convert int keys to str for JSON serialisation
    dist_str = {str(k): v for k, v in result["distribution"].items()}

    return CrcDistributionResponse(
        distribution = dist_str,
        explanation  = result["explanation"],
        crc_name     = crc_zone,
    )


# ══════════════════════════════════════════════════════════════════════════════
# DN AI endpoint — national-scope assistant
# ══════════════════════════════════════════════════════════════════════════════

_require_dn = require_role("DN")


class DnChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(
        ...,
        min_length=1,
        max_length=30,
        description="Conversation history — last message must be role=user",
    )
    think: bool = Field(
        False,
        description="Enable Qwen3 thinking mode — slower but deeper reasoning",
    )


class DnChatResponse(BaseModel):
    reply: str
    model: str = "qwen3:8b"


@router.post(
    "/dn/chat",
    response_model=DnChatResponse,
    summary="DN AI assistant — national-scope SCADA advisor",
)
async def dn_chat(
    body:         DnChatRequest,
    current_user: User    = Depends(_require_dn),
    db:           Session = Depends(get_db),
):
    """
    Accepts the full conversation history and returns the next assistant message.
    The system prompt is built from live national data (all BCCs, all CRCs, active
    cuts, recent orders, and today's programme) fetched directly from the DB at
    request time — no stale context.

    Only DN-role users can call this endpoint.
    """
    logger.info("[AI/DN] chat request — user=%s", current_user.id)

    if body.messages[-1].role != "user":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Le dernier message doit être de rôle 'user'.",
        )

    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    try:
        reply = await chat_with_dn_context(
            messages = messages,
            think    = body.think,
            db       = db,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )

    return DnChatResponse(reply=reply)
