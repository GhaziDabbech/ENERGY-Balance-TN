/* Backend connection shared by every screen. */

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const TOKEN_KEY = "energy_balance_citizen_token";

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path, options = {}, token = getToken()) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let message = `Backend request failed (${response.status})`;
    try {
      const errorData = await response.json();
      message = typeof errorData.detail === "string" ? errorData.detail : message;
    } catch {
      // Keep the default message when the backend does not return JSON.
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

const STAFF_KEY = "energy_balance_staff_session";

export function getStaffSession() {
  try {
    return JSON.parse(sessionStorage.getItem(STAFF_KEY) || "null");
  } catch {
    return null;
  }
}

export function setStaffSession(session) {
  if (session) sessionStorage.setItem(STAFF_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(STAFF_KEY);
}
