import sys
import os
import re
import json
sys.path.insert(0, os.path.dirname(__file__))

import ollama
from datetime import datetime, date, timedelta, timezone
from tools import (get_selection_reason, get_kpi, list_stale_feeders,
                   compare_regions, get_zone_schedule, list_active_cuts,
                   _parse_ts, supabase)

MODEL = "qwen3:8b"
MAX_TOOL_ROUNDS = 3
TUNIS = timezone(timedelta(hours=1))  # Tunisia is UTC+1 all year (no daylight saving)

# timeout = never wait forever; keep_alive = keep the model loaded between questions;
# num_predict = cap the answer length so the model can't ramble endlessly
CLIENT = ollama.Client(timeout=120)
CHAT_OPTIONS = {"num_predict": 500, "temperature": 0.4, "repeat_penalty": 1.15}
KEEP_ALIVE = "30m"
TIMEOUT_REPLY = "The assistant is taking too long to answer. Please try again."

# Language is detected IN CODE (a small model is unreliable at it).
# Derja is understood, but answered in French: qwen3:8b cannot reliably WRITE Derja
# (tests produced repetition loops). Change "French" below to "Arabic" to answer Derja in Arabic.
REPLY_LANGUAGE = {"English": "English", "French": "French", "Arabic": "Arabic", "Derja": "French"}

FALLBACK = {
    "English": "Sorry, I didn't understand. Could you rephrase your question?",
    "French": "Désolé, je n'ai pas compris. Pouvez-vous reformuler votre question ?",
    "Arabic": "عذرًا، لم أفهم سؤالك. هل يمكنك إعادة صياغته؟",
}

DERJA_WORDS = {"chbik", "3aweni", "aaweni", "wa9tech", "wa9teh", "waqtech", "wakteh", "yarja3", "yarjaa",
               "fama", "famma", "ma9sous", "maqsous", "ma9souss", "mat9ass", "dhaw", "dhaou", "dhaw",
               "a3tini", "aatini", "chnowa", "chnoua", "3lech", "alech", "kifech", "kifach", "barcha",
               "aslema", "ahla", "salam", "asslema", "3aslema", "n7eb", "nheb", "lkol", "jeweb", "behi", "yeser", "mta3", "mte3", "3leha", "3lih",
               "9adech", "9addech", "gadech", "tawa", "taw", "ena", "inti", "enti", "3andi", "mouch", "mech"}
FRENCH_WORDS = {"bonjour", "bonsoir", "salut", "merci", "quand", "pourquoi", "quel", "quelle", "quels",
                "est", "sont", "le", "la", "les", "du", "des", "de", "une", "un", "mon", "ma", "mes", "je",
                "vous", "courant", "coupure", "coupures", "electricite", "retour", "revient", "reviendra",
                "aujourd", "demain", "zones", "il", "y", "a-t-il", "combien", "comment"}

DERJA_GLOSSARY = ("Tunisian Derja words you may see: ma9sous/maqsous = cut, dhaw/dhaou/courant = electricity, "
                  "a3tini = give me, wa9tech = when, yarja3 = comes back, fama = is there, lkol/kol = all, "
                  "chnowa = what, 3lech = why, 9adech = how much / how long, tawa = now, 3aweni = help me, "
                  "aslema/chbik = hello / what's up.")


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
    now_local = now.astimezone(TUNIS)
    view["restoration_day"] = _day_label(end.astimezone(TUNIS), now_local)
    view["cut_start_day"] = _day_label(start.astimezone(TUNIS), now_local)
    if r["status"] == "active":
        view["minutes_until_restoration"] = max(0, int((end - now).total_seconds() // 60))
    else:
        view["minutes_until_cut_starts"] = max(0, int((start - now).total_seconds() // 60))
    return view


def _detect_language(message):
    """Returns 'Arabic', 'Derja', 'French' or 'English'."""
    if re.search(r"[\u0600-\u06FF]", message):
        return "Arabic"
    words = re.findall(r"[a-zA-Z0-9\u00C0-\u017F'-]+", message.lower())
    for w in words:
        if w in DERJA_WORDS or re.search(r"[a-z][2-9]|[2-9][a-z]", w):
            return "Derja"
    if re.search(r"[éèêàçùûôî]", message.lower()) or sum(w in FRENCH_WORDS for w in words) >= 1:
        return "French"
    return "English"


def _is_garbage(reply, done_reason, user_message):
    """Catch the two failure modes seen in testing: runaway loops and echoing the question."""
    if done_reason == "length":      # hit the length cap = the model was looping
        return True
    r, u = _norm(reply), _norm(user_message)
    return not r or r == u


def _day_label(dt_local, now_local):
    delta = (dt_local.date() - now_local.date()).days
    return {0: "today", 1: "tomorrow"}.get(delta, dt_local.strftime("%Y-%m-%d"))


def _norm(text):
    """Lowercase and keep only letters/digits, so 'La Soukra' matches 'lasoukra' or 'la-soukra'."""
    return re.sub(r"[^a-z0-9]", "", (text or "").lower())


def _other_zone_mentioned(message, own_zone_id):
    """Deterministic guard: returns the name of ANOTHER zone if the citizen's message names one.
    Done in code on purpose: a small model sometimes ignores 'don't talk about other zones'."""
    msg = _norm(message)
    for z in supabase.table("zones").select("id,name").execute().data:
        if z["id"] != own_zone_id and _norm(z["name"]) and _norm(z["name"]) in msg:
            return z["name"]
    return None


# ================= tool descriptions given to the model =================

ADMIN_TOOLS = [
    {"type": "function", "function": {
        "name": "list_active_cuts",
        "description": "List the power cuts happening right now or coming up (validated or active): zone, region, feeder, start and end time. Needs no dates. Use it for any question like 'which zones are cut' or 'where is the electricity cut'.",
        "parameters": {"type": "object", "properties": {}}}},
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
    "list_active_cuts": lambda a: list_active_cuts(),
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

def _lang_rule(reply_lang):
    return f"IMPORTANT: write your whole answer in {reply_lang} only."


# ================= system prompts =================

def _admin_prompt(reply_lang):
    today = date.today()
    month_start = today.replace(day=1)
    return f"""{_lang_rule(reply_lang)}

You are the STEG load-shedding assistant for internal staff (DN, CRC, BCC). Today is {today.isoformat()}.
Rules:
- Use the tools to answer. Quote exact numbers from tool results. Never invent numbers, feeders, zones or reasons.
- Priority levels go from 0 to 5: 0 is never cut, 1 is the lowest cut priority, 5 is the highest (cut first).
- Feeders are ranked by a fairness score: 45% priority level,
  25% time since last cut (longer = more likely), 20% cuts this month (fewer = more likely), minus 10% load (smaller feeders preferred).
  Use this to explain why a feeder is chosen.
- fairness_score goes from 0 to 1, higher is fairer. inequality_index: 0 means perfectly fair, higher means less fair.
- If the user gives no dates, use the current month: {month_start.isoformat()} to {today.isoformat()}.
- For any question about which zones are cut, call list_active_cuts immediately. Never ask the user for dates for that.
- Regions are 'nord' and 'sud'. Feeders are named like Depart_SfaxSud_1.
- If a tool returns an error or nothing, say so plainly.
- If the message is only a greeting, greet back briefly and say what you can help with.
- Never mention tool names.
- {DERJA_GLOSSARY}
- Be concise. {_lang_rule(reply_lang)}"""


def _citizen_prompt(zone_name, reply_lang):
    return f"""{_lang_rule(reply_lang)}

You are the STEG power-cut assistant for citizens. Today is {date.today().isoformat()}. All times are Tunisia local time.
The user lives in the zone "{zone_name}". The tool get_my_schedule ONLY describes "{zone_name}".
Rules:
- For any question about power cuts, when electricity comes back, or the schedule, ALWAYS call get_my_schedule first.
- Answer only from the tool result. Never invent or estimate a time. If status is "none", say there is no planned or ongoing cut in {zone_name} right now.
- Never say anything about the power situation of any other place than {zone_name}.
- Never mention internal details (feeders, priorities, BCC decisions) and never mention tool names.
- If asked WHY there is a cut: say STEG plans cuts to balance electricity supply and demand, and rotates them
  fairly between zones. Do not invent any other reason.
- If asked about all zones or other zones: say you can only give information about {zone_name}.
- If the message is only a greeting or a request for help, greet back briefly and say you can tell them
  when the electricity will be cut or come back in {zone_name}.
- Always give the exact restoration time and day (today/tomorrow) from the tool when there is a cut.
- {DERJA_GLOSSARY}
- Keep it short and friendly. {_lang_rule(reply_lang)}"""


def _refusal_prompt(own_zone, other_zone, reply_lang):
    return f"""{_lang_rule(reply_lang)}

You are the STEG power-cut assistant for citizens. The user lives in "{own_zone}" but asked about "{other_zone}".
You have NO information about "{other_zone}". In one or two short sentences, politely explain that you can only
share information about their own zone ({own_zone}), and that they can ask about it. Do not guess anything about {other_zone}."""


# ================= core loop =================

def _call(messages, tools=None):
    kwargs = dict(model=MODEL, messages=messages, think=False,
                  options=CHAT_OPTIONS, keep_alive=KEEP_ALIVE)
    if tools:
        kwargs["tools"] = tools
    resp = CLIENT.chat(**kwargs)
    return resp.message, resp.done_reason


def _finish(content, done_reason, user_message, reply_lang):
    reply = _clean(content)
    return FALLBACK[reply_lang] if _is_garbage(reply, done_reason, user_message) else reply


def _run(messages, tools, executors, user_message, reply_lang):
    try:
        for _ in range(MAX_TOOL_ROUNDS):
            msg, done_reason = _call(messages, tools)
            if not msg.tool_calls:
                return _finish(msg.content, done_reason, user_message, reply_lang)
            messages.append(msg)
            for call in msg.tool_calls:
                name = call.function.name
                args = call.function.arguments or {}
                fn = executors.get(name)
                result = fn(args) if fn else {"error": f"Unknown tool {name}"}
                messages.append({"role": "tool", "tool_name": name,
                                 "content": json.dumps(result, default=str, ensure_ascii=False)})
        # too many tool rounds: force a final answer without tools
        msg, done_reason = _call(messages)
        return _finish(msg.content, done_reason, user_message, reply_lang)
    except Exception as e:
        print(f"[chat error] {type(e).__name__}: {e}")  # visible in the server log
        return TIMEOUT_REPLY


def chat_admin(message, history=None):
    reply_lang = REPLY_LANGUAGE[_detect_language(message)]
    messages = [{"role": "system", "content": _admin_prompt(reply_lang)}] + (history or [])
    messages.append({"role": "user", "content": message})
    return _run(messages, ADMIN_TOOLS, ADMIN_EXECUTORS, message, reply_lang)


def chat_citizen(message, zone_id, history=None):
    """zone_id MUST come from the logged-in citizen's account on the server.
    No history on purpose: citizen questions are about 'right now', so every answer
    must come fresh from the database instead of repeating an older answer."""
    if not zone_id:
        return "Please log in to see information about your zone."
    zone = supabase.table("zones").select("name").eq("id", zone_id).execute().data
    if not zone:
        return "Your account is not linked to a valid zone. Please contact STEG."
    own_zone = zone[0]["name"]
    reply_lang = REPLY_LANGUAGE[_detect_language(message)]

    # Guard in code: if another zone is named, the model gets NO schedule data at all.
    other = _other_zone_mentioned(message, zone_id)
    if other:
        messages = [{"role": "system", "content": _refusal_prompt(own_zone, other, reply_lang)},
                    {"role": "user", "content": message}]
        return _run(messages, None, {}, message, reply_lang)

    executors = {"get_my_schedule": lambda a: _citizen_view(zone_id)}
    messages = [{"role": "system", "content": _citizen_prompt(own_zone, reply_lang)},
                {"role": "user", "content": message}]
    return _run(messages, CITIZEN_TOOLS, executors, message, reply_lang)


# ================= terminal test =================

if __name__ == "__main__":
    import time
    mode = input("Mode? (a = admin, c = citizen): ").strip().lower()
    zone_id = input("Citizen zone_id: ").strip() if mode == "c" else None
    history = []
    print("Type your question (or 'exit').")
    while True:
        q = input("\nYou: ").strip()
        if q.lower() == "exit":
            break
        t0 = time.time()
        reply = chat_citizen(q, zone_id) if mode == "c" else chat_admin(q, history)
        print(f"Bot: {reply}")
        print(f"     ({time.time() - t0:.1f} s)")
        history += [{"role": "user", "content": q}, {"role": "assistant", "content": reply}]