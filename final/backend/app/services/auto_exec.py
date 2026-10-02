"""
Auto-Execution Scheduler
========================
Fires every 30 minutes aligned to the clock (00:00, 00:30, 01:00, …).
For each BCC that has auto_mode=True it reads the current J+1 slot,
applies the conflict ruleset, and creates/restores Execution records.

Ruleset:
  R1  j1 feeder already executing → close old record, open new one (ENS per slot).
  R2  Manual/urgence feeder running + planned slot starts → execute planned feeders
      not already cutting. Manual feeder stays running. Its MW is NOT counted toward
      the planned obligation — deficit is reported if the plan MW isn't covered by
      auto-exec feeders alone.
  R3/R4  Bad plan / cooldown feeder in plan → execute as planned, no substitution.
  R5  Feeder is P0 → hard block, skip entire slot. DN sees deficit on dashboard.
  R6  Feeder planned across consecutive slots → close old record per slot boundary,
      open new one (ENS tracked per slot). Cut is never interrupted.
  R7  Slot MW = 0 → restore only j1 feeders. Manual/urgence feeders stay running.
  R8  No validated plan / feeder_refs empty → same as R7 (treat as 0 MW).
  R9  P0 block → do nothing at all for that slot. DN notices deficit within 30s.
  R10 Scheduler fires > 2 min late → skip slot, broadcast slot_manqué to DN/CRC/BCC.
"""
import asyncio
import logging
from datetime import date, datetime, timezone, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.execution import Execution
from app.models.network import BCC, Feeder
from app.models.programme import Programme, ProgrammeSlot
from app.models.user import User
from app.services.websocket import manager

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
LATE_TOLERANCE_MIN = 2      # skip slot if we're more than 2 min late
SLOT_DURATION_MIN  = 30     # each slot is 30 minutes


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _slot_for_now(now: datetime) -> str:
    """Return the HH:MM slot label for the current time (floored to 30-min boundary).
    Uses Tunis local time (UTC+1) since slot labels are in local time."""
    local = now.astimezone(timezone(timedelta(hours=1)))
    h = local.hour
    m = 0 if local.minute < 30 else 30
    return f"{h:02d}:{m:02d}"


def _slot_start_utc(slot_label: str, ref_date: date) -> datetime:
    """Convert a slot label like '18:00' and a date into a UTC-aware datetime."""
    h, m = map(int, slot_label.split(":"))
    # The backend runs at UTC+1 (Tunisia time = UTC+1 year-round, no DST).
    # Slot labels are in local time, so subtract 1h to get UTC.
    local_dt = datetime(ref_date.year, ref_date.month, ref_date.day, h, m,
                        tzinfo=timezone(timedelta(hours=1)))
    return local_dt.astimezone(timezone.utc)


def _minutes_late(slot_label: str, ref_date: date, now: datetime) -> float:
    """How many minutes after the slot start are we firing?"""
    slot_start = _slot_start_utc(slot_label, ref_date)
    delta = now - slot_start
    return delta.total_seconds() / 60


def _get_system_operator(db: Session, bcc_id: int) -> User | None:
    """
    Find the operator to record auto-executions under.
    Prefer the first active BCC operator; fall back to any active DN user.
    The 'operator' here is just for audit trail — the trigger='j1' marks it automated.
    """
    op = (
        db.query(User)
        .filter(User.bcc_id == bcc_id, User.is_active == True)
        .first()
    )
    if op:
        return op
    return db.query(User).filter(User.role == "DN", User.is_active == True).first()


def _get_slot_feeder_refs(slot: ProgrammeSlot) -> list[str]:
    """Parse comma-separated feeder_refs from the slot row."""
    if not slot or not slot.feeder_refs:
        return []
    return [r.strip() for r in slot.feeder_refs.split(",") if r.strip()]


def _get_executing_for_bcc(db: Session, bcc_id: int) -> dict[int, Execution]:
    """Return {feeder_id: Execution} for all currently executing cuts in this BCC."""
    rows = (
        db.query(Execution)
        .filter(Execution.bcc_id == bcc_id, Execution.status == "executing")
        .all()
    )
    return {e.feeder_id: e for e in rows}


def _close_execution(db: Session, exec_row: Execution, now: datetime, notes: str = "") -> None:
    """Restore an execution record (compute duration + ENS)."""
    exec_row.ended_at     = now
    exec_row.duration_min = (now - exec_row.started_at).total_seconds() / 60
    exec_row.ens_mwh      = exec_row.mw_shed * exec_row.duration_min / 60
    exec_row.status       = "restored"
    if notes:
        exec_row.notes = notes


def _open_execution(
    db: Session
    ,feeder: Feeder
    ,operator_id: int
    ,now: datetime
    ,slot_label: str
    ,programme_id: int | None
) -> Execution:
    """Create a new executing record for a feeder."""
    exec_row = Execution(
        feeder_id   = feeder.id
        ,bcc_id     = feeder.bcc_id
        ,operator_id= operator_id
        ,mw_shed    = feeder.mw_nominal
        ,trigger    = "j1"
        ,status     = "executing"
        ,notes      = f"Auto-exec slot {slot_label} — programme_id={programme_id}"
    )
    db.add(exec_row)
    return exec_row


# ── Citizen portal write-through (mirrors executions route) ──────────────────

def _citizen_writethrough(db: Session, bcc_id: int, exec_row: Execution) -> None:
    """Update CitizenZone + CitizenProgramSchedule when a new cut starts."""
    try:
        from app.models.citizen import CitizenProgramSchedule, CitizenZone
        from decimal import Decimal

        zones = db.query(CitizenZone).filter(CitizenZone.bcc_id == bcc_id).all()
        for z in zones:
            z.electricity_status = "Scheduled Outage"

        today    = date.today()
        start    = exec_row.started_at.astimezone(timezone.utc)
        end_dt   = start + timedelta(minutes=45)

        for zone in zones:
            existing = (
                db.query(CitizenProgramSchedule)
                .filter(
                    CitizenProgramSchedule.zone_id        == zone.id
                    ,CitizenProgramSchedule.scheduled_date == today
                    ,CitizenProgramSchedule.status.in_(["active", "planned"])
                )
                .first()
            )
            if existing:
                existing.status = "active"
            else:
                db.add(CitizenProgramSchedule(
                    zone_id          = zone.id
                    ,execution_id    = exec_row.id
                    ,scheduled_date  = today
                    ,start_time      = start.time()
                    ,end_time        = end_dt.time()
                    ,duration_minutes= 45
                    ,target_mw       = Decimal(str(round(exec_row.mw_shed, 2)))
                    ,status          = "active"
                    ,reason          = "Délestage automatique — programme J+1"
                ))
    except Exception as exc:
        logger.warning("[auto_exec] citizen write-through failed: %s", exc)


def _citizen_restore(db: Session, bcc_id: int, exec_row: Execution) -> None:
    """Update CitizenZone + CitizenProgramSchedule when a cut is restored."""
    try:
        from app.models.citizen import CitizenProgramSchedule, CitizenZone

        zones    = db.query(CitizenZone).filter(CitizenZone.bcc_id == bcc_id).all()
        zone_ids = [z.id for z in zones]
        if not zone_ids:
            return

        schedules = (
            db.query(CitizenProgramSchedule)
            .filter(
                CitizenProgramSchedule.zone_id.in_(zone_ids)
                ,CitizenProgramSchedule.execution_id == exec_row.id
            )
            .all()
        )
        for s in schedules:
            s.status = "executed"

        # Only restore zone if no other active cuts remain for this BCC
        still_active = (
            db.query(Execution)
            .filter(
                Execution.bcc_id == bcc_id
                ,Execution.status == "executing"
                ,Execution.id    != exec_row.id
            )
            .count()
        )
        if still_active == 0:
            for z in zones:
                z.electricity_status = "Power Available"
    except Exception as exc:
        logger.warning("[auto_exec] citizen restore write-through failed: %s", exc)


# ── Core per-BCC slot execution logic ────────────────────────────────────────

async def _process_bcc_slot(
    db: Session
    ,bcc: BCC
    ,slot_label: str
    ,programme_date: date
    ,now: datetime
) -> dict[str, Any]:
    """
    Apply the full ruleset for one BCC / one slot.
    Returns a result dict for WebSocket broadcasting.
    """
    result: dict[str, Any] = {
        "bcc_id":         bcc.id
        ,"bcc_name":      bcc.name
        ,"slot":          slot_label
        ,"programme_date":programme_date.isoformat()
        ,"executed":      []   # feeder refs that got a new execution record
        ,"continued":     []   # feeder refs that were already executing (kept)
        ,"restored":      []   # feeder refs that were restored (slot MW=0 or not in plan)
        ,"blocked_p0":    []   # feeder refs blocked because P0
        ,"skipped_late":  False
        ,"deficit_mw":    0.0
        ,"error":         None
    }

    try:
        # ── Find today's programme ─────────────────────────────────────────
        prog = (
            db.query(Programme)
            .filter(Programme.programme_date == programme_date)
            .first()
        )

        # ── Get the BCC slot for this time ────────────────────────────────
        planned_slot = None
        if prog:
            planned_slot = (
                db.query(ProgrammeSlot)
                .filter(
                    ProgrammeSlot.programme_id == prog.id
                    ,ProgrammeSlot.bcc_id      == bcc.id
                    ,ProgrammeSlot.time_slot   == slot_label
                )
                .first()
            )

        planned_refs = _get_slot_feeder_refs(planned_slot)
        target_mw    = planned_slot.mw_bcc if planned_slot else 0.0

        # R8: no plan OR feeder_refs empty (plan exists but no feeders assigned)
        # → treat as 0 MW regardless of mw_bcc target.
        if not planned_refs:
            planned_refs = []

        # ── Current execution state for this BCC ─────────────────────────
        executing_map = _get_executing_for_bcc(db, bcc.id)  # {feeder_id: Execution}

        # Build ref → feeder map for all BCC feeders
        all_feeders: dict[str, Feeder] = {
            f.ref: f
            for f in db.query(Feeder).filter(Feeder.bcc_id == bcc.id).all()
        }
        feeder_id_to_ref: dict[int, str] = {f.id: f.ref for f in all_feeders.values()}

        # R7/R8: slot MW = 0 or no plan → restore only auto-exec feeders.
        # Manually shedded feeders (trigger != 'j1') are left untouched.
        if not planned_refs:
            for fid, exec_row in list(executing_map.items()):
                if exec_row.trigger != "j1":
                    # Manual or urgence cut — leave it running, operator controls it
                    ref = feeder_id_to_ref.get(fid, f"id={fid}")
                    logger.debug(
                        "[auto_exec] BCC %d slot %s: skipping restore of %s (trigger=%s, manual)",
                        bcc.id, slot_label, ref, exec_row.trigger
                    )
                    continue
                _close_execution(db, exec_row, now, notes="Auto-restore: slot MW=0 ou non planifié")
                _citizen_restore(db, bcc.id, exec_row)
                ref = feeder_id_to_ref.get(fid, f"id={fid}")
                result["restored"].append(ref)
            db.commit()

            # Broadcast restoration
            if result["restored"]:
                await manager.broadcast_to_bcc({
                    "event":    "auto_exec_slot"
                    ,"bcc_id":  bcc.id
                    ,"slot":    slot_label
                    ,"action":  "restored"
                    ,"feeders": result["restored"]
                }, bcc.id)
                await manager.broadcast_to_role({
                    "event":    "auto_exec_slot"
                    ,"bcc_id":  bcc.id
                    ,"bcc_name":bcc.name
                    ,"slot":    slot_label
                    ,"action":  "restored"
                    ,"feeders": result["restored"]
                }, "DN", "CRC")
            return result

        # ── R5/R9: check for P0 feeders in plan — hard block entire slot ──
        for ref in planned_refs:
            f = all_feeders.get(ref)
            if f and f.priority == "P0":
                result["blocked_p0"].append(ref)

        if result["blocked_p0"]:
            result["deficit_mw"] = target_mw
            result["error"] = (
                f"Slot {slot_label} bloqué — départ(s) P0 dans le plan : "
                f"{', '.join(result['blocked_p0'])}. Intervention manuelle requise."
            )
            # Notify BCC operator and DN without executing anything
            await manager.broadcast_to_bcc({
                "event":       "auto_exec_p0_block"
                ,"bcc_id":     bcc.id
                ,"slot":       slot_label
                ,"blocked":    result["blocked_p0"]
                ,"deficit_mw": result["deficit_mw"]
                ,"message":    result["error"]
            }, bcc.id)
            await manager.broadcast_to_role({
                "event":       "auto_exec_p0_block"
                ,"bcc_id":     bcc.id
                ,"bcc_name":   bcc.name
                ,"slot":       slot_label
                ,"blocked":    result["blocked_p0"]
                ,"deficit_mw": result["deficit_mw"]
                ,"message":    result["error"]
            }, "DN", "CRC")
            return result

        # ── Find the operator for this BCC ────────────────────────────────
        operator = _get_system_operator(db, bcc.id)
        if not operator:
            result["error"] = "Aucun opérateur actif trouvé pour ce BCC"
            logger.error("[auto_exec] BCC %d: no operator found", bcc.id)
            return result

        # ── Restore feeders that were executing but are NOT in this slot's plan.
        # Only auto-exec managed feeders (trigger='j1') are restored automatically.
        # Manually shedded feeders (trigger='manual' or 'urgence') are left running
        # regardless of whether they appear in the plan — the operator controls them.
        executing_refs_now = {feeder_id_to_ref.get(fid): fid
                              for fid in executing_map
                              if feeder_id_to_ref.get(fid) not in planned_refs}

        for ref, fid in executing_refs_now.items():
            if ref is None:
                continue
            exec_row = executing_map[fid]
            if exec_row.trigger != "j1":
                # Manual / urgence cut — do not auto-restore it
                logger.debug(
                    "[auto_exec] BCC %d slot %s: keeping %s (trigger=%s, manual)",
                    bcc.id, slot_label, ref, exec_row.trigger
                )
                continue
            # R6: if this feeder is in the NEXT slot too, let the next tick handle it
            # For now just close this slot's record and the next tick will re-open
            _close_execution(
                db, exec_row, now
                ,notes=f"Auto-slot-close: {slot_label} — not in this slot plan"
            )
            _citizen_restore(db, bcc.id, exec_row)
            result["restored"].append(ref)

        # Refresh executing map after restorations
        db.flush()
        executing_map = _get_executing_for_bcc(db, bcc.id)

        # ── Process planned feeders ───────────────────────────────────────
        # Track which continued refs went through the j1 path (for deficit calc).
        _j1_continued_refs: set[str] = set()

        for ref in planned_refs:
            f = all_feeders.get(ref)
            if not f:
                logger.warning("[auto_exec] BCC %d: feeder ref %s not found in DB", bcc.id, ref)
                continue

            already_exec = executing_map.get(f.id)

            if already_exec:
                if already_exec.trigger != "j1":
                    # R2/manual: feeder already cutting (manual or urgence) and also
                    # in this slot's plan.  Leave the existing record untouched.
                    # Do NOT count it toward actual_mw for the deficit calculation —
                    # it was already running independently; the planned slot's MW
                    # obligation is still unmet for this feeder.
                    result["continued"].append(ref)
                else:
                    # R1/R6: auto-exec feeder already running — close old record,
                    # open new one for this slot for per-slot ENS accounting.
                    _close_execution(
                        db, already_exec, now
                        ,notes=f"Auto-slot-transition → {slot_label}"
                    )
                    db.flush()

                    new_exec = _open_execution(db, f, operator.id, now, slot_label, prog.id if prog else None)
                    db.flush()
                    _citizen_writethrough(db, bcc.id, new_exec)
                    result["continued"].append(ref)
                    _j1_continued_refs.add(ref)   # counts toward planned MW coverage
            else:
                # R3/R4: execute as planned (cooldown ignored, plan overrides)
                new_exec = _open_execution(db, f, operator.id, now, slot_label, prog.id if prog else None)
                db.flush()
                _citizen_writethrough(db, bcc.id, new_exec)
                result["executed"].append(ref)

        db.commit()

        # ── Compute actual MW vs target for deficit reporting (R2) ─────────
        # Only count feeders that auto-exec actually started ('executed') or
        # transitioned slot-to-slot ('continued' via the j1 path).
        # Manual/urgence feeders in 'continued' were running independently and
        # do not satisfy the planned J+1 MW obligation.
        j1_refs = set(result["executed"])   # freshly started by auto-exec this tick

        # Add continued feeders that came through the j1 branch (not manual).
        # After db.flush() + the loop, new j1 records are committed; we can
        # identify them by re-querying or by tracking which refs went through
        # the j1 branch. Track it with a local set during the loop above.
        j1_refs |= _j1_continued_refs

        actual_mw            = sum(all_feeders[r].mw_nominal for r in j1_refs if r in all_feeders)
        result["deficit_mw"] = round(max(0.0, target_mw - actual_mw), 2)

        # ── Broadcast result to BCC and supervisors ───────────────────────
        ws_payload_bcc = {
            "event":     "auto_exec_slot"
            ,"bcc_id":   bcc.id
            ,"slot":     slot_label
            ,"action":   "executed"
            ,"executed": result["executed"]
            ,"continued":result["continued"]
            ,"restored": result["restored"]
            ,"target_mw":target_mw
            ,"actual_mw":actual_mw
            ,"deficit_mw":result["deficit_mw"]
        }
        await manager.broadcast_to_bcc(ws_payload_bcc, bcc.id)
        await manager.broadcast_to_role({
            **ws_payload_bcc
            ,"bcc_name": bcc.name
        }, "DN", "CRC")

        logger.info(
            "[auto_exec] BCC %s slot %s — executed=%s continued=%s restored=%s deficit=%.1f MW",
            bcc.name, slot_label
            ,result["executed"], result["continued"], result["restored"]
            ,result["deficit_mw"]
        )

    except Exception as exc:
        logger.exception("[auto_exec] BCC %d slot %s — unhandled error: %s", bcc.id, slot_label, exc)
        result["error"] = str(exc)
        try:
            db.rollback()
        except Exception:
            pass

    return result


# ── Main scheduler entry point ────────────────────────────────────────────────

async def run_auto_exec_tick() -> None:
    """
    Called every 30 minutes by APScheduler.
    Iterates over all BCCs with auto_mode=True and fires slot execution.
    """
    now          = _now_utc()
    slot_label   = _slot_for_now(now)
    # Use Tunis local date so slots like 23:30 and 00:00 always land on the
    # correct calendar day regardless of server timezone.
    tunis_tz     = timezone(timedelta(hours=1))
    today        = now.astimezone(tunis_tz).date()

    logger.info("[auto_exec] Tick at %s — slot %s", now.isoformat(), slot_label)

    db: Session = SessionLocal()
    try:
        # R10: check if we're too late to execute this slot
        minutes_late = _minutes_late(slot_label, today, now)
        if minutes_late > LATE_TOLERANCE_MIN:
            logger.warning(
                "[auto_exec] Slot %s fired %.1f min late — skipping, broadcasting slot_manqué",
                slot_label, minutes_late
            )
            await manager.broadcast_to_role({
                "event":        "slot_manqué"
                ,"slot":        slot_label
                ,"minutes_late":round(minutes_late, 1)
                ,"message":     (
                    f"Slot {slot_label} : exécution automatique ignorée "
                    f"(déclenchement {round(minutes_late, 1)} min en retard > {LATE_TOLERANCE_MIN} min)"
                )
            }, "DN", "CRC", "BCC")
            return

        # Load all BCCs with auto_mode enabled
        auto_bccs: list[BCC] = (
            db.query(BCC).filter(BCC.auto_mode == True).all()
        )

        if not auto_bccs:
            logger.debug("[auto_exec] No BCCs with auto_mode=True — nothing to do")
            return

        for bcc in auto_bccs:
            await _process_bcc_slot(db, bcc, slot_label, today, now)

    finally:
        db.close()


async def run_auto_exec_tick_forced() -> dict:
    """
    Like run_auto_exec_tick but skips the late-tolerance guard.
    Used by the DN "trigger now" API endpoint to recover missed slots.
    """
    now       = _now_utc()
    tunis_tz  = timezone(timedelta(hours=1))
    today     = now.astimezone(tunis_tz).date()
    slot_label = _slot_for_now(now)

    logger.info("[auto_exec] FORCED tick at %s — slot %s", now.isoformat(), slot_label)

    db: Session = SessionLocal()
    results = []
    try:
        auto_bccs: list[BCC] = db.query(BCC).filter(BCC.auto_mode == True).all()
        for bcc in auto_bccs:
            r = await _process_bcc_slot(db, bcc, slot_label, today, now)
            results.append(r)
    finally:
        db.close()

    return {"slot": slot_label, "bccs_processed": len(results), "results": results}
