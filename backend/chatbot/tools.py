import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from functions import explain_selection, compute_kpi, supabase
from datetime import datetime, timezone


# ---------- helpers ----------

def _parse_ts(value):
    """Turn a database timestamp string into a timezone-aware datetime (UTC).
    The DB stores timestamps WITHOUT timezone, so we attach UTC ourselves.
    Returns None if the value is empty."""
    if value is None:
        return None
    dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _bcc_region_map():
    """Returns {bcc_id: 'nord' or 'sud'} — region lives on the bcc table."""
    rows = supabase.table("bcc").select("id,crc").execute().data
    return {r["id"]: r["crc"] for r in rows}


# ---------- tool 1 ----------

def get_selection_reason(feeder_id: str) -> dict:
    """Admin tool. Why a feeder was selected: priority level, days since
    last cut, load weight, cuts this month."""
    try:
        return explain_selection(feeder_id)
    except Exception as e:
        return {"error": str(e)}


# ---------- tool 2 ----------

def get_kpi(region: str, period_start: str, period_end: str) -> dict:
    """Admin tool. ENS, raw inequality index (0 = fair, higher = less fair),
    and fairness_score (0-1, higher = better) for a region and date range.
    Dates are strings like '2026-09-01'."""
    try:
        start = datetime.strptime(period_start, "%Y-%m-%d")
        end = datetime.strptime(period_end, "%Y-%m-%d")
        result = compute_kpi(region, start, end)
        result["fairness_score"] = round(1 / (1 + result["inequality_index"]), 2)
        return result
    except Exception as e:
        return {"error": str(e)}


# ---------- tool 3 ----------

def list_stale_feeders(days: int, limit: int = 10) -> dict:
    """Admin tool. Feeders not cut in at least `days` days (or never cut),
    most overdue first. Priority-0 feeders are excluded because they are
    never cut by design. Returns only the top `limit` to keep answers short."""
    try:
        now = datetime.now(timezone.utc)
        rows = (supabase.table("feeders")
                .select("id,name,priority_level,last_cut_at")
                .gt("priority_level", 0)
                .execute().data)

        stale = []
        for f in rows:
            last_cut = _parse_ts(f["last_cut_at"])
            if last_cut is None:
                stale.append({"name": f["name"], "id": f["id"],
                              "priority_level": f["priority_level"],
                              "days_since_last_cut": None})
            else:
                delta = (now - last_cut).days
                if delta >= days:
                    stale.append({"name": f["name"], "id": f["id"],
                                  "priority_level": f["priority_level"],
                                  "days_since_last_cut": delta})

        # never-cut first, then the oldest cuts first
        stale.sort(key=lambda x: (x["days_since_last_cut"] is not None,
                                  -(x["days_since_last_cut"] or 0)))
        return {"total_stale": len(stale), "top": stale[:limit]}
    except Exception as e:
        return {"error": str(e)}


# ---------- tool 4 ----------

def compare_regions(period_start: str, period_end: str) -> dict:
    """Admin tool. Side-by-side comparison of CRC Nord vs CRC Sud:
    number of feeders, cuts this month, average cuts per feeder,
    feeders never cut, plus ENS and fairness for the date range."""
    try:
        region_of = _bcc_region_map()
        rows = (supabase.table("feeders")
                .select("bcc_id,total_cuts_month,last_cut_at")
                .gt("priority_level", 0)
                .execute().data)

        stats = {r: {"feeders": 0, "cuts_this_month": 0, "never_cut": 0}
                 for r in ("nord", "sud")}
        for f in rows:
            region = region_of.get(f["bcc_id"])
            if region not in stats:
                continue
            stats[region]["feeders"] += 1
            stats[region]["cuts_this_month"] += f["total_cuts_month"] or 0
            if f["last_cut_at"] is None:
                stats[region]["never_cut"] += 1

        for region, s in stats.items():
            s["avg_cuts_per_feeder"] = (round(s["cuts_this_month"] / s["feeders"], 2)
                                        if s["feeders"] else 0)
            kpi = get_kpi(region, period_start, period_end)
            s["ens_mwh"] = kpi.get("ens_mwh")
            s["fairness_score"] = kpi.get("fairness_score")

        return stats
    except Exception as e:
        return {"error": str(e)}


# ---------- tool 5 (citizen) ----------

def get_zone_schedule(zone_id: str) -> dict:
    """Citizen tool. Current or next power cut for ONE zone.
    IMPORTANT: zone_id must always come from the logged-in citizen's
    account on the server, never from the AI model or the browser.
    Only 'validated' or 'active' cuts are shown; 'planned' cuts are not
    approved by the BCC operator yet, so citizens must not see them."""
    try:
        zone = supabase.table("zones").select("name").eq("id", zone_id).execute().data
        if not zone:
            return {"error": "Unknown zone"}
        zone_name = zone[0]["name"]

        feeder_ids = [f["id"] for f in supabase.table("feeders")
                      .select("id").eq("zone_id", zone_id).execute().data]
        if not feeder_ids:
            return {"zone_name": zone_name, "status": "none"}

        rows = (supabase.table("program_schedule")
                .select("status,time_slot_start,time_slot_end")
                .in_("feeder_id", feeder_ids)
                .in_("status", ["validated", "active"])
                .execute().data)

        now = datetime.now(timezone.utc)
        upcoming = [r for r in rows
                    if _parse_ts(r["time_slot_end"]) and _parse_ts(r["time_slot_end"]) >= now]
        if not upcoming:
            return {"zone_name": zone_name, "status": "none"}

        # a cut happening right now beats a future one
        upcoming.sort(key=lambda r: (r["status"] != "active", _parse_ts(r["time_slot_start"])))
        nxt = upcoming[0]
        return {
            "zone_name": zone_name,
            "status": "active" if nxt["status"] == "active" else "scheduled",
            "start": nxt["time_slot_start"],
            "estimated_end": nxt["time_slot_end"],
        }
    except Exception as e:
        return {"error": str(e)}


# ---------- manual tests ----------

if __name__ == "__main__":
    test_id = input("Paste a real feeder_id to test get_selection_reason: ")
    print(get_selection_reason(test_id))

    print()
    region = input("Region to test get_kpi (nord or sud): ")
    print(get_kpi(region, "2026-01-01", "2026-12-31"))

    print()
    print("Stale feeders (30+ days or never cut), top 5:")
    print(list_stale_feeders(30, limit=5))

    print()
    print("Nord vs Sud:")
    print(compare_regions("2026-01-01", "2026-12-31"))

    print()
    zid = input("Paste a zone_id to test get_zone_schedule: ")
    print(get_zone_schedule(zid))