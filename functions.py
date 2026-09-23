from supabase import create_client
from datetime import datetime, timedelta

url = "http://127.0.0.1:54321"
key = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
supabase = create_client(url, key)


def split_regional_target(national_target_mw, ratio=0.66):
    """
    Splits the national MW target between the 2 regions (nord/sud).
    ratio = the North's share (default 0.66 = 66% North / 34% South).
    """
    nord_mw = round(national_target_mw * ratio, 2)
    sud_mw = round(national_target_mw * (1 - ratio), 2)
    return {"nord_mw": nord_mw, "sud_mw": sud_mw}


def allocate_to_bcc(crc_target_mw, bcc_list):
    """
    Splits a region's MW target across its BCCs,
    proportional to each BCC's avg_load_mw.
    """
    total_load = sum(b["avg_load_mw"] for b in bcc_list)
    bcc_allocations = []
    for b in bcc_list:
        share = b["avg_load_mw"] / total_load
        allocated_mw = round(crc_target_mw * share, 2)
        bcc_allocations.append({
            "bcc_name": b["name"],
            "allocated_mw": allocated_mw
        })
    return bcc_allocations


def build_reason_string(feeder, current_time=None):
    """
    Builds a short, human-readable reason explaining why a feeder was selected.
    Example outputs:
      "Priority 5, never cut before"
      "Priority 3, last cut 12 days ago"
      "Priority 4, last cut 10 hours ago"
    """
    if current_time is None:
        current_time = datetime.now()

    priority = feeder["priority_level"]

    if feeder["last_cut_at"] is None:
        return f"Priority {priority}, never cut before"

    time_since_cut = current_time - feeder["last_cut_at"]
    days_since_cut = time_since_cut.days

    if days_since_cut >= 1:
        return f"Priority {priority}, last cut {days_since_cut} days ago"
    else:
        hours_since_cut = int(time_since_cut.total_seconds() // 3600)
        return f"Priority {priority}, last cut {hours_since_cut} hours ago"


def select_feeders(bcc_target_mw, feeder_list, cooldown_hours=4, current_time=None):
    """
    Selects which feeders to cut to meet a BCC's target MW.

    Rules applied, in order:
    1. Exclude every feeder with priority_level = 0
    2. Skip any feeder still inside its cooldown window
    3. Score each remaining feeder using a weighted fairness formula:
         Score = 0.45*(priority/5) + 0.25*min(days_since_cut/30, 1)
                 + 0.20*max(0, 1 - cuts_this_month/5) - 0.10*(load/max_load)
       -> priority dominates (45%), but rotation (25%) and anti-repetition (20%)
          guarantee no feeder is neglected or overused forever; load protection (10%)
          discourages always hitting the single biggest feeder.
    4. Stop adding feeders once combined avg_load_mw meets/exceeds bcc_target_mw
    5. Attach a 45-minute max duration note to every selected feeder
    6. Attach a human-readable reason string to every selected feeder
    """
    if current_time is None:
        current_time = datetime.now()

    # Rule 1: exclude priority_level = 0 (critical, never-cut feeders)
    eligible = [f for f in feeder_list if f["priority_level"] != 0]

    # Rule 2: skip feeders still inside their cooldown window
    def is_in_cooldown(f):
        if f["last_cut_at"] is None:
            return False
        time_since_cut = current_time - f["last_cut_at"]
        return time_since_cut < timedelta(hours=cooldown_hours)

    eligible = [f for f in eligible if not is_in_cooldown(f)]

    if len(eligible) == 0:
        return []

    # Rule 3: weighted fairness score
    max_load = max(f["avg_load_mw"] for f in eligible)

    def fairness_score(f):
        priority = f["priority_level"]

        if f["last_cut_at"] is None:
            days_since_cut = 30  # never cut = treat as fully "overdue" (caps at the formula's own max)
        else:
            days_since_cut = (current_time - f["last_cut_at"]).days

        cuts_this_month = f.get("total_cuts_month", 0)
        load = f["avg_load_mw"]

        priority_term = 0.45 * (priority / 5)
        rotation_term = 0.25 * min(days_since_cut / 30, 1)
        anti_repetition_term = 0.20 * max(0, 1 - (cuts_this_month / 5))
        load_term = 0.10 * (load / max_load) if max_load > 0 else 0

        return priority_term + rotation_term + anti_repetition_term - load_term

    eligible.sort(key=fairness_score, reverse=True)  # highest score first

    # Rule 4 + 5 + 6: keep adding feeders until target MW is met,
    # tag each with max duration AND a reason string
    proposed_feeders = []
    total_mw = 0
    for f in eligible:
        if total_mw >= bcc_target_mw:
            break
        f_with_note = dict(f)
        f_with_note["max_duration_minutes"] = 45
        f_with_note["reason"] = build_reason_string(f, current_time)
        proposed_feeders.append(f_with_note)
        total_mw += f["avg_load_mw"]

    return proposed_feeders


def estimate_national_deficit(load_forecast, available_resources, constraints=None, time_step_minutes=30):
    """
    Compares expected demand to available supply, per time slot.
    load_forecast and available_resources are lists of numbers (MW),
    one value per time slot — typed in by the DN operator, never predicted here.

    Returns a list of dicts: [{slot_index, time_step_minutes, deficit_mw}, ...]
    A positive deficit_mw means demand exceeds supply (a real problem slot).
    A deficit_mw of 0 or less means supply is sufficient for that slot.
    """
    if len(load_forecast) != len(available_resources):
        raise ValueError("load_forecast and available_resources must have the same number of slots")

    deficit_per_slot = []
    for i in range(len(load_forecast)):
        deficit_mw = round(load_forecast[i] - available_resources[i], 2)
        deficit_per_slot.append({
            "slot_index": i,
            "time_step_minutes": time_step_minutes,
            "deficit_mw": deficit_mw
        })

    return deficit_per_slot


def build_j1_program(deficit_per_slot, date):
    """
    Turns the deficit list into a full day-ahead draft plan (J1 = next day).
    Only slots with a real deficit (demand > supply) need a cut plan.
    Returns a dict: {date, slots_needing_action[], total_national_deficit_mw}
    """
    slots_needing_action = [s for s in deficit_per_slot if s["deficit_mw"] > 0]
    total_deficit = round(sum(s["deficit_mw"] for s in slots_needing_action), 2)

    provisional_schedule = {
        "date": date,
        "slots_needing_action": slots_needing_action,
        "total_national_deficit_mw": total_deficit
    }

    return provisional_schedule


def _compute_ens_and_equity(execution_records):
    """
    Pure calculation — no database calls, so it's easy to test with fake data.
    execution_records: list of dicts, each with zone_id, actual_mw_shed,
    actual_start, actual_end (all real datetime objects).
    """
    total_ens_mwh = 0
    cuts_per_zone = {}

    for r in execution_records:
        duration_hours = (r["actual_end"] - r["actual_start"]).total_seconds() / 3600
        energy_mwh = r["actual_mw_shed"] * duration_hours
        total_ens_mwh += energy_mwh
        cuts_per_zone[r["zone_id"]] = cuts_per_zone.get(r["zone_id"], 0) + 1

    total_ens_mwh = round(total_ens_mwh, 2)

    if len(cuts_per_zone) == 0:
    	inequality_index = 0
    else:
        counts = list(cuts_per_zone.values())
        mean_count = sum(counts) / len(counts)
        variance = sum((c - mean_count) ** 2 for c in counts) / len(counts)
        inequality_index = round(variance ** 0.5, 2)  # standard deviation; 0 = perfectly fair

    return {"ens_mwh": total_ens_mwh, "inequality_index": inequality_index}


def compute_kpi(region, period_start, period_end):
    """
    Computes real KPIs for a region over a period, using execution_log
    (what REALLY happened), never program_schedule (what was only planned).
    region: "nord" or "sud"
    period_start, period_end: datetime objects
    """
    # Step 1: find BCCs in this region
    bccs = supabase.table("bcc").select("id").eq("crc", region).execute()
    bcc_ids = [b["id"] for b in bccs.data]
    if not bcc_ids:
        return {"ens_mwh": 0, "inequality_index": 0}

    # Step 2: find feeders belonging to those BCCs, with their zone
    feeders = supabase.table("feeders").select("id, zone_id").in_("bcc_id", bcc_ids).execute()
    feeder_zone_map = {f["id"]: f["zone_id"] for f in feeders.data}
    feeder_ids = list(feeder_zone_map.keys())
    if not feeder_ids:
        return {"ens_mwh": 0, "inequality_index": 0}

    # Step 3: find scheduled entries linked to those feeders
    schedules = supabase.table("program_schedule").select("id, feeder_id").in_("feeder_id", feeder_ids).execute()
    schedule_feeder_map = {s["id"]: s["feeder_id"] for s in schedules.data}
    schedule_ids = list(schedule_feeder_map.keys())
    if not schedule_ids:
        return {"ens_mwh": 0, "inequality_index": 0}

    # Step 4: find real execution logs for those schedules, within the period
    logs = supabase.table("execution_log").select(
        "schedule_id, actual_start, actual_end, actual_mw_shed"
    ).in_("schedule_id", schedule_ids)\
     .gte("actual_start", period_start.isoformat())\
     .lte("actual_start", period_end.isoformat())\
     .execute()

    # Step 5: enrich each log with its zone_id, so we can measure fairness
    enriched_records = []
    for log in logs.data:
        feeder_id = schedule_feeder_map.get(log["schedule_id"])
        zone_id = feeder_zone_map.get(feeder_id)
        enriched_records.append({
            "zone_id": zone_id,
            "actual_mw_shed": log["actual_mw_shed"],
            "actual_start": datetime.fromisoformat(log["actual_start"]),
            "actual_end": datetime.fromisoformat(log["actual_end"]),
        })

    return _compute_ens_and_equity(enriched_records)


def explain_selection(feeder_id, current_time=None):
    """
    A queryable (structured) version of the reason string from select_feeders().
    Instead of a sentence, returns separate fields the chatbot/UI can use directly.
    Includes cuts_this_month, so it fully matches the real fairness formula
    used by select_feeders() (priority + rotation + anti-repetition + load).
    """
    if current_time is None:
        current_time = datetime.now()

    # Fetch the feeder itself
    feeder_response = supabase.table("feeders").select(
        "id, priority_level, avg_load_mw, last_cut_at, bcc_id, total_cuts_month"
    ).eq("id", feeder_id).execute()

    if len(feeder_response.data) == 0:
        raise ValueError(f"No feeder found with id: {feeder_id}")

    feeder = feeder_response.data[0]

    # days_since_last_cut
    if feeder["last_cut_at"] is None:
        days_since_last_cut = None  # "never cut" — no number makes sense here
    else:
        last_cut = datetime.fromisoformat(feeder["last_cut_at"])
        days_since_last_cut = (current_time - last_cut).days

    # load_weight: this feeder's share of its BCC's total feeder load
    bcc_feeders = supabase.table("feeders").select("avg_load_mw").eq("bcc_id", feeder["bcc_id"]).execute()
    total_bcc_load = sum(f["avg_load_mw"] for f in bcc_feeders.data)
    load_weight = round(feeder["avg_load_mw"] / total_bcc_load, 3) if total_bcc_load > 0 else 0

    return {
        "priority_level": feeder["priority_level"],
        "days_since_last_cut": days_since_last_cut,
        "load_weight": load_weight,
        "cuts_this_month": feeder.get("total_cuts_month", 0)
    }


# ============================================================
# TEST SCENARIOS — run this file directly to execute all tests
# ============================================================
if __name__ == "__main__":

    # ---------- split_regional_target() tests ----------
    print("=== split_regional_target() ===")
    result1 = split_regional_target(500)
    print("Scenario 1 (default ratio):", result1)

    result2 = split_regional_target(500, ratio=0.5)
    print("Scenario 2 (50/50 ratio):", result2)

    result3 = split_regional_target(10)
    print("Scenario 3 (small target):", result3)

    # ---------- allocate_to_bcc() tests ----------
    print("\n=== allocate_to_bcc() ===")
    nord_bccs = supabase.table("bcc").select("name, avg_load_mw").eq("crc", "nord").execute()
    allocation_result = allocate_to_bcc(330, nord_bccs.data)
    print("Scenario 1 (North, real data):", allocation_result)

    sud_bccs = supabase.table("bcc").select("name, avg_load_mw").eq("crc", "sud").execute()
    allocation_result2 = allocate_to_bcc(170, sud_bccs.data)
    print("Scenario 2 (South, real data):", allocation_result2)

    equal_bccs = [
        {"name": "Fake_BCC_A", "avg_load_mw": 50},
        {"name": "Fake_BCC_B", "avg_load_mw": 50},
        {"name": "Fake_BCC_C", "avg_load_mw": 50},
    ]
    allocation_result3 = allocate_to_bcc(300, equal_bccs)
    print("Scenario 3 (equal loads, fake data):", allocation_result3)

    # ---------- select_feeders() tests ----------
    print("\n=== select_feeders() ===")
    now = datetime.now()

    fake_feeders_a = [
        {"name": "F1", "priority_level": 5, "avg_load_mw": 5, "last_cut_at": now - timedelta(hours=1), "total_cuts_month": 2},   # in cooldown
        {"name": "F2", "priority_level": 5, "avg_load_mw": 4, "last_cut_at": None, "total_cuts_month": 0},                        # eligible
        {"name": "F3", "priority_level": 4, "avg_load_mw": 6, "last_cut_at": now - timedelta(hours=10), "total_cuts_month": 1},  # eligible
        {"name": "F4", "priority_level": 0, "avg_load_mw": 10, "last_cut_at": None, "total_cuts_month": 0},                       # excluded
    ]
    result_a = select_feeders(8, fake_feeders_a, cooldown_hours=4, current_time=now)
    print("Scenario 1 (cooldown + priority-0 mix):")
    for f in result_a:
        print(" ", f["name"], "| reason:", f["reason"])

    fake_feeders_b = [
        {"name": "G1", "priority_level": 3, "avg_load_mw": 5, "last_cut_at": now - timedelta(minutes=30), "total_cuts_month": 3},
        {"name": "G2", "priority_level": 4, "avg_load_mw": 5, "last_cut_at": now - timedelta(hours=2), "total_cuts_month": 2},
    ]
    result_b = select_feeders(10, fake_feeders_b, cooldown_hours=4, current_time=now)
    print("Scenario 2 (all in cooldown, expect empty list):", result_b)

    real_feeders = supabase.table("feeders").select("name, priority_level, avg_load_mw, last_cut_at, total_cuts_month").limit(10).execute()
    result_c = select_feeders(15, real_feeders.data, cooldown_hours=4, current_time=now)
    print("Scenario 3 (real database feeders):")
    for f in result_c:
        print(" ", f["name"], "| priority:", f["priority_level"], "| load:", f["avg_load_mw"], "| reason:", f["reason"])

    # ---------- select_feeders() fairness formula proof ----------
    print("\n=== select_feeders() fairness formula proof ===")
    fairness_test_feeders = [
        {"name": "HighPrio_RecentlyCut", "priority_level": 5, "avg_load_mw": 5, "last_cut_at": now - timedelta(days=2), "total_cuts_month": 8},
        {"name": "LowPrio_NeverCut", "priority_level": 2, "avg_load_mw": 5, "last_cut_at": None, "total_cuts_month": 0},
    ]
    result_fairness = select_feeders(5, fairness_test_feeders, cooldown_hours=4, current_time=now)
    print("Winner (should be LowPrio_NeverCut, despite lower priority):")
    for f in result_fairness:
        print(" ", f["name"], "| reason:", f["reason"])

    # ---------- estimate_national_deficit() + build_j1_program() tests ----------
    print("\n=== estimate_national_deficit() + build_j1_program() ===")

    load_forecast_1 = [3000, 3200, 4500, 4800, 4000, 3100]
    available_1     = [3000, 3000, 4000, 4200, 4000, 3500]
    deficits_1 = estimate_national_deficit(load_forecast_1, available_1, time_step_minutes=240)
    print("Scenario 1 deficits:", deficits_1)

    program_1 = build_j1_program(deficits_1, date="2026-09-21")
    print("Scenario 1 program:", program_1)

    load_forecast_2 = [3000, 3000, 3000]
    available_2     = [3000, 3000, 3000]
    deficits_2 = estimate_national_deficit(load_forecast_2, available_2)
    program_2 = build_j1_program(deficits_2, date="2026-09-22")
    print("Scenario 2 (no deficit anywhere):", program_2)

    try:
        estimate_national_deficit([100, 200], [100])
    except ValueError as e:
        print("Scenario 3 (expected error):", e)

    # ---------- FULL CHAIN END-TO-END TEST ----------
    print("\n=== FULL CHAIN: national target -> regions -> BCCs -> feeders ===")

    national_target = 500

    regional_split = split_regional_target(national_target)
    print("Step 1 - Regional split:", regional_split)

    for region in ["nord", "sud"]:
        region_target = regional_split[f"{region}_mw"]
        region_bccs = supabase.table("bcc").select("id, name, avg_load_mw").eq("crc", region).execute()
        bcc_allocations = allocate_to_bcc(region_target, region_bccs.data)

        print(f"\nStep 2 - {region.upper()} BCC allocations (target {region_target} MW):")
        for alloc in bcc_allocations:
            print(" ", alloc)

        for bcc, alloc in zip(region_bccs.data, bcc_allocations):
            bcc_feeders = supabase.table("feeders").select(
                "name, priority_level, avg_load_mw, last_cut_at, total_cuts_month"
            ).eq("bcc_id", bcc["id"]).execute()

            selected = select_feeders(alloc["allocated_mw"], bcc_feeders.data)

            print(f"\nStep 3 - Feeders selected for {bcc['name']} (target {alloc['allocated_mw']} MW):")
            if len(selected) == 0:
                print("   No feeders selected (none eligible or none needed)")
            for f in selected:
                print("  ", f["name"], "| load:", f["avg_load_mw"], "| reason:", f["reason"])

    # ---------- compute_kpi() tests ----------
    print("\n=== compute_kpi() ===")

    kpi_real = compute_kpi("nord", datetime(2026, 1, 1), datetime(2026, 12, 31))
    print("Scenario 1 (real DB, no execution data yet):", kpi_real)

    fake_records_unfair = [
        {"zone_id": "zoneA", "actual_mw_shed": 5, "actual_start": now, "actual_end": now + timedelta(minutes=45)},
        {"zone_id": "zoneA", "actual_mw_shed": 4, "actual_start": now, "actual_end": now + timedelta(minutes=30)},
        {"zone_id": "zoneA", "actual_mw_shed": 3, "actual_start": now, "actual_end": now + timedelta(minutes=20)},
        {"zone_id": "zoneB", "actual_mw_shed": 6, "actual_start": now, "actual_end": now + timedelta(minutes=45)},
    ]
    kpi_unfair = _compute_ens_and_equity(fake_records_unfair)
    print("Scenario 2 (unfair: zoneA cut 3x, zoneB cut 1x):", kpi_unfair)

    fake_records_fair = [
        {"zone_id": "zoneA", "actual_mw_shed": 5, "actual_start": now, "actual_end": now + timedelta(minutes=45)},
        {"zone_id": "zoneB", "actual_mw_shed": 5, "actual_start": now, "actual_end": now + timedelta(minutes=45)},
        {"zone_id": "zoneC", "actual_mw_shed": 5, "actual_start": now, "actual_end": now + timedelta(minutes=45)},
    ]
    kpi_fair = _compute_ens_and_equity(fake_records_fair)
    print("Scenario 3 (perfectly fair: each zone cut exactly once):", kpi_fair)

    # ---------- explain_selection() tests ----------
    print("\n=== explain_selection() ===")

    one_feeder = supabase.table("feeders").select("id, name").limit(1).execute().data[0]
    explanation_1 = explain_selection(one_feeder["id"])
    print(f"Scenario 1 ({one_feeder['name']}):", explanation_1)

    another_feeder = supabase.table("feeders").select("id, name").limit(1).offset(5).execute().data[0]
    explanation_2 = explain_selection(another_feeder["id"])
    print(f"Scenario 2 ({another_feeder['name']}):", explanation_2)

    try:
        explain_selection("00000000-0000-0000-0000-000000000000")
    except ValueError as e:
        print("Scenario 3 (expected error):", e)