import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api.js";

/* =========================================================
   STAFF CONSOLE
   The human-in-the-loop screen: the engine PROPOSES cuts, an operator
   APPROVES or REJECTS them, then LOGS what really happened.
   Every action is scoped by role on the backend and written to the audit log.
========================================================= */

const ROLE_LABELS = {
  admin: "Administrator",
  dn: "Dispatching National",
  crc_nord: "CRC Nord",
  crc_sud: "CRC Sud",
  bcc: "BCC operator",
};

function todayISO() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function monthAgoISO() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export default function StaffConsole({ session, onLogout }) {
  const { token, staff } = session;
  const call = useCallback((path, options = {}) => apiFetch(path, options, token), [token]);

  const [bccs, setBccs] = useState([]);
  const [planned, setPlanned] = useState([]);
  const [approved, setApproved] = useState([]);
  const [executed, setExecuted] = useState([]);
  const [kpis, setKpis] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [p, a, e] = await Promise.all([
        call("/api/admin/schedules?status=planned"),
        call("/api/admin/schedules?status=approved"),
        call(`/api/admin/schedules?status=executed&target_date=${todayISO()}`),
      ]);
      setPlanned(p);
      setApproved(a);
      setExecuted(e);
      const regions =
        staff.role === "crc_nord" ? ["nord"] : staff.role === "crc_sud" ? ["sud"] : staff.role === "bcc" ? [null] : ["nord", "sud"];
      const results = await Promise.all(
        regions.map((r) =>
          call(`/api/admin/kpi?period_start=${monthAgoISO()}&period_end=${todayISO()}${r ? `&region=${r}` : ""}`),
        ),
      );
      setKpis(results);
    } catch (err) {
      if (err.status === 401) onLogout();
      else setError(err.message);
    }
  }, [call, staff.role, onLogout]);

  useEffect(() => {
    call("/api/admin/bcc").then(setBccs).catch(() => {});
    const timer = setTimeout(refresh, 0); // first load, outside the render cycle
    const interval = setInterval(refresh, 30000); // keep the lists fresh
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [call, refresh]);

  const act = async (fn, success) => {
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(success);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const review = (id, approve) =>
    act(
      () =>
        call("/api/admin/schedules/review", {
          method: "POST",
          body: JSON.stringify(approve ? { approve_ids: [id] } : { reject_ids: [id] }),
        }),
      approve ? `Cut #${id} approved.` : `Cut #${id} rejected.`,
    );

  const logExecution = (s) =>
    act(
      () =>
        call("/api/admin/execution", {
          method: "POST",
          body: JSON.stringify({
            schedule_id: s.id,
            actual_start: `${s.scheduled_date}T${s.start_time}:00`,
            actual_end: `${s.scheduled_date}T${s.end_time}:00`,
            actual_mw_shed: s.target_mw,
          }),
        }),
      `Execution of cut #${s.id} logged. The feeder's rotation history was updated.`,
    );
  const cancelCut = (s) => {
    const typed = window.prompt(`Cancel the cut of ${s.feeder_name} (${s.start_time}-${s.end_time})?\nType I CONFIRM to proceed.`);
    if (typed === null) return;
    act(
      () => call(`/api/admin/schedules/${s.id}/cancel`, { method: "POST", body: JSON.stringify({ confirmation: typed }) }),
      `Cut #${s.id} cancelled.`,
    );
  };
  return (
    <div className="staff-page">
      <header className="staff-header">
        <div className="auth-brand">
          <div className="brand-logo">⚡</div>
          <div>
            <div className="auth-brand-name">ENERGY BALANCE TN</div>
            <div className="auth-brand-sub">Staff console</div>
          </div>
        </div>
        <div className="staff-user">
          <strong>{staff.full_name}</strong>
          <span>
            {ROLE_LABELS[staff.role] || staff.role}
            {staff.bcc_name ? ` · ${staff.bcc_name}` : ""}
          </span>
          <button className="settings-logout" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <section className="staff-kpis">
        {kpis.map((k) => (
          <div className="dashboard-card staff-kpi" key={k.region || "bcc"}>
            <span className="card-label">
              {k.region === "nord" ? "CRC NORD" : k.region === "sud" ? "CRC SUD" : (staff.bcc_name || "MY BCC").toUpperCase()} · LAST 30 DAYS
            </span>
            <div className="staff-kpi-values">
              <div>
                <strong>{Math.round(k.fairness_score * 100)}%</strong>
                <span>Fairness score</span>
              </div>
              <div>
                <strong>{k.ens_mwh}</strong>
                <span>MWh not supplied</span>
              </div>
              <div>
                <strong>{k.execution_count}</strong>
                <span>Cuts executed</span>
              </div>
            </div>
          </div>
        ))}
      </section>

      {message && <div className="staff-message">{message}</div>}
      {error && <div className="auth-error">{error}</div>}

      <div className="staff-grid">
        <div className="staff-column">
          <ProposalForm bccs={bccs} staff={staff} call={call} onDone={(m) => { setMessage(m); refresh(); }} onError={setError} />

          <div className="dashboard-card">
            <span className="card-label">WAITING FOR YOUR VALIDATION</span>
            <h3 className="staff-title">Proposed cuts ({planned.length})</h3>
            {planned.length === 0 && <p className="staff-empty">No proposal waiting.</p>}
            {planned.map((s) => (
              <div className="staff-row" key={s.id}>
                <div className="staff-row-main">
                  <strong>{s.feeder_name}</strong>
                  <span>
                    {s.zone_name} · {s.scheduled_date} {s.start_time}–{s.end_time} · {s.target_mw} MW
                  </span>
                  <small>{s.reason}</small>
                </div>
                <div className="staff-row-actions">
                  <button className="staff-approve" onClick={() => review(s.id, true)}>Approve</button>
                  <button className="staff-reject" onClick={() => review(s.id, false)}>Reject</button>
                </div>
              </div>
            ))}
          </div>

          <div className="dashboard-card">
            <span className="card-label">APPROVED</span>
            <h3 className="staff-title">Approved cuts ({approved.length})</h3>
            {approved.length === 0 && <p className="staff-empty">No approved cut pending execution.</p>}
            {approved.map((s) => (
              <div className="staff-row" key={s.id}>
                <div className="staff-row-main">
                  <strong>{s.feeder_name}</strong>
                  <span>
                    {s.zone_name} · {s.scheduled_date} {s.start_time}–{s.end_time} · {s.target_mw} MW
                  </span>
                </div>
                <div className="staff-row-actions">
                  {new Date(`${s.scheduled_date}T${s.start_time}`) <= new Date() ? (
                    <button className="staff-approve" onClick={() => logExecution(s)}>Log execution</button>
                  ) : (
                    <span className="staff-empty">Log from {s.start_time}</span>
                  )}
                  <button className="staff-reject" onClick={() => cancelCut(s)}>Cancel</button>
                </div>
              </div>
            ))}
          </div>
          
          <div className="dashboard-card">
            <span className="card-label">DONE TODAY</span>
            <h3 className="staff-title">Executed today ({executed.length})</h3>
            {executed.length === 0 && <p className="staff-empty">No execution logged today.</p>}
            {executed.map((s) => (
              <div className="staff-row" key={s.id}>
                <div className="staff-row-main">
                  <strong>{s.feeder_name}</strong>
                  <span>
                    {s.zone_name} · {s.start_time}–{s.end_time} · {s.target_mw} MW
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

                <AdminAssistant call={call} onDone={refresh} />
      </div>
    </div>
  );
}

function ProposalForm({ bccs, staff, call, onDone, onError }) {
  const [chosenBcc, setBccId] = useState("");
  const bccId = chosenBcc || String(staff.bcc_id || bccs[0]?.id || "");
  const [target, setTarget] = useState("10");
  const [date, setDate] = useState(todayISO());
  const [start, setStart] = useState("19:00");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    onError("");
    try {
      const res = await call("/api/admin/proposals", {
        method: "POST",
        body: JSON.stringify({ bcc_id: Number(bccId), target_mw: Number(target), scheduled_date: date, start_time: start }),
      });
      onDone(`The engine proposed ${res.created.length} cut(s) for ${res.total_mw} MW. Please review them below.`);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="dashboard-card staff-form" onSubmit={submit}>
      <span className="card-label">FAIRNESS ENGINE</span>
      <h3 className="staff-title">Propose cuts</h3>
      <div className="staff-form-row">
        <label>
          BCC
          <select value={bccId} onChange={(e) => setBccId(e.target.value)}>
            {bccs.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <label>
          Target (MW)
          <input type="number" min="1" step="0.5" value={target} onChange={(e) => setTarget(e.target.value)} />
        </label>
        <label>
          Date
          <input type="date" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Start
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
      </div>
      <button className="auth-submit" disabled={busy || !bccId}>{busy ? "Computing…" : "Run the fairness engine"}</button>
      <small className="staff-hint">Priority-0 feeders (hospitals, water pumping) are never proposed. Maximum 45 minutes per cut.</small>
    </form>
  );
}

function AdminAssistant({ call, onDone }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hello! Ask me which zones are cut now, why a feeder was chosen, or compare the regions. French, Arabic, English or Derja.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || sending) return;
    const history = messages.slice(1).slice(-6);
    setMessages((m) => [...m, { role: "user", content: question }]);
    setInput("");
    setSending(true);
    try {
      const data = await call("/api/chat/admin", {
        method: "POST",
        body: JSON.stringify({ message: question, history }),
      });
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      if (onDone) onDone(); // the assistant may have created proposals      
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "The assistant is not available right now." }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat-container staff-chat">
      <div className="chat-header">
        <div className="chat-header-icon">✦</div>
        <div>
          <strong>Operations Assistant</strong>
          <span>Answers only from live platform data</span>
        </div>
        <span className="chat-online">Online</span>
      </div>
      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-message ${m.role}`}>
            {m.role === "assistant" && <div className="chat-message-avatar">✦</div>}
            <div className="chat-bubble">{m.content}</div>
          </div>
        ))}
        {sending && (
          <div className="chat-message assistant">
            <div className="chat-message-avatar">✦</div>
            <div className="chat-bubble chat-typing">Thinking…</div>
          </div>
        )}
      </div>
      <div className="chat-suggestions">
        <button onClick={() => send("Which zones are cut now?")}>Active cuts</button>
        <button onClick={() => send("Compare nord and sud this month")}>Compare regions</button>
        <button onClick={() => send("Which feeders haven't been cut in 30 days?")}>Stale feeders</button>
      </div>
      <div className="chat-input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about operations…"
        />
        <button onClick={() => send()} disabled={sending}>→</button>
      </div>
    </div>
  );
}
