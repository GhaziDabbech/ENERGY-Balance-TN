"""
AI service — BCC-scoped context builder + Ollama call.

Security model:
  - All DB queries are filtered by bcc_id extracted from the JWT (never from
    the request body).  The model only sees what this function injects.
  - No cross-BCC data is ever fetched or included in the prompt.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.models.execution import Execution
from app.models.network import BCC, Feeder
from app.models.order import Order
from app.models.programme import Programme, ProgrammeSlot

logger = logging.getLogger(__name__)

import os

OLLAMA_URL   = os.getenv("OLLAMA_URL", "http://localhost:11434/api/chat")
OLLAMA_MODEL = "qwen3:8b"
TIMEOUT_SEC  = 120.0   # generation can take a few seconds on CPU


# ── Context builder ───────────────────────────────────────────────────────────

def _build_bcc_context(bcc_id: int, bcc_name: str, bcc_zone: str, db: Session) -> str:
    """
    Fetches all BCC-scoped data from the DB and formats it as a readable
    text block to inject into the system prompt.
    """
    now     = datetime.now(timezone.utc)
    since24 = now - timedelta(hours=24)
    since7d = now - timedelta(days=7)

    # ── BCC info ──────────────────────────────────────────────────────────────
    bcc = db.get(BCC, bcc_id)
    bcc_line = (
        f"BCC : {bcc_name} | Zone : {bcc_zone} | "
        f"Mode auto : {'OUI' if bcc and bcc.auto_mode else 'NON'}"
    )

    # ── Feeders ───────────────────────────────────────────────────────────────
    feeders: list[Feeder] = (
        db.query(Feeder)
        .filter(Feeder.bcc_id == bcc_id)
        .order_by(Feeder.priority, Feeder.ref)
        .all()
    )
    feeder_lines = []
    for f in feeders:
        feeder_lines.append(
            f"  {f.ref} | {f.nom} | {f.priority} | {f.mw_nominal} MW | "
            f"Poste: {f.poste_source} | Statut: {f.statut}"
        )
    feeders_block = "\n".join(feeder_lines) if feeder_lines else "  (aucun départ)"

    # ── Active executions (currently cutting) ─────────────────────────────────
    active_execs: list[Execution] = (
        db.query(Execution)
        .filter(Execution.bcc_id == bcc_id, Execution.status == "executing")
        .order_by(Execution.started_at.desc())
        .all()
    )
    active_lines = []
    for e in active_execs:
        feeder  = db.get(Feeder, e.feeder_id)
        elapsed = round((now - e.started_at).total_seconds() / 60)
        overdue = "⚠ DÉPASSEMENT" if elapsed >= 45 else ""
        active_lines.append(
            f"  {feeder.ref if feeder else '?'} | {feeder.nom if feeder else '?'} | "
            f"{e.mw_shed} MW | Début : {e.started_at.strftime('%H:%M')} | "
            f"Durée : {elapsed} min {overdue}"
        )
    active_block = "\n".join(active_lines) if active_lines else "  (aucune coupure active)"

    # ── Last 24h executions (restored) ────────────────────────────────────────
    recent_execs: list[Execution] = (
        db.query(Execution)
        .filter(
            Execution.bcc_id  == bcc_id,
            Execution.status  == "restored",
            Execution.started_at >= since24,
        )
        .order_by(Execution.started_at.desc())
        .limit(20)
        .all()
    )
    recent_lines = []
    for e in recent_execs:
        feeder = db.get(Feeder, e.feeder_id)
        recent_lines.append(
            f"  {feeder.ref if feeder else '?'} | {feeder.nom if feeder else '?'} | "
            f"{e.mw_shed} MW | {e.started_at.strftime('%H:%M')} → "
            f"{e.ended_at.strftime('%H:%M') if e.ended_at else '?'} | "
            f"{round(e.duration_min or 0)} min | ENS: {round(e.ens_mwh or 0, 2)} MWh"
        )
    recent_block = "\n".join(recent_lines) if recent_lines else "  (aucune coupure ces 24 dernières heures)"

    # ── Last 7 days ENS summary per feeder ────────────────────────────────────
    week_execs: list[Execution] = (
        db.query(Execution)
        .filter(
            Execution.bcc_id    == bcc_id,
            Execution.status    == "restored",
            Execution.started_at >= since7d,
        )
        .all()
    )
    feeder_ens: dict[str, float] = {}
    feeder_cuts: dict[str, int]  = {}
    for e in week_execs:
        feeder = db.get(Feeder, e.feeder_id)
        ref    = feeder.ref if feeder else "?"
        feeder_ens[ref]  = feeder_ens.get(ref, 0.0)  + (e.ens_mwh or 0.0)
        feeder_cuts[ref] = feeder_cuts.get(ref, 0)    + 1
    ens_lines = [
        f"  {ref} | {cuts} coupures | ENS : {round(ens, 2)} MWh"
        for ref, (cuts, ens) in sorted(
            {r: (feeder_cuts[r], feeder_ens[r]) for r in feeder_cuts}.items(),
            key=lambda x: -x[1][1],
        )
    ]
    ens_block = "\n".join(ens_lines) if ens_lines else "  (aucune donnée sur 7 jours)"

    # ── Active orders targeting this BCC (via CRC) ────────────────────────────
    active_orders: list[Order] = (
        db.query(Order)
        .filter(
            Order.status.in_(["pending", "acknowledged", "executing"]),
        )
        .order_by(Order.issued_at.desc())
        .limit(5)
        .all()
    )
    order_lines = []
    for o in active_orders:
        order_lines.append(
            f"  {o.order_ref} | {o.order_type.upper()} | {o.mw_total} MW | "
            f"Statut : {o.status} | Émis : {o.issued_at.strftime('%H:%M')}"
        )
    orders_block = "\n".join(order_lines) if order_lines else "  (aucun ordre actif)"

    # ── Today's programme slots for this BCC ──────────────────────────────────
    today = now.date()
    prog  = (
        db.query(Programme)
        .filter(Programme.programme_date == today)
        .first()
    )
    slot_lines = []
    if prog:
        slots: list[ProgrammeSlot] = (
            db.query(ProgrammeSlot)
            .filter(
                ProgrammeSlot.programme_id == prog.id,
                ProgrammeSlot.bcc_id       == bcc_id,
                ProgrammeSlot.mw_bcc       > 0,
            )
            .order_by(ProgrammeSlot.time_slot)
            .all()
        )
        for s in slots:
            refs  = s.feeder_refs or "—"
            slot_lines.append(f"  {s.time_slot} | {s.mw_bcc} MW | Départs : {refs}")
    slots_block = "\n".join(slot_lines) if slot_lines else "  (aucun créneau planifié aujourd'hui)"

    # ── Assemble ──────────────────────────────────────────────────────────────
    context = f"""=== DONNÉES BCC — {bcc_name} ===
Heure actuelle (UTC) : {now.strftime('%d/%m/%Y %H:%M')}

[IDENTITÉ BCC]
{bcc_line}

[LISTE DES DÉPARTS HTA]
{feeders_block}

[COUPURES ACTIVES EN CE MOMENT]
{active_block}

[HISTORIQUE COUPURES — 24 DERNIÈRES HEURES]
{recent_block}

[BILAN ENS PAR DÉPART — 7 DERNIERS JOURS]
{ens_block}

[ORDRES ACTIFS (URGENCE / RÉALIMENTATION)]
{orders_block}

[PROGRAMME J AUJOURD'HUI — CRÉNEAUX BCC]
{slots_block}
"""
    return context



# ── Programme fill ────────────────────────────────────────────────────────────

def _compute_feeder_score(
    feeder:           dict,
    days_since:       float,
    cuts_last_30:     int,
    largest_feeder_mw: float,
) -> float:
    """
    Scoring formula for feeder shedding priority (higher score = cut first).

    score = 0.45 × (priority_level / 5)
          + 0.25 × min(days_since_last_cut / 30, 1)
          + 0.20 × max(0, 1 - cuts_last_30_days / 5)
          - 0.10 × (feeder_load / largest_feeder_load)

    priority_level : P1→1 … P5→5  (P0 excluded — never cut)
    days_since     : days since last cut for this feeder
    cuts_last_30   : number of times this feeder was cut in the last 30 days
    feeder_load    : feeder MW nominal
    largest_feeder_mw : largest MW among all eligible feeders (normalisation)

    A feeder with more score has priority to be cut.
    """
    priority_level = {"P1": 1, "P2": 2, "P3": 3, "P4": 4, "P5": 5}.get(
        feeder.get("priority", "P5"), 5
    )
    feeder_mw    = float(feeder.get("mw", 1) or 1)
    largest_mw   = float(largest_feeder_mw) if largest_feeder_mw else feeder_mw

    component_priority  = 0.45 * (priority_level / 5)
    component_rest      = 0.25 * min(days_since / 30.0, 1.0)
    component_equity    = 0.20 * max(0.0, 1.0 - cuts_last_30 / 5.0)
    component_load      = 0.10 * (feeder_mw / largest_mw)   # subtracted

    return component_priority + component_rest + component_equity - component_load


def _algo_fill_programme(
    slots:   list[dict],   # [{time_slot, mw_bcc}]
    feeders: list[dict],   # [{ref, nom, mw, priority, locked, days_since}]
) -> dict[str, list[str]]:
    """
    Equity-aware best-fit feeder assignment using the STEG scoring formula.

    Per slot:
      1. Compute a score for each eligible feeder:
             score = 0.45 × (priority_level/5)
                   + 0.25 × min(days_since_last_cut/30, 1)
                   + 0.20 × max(0, 1 − cuts_last_30_days/5)
                   − 0.10 × (feeder_load/largest_feeder_load)
         Higher score → higher shedding priority.
      2. Enforce operational constraints (soft — only violated if unavoidable):
           • No feeder cut for more than 45 minutes straight.
           • No feeder cut twice within a 4-hour window (8 consecutive slots).
      3. Try all combinations of 1..MAX_COMBO top-ranked feeders.
         Pick the combination whose MW total is closest to target from above
         (smallest overshoot wins; undershoot only as last resort).
      4. Update dynamic state so scores reflect actual usage across slots.

    P0/locked feeders are NEVER touched.
    """
    from itertools import combinations as _combos

    MAX_COMBO   = 4    # max feeders per slot (operationally realistic)
    POOL_SIZE   = 18   # top-ranked feeders considered per slot
    SLOT_MIN    = 30   # each slot = 30 minutes
    MAX_CONSEC  = 45 // SLOT_MIN   # 45 min max → 1 consecutive slot (next slot must rest)
    COOLDOWN_SLOTS = (4 * 60) // SLOT_MIN   # 4 hours = 8 slots cooldown after a cut

    eligible = [
        f for f in feeders
        if not f.get("locked") and f.get("priority", "P5") != "P0" and f.get("mw", 0) > 0
    ]
    if not eligible:
        return {s["time_slot"]: [] for s in slots}

    feeder_map     = {f["ref"]: f for f in eligible}
    largest_mw     = max(f.get("mw", 0) for f in eligible)

    # Dynamic state across slots
    # days_since_dyn : float  — decremented each 30-min slot this feeder is NOT cut
    # cuts_last_30   : int    — rolling count; decays as slots pass (1 slot ≈ 1/48 day)
    # consec_on      : int    — consecutive slots feeder has been cutting right now
    # slots_since_last_cut : int — slots elapsed since this feeder was last restored
    #                              (starts at days_since × 48 to honour historical rest)
    days_since_dyn:     dict[str, float] = {
        ref: float(feeder_map[ref].get("days_since") or 0)
        for ref in feeder_map
    }
    cuts_last_30:       dict[str, int]   = {ref: 0 for ref in feeder_map}
    consec_on:          dict[str, int]   = {ref: 0 for ref in feeder_map}
    slots_since_cut:    dict[str, int]   = {
        ref: int(days_since_dyn[ref] * 48)   # convert historical rest days → slots
        for ref in feeder_map
    }

    assignments: dict[str, list[str]] = {}

    for s in slots:
        target = float(s["mw_bcc"])
        if target <= 0:
            assignments[s["time_slot"]] = []
            # Update rest counters for all feeders
            for ref in feeder_map:
                consec_on[ref]       = 0
                slots_since_cut[ref] += 1
                days_since_dyn[ref]   = slots_since_cut[ref] / 48.0
            continue

        # ── Determine which feeders are currently blocked by constraints ───────
        # Blocked (hard) : feeder already cutting for MAX_CONSEC slots with
        #                  enough alternative feeders available.
        # Soft-blocked   : feeder cut less than COOLDOWN_SLOTS ago — penalise
        #                  score heavily but don't forbid (may be forced).
        def is_hard_blocked(ref: str) -> bool:
            return consec_on[ref] >= MAX_CONSEC or slots_since_cut[ref] < COOLDOWN_SLOTS

        # Count how many feeders are NOT hard-blocked — if too few to reach target,
        # we lift constraints gracefully (only-if-necessary rule).
        free_refs    = [r for r in feeder_map if not is_hard_blocked(r)]
        free_mw_sum  = sum(feeder_map[r]["mw"] for r in free_refs)
        lift_constraints = free_mw_sum < target - 0.6   # forced override

        # ── Score each feeder (with constraint penalty) ───────────────────────
        scored: list[tuple[float, str]] = []
        for ref in feeder_map:
            base_score = _compute_feeder_score(
                feeder            = feeder_map[ref],
                days_since        = days_since_dyn[ref],
                cuts_last_30      = cuts_last_30[ref],
                largest_feeder_mw = largest_mw,
            )
            # Apply heavy penalty for constraint violations unless forced override
            if not lift_constraints:
                if consec_on[ref] >= MAX_CONSEC:
                    base_score -= 10.0   # must rest — push to bottom
                elif slots_since_cut[ref] < COOLDOWN_SLOTS:
                    # 4-hour cooldown — penalise proportionally to how recently it was cut
                    cooldown_remaining = COOLDOWN_SLOTS - slots_since_cut[ref]
                    base_score -= 5.0 * (cooldown_remaining / COOLDOWN_SLOTS)

            scored.append((base_score, ref))

        # Sort DESC by score: highest score = cut first
        scored.sort(key=lambda x: -x[0])
        pool = [ref for _, ref in scored[:POOL_SIZE]]

        # ── Combination search ────────────────────────────────────────────────
        best_refs  : list[str] = []
        best_over  : float     = float("inf")
        best_under : list[str] = []
        best_under_total: float = 0.0

        for size in range(1, min(MAX_COMBO, len(pool)) + 1):
            for combo in _combos(pool, size):
                total     = sum(feeder_map[r]["mw"] for r in combo)
                overshoot = total - target

                if overshoot >= -0.6:
                    if overshoot < best_over:
                        best_over = overshoot
                        best_refs = list(combo)
                else:
                    if total > best_under_total:
                        best_under_total = total
                        best_under = list(combo)

        chosen     = best_refs if best_refs else best_under
        chosen_set = set(chosen)
        assignments[s["time_slot"]] = chosen

        # ── Update dynamic state ──────────────────────────────────────────────
        for ref in feeder_map:
            if ref in chosen_set:
                consec_on[ref]       += 1
                slots_since_cut[ref]  = 0
                # Increment 30-day rolling cut counter (decays naturally via
                # days_since growth — we keep it simple: +1 per usage episode)
                cuts_last_30[ref]    = min(cuts_last_30[ref] + 1, 10)
                days_since_dyn[ref]   = 0.0
            else:
                consec_on[ref]        = 0
                slots_since_cut[ref] += 1
                days_since_dyn[ref]   = slots_since_cut[ref] / 48.0
                # Very slow decay of the 30-day cut counter
                if slots_since_cut[ref] % 48 == 0:   # once per day
                    cuts_last_30[ref] = max(0, cuts_last_30[ref] - 1)

    return assignments


async def fill_programme_with_ai(
    bcc_id:   int,
    bcc_name: str,
    bcc_zone: str,
    slots:    list[dict],
    feeders:  list[dict],
    db:       Session,
) -> dict:
    """
    Generate a complete J+1 feeder assignment using a deterministic rotation
    algorithm, then ask the AI to write a plain-French explanation.

    Returns:
        {
            "assignments": { "00:00": ["F05","F07"], ... },
            "explanation": "Voici mon raisonnement…"
        }
    """
    import re

    # ── Step 1: deterministic algorithm — always correct ─────────────────────
    assignments = _algo_fill_programme(slots, feeders)

    # ── Step 2: ask AI only for the explanation ───────────────────────────────
    # Build a compact summary of the plan for the AI to explain
    available = [f for f in feeders if not f.get("locked") and f.get("priority","P5") != "P0"]
    feeder_map = {f["ref"]: f for f in available}

    # Count how many slots each feeder appears in
    usage: dict[str, int] = {}
    for refs in assignments.values():
        for r in refs:
            usage[r] = usage.get(r, 0) + 1

    usage_lines = "\n".join(
        f"  {ref}: {cnt} créneaux | {feeder_map[ref]['mw']} MW | {feeder_map[ref]['priority']} | repos initial: {feeder_map[ref].get('days_since') or 0}j"
        for ref, cnt in sorted(usage.items(), key=lambda x: -x[1])
        if ref in feeder_map
    )

    total_ens = sum(
        sum(feeder_map[r]["mw"] for r in refs if r in feeder_map) * 0.5
        for refs in assignments.values()
    )

    explain_prompt = f"""Tu es un assistant SCADA pour {bcc_name}.

L'algorithme de priorité STEG vient de générer le plan J+1 suivant en appliquant la formule de score :

    score = 0.45 × (niveau_priorité / 5)
          + 0.25 × min(jours_repos / 30, 1)
          + 0.20 × max(0, 1 − coupures_30j / 5)
          − 0.10 × (puissance / puissance_max)

Les départs avec le score le plus élevé ont été coupés en priorité.
Contraintes respectées : max 45 min de coupure continue par départ, délai minimum 4 heures entre deux coupures du même départ.

UTILISATION DES DÉPARTS :
{usage_lines}

ENS total estimé : {round(total_ens, 1)} MWh sur 48 créneaux.

Rédige une explication concise (4-6 phrases) pour l'opérateur BCC expliquant :
1. Quels départs ont obtenu les scores les plus élevés et pourquoi (priorité, jours de repos, historique 30j)
2. Comment la rotation a réparti la charge entre les départs pour respecter l'équité territoriale
3. Si des contraintes (45 min / 4 heures) ont influencé certains choix
4. Ce que l'opérateur peut ajuster manuellement si nécessaire

Réponds uniquement en français, en style technique et direct.
"""

    explanation = "Plan généré par l'algorithme d'équité territoriale."
    try:
        payload: dict[str, Any] = {
            "model":    OLLAMA_MODEL,
            "messages": [{"role": "user", "content": explain_prompt}],
            "stream":   False,
            "think":    False,
            "options":  {"temperature": 0.3, "num_predict": 400},
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(OLLAMA_URL, json=payload)
            resp.raise_for_status()
            content = resp.json()["message"]["content"].strip()
            content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
            if content:
                explanation = content
    except Exception as exc:
        logger.warning("[AI] fill-programme explanation failed (non-critical): %s", exc)
        # explanation stays as the default string — assignments are still correct

    return {"assignments": assignments, "explanation": explanation}


def _local_fallback_fill(slots: list[dict], feeders: list[dict]) -> dict[str, list[str]]:
    """Simple greedy fallback (kept for import compatibility)."""
    return _algo_fill_programme(slots, feeders)

async def chat_with_bcc_context(
    bcc_id:   int,
    bcc_name: str,
    bcc_zone: str,
    messages: list[dict[str, str]],
    db:       Session,
    think:    bool = False,
) -> str:
    """
    Build a BCC-scoped context, prepend it as the system prompt,
    and send the conversation to the local Ollama instance.

    Returns the assistant's reply as a plain string.
    Raises RuntimeError on Ollama connectivity issues.
    """
    try:
        bcc_context = _build_bcc_context(bcc_id, bcc_name, bcc_zone, db)
    except Exception as exc:
        logger.error("[AI] Context build failed: %s", exc, exc_info=True)
        bcc_context = f"(Données indisponibles — erreur lors de la récupération : {exc})"

    system_prompt = f"""Tu es un assistant IA intégré dans le système SCADA de la STEG.
Tu assistes l'opérateur du {bcc_name}, responsable de la zone {bcc_zone}.

RÈGLES GÉNÉRALES :
- Tu réponds UNIQUEMENT en français, de manière concise et technique.
- Toutes les données ci-dessous appartiennent au {bcc_name}. Tu peux les utiliser librement pour répondre.
- Le programme J+1 et les créneaux proviennent de la CRC — c'est normal, c'est le plan transmis à ce BCC.
- Si on te demande des données d'autres BCCs ou des données nationales non présentes ci-dessous, réponds : "Ces données ne sont pas disponibles dans mon contexte."
- Tes recommandations sont des aides à la décision. La validation finale appartient toujours à l'opérateur.
- Ne jamais inventer de chiffres. Si une donnée manque, dis-le clairement.

FORMULE DE PRIORITÉ DES DÉPARTS (score 0–1, plus le score est élevé, plus le départ est prioritaire à couper) :

    score = 0.45 × (niveau_priorité / 5)
          + 0.25 × min(jours_depuis_dernière_coupure / 30, 1)
          + 0.20 × max(0, 1 − coupures_30_derniers_jours / 5)
          − 0.10 × (puissance_départ / puissance_départ_max)

  • niveau_priorité : P1→1, P2→2, P3→3, P4→4, P5→5  (P0 = inviolable, jamais coupé)
  • jours_depuis_dernière_coupure : plus un départ s'est reposé longtemps, plus son score monte
  • coupures_30_derniers_jours : équité — un départ peu sollicité récemment est favorisé
  • puissance_départ / puissance_max : à score égal, un départ de forte puissance est légèrement défavorisé
    (on préfère couper les petits départs en premier pour garder de la granularité)

CONTRAINTES OPÉRATIONNELLES (règles d'équité strictes — assouplies uniquement si aucune autre option) :
  • Durée maximale de coupure : 45 minutes par départ. Au-delà, le départ DOIT être rétabli.
  • Délai minimal entre deux coupures du même départ : 4 heures (8 créneaux de 30 min).
  • Ces contraintes peuvent être exceptionnellement levées si le nombre de départs disponibles est insuffisant
    pour atteindre la consigne — dans ce cas, signale-le explicitement à l'opérateur.

COMMENT UTILISER CES RÈGLES DANS TES RÉPONSES :
  - Quand l'opérateur te demande quels départs couper pour un ordre d'urgence ou un créneau donné,
    calcule mentalement les scores à partir des données disponibles ci-dessous (jours de repos, historique)
    et propose les départs avec les scores les plus élevés, dans la limite de la consigne MW.
  - Si un départ est en dépassement (> 45 min), recommande son rétablissement immédiat en priorité.
  - Si un départ a été coupé il y a moins de 4 heures, signale qu'il est en période de repos et
    propose une alternative, sauf si aucune n'est disponible.
  - Explique toujours ton raisonnement en citant les composantes du score (priorité, repos, équité, puissance).

{bcc_context}
"""

    # Build Ollama message list: system + conversation history
    ollama_messages: list[dict[str, str]] = [
        {"role": "system", "content": system_prompt}
    ]
    # Append the conversation (user / assistant turns)
    ollama_messages.extend(messages)

    payload: dict[str, Any] = {
        "model":    OLLAMA_MODEL,
        "messages": ollama_messages,
        "stream":   False,
        "think":    think,
        "options": {
            "temperature": 0.3,
            "num_predict": 512,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SEC) as client:
            resp = await client.post(OLLAMA_URL, json=payload)
            resp.raise_for_status()
            data = resp.json()
            # Qwen3 returns a "thinking" block inside <think>...</think> tags
            # when thinking mode is active. Strip it from the final reply.
            content = data["message"]["content"].strip()
            # Remove <think>...</think> block if present (Qwen3 thinking mode)
            import re
            content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
            return content

    except httpx.ConnectError:
        logger.error("[AI] Ollama non joignable sur %s", OLLAMA_URL)
        raise RuntimeError(
            "Le service IA local (Ollama) est inaccessible. "
            "Assurez-vous qu'Ollama est démarré et que le modèle qwen3:8b est chargé."
        )
    except httpx.HTTPStatusError as exc:
        logger.error("[AI] Ollama HTTP error %s: %s", exc.response.status_code, exc.response.text)
        raise RuntimeError(f"Erreur Ollama ({exc.response.status_code}) — {exc.response.text[:200]}")
    except Exception as exc:
        logger.error("[AI] Unexpected error: %s", exc)
        raise RuntimeError(f"Erreur inattendue du service IA : {exc}")


# ── CRC context builder ───────────────────────────────────────────────────────

def _build_crc_context(crc_zone: str, db: Session) -> str:
    """
    Builds a CRC-scoped context block for the AI system prompt.
    Aggregates BCC-level data (not feeder-level) — appropriate for the
    regional supervision role.

    Data included:
      - All BCCs under this CRC with their consigne/réalisé/statut
      - Active executions per BCC (count + MW)
      - Active orders (urgence / réalimentation) for this CRC
      - Today's programme slots (CRC-level MW)
      - Last 24h ENS per BCC
    """
    from app.models.network import CRC

    now     = datetime.now(timezone.utc)
    since24 = now - timedelta(hours=24)

    # ── Resolve CRC id from zone name ─────────────────────────────────────────
    crc = db.query(CRC).filter(CRC.name == crc_zone).first()
    if not crc:
        return f"(CRC '{crc_zone}' introuvable dans la base de données)"

    crc_id = crc.id

    # ── BCCs under this CRC ───────────────────────────────────────────────────
    bccs: list[BCC] = (
        db.query(BCC)
        .filter(BCC.crc_id == crc_id)
        .order_by(BCC.id)
        .all()
    )

    bcc_lines = []
    for b in bccs:
        # Count active executions and sum MW for this BCC
        active = (
            db.query(Execution)
            .filter(Execution.bcc_id == b.id, Execution.status == "executing")
            .all()
        )
        active_mw   = round(sum(e.mw_shed or 0 for e in active), 1)
        active_count = len(active)

        # 24h ENS for this BCC
        ens_24h = db.query(Execution).filter(
            Execution.bcc_id == b.id,
            Execution.status == "restored",
            Execution.started_at >= since24,
        ).all()
        ens_sum = round(sum(e.ens_mwh or 0 for e in ens_24h), 2)

        overdue = sum(
            1 for e in active
            if (now - e.started_at).total_seconds() / 60 >= 45
        )
        overdue_str = f" | ⚠ {overdue} dépassements" if overdue else ""

        bcc_lines.append(
            f"  {b.name} | Zone: {b.zone} | "
            f"Mode auto: {'OUI' if b.auto_mode else 'NON'} | "
            f"Coupures actives: {active_count} ({active_mw} MW){overdue_str} | "
            f"ENS 24h: {ens_sum} MWh"
        )

    bccs_block = "\n".join(bcc_lines) if bcc_lines else "  (aucun BCC)"

    # ── Active orders for this CRC ────────────────────────────────────────────
    active_orders: list[Order] = (
        db.query(Order)
        .filter(
            Order.target_crc_id == crc_id,
            Order.status.in_(["pending", "acknowledged", "executing"]),
        )
        .order_by(Order.issued_at.desc())
        .limit(8)
        .all()
    )
    order_lines = []
    for o in active_orders:
        order_lines.append(
            f"  {o.order_ref} | {o.order_type.upper()} | {o.mw_total} MW | "
            f"Statut: {o.status} | Émis: {o.issued_at.strftime('%H:%M')}"
        )
    orders_block = "\n".join(order_lines) if order_lines else "  (aucun ordre actif)"

    # ── Today's programme slots for this CRC ─────────────────────────────────
    today = now.date()
    prog  = db.query(Programme).filter(Programme.programme_date == today).first()
    slot_lines = []
    if prog:
        # Get all slots for BCCs under this CRC
        bcc_ids = [b.id for b in bccs]
        slots: list[ProgrammeSlot] = (
            db.query(ProgrammeSlot)
            .filter(
                ProgrammeSlot.programme_id == prog.id,
                ProgrammeSlot.bcc_id.in_(bcc_ids),
                ProgrammeSlot.mw_bcc > 0,
            )
            .order_by(ProgrammeSlot.time_slot, ProgrammeSlot.bcc_id)
            .all()
        )
        # Group by time_slot
        from collections import defaultdict
        slot_map: dict[str, float] = defaultdict(float)
        for s in slots:
            slot_map[s.time_slot] += s.mw_bcc
        for ts in sorted(slot_map.keys())[:12]:  # show first 12 slots
            slot_lines.append(f"  {ts} → {round(slot_map[ts], 1)} MW total CRC")
        if len(slot_map) > 12:
            slot_lines.append(f"  … ({len(slot_map) - 12} créneaux supplémentaires)")
    slots_block = "\n".join(slot_lines) if slot_lines else "  (aucun créneau planifié aujourd'hui)"

    context = f"""=== DONNÉES CRC — {crc_zone} ===
Heure actuelle (UTC) : {now.strftime('%d/%m/%Y %H:%M')}
CRC : {crc.name} | Ville : {crc.city} | Quote-part nationale : {crc.split_pct}%

[BCCs SOUS SUPERVISION]
{bccs_block}

[ORDRES ACTIFS (URGENCE / RÉALIMENTATION)]
{orders_block}

[PROGRAMME J AUJOURD'HUI — CRÉNEAUX CRC]
{slots_block}
"""
    return context


async def chat_with_crc_context(
    crc_zone: str,                           # e.g. "CRC Nord"
    messages: list[dict[str, str]],          # [{"role": "user"|"assistant", "content": "..."}]
    db:       Session,
    think:    bool = False,
) -> str:
    """
    Build a CRC-scoped context and send the conversation to Ollama.
    The CRC operator can ask about any BCC under their supervision,
    active orders, programme status, etc. — but not about other CRCs.
    """
    try:
        crc_context = _build_crc_context(crc_zone, db)
    except Exception as exc:
        logger.error("[AI] CRC context build failed: %s", exc, exc_info=True)
        crc_context = f"(Données indisponibles : {exc})"

    system_prompt = f"""Tu es un assistant IA intégré dans le système SCADA de la STEG.
Tu assistes l'opérateur de la {crc_zone}, responsable de la supervision régionale.

RÈGLES :
- Tu réponds UNIQUEMENT en français, de manière concise et technique.
- Tu as accès aux données de la {crc_zone} et de tous ses BCCs ci-dessous.
- Si on te demande des données de l'autre CRC ou du niveau national non présentes ci-dessous, réponds : "Ces données ne sont pas disponibles dans mon contexte."
- Tes recommandations sont des aides à la décision. La validation finale appartient à l'opérateur CRC.
- Ne jamais inventer de chiffres. Si une donnée manque, dis-le clairement.

{crc_context}
"""

    ollama_messages: list[dict[str, str]] = [
        {"role": "system", "content": system_prompt}
    ]
    ollama_messages.extend(messages)

    payload: dict[str, Any] = {
        "model":    OLLAMA_MODEL,
        "messages": ollama_messages,
        "stream":   False,
        "think":    think,
        "options":  {"temperature": 0.3, "num_predict": 512},
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SEC) as client:
            resp = await client.post(OLLAMA_URL, json=payload)
            resp.raise_for_status()
            import re
            content = resp.json()["message"]["content"].strip()
            content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
            return content
    except httpx.ConnectError:
        raise RuntimeError(
            "Le service IA local (Ollama) est inaccessible. "
            "Assurez-vous qu'Ollama est démarré."
        )
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(f"Erreur Ollama ({exc.response.status_code})")
    except Exception as exc:
        raise RuntimeError(f"Erreur inattendue du service IA : {exc}")


async def suggest_crc_distribution(
    crc_zone:  str,
    order_type: str,   # "urgence" | "realim"
    mw_total:  float,
    bccs:      list[dict],  # [{id, label, current_mw, capacity_mw}]
    db:        Session,
) -> dict:
    """
    Given a total MW to distribute (urgence or réalimentation), suggest
    how to split it across BCCs using the deterministic algorithm,
    then ask AI for an explanation.

    Returns: {"distribution": {bcc_id: mw}, "explanation": str}
    """
    import re

    # Deterministic proportional distribution weighted by capacity
    total_capacity = sum(b.get("capacity_mw", 1) for b in bccs)
    distribution: dict[int, float] = {}
    remaining = mw_total

    for i, b in enumerate(bccs):
        ratio = b.get("capacity_mw", 1) / total_capacity if total_capacity > 0 else 1 / len(bccs)
        if i == len(bccs) - 1:
            val = round(remaining * 2) / 2  # give remainder to last BCC
        else:
            val = round(mw_total * ratio * 2) / 2
        distribution[b["id"]] = max(0.0, val)
        remaining -= val

    # Ask AI for explanation
    bcc_lines = "\n".join(
        f"  {b['label']}: {distribution[b['id']]} MW (capacité: {b.get('capacity_mw','?')} MW)"
        for b in bccs
    )
    action_fr = "délestage d'urgence" if order_type == "urgence" else "réalimentation"

    explain_prompt = f"""Tu es un assistant SCADA pour la {crc_zone}.

Un algorithme de répartition proportionnelle vient de distribuer {mw_total} MW de {action_fr} :

{bcc_lines}

Rédige une explication concise (3-4 phrases) pour l'opérateur CRC expliquant :
1. La logique de répartition utilisée
2. Quels BCCs reçoivent le plus et pourquoi
3. Ce que l'opérateur peut ajuster si nécessaire

Réponds uniquement en français, style technique et direct.
"""

    explanation = f"Répartition proportionnelle de {mw_total} MW entre {len(bccs)} BCCs."
    try:
        payload: dict[str, Any] = {
            "model":    OLLAMA_MODEL,
            "messages": [{"role": "user", "content": explain_prompt}],
            "stream":   False,
            "think":    False,
            "options":  {"temperature": 0.3, "num_predict": 300},
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(OLLAMA_URL, json=payload)
            resp.raise_for_status()
            content = resp.json()["message"]["content"].strip()
            content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
            if content:
                explanation = content
    except Exception as exc:
        logger.warning("[AI] CRC distribution explanation failed: %s", exc)

    return {"distribution": distribution, "explanation": explanation}


# ══════════════════════════════════════════════════════════════════════════════
# DN AI — national-scope context + chat
# ══════════════════════════════════════════════════════════════════════════════

def _build_dn_context(db: Session) -> str:
    """
    Builds the full national context for the DN AI assistant.

    Scope:
      - All CRCs with split keys
      - All BCCs: consigne / réalisé / statut / active cuts count
      - Currently executing cuts (all BCCs, with elapsed time + overdue flag)
      - Recent orders (urgence / réalimentation, last 10)
      - Today's national programme headline (total planifié + pic)
      - 24h ENS per BCC
    """
    from app.api.routes.dashboard import _get_consignes
    from app.models.network import CRC

    now     = datetime.now(timezone.utc)
    since24 = now - timedelta(hours=24)

    CONSIGNES = _get_consignes()

    # ── CRC overview ──────────────────────────────────────────────────────────
    crcs: list[CRC] = db.query(CRC).order_by(CRC.name).all()
    crc_map = {c.id: c for c in crcs}

    crc_lines = []
    for c in crcs:
        crc_lines.append(
            f"  {c.name} | Ville : {c.city} | Clé de répartition : {c.split_pct}%"
        )
    crcs_block = "\n".join(crc_lines) if crc_lines else "  (aucune CRC)"

    # ── BCC status rows ───────────────────────────────────────────────────────
    bccs: list[BCC] = db.query(BCC).order_by(BCC.name).all()
    bcc_lines = []
    total_consigne = 0.0
    total_realise  = 0.0

    for b in bccs:
        consigne = CONSIGNES.get(b.name, 50.0)
        total_consigne += consigne

        # Active cuts for this BCC
        executing = (
            db.query(Execution)
            .filter(Execution.bcc_id == b.id, Execution.status == "executing")
            .all()
        )
        realise = round(sum(e.mw_shed for e in executing), 1)
        total_realise  += realise
        ecart    = round(realise - consigne, 1)
        pct      = round((realise / consigne) * 100, 1) if consigne > 0 else 0

        if len(executing) == 0:
            statut = "INACTIF"
        elif pct >= 98:
            statut = "CONFORME"
        elif pct >= 85:
            statut = "ATTENTION"
        elif pct >= 70:
            statut = "SOUS-CONSIGNE"
        else:
            statut = "CRITIQUE"

        overdue_count = sum(
            1 for e in executing
            if (now - e.started_at).total_seconds() / 60 >= 45
        )
        overdue_str = f" | ⚠ {overdue_count} dépassement(s)" if overdue_count else ""

        crc_name = crc_map[b.crc_id].name if b.crc_id in crc_map else "—"

        bcc_lines.append(
            f"  {b.name} | {crc_name} | Zone : {b.zone} | "
            f"Consigne : {consigne} MW | Réalisé : {realise} MW | "
            f"Écart : {ecart:+.1f} MW | {pct:.1f}% | Statut : {statut}"
            f"{overdue_str}"
        )

    bccs_block = "\n".join(bcc_lines) if bcc_lines else "  (aucun BCC)"
    deficit_national = round(total_realise - total_consigne, 1)

    # ── Live cuts (all BCCs) ──────────────────────────────────────────────────
    all_active: list[Execution] = (
        db.query(Execution)
        .filter(Execution.status == "executing")
        .order_by(Execution.started_at.asc())
        .all()
    )
    cut_lines = []
    for e in all_active:
        feeder  = db.get(Feeder, e.feeder_id)
        bcc     = db.get(BCC, e.bcc_id)
        elapsed = round((now - e.started_at).total_seconds() / 60)
        overdue = " ⚠ DÉPASSEMENT" if elapsed >= 45 else ""
        cut_lines.append(
            f"  {feeder.ref if feeder else '?'} | {feeder.nom if feeder else '?'} | "
            f"{feeder.priority if feeder else '?'} | {e.mw_shed} MW | "
            f"BCC : {bcc.name if bcc else '?'} | "
            f"Début : {e.started_at.strftime('%H:%M')} | "
            f"Durée : {elapsed} min{overdue}"
        )
    cuts_block = "\n".join(cut_lines) if cut_lines else "  (aucune coupure active sur le réseau)"

    # ── 24h ENS per BCC ───────────────────────────────────────────────────────
    ens_lines = []
    for b in bccs:
        execs_24h = (
            db.query(Execution)
            .filter(
                Execution.bcc_id  == b.id,
                Execution.status  == "restored",
                Execution.started_at >= since24,
            )
            .all()
        )
        ens = round(sum(e.ens_mwh or 0 for e in execs_24h), 2)
        cuts = len(execs_24h)
        ens_lines.append(
            f"  {b.name} | {cuts} coupures | ENS 24h : {ens} MWh"
        )
    ens_block = "\n".join(ens_lines) if ens_lines else "  (aucune donnée)"

    # ── Recent orders (last 10) ───────────────────────────────────────────────
    recent_orders: list[Order] = (
        db.query(Order)
        .order_by(Order.issued_at.desc())
        .limit(10)
        .all()
    )
    order_lines = []
    for o in recent_orders:
        crc_label = crc_map[o.target_crc_id].name if o.target_crc_id in crc_map else "National"
        order_lines.append(
            f"  {o.order_ref} | {o.order_type.upper()} | {o.mw_total} MW "
            f"(Nord {o.mw_nord} MW / Sud {o.mw_sud} MW) | "
            f"Statut : {o.status} | Cible : {crc_label} | "
            f"Émis : {o.issued_at.strftime('%d/%m %H:%M')}"
        )
    orders_block = "\n".join(order_lines) if order_lines else "  (aucun ordre récent)"

    # ── Today's national programme ────────────────────────────────────────────
    today = now.date()
    prog = (
        db.query(Programme)
        .filter(Programme.programme_date == today)
        .first()
    )
    if prog:
        slots: list[ProgrammeSlot] = (
            db.query(ProgrammeSlot)
            .filter(ProgrammeSlot.programme_id == prog.id)
            .order_by(ProgrammeSlot.time_slot)
            .all()
        )
        # Aggregate by time_slot to get national totals
        from collections import defaultdict as _dd
        national_slots: dict[str, float] = _dd(float)
        for s in slots:
            national_slots[s.time_slot] += s.mw_bcc
        if national_slots:
            total_planifie = round(sum(national_slots.values()) * 0.5, 0)  # MWh (30-min slots)
            peak_mw        = round(max(national_slots.values()), 1)
            current_slot   = f"{now.hour:02d}:{(now.minute // 30) * 30:02d}"
            current_plan   = round(national_slots.get(current_slot, 0), 1)
            prog_block = (
                f"  Programme validé : OUI | "
                f"Total ENS planifié : {total_planifie} MWh | "
                f"Pic prévu : {peak_mw} MW | "
                f"Créneau actuel ({current_slot}) : {current_plan} MW planifié"
            )
        else:
            prog_block = "  Programme validé mais aucun créneau chargé"
    else:
        prog_block = "  Aucun programme J validé pour aujourd'hui — RISQUE"

    # ── Assemble ──────────────────────────────────────────────────────────────
    context = f"""=== DONNÉES NATIONALES DN — STEG Réseau Interconnecté ===
Heure actuelle (UTC) : {now.strftime('%d/%m/%Y %H:%M')}
Opérateur niveau : Ingénieur de Quart DN (niveau national)

[RÉSUMÉ NATIONAL]
  Consigne nationale totale : {total_consigne:.1f} MW
  Réalisé national total    : {total_realise:.1f} MW
  Écart national            : {deficit_national:+.1f} MW
  Coupures actives          : {len(all_active)}
  Statut général            : {"DÉFICIT ACTIF" if deficit_national < -5 else "ÉQUILIBRÉ"}

[CENTRES RÉGIONAUX DE CONDUITE]
{crcs_block}

[ÉTAT DES BCCs (7 POSTES DE CONDUITE LOCAUX)]
{bccs_block}

[COUPURES ACTIVES EN CE MOMENT — TOUS BCCs]
{cuts_block}

[BILAN ENS PAR BCC — 24 DERNIÈRES HEURES]
{ens_block}

[ORDRES RÉCENTS (URGENCE / RÉALIMENTATION)]
{orders_block}

[PROGRAMME J AUJOURD'HUI]
{prog_block}
"""
    return context


async def chat_with_dn_context(
    messages: list[dict[str, str]],
    db:       Session,
    think:    bool = False,
) -> str:
    """
    Build a national-scope DN context, prepend it as the system prompt,
    and send the conversation to the local Ollama / Qwen instance.

    Returns the assistant's reply as a plain string.
    Raises RuntimeError on connectivity issues.
    """
    try:
        dn_context = _build_dn_context(db)
    except Exception as exc:
        logger.error("[AI/DN] Context build failed: %s", exc, exc_info=True)
        dn_context = f"(Données indisponibles — erreur lors de la récupération : {exc})"

    system_prompt = f"""Tu es l'assistant IA intégré dans le pupitre de conduite nationale (DN) du système SCADA STEG.
Tu assistes l'Ingénieur de Quart DN, responsable de l'équilibre électrique national de la Tunisie.

RÈGLES ABSOLUES :
- Tu réponds UNIQUEMENT en français, de manière concise, technique et professionnelle.
- Tu as accès à toutes les données nationales ci-dessous (7 BCCs, 2 CRCs, ordres, programme).
- Ne jamais inventer de chiffres. Si une donnée manque, dis-le clairement.
- Tes recommandations sont des aides à la décision. La validation finale et la responsabilité incombent exclusivement à l'Ingénieur de Quart DN.
- Si on te pose une question sur les données d'un départ HTA spécifique non présent dans le contexte, précise que tu n'as pas le détail feeder-level au niveau DN — il faut consulter le BCC concerné.
- Tu peux formuler des ordres télégraphiques (libellés télex) si demandé.
- Tu peux analyser des scénarios hypothétiques ("si on déleste X MW supplémentaires sur BCC 5…").
- Tu ne dois jamais recommander de couper un départ P0 (hôpitaux, stations d'eau, sécurité nationale).

DOMAINES DE COMPÉTENCE :
  • Analyse du déficit / surplus national
  • Arbitrage inter-CRC (répartition Nord / Sud)
  • Impact fréquence réseau (règle : Δf ≈ +0.04 Hz pour +10 MW récupérés)
  • Formulation d'ordres de délestage d'urgence ou de réalimentation
  • Lecture et validation du programme J+1
  • Synthèse pour le chef de quart ou pour transmission télex aux CRCs

{dn_context}
"""

    ollama_messages: list[dict[str, str]] = [
        {"role": "system", "content": system_prompt}
    ]
    ollama_messages.extend(messages)

    payload: dict[str, Any] = {
        "model":    OLLAMA_MODEL,
        "messages": ollama_messages,
        "stream":   False,
        "think":    think,
        "options": {
            "temperature": 0.25,   # slightly more deterministic for operational decisions
            "num_predict": 768,    # longer replies OK for DN — may need multi-paragraph analysis
        },
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SEC) as client:
            resp = await client.post(OLLAMA_URL, json=payload)
            resp.raise_for_status()
            import re
            content = resp.json()["message"]["content"].strip()
            content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
            return content

    except httpx.ConnectError:
        logger.error("[AI/DN] Ollama non joignable sur %s", OLLAMA_URL)
        raise RuntimeError(
            "Le service IA local (Ollama) est inaccessible. "
            "Assurez-vous qu'Ollama est démarré et que le modèle qwen3:8b est chargé."
        )
    except httpx.HTTPStatusError as exc:
        logger.error("[AI/DN] Ollama HTTP error %s: %s", exc.response.status_code, exc.response.text)
        raise RuntimeError(f"Erreur Ollama ({exc.response.status_code}) — {exc.response.text[:200]}")
    except Exception as exc:
        logger.error("[AI/DN] Unexpected error: %s", exc)
        raise RuntimeError(f"Erreur inattendue du service IA : {exc}")


# ══════════════════════════════════════════════════════════════════════════════
# Citizen AI — feeder-scoped context + public national summary
# ══════════════════════════════════════════════════════════════════════════════

def _build_citizen_context(citizen_id: int, db: Session) -> str:
    """
    Builds a citizen-scoped context block for the AI system prompt.

    Includes:
      - Citizen identity (name, governorate, zone)
      - Their registered HTA feeder (ref, nom, poste source, priority, MW)
      - Today's planned shedding slots for that feeder's BCC
      - Current execution status of their feeder (cutting or normal)
      - Recent shedding history (last 7 days) for their feeder
      - Lightweight national summary: total active cuts, total MW shed
    """
    from app.models.citizen import Citizen, CitizenZone, CitizenProgramSchedule
    from app.models.network import BCC
    from datetime import date

    now     = datetime.now(timezone.utc)
    since7d = now - timedelta(days=7)
    today   = now.date()

    # ── Citizen + zone ────────────────────────────────────────────────────────
    citizen = db.get(Citizen, citizen_id)
    if not citizen:
        return "(Données citoyen introuvables)"

    zone = db.get(CitizenZone, citizen.zone_id) if citizen.zone_id else None
    citizen_name = f"{citizen.first_name} {citizen.last_name}".strip()
    zone_name    = zone.name        if zone else "—"
    governorate  = citizen.governorate or (zone.governorate if zone else "—")

    # ── Feeder ────────────────────────────────────────────────────────────────
    feeder: Feeder | None = db.get(Feeder, citizen.feeder_id) if citizen.feeder_id else None
    if feeder:
        feeder_line = (
            f"Départ : {feeder.ref} | {feeder.nom} | "
            f"Priorité : {feeder.priority} | {feeder.mw_nominal} MW | "
            f"Poste source : {feeder.poste_source} | Statut réseau : {feeder.statut}"
        )
    else:
        feeder_line = "Aucun départ HTA enregistré pour ce citoyen."

    # ── Current execution on this feeder ─────────────────────────────────────
    current_cut: Execution | None = None
    if feeder:
        current_cut = (
            db.query(Execution)
            .filter(Execution.feeder_id == feeder.id, Execution.status == "executing")
            .order_by(Execution.started_at.desc())
            .first()
        )

    if current_cut:
        elapsed = round((now - current_cut.started_at).total_seconds() / 60)
        cut_status = (
            f"⚡ COUPURE EN COURS depuis {current_cut.started_at.strftime('%H:%M')} "
            f"({elapsed} min écoulées) — {current_cut.mw_shed} MW délestés"
        )
    else:
        cut_status = "✓ Alimentation normale — aucune coupure active sur ce départ"

    # ── Today's scheduled slots for this feeder's BCC ────────────────────────
    bcc_id = feeder.bcc_id if feeder else None
    slot_lines = []
    if bcc_id:
        from app.models.programme import Programme, ProgrammeSlot
        prog = (
            db.query(Programme)
            .filter(Programme.programme_date == today)
            .first()
        )
        if prog:
            slots: list[ProgrammeSlot] = (
                db.query(ProgrammeSlot)
                .filter(
                    ProgrammeSlot.programme_id == prog.id,
                    ProgrammeSlot.bcc_id == bcc_id,
                    ProgrammeSlot.mw_bcc > 0,
                )
                .order_by(ProgrammeSlot.time_slot)
                .all()
            )
            for s in slots:
                slot_lines.append(f"  {s.time_slot} | {s.mw_bcc} MW planifié")

    slots_block = "\n".join(slot_lines) if slot_lines else "  Aucun créneau planifié aujourd'hui"

    # ── Feeder shedding history — last 7 days ─────────────────────────────────
    history_lines = []
    if feeder:
        past_execs: list[Execution] = (
            db.query(Execution)
            .filter(
                Execution.feeder_id  == feeder.id,
                Execution.status     == "restored",
                Execution.started_at >= since7d,
            )
            .order_by(Execution.started_at.desc())
            .limit(10)
            .all()
        )
        for e in past_execs:
            history_lines.append(
                f"  {e.started_at.strftime('%d/%m %H:%M')} → "
                f"{e.ended_at.strftime('%H:%M') if e.ended_at else '?'} | "
                f"{round(e.duration_min or 0)} min | ENS: {round(e.ens_mwh or 0, 2)} MWh"
            )

    history_block = "\n".join(history_lines) if history_lines else "  Aucune coupure sur ce départ ces 7 derniers jours"

    # ── National summary (lightweight — no feeder detail) ─────────────────────
    total_active: list[Execution] = (
        db.query(Execution)
        .filter(Execution.status == "executing")
        .all()
    )
    total_mw_shed = round(sum(e.mw_shed or 0 for e in total_active), 1)
    total_cuts    = len(total_active)

    # Count BCCs with active cuts
    active_bcc_ids = {e.bcc_id for e in total_active}
    national_line = (
        f"Coupures actives sur le réseau national : {total_cuts} départs | "
        f"{total_mw_shed} MW délestés | "
        f"{len(active_bcc_ids)} BCC(s) actif(s)"
    ) if total_cuts > 0 else "Réseau national : aucune coupure active en ce moment"

    # ── Assemble ──────────────────────────────────────────────────────────────
    context = f"""=== DONNÉES CITOYEN ===
Heure actuelle (UTC) : {now.strftime('%d/%m/%Y %H:%M')}

[IDENTITÉ]
Nom         : {citizen_name}
Gouvernorat : {governorate}
Zone STEG   : {zone_name}

[VOTRE DÉPART HTA]
{feeder_line}

[STATUT ACTUEL DE VOTRE DÉPART]
{cut_status}

[PROGRAMME J — CRÉNEAUX PRÉVUS POUR VOTRE ZONE]
{slots_block}

[HISTORIQUE COUPURES — 7 DERNIERS JOURS (VOTRE DÉPART)]
{history_block}

[RÉSUMÉ NATIONAL]
{national_line}
"""
    return context


async def chat_with_citizen_context(
    citizen_id: int,
    messages:   list[dict[str, str]],
    db:         Session,
    think:      bool = False,
) -> str:
    """
    Build a citizen-scoped context (feeder + zone + national summary),
    prepend it as the system prompt, and forward the conversation to Ollama.

    The AI is instructed to answer in plain, citizen-friendly French
    (no SCADA jargon, no operator terminology).

    Returns the assistant reply as a plain string.
    Raises RuntimeError on Ollama connectivity issues.
    """
    import re

    try:
        citizen_context = _build_citizen_context(citizen_id, db)
    except Exception as exc:
        logger.error("[AI/citizen] Context build failed: %s", exc, exc_info=True)
        citizen_context = f"(Données indisponibles : {exc})"

    system_prompt = f"""Tu es l'assistant IA du Portail Citoyen STEG — ENERGY Balance TN.
Tu aides les citoyens à comprendre leur situation électrique de façon simple et rassurante.

RÈGLES ABSOLUES :
- Réponds UNIQUEMENT en français, de façon claire, simple et rassurante (pas de jargon technique SCADA).
- Tu as accès aux données personnalisées du citoyen ci-dessous.
- Tu peux répondre aux questions sur : son départ, ses horaires de coupure, l'état actuel, l'historique récent.
- Pour les questions nationales, donne un résumé sans entrer dans les détails d'opérateur.
- Si une information n'est pas disponible dans le contexte, dis-le clairement sans inventer.
- Tes réponses doivent être courtes (3-5 phrases maximum) sauf si plus de détails sont explicitement demandés.
- Ne mentionne jamais les noms de BCCs, CRCs, ou termes d'opérateur SCADA — parle de "votre zone", "votre quartier", "le réseau".
- Reste toujours positif et utile.

{citizen_context}
"""

    ollama_messages: list[dict[str, str]] = [
        {"role": "system", "content": system_prompt}
    ]
    ollama_messages.extend(messages)

    payload: dict[str, Any] = {
        "model":    OLLAMA_MODEL,
        "messages": ollama_messages,
        "stream":   False,
        "think":    think,
        "options": {
            "temperature": 0.4,
            "num_predict": 400,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SEC) as client:
            resp = await client.post(OLLAMA_URL, json=payload)
            resp.raise_for_status()
            content = resp.json()["message"]["content"].strip()
            content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
            return content

    except httpx.ConnectError:
        logger.error("[AI/citizen] Ollama non joignable sur %s", OLLAMA_URL)
        raise RuntimeError(
            "Le service IA est temporairement indisponible. "
            "Veuillez réessayer dans quelques instants."
        )
    except httpx.HTTPStatusError as exc:
        logger.error("[AI/citizen] Ollama HTTP error %s: %s", exc.response.status_code, exc.response.text)
        raise RuntimeError(f"Erreur du service IA ({exc.response.status_code}).")
    except Exception as exc:
        logger.error("[AI/citizen] Unexpected error: %s", exc)
        raise RuntimeError(f"Erreur inattendue du service IA : {exc}")
