import { useEffect, useState } from "react";
import { apiFetch } from "./api.js";

/* =========================================================
   ENTRY SCREEN
   Two doors, as decided by the team: Citizen or Staff.
   There is no public view: a citizen only ever sees their own zone.
========================================================= */

export default function AuthScreen({ onCitizenLogin, onStaffLogin }) {
  const [mode, setMode] = useState(null); // null | "citizen" | "signup" | "staff"

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-logo">⚡</div>
          <div>
            <div className="auth-brand-name">ENERGY BALANCE TN</div>
            <div className="auth-brand-sub">National load-shedding platform · STEG</div>
          </div>
        </div>

        {mode === null && (
          <div className="auth-choice">
            <h1>Welcome</h1>
            <p>Choose how you want to sign in.</p>
            <button className="auth-door" onClick={() => setMode("citizen")}>
              <span className="auth-door-icon">⌂</span>
              <span>
                <strong>Citizen Login</strong>
                <small>See the electricity status and planned cuts in your zone</small>
              </span>
            </button>
            <button className="auth-door" onClick={() => setMode("staff")}>
              <span className="auth-door-icon">⚙</span>
              <span>
                <strong>Staff Login</strong>
                <small>DN, CRC and BCC operators</small>
              </span>
            </button>
          </div>
        )}

        {mode === "citizen" && (
          <LoginForm
            title="Citizen login"
            endpoint="/api/auth/citizen/login"
            onSuccess={(data) => onCitizenLogin(data.token)}
            onBack={() => setMode(null)}
            footer={
              <button className="auth-link" onClick={() => setMode("signup")}>
                No account yet? Create one
              </button>
            }
          />
        )}

        {mode === "signup" && (
          <SignupForm onSuccess={(data) => onCitizenLogin(data.token)} onBack={() => setMode("citizen")} />
        )}

        {mode === "staff" && (
          <LoginForm
            title="Staff login"
            endpoint="/api/auth/staff/login"
            onSuccess={(data) => onStaffLogin({ token: data.token, staff: data.staff })}
            onBack={() => setMode(null)}
          />
        )}
      </div>
    </div>
  );
}

function LoginForm({ title, endpoint, onSuccess, onBack, footer }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSuccess(await apiFetch(endpoint, { method: "POST", body: JSON.stringify({ email, password }) }, null));
    } catch (err) {
      setError(err.message || "Login failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={submit}>
      <button type="button" className="auth-back" onClick={onBack}>← Back</button>
      <h1>{title}</h1>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {error && <div className="auth-error">{error}</div>}
      <button className="auth-submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      {footer}
    </form>
  );
}

function SignupForm({ onSuccess, onBack }) {
  const [zones, setZones] = useState([]);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", password: "", zone_id: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch("/api/public/zones", {}, null).then(setZones).catch(() => setError("Could not load the zone list."));
  }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = { ...form, zone_id: Number(form.zone_id) };
      onSuccess(await apiFetch("/api/auth/citizen/register", { method: "POST", body: JSON.stringify(body) }, null));
    } catch (err) {
      setError(err.message || "Sign-up failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={submit}>
      <button type="button" className="auth-back" onClick={onBack}>← Back</button>
      <h1>Create a citizen account</h1>
      <div className="auth-row">
        <label>
          First name
          <input value={form.first_name} onChange={set("first_name")} required />
        </label>
        <label>
          Last name
          <input value={form.last_name} onChange={set("last_name")} required />
        </label>
      </div>
      <label>
        Email
        <input type="email" value={form.email} onChange={set("email")} required />
      </label>
      <label>
        Password (8 characters minimum)
        <input type="password" minLength={8} value={form.password} onChange={set("password")} required />
      </label>
      <label>
        Your zone
        <select value={form.zone_id} onChange={set("zone_id")} required>
          <option value="">Choose your zone…</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name} ({z.governorate})
            </option>
          ))}
        </select>
      </label>
      <p className="auth-note">You will only receive information about this zone.</p>
      {error && <div className="auth-error">{error}</div>}
      <button className="auth-submit" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
    </form>
  );
}
