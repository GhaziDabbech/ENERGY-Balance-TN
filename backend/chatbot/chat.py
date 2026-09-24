"""Chat engine: connects the local model (Ollama, qwen3:8b) to the read-only tools.
Security by design:
- The citizen tool has NO parameters: the zone comes from the login token, never from the model.
- If a citizen names another zone, the model receives NO schedule data at all (guard in code).
- Language is detected in code; runaway/echo answers are replaced by a clean fallback.
"""
import json
import os
import re
from datetime import date

import ollama
from sqlalchemy.orm import Session

from chatbot.tools import (compare_regions, get_kpi, get_selection_reason, get_zone_schedule,
                           list_active_cuts, list_stale_feeders)
from models import Zone

MODEL = os.getenv("OLLAMA_MODEL", "qwen3:8b")
MAX_TOOL_ROUNDS = 3
CLIENT = ollama.Client(host=os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434"), timeout=120)

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


def _norm(text):
    """Lowercase and keep only letters/digits, so 'La Soukra' matches 'lasoukra' or 'la-soukra'."""
    return re.sub(r"[^a-z0-9]", "", (text or "").lower())



def _other_zone_mentioned(db: Session, message: str, own_zone_id: int):
    """Deterministic guard: name of ANOTHER zone if the citizen's message names one."""
    msg = _norm(message)
    for z in db.query(Zone).all():
        if z.id != own_zone_id and _norm(z.name) and _norm(z.name) in msg:
            return z.name
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

def _admin_executors(db: Session, bcc_ids):
    """Tools for the admin chatbot, bound to this request's DB session and the staff member's scope."""
    return {
        "list_active_cuts": lambda a: list_active_cuts(db, bcc_ids),
        "get_selection_reason": lambda a: get_selection_reason(db, a.get("feeder_name", ""), bcc_ids),
        "get_kpi": lambda a: get_kpi(db, a.get("region"), a.get("period_start", ""), a.get("period_end", ""), bcc_ids),
        "list_stale_feeders": lambda a: list_stale_feeders(db, int(a.get("days", 30) or 30), bcc_ids),
        "compare_regions": lambda a: compare_regions(db, a.get("period_start", ""), a.get("period_end", "")),
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
- Regions are 'nord' and 'sud'. Feeders are named like Depart_SfaxCentre_1. Critical feeders (hospitals, water pumping) have priority 0 and are never cut.
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


def chat_admin(db: Session, message: str, history=None, bcc_ids=None) -> str:
    reply_lang = REPLY_LANGUAGE[_detect_language(message)]
    messages = [{"role": "system", "content": _admin_prompt(reply_lang)}] + (history or [])
    messages.append({"role": "user", "content": message})
    return _run(messages, ADMIN_TOOLS, _admin_executors(db, bcc_ids), message, reply_lang)


def chat_citizen(db: Session, message: str, zone_id: int) -> str:
    """zone_id MUST come from the logged-in citizen's token on the server.
    No history on purpose: citizen questions are about 'right now', so every answer
    comes fresh from the database instead of repeating an older answer."""
    zone = db.get(Zone, zone_id) if zone_id else None
    if not zone:
        return "Your account is not linked to a valid zone. Please contact STEG."
    reply_lang = REPLY_LANGUAGE[_detect_language(message)]

    # Guard in code: if another zone is named, the model gets NO schedule data at all.
    other = _other_zone_mentioned(db, message, zone.id)
    if other:
        messages = [{"role": "system", "content": _refusal_prompt(zone.name, other, reply_lang)},
                    {"role": "user", "content": message}]
        return _run(messages, None, {}, message, reply_lang)

    executors = {"get_my_schedule": lambda a: get_zone_schedule(db, zone.id)}
    messages = [{"role": "system", "content": _citizen_prompt(zone.name, reply_lang)},
                {"role": "user", "content": message}]
    return _run(messages, CITIZEN_TOOLS, executors, message, reply_lang)
