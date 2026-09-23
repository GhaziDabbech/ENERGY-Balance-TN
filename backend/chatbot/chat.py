import sys
import os
import re
import json
sys.path.insert(0, os.path.dirname(__file__))

import ollama
from datetime import datetime, date, timedelta, timezone
from tools import (get_selection_reason, get_kpi, list_stale_feeders,
                   compare_regions, get_zone_schedule, _parse_ts, supabase)

MODEL = "qwen3:8b"
MAX_TOOL_ROUNDS = 3
TUNIS = timezone(timedelta(hours=1))  # Tunisia is UTC+1 all year (no daylight saving)


# ================= helpers =================

def _clean(text):
    """Remove any leftover <think>...</think> reasoning from the model output."""
    return re.sub(r"<think>.*?</think>", "", text or "", flags=re.DOTALL).strip()


def _humanize(result):
    """The model reads None as 'unknown'. For feeders, None days-since-cut means 'never cut'."""
    if isinstance(result, dict):
        return {k: ("never cut" if k == "days_since_last_cut" and v is None else _humanize(v))
                for k, v in result.items()}
    if isinstance(result, list):
        return [_humanize(x) for x in result]
    return result


def _feeder_reason_by_name(feeder_name):
    """Admins ask by name (e.g. Depart_SfaxSud_1), not by UUID: resolve it here."""
    rows = supabase.table("feeders").select("id,name").ilike("name", feeder_name).execute().data
    if not rows:
        rows = (supabase.table("feeders").select("id,name")
                .ilike("name", f"%{feeder_name}%").limit(1).execute().data)
    if not rows:
        return {"error": f"No feeder found with name '{feeder_name}'"}
    result = get_selection_reason(rows[0]["id"])
    result["feeder_name"] = rows[0]["name"]
    return result


def _citizen_view(zone_id):
    """Citizen-friendly version of get_zone_schedule: Tunisia local time + minutes left."""
    r = get_zone_schedule(zone_id)
    if r.get("status") not in ("active", "scheduled"):
        return r
    start = _parse_ts(r["start"])
    end = _parse_ts(r["estimated_end"])
    now = datetime.now(timezone.utc)
    view = {
        "zone_name": r["zone_name"],
        "status": r["status"],
        "start_local_time": start.astimezone(TUNIS).strftime("%Y-%m-%d %H:%M"),
        "estimated_restoration_local_time": end.astimezone(TUNIS).strftime("%Y-%m-%d %H:%M"),
    }
    if r["status"] == "active":
        view["minutes_until_restoration"] = max(0, int((end - now).total_seconds() // 60))
    else:
        view["minutes_until_cut_starts"] = max(0, int((start - now).total_seconds() // 60))
    return view


# ================= tool descriptions given to the model =================

ADMIN_TOOLS = [
    {"type": "function", "function": {
        "name": "get_selection_reason",
        "description": "Explain the fairness factors of one feeder (depart MT): priority level (0-5), days since last cut, load weight and cuts this month. Use it for questions like 'why was this feeder chosen'.",
        "parameters": {"type": "object", "properties": {
            "feeder_name": {"type": "string", "description": "Feeder name, e.g. Depart_SfaxSud_1"}},
            "required": ["feeder_name"]}}},
    {"type": "function", "function": {
        "name": "get_kpi",
        "description": "KPIs for one region over a date range: energy not supplied (ens_mwh), fairness_score (0-1, higher is fairer) and inequality_index (0 is perfectly fair, higher is less fair).",
        "parameters": {"type": "object", "properties": {
            "region": {"type": "string", "enum": ["nord", "sud"]},
            "period_start": {"type": "string", "description": "YYYY-MM-DD"},
            "period_end": {"type": "string", "description": "YYYY-MM-DD"}},
            "required": ["region", "period_start", "period_end"]}}},
    {"type": "function", "function": {
        "name": "list_stale_feeders",
        "description": "Feeders not cut for at least N days (or never cut), most overdue first. Returns the total count and the top ones.",
        "parameters": {"type": "object", "properties": {
            "days": {"type": "integer", "description": "Minimum days since last cut"}},
            "required": ["days"]}}},
    {"type": "function", "function": {
        "name": "compare_regions",
        "description": "Compare CRC Nord and CRC Sud side by side over a date range: feeders, cuts this month, average cuts per feeder, feeders never cut, ENS and fairness_score.",
        "parameters": {"type": "object", "properties": {
            "period_start": {"type": "string", "description": "YYYY-MM-DD"},
            "period_end": {"type": "string", "description": "YYYY-MM-DD"}},
            "required": ["period_start", "period_end"]}}},
]

ADMIN_EXECUTORS = {
    "get_selection_reason": lambda a: _humanize(_feeder_reason_by_name(a.get("feeder_name", ""))),
    "get_kpi": lambda a: get_kpi(a.get("region", ""), a.get("period_start", ""), a.get("period_end", "")),
    "list_stale_feeders": lambda a: _humanize(list_stale_feeders(int(a.get("days", 30)))),
    "compare_regions": lambda a: compare_regions(a.get("period_start", ""), a.get("period_end", "")),
}

# The citizen tool has NO parameters on purpose: the zone is fixed by the server.
CITIZEN_TOOLS = [
    {"type": "function", "function": {
        "name": "get_my_schedule",
        "description": "Get the current or next power cut in the user's own zone, with estimated restoration time. It already knows the user's zone.",
        "parameters": {"type": "object", "properties": {}}}},
]


# ================= system prompts =================

def _admin_prompt():
    today = date.today()
    month_start = today.replace(day=1)
    return f"""LANGUAGE RULE (most important): reply in the language of the user's latest message. English question -> English answer. French -> French. Arabic -> Arabic. Tunisian Derja (Arabic letters, or Latin letters with numbers like 3, 7, 9) -> simple Tunisian Derja in the same kind of letters.

You are the STEG load-shedding assistant for internal staff (DN, CRC, BCC). Today is {today.isoformat()}.
Rules:
- Use the tools to answer. Quote exact numbers from tool results. Never invent numbers, feeders or reasons.
- fairness_score goes from 0 to 1, higher is fairer. inequality_index: 0 means perfectly fair, higher means less fair. Prefer fairness_score when explaining.
- If the user gives no dates, use the current month: {month_start.isoformat()} to {today.isoformat()}.
- Regions are 'nord' and 'sud'. Feeders are named like Depart_SfaxSud_1.
- If a tool returns an error, say so plainly.
- Be concise."""


def _citizen_prompt():
    return f"""LANGUAGE RULE (most important): reply in the language of the user's latest message. English question -> English answer. French -> French. Arabic -> Arabic. Tunisian Derja (Arabic letters, or Latin letters with numbers like 3, 7, 9) -> simple Tunisian Derja in the same kind of letters.

You are the STEG power-cut assistant for citizens. Today is {date.today().isoformat()}. All times are Tunisia local time.
Rules:
- For any question about power cuts, when electricity comes back, or the schedule in the user's area, ALWAYS call get_my_schedule first. It already knows the user's zone.
- Answer only from the tool result. Never invent or estimate a time yourself. If status is "none", say there is no planned or ongoing cut in their zone right now.
- You only have information about the user's own zone. If asked about another zone or other people, politely say you can only share information about their own zone.
- Never mention internal details (feeders, priorities, BCC decisions).
- Always give the exact restoration time from the tool when there is a cut. Keep it short and friendly."""


# ================= core loop =================

def _run(messages, tools, executors):
    for _ in range(MAX_TOOL_ROUNDS):
        resp = ollama.chat(model=MODEL, messages=messages, tools=tools, think=False)
        msg = resp.message
        if not msg.tool_calls:
            return _clean(msg.content)
        messages.append(msg)
        for call in msg.tool_calls:
            name = call.function.name
            args = call.function.arguments or {}
            fn = executors.get(name)
            result = fn(args) if fn else {"error": f"Unknown tool {name}"}
            messages.append({"role": "tool", "tool_name": name,
                             "content": json.dumps(result, default=str, ensure_ascii=False)})
    # too many tool rounds: force a final answer without tools
    resp = ollama.chat(model=MODEL, messages=messages, think=False)
    return _clean(resp.message.content)


def chat_admin(message, history=None):
    messages = [{"role": "system", "content": _admin_prompt()}] + (history or [])
    messages.append({"role": "user", "content": message})
    return _run(messages, ADMIN_TOOLS, ADMIN_EXECUTORS)


def chat_citizen(message, zone_id, history=None):
    """zone_id MUST come from the logged-in citizen's account on the server."""
    if not zone_id:
        return "Please log in to see information about your zone."
    executors = {"get_my_schedule": lambda a: _citizen_view(zone_id)}
    # No history on purpose: citizen questions are about "right now", so the bot must
    # call the tool every time instead of repeating an older (possibly outdated) answer.
    messages = [{"role": "system", "content": _citizen_prompt()}]
    messages.append({"role": "user", "content": message})
    return _run(messages, CITIZEN_TOOLS, executors)


# ================= terminal test =================

if __name__ == "__main__":
    mode = input("Mode? (a = admin, c = citizen): ").strip().lower()
    zone_id = input("Citizen zone_id: ").strip() if mode == "c" else None
    history = []
    print("Type your question (or 'exit').")
    while True:
        q = input("\nYou: ").strip()
        if q.lower() == "exit":
            break
        reply = chat_citizen(q, zone_id, history) if mode == "c" else chat_admin(q, history)
        print(f"Bot: {reply}")
        history += [{"role": "user", "content": q}, {"role": "assistant", "content": reply}]