/**
 * Axios instance for the ENERGY Balance citizen API.
 *
 * Base URL is read from VITE_API_URL (falls back to http://localhost:8000).
 * Every request automatically gets the citizen Bearer token from localStorage
 * so individual callers never have to touch headers.
 *
 * All citizen API paths are under /api/v1/citizen/.
 */
import axios from "axios"

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000"

const api = axios.create({
  baseURL: BASE,
  headers: { "Content-Type": "application/json" },
})

// ── Request interceptor: attach token when present ────────────────────────────
api.interceptors.request.use((config) => {
  const raw = localStorage.getItem("citizen-auth")
  if (raw) {
    try {
      const { state } = JSON.parse(raw)
      if (state?.token) {
        config.headers.Authorization = `Bearer ${state.token}`
      }
    } catch {
      // malformed storage — ignore
    }
  }
  return config
})

// ── Response interceptor: clear auth on 401 ──────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("citizen-auth")
      // let the route guard handle the redirect
    }
    return Promise.reject(err)
  }
)

export default api

// ── Typed helpers ─────────────────────────────────────────────────────────────

export const citizenApi = {
  // Auth
  register:     (body) => api.post("/api/v1/citizen/register", body),
  login:        (body) => api.post("/api/v1/citizen/login", body),

  // Profile
  getMe:        ()     => api.get("/api/v1/citizen/me"),
  updateMe:     (body) => api.patch("/api/v1/citizen/me", body),

  // Dashboard
  getDashboard: ()     => api.get("/api/v1/citizen/dashboard/me"),

  // Zones (public)
  getZones:     ()     => api.get("/api/v1/citizen/zones"),
  getZone:      (id)   => api.get(`/api/v1/citizen/zones/${id}`),

  // Registration cascade (public)
  getGovernorates:  ()                        => api.get("/api/v1/citizen/governorates"),
  getPosteSources:  (gov)                     => api.get(`/api/v1/citizen/poste-sources?governorate=${encodeURIComponent(gov)}`),
  getDepartes:      (gov, posteSource)        => api.get(`/api/v1/citizen/departes?governorate=${encodeURIComponent(gov)}&poste_source=${encodeURIComponent(posteSource)}`),
  getLocalities:    (gov)                     => api.get(`/api/v1/citizen/localities?governorate=${encodeURIComponent(gov)}`),

  // Virtual check (public)
  virtualCheck: (zoneId) => api.get(`/api/v1/citizen/virtual-check?zone_id=${zoneId}`),

  // Schedules (public — zone-level fallback)
  getSchedules: (zoneId, date) => {
    const params = new URLSearchParams()
    if (zoneId) params.set("zone_id", zoneId)
    if (date)   params.set("target_date", date)
    return api.get(`/api/v1/citizen/schedules?${params}`)
  },

  // Feeder schedule (protected — personal, feeder-level)
  // Returns the merged timeline of planned slots + actual executions for the
  // authenticated citizen's specific HTA feeder (départ).
  // Optional `date` param: ISO string "YYYY-MM-DD", defaults to today.
  getFeederSchedule: (date) => {
    const params = new URLSearchParams()
    if (date) params.set("target_date", date)
    const qs = params.toString()
    return api.get(`/api/v1/citizen/feeder-schedule${qs ? `?${qs}` : ""}`)
  },

  // Notifications (protected)
  getNotifications:    (unreadOnly = false) =>
    api.get(`/api/v1/citizen/notifications${unreadOnly ? "?unread_only=true" : ""}`),
  getUnreadCount:      () => api.get("/api/v1/citizen/notifications/unread-count"),
  markRead:            (id) => api.patch(`/api/v1/citizen/notifications/${id}/read`),
  markAllRead:         () => api.patch("/api/v1/citizen/notifications/read-all"),

  // AI chat (protected)
  // messages: [{role: "user"|"assistant", content: string}]
  // The last message must be role="user".
  chat: (messages) => api.post("/api/v1/citizen/ai/chat", { messages }),
}
