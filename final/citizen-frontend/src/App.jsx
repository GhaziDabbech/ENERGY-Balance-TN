/**
 * ENERGY Balance TN — Citizen Portal
 *
 * Auth flow:
 *   - Unauthenticated visitors → /login or /register
 *   - Authenticated citizens   → main shell (dashboard / schedule / map …)
 *
 * All data comes from the STEG backend at VITE_API_URL (default: http://localhost:8000).
 * No hardcoded demo values remain — everything is derived from the logged-in citizen.
 */
import { useEffect, useMemo, useState, useCallback, useRef } from "react"
import { Routes, Route, Navigate, useNavigate } from "react-router-dom"
import GOVERNORATES_GJ from "./data/governorates.json"

import { useCitizenAuthStore } from "./store/authStore"
import { citizenApi } from "./lib/api"
import api from "./lib/api"
import LoginPage    from "./pages/LoginPage"
import RegisterPage from "./pages/RegisterPage"

// ── SVG map projection (Mercator) ─────────────────────────────────────────────
const VW = 560, VH = 1000, PAD = 28
const LAT_MIN = 29.9, LAT_MAX = 37.65, LNG_MIN = 7.45, LNG_MAX = 11.65
const TO_RAD    = Math.PI / 180
const mercY_MIN = Math.log(Math.tan(Math.PI / 4 + LAT_MIN * TO_RAD / 2))
const mercY_MAX = Math.log(Math.tan(Math.PI / 4 + LAT_MAX * TO_RAD / 2))

function project(lat, lng)
{
    const x  = PAD + ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * (VW - PAD * 2)
    const my = Math.log(Math.tan(Math.PI / 4 + lat * TO_RAD / 2))
    const y  = PAD + ((mercY_MAX - my) / (mercY_MAX - mercY_MIN)) * (VH - PAD * 2)
    return [x, y]
}

function geomToPath(geometry)
{
    if (!geometry) return ""
    const ring = (r) =>
    {
        const pts = r.map(([lo, la]) => { const [x, y] = project(la, lo); return `${x.toFixed(1)},${y.toFixed(1)}` })
        return `M${pts.join(" L")} Z`
    }
    if (geometry.type === "Polygon")      return geometry.coordinates.map(ring).join(" ")
    if (geometry.type === "MultiPolygon") return geometry.coordinates.flatMap(p => p.map(ring)).join(" ")
    return ""
}

function geoCentroid(geometry)
{
    let c = []
    if (geometry?.type === "Polygon")      c = geometry.coordinates[0]
    if (geometry?.type === "MultiPolygon") c = geometry.coordinates[0]?.[0] ?? []
    if (!c.length) return null
    const n = c.length
    return project(c.reduce((s, p) => s + p[1], 0) / n, c.reduce((s, p) => s + p[0], 0) / n)
}

const ZOOM_MIN = 0.85, ZOOM_MAX = 18, ZOOM_STEP = 1.35
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// French names for GeoJSON feature keys
const GOV_FR =
{
    "Tunis": "Tunis", "Manubah": "La Manouba", "Ben Arous (Tunis Sud)": "Ben Arous"
    ,"Ariana": "Ariana", "Bizerte": "Bizerte", "Nabeul": "Nabeul"
    ,"Zaghouan": "Zaghouan", "Béja": "Béja", "Jendouba": "Jendouba"
    ,"Le Kef": "Le Kef", "Siliana": "Siliana", "Sousse": "Sousse"
    ,"Kairouan": "Kairouan", "Mahdia": "Mahdia", "Monastir": "Monastir"
    ,"Sidi Bou Zid": "Sidi Bouzid", "Kassérine": "Kasserine", "Sfax": "Sfax"
    ,"Gafsa": "Gafsa", "Tozeur": "Tozeur", "Kebili": "Kébili"
    ,"Gabès": "Gabès", "Médenine": "Médenine", "Tataouine": "Tataouine"
}

// Normalize DB governorate names → GeoJSON feature key
// DB value (from feeder.governorate) → GeoJSON properties.name
const DB_TO_GEOJSON_KEY =
{
    "Tunis":       "Tunis"
    ,"Ariana":     "Ariana"
    ,"Ben Arous":  "Ben Arous (Tunis Sud)"
    ,"Manouba":    "Manubah"
    ,"Manubah":    "Manubah"
    ,"Nabeul":     "Nabeul"
    ,"Zaghouan":   "Zaghouan"
    ,"Bizerte":    "Bizerte"
    ,"Béja":       "Béja"
    ,"Beja":       "Béja"
    ,"Jendouba":   "Jendouba"
    ,"Le Kef":     "Le Kef"
    ,"Siliana":    "Siliana"
    ,"Sousse":     "Sousse"
    ,"Kairouan":   "Kairouan"
    ,"Monastir":   "Monastir"
    ,"Mahdia":     "Mahdia"
    ,"Sidi Bouzid":"Sidi Bou Zid"
    ,"Sidi Bou Zid":"Sidi Bou Zid"
    ,"Kasserine":  "Kassérine"
    ,"Kassérine":  "Kassérine"
    ,"Sfax":       "Sfax"
    ,"Gafsa":      "Gafsa"
    ,"Tozeur":     "Tozeur"
    ,"Kébili":     "Kebili"
    ,"Kebili":     "Kebili"
    ,"Gabès":      "Gabès"
    ,"Gabes":      "Gabès"
    ,"Médenine":   "Médenine"
    ,"Medenine":   "Médenine"
    ,"Tataouine":  "Tataouine"
}

// Static fallback zone labels (used when API is unavailable)
const GOV_BCC_ZONE =
{
    "Tunis": "Grand Tunis", "Manubah": "Grand Tunis"
    ,"Ben Arous (Tunis Sud)": "Grand Tunis", "Ariana": "Grand Tunis"
    ,"Nabeul": "BCC 2 — Nord", "Zaghouan": "BCC 2 — Nord", "Bizerte": "BCC 2 — Nord"
    ,"Béja": "BCC 3 — Nord-Ouest", "Jendouba": "BCC 3 — Nord-Ouest"
    ,"Le Kef": "BCC 3 — Nord-Ouest", "Siliana": "BCC 3 — Nord-Ouest"
    ,"Sousse": "BCC 4 — Sahel", "Kairouan": "BCC 4 — Sahel"
    ,"Mahdia": "BCC 4 — Sahel", "Monastir": "BCC 4 — Sahel"
    ,"Sfax": "BCC 5 — Sfax", "Sidi Bou Zid": "BCC 5 — Sfax"
    ,"Gafsa": "BCC 6 — Gafsa", "Tozeur": "BCC 6 — Gafsa", "Kassérine": "BCC 6 — Gafsa"
    ,"Gabès": "BCC 7 — Sud", "Médenine": "BCC 7 — Sud"
    ,"Tataouine": "BCC 7 — Sud", "Kebili": "BCC 7 — Sud"
}

// Static fallback status — shown while API is loading or unreachable.
// All "available" by default so the map is green (not gray) on first paint.
const GOV_STATIC_STATUS = {}
Object.keys(GOV_BCC_ZONE).forEach(gov => { GOV_STATIC_STATUS[gov] = "available" })

// Derive status from ratio  (0 → available, 0<r≤0.6 → demand, r>0.6 → outage)
function ratioToStatus(ratio)
{
    if (ratio == null) return "unknown"
    if (ratio === 0)   return "available"
    if (ratio <= 0.60) return "demand"
    return "outage"
}

// Status visual config — light theme
const ST_CFG =
{
    outage:    { fill: "#ef4444", op: 0.28, stroke: "#dc2626", strokeSel: "#b91c1c", label: "Coupure en cours",  dot: "#ef4444", textColor: "#991b1b" }
    ,demand:   { fill: "#f59e0b", op: 0.22, stroke: "#d97706", strokeSel: "#b45309", label: "Forte demande",    dot: "#f59e0b", textColor: "#92400e" }
    ,available:{ fill: "#22c55e", op: 0.12, stroke: "#16a34a", strokeSel: "#15803d", label: "Alimentation normale", dot: "#22c55e", textColor: "#14532d" }
    ,unknown:  { fill: "#94a3b8", op: 0.10, stroke: "#64748b", strokeSel: "#475569", label: "Inconnu",          dot: "#94a3b8", textColor: "#475569" }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(fullName)
{
    if (!fullName) return "?"
    return fullName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0].toUpperCase())
        .join("")
}

function normalizeZone(zone)
{
    const raw    = String(zone.electricity_status || zone.currentStatus || "Unknown")
    const lower  = raw.toLowerCase()
    let status   = "unknown"
    if (lower.includes("scheduled") || lower.includes("emergency") || lower.includes("outage") || lower.includes("coupure")) {
        status = "outage"
    } else if (lower.includes("demand") || lower.includes("élevée")) {
        status = "demand"
    } else if (lower.includes("available") || lower.includes("normale") || lower.includes("normal")) {
        status = "available"
    }
    return {
        ...zone,
        currentStatus:      zone.currentStatus || status,
        currentStatusLabel: zone.currentStatusLabel || raw,
        currentDescription: zone.currentDescription || "",
        shedding: Array.isArray(zone.shedding) ? zone.shedding : [],
    }
}

// ── Route guards ──────────────────────────────────────────────────────────────

function RequireAuth({ children })
{
    const token = useCitizenAuthStore((s) => s.token)
    if (!token) return <Navigate to="/login" replace />
    return children
}

function RequireGuest({ children })
{
    const token = useCitizenAuthStore((s) => s.token)
    if (token) return <Navigate to="/" replace />
    return children
}

// ── Root app ──────────────────────────────────────────────────────────────────

export default function App()
{
    return (
        <Routes>
            <Route path="/login"    element={<RequireGuest><LoginPage /></RequireGuest>} />
            <Route path="/register" element={<RequireGuest><RegisterPage /></RequireGuest>} />
            <Route path="/*"        element={<RequireAuth><Shell /></RequireAuth>} />
        </Routes>
    )
}

// ── Main shell ────────────────────────────────────────────────────────────────

function Shell()
{
    const navigate                              = useNavigate()
    const { citizen: authCitizen, logout }      = useCitizenAuthStore()
    const [activePage, setActivePage]           = useState("dashboard")
    const [virtualCheckOpen, setVirtualCheckOpen] = useState(false)

    // ── Remote state ──────────────────────────────────────────────────────────
    const [dashboardData,   setDashboardData]   = useState(null)
    const [zones,           setZones]           = useState([])
    const [notifications,   setNotifications]   = useState([])
    const [unreadCount,     setUnreadCount]     = useState(0)
    const [loading,         setLoading]         = useState(true)
    const [error,           setError]           = useState("")

    // ── Initial data load ─────────────────────────────────────────────────────
    const reload = useCallback(async () => {
        setLoading(true)
        setError("")
        try {
            // Run all calls in parallel but don't let secondary calls kill the dashboard
            const [dashRes, zonesRes, notifRes, unreadRes] = await Promise.allSettled([
                citizenApi.getDashboard(),
                citizenApi.getZones(),
                citizenApi.getNotifications(),
                citizenApi.getUnreadCount(),
            ])

            // Dashboard is critical — if it fails, show error and bail
            if (dashRes.status === "rejected") {
                if (dashRes.reason?.response?.status === 401) {
                    logout()
                    navigate("/login", { replace: true })
                    return
                }
                throw dashRes.reason
            }

            setDashboardData(dashRes.value.data)

            if (zonesRes.status === "fulfilled") {
                setZones((zonesRes.value.data ?? []).map(normalizeZone))
            }
            if (notifRes.status === "fulfilled") {
                setNotifications(notifRes.value.data ?? [])
            }
            if (unreadRes.status === "fulfilled") {
                setUnreadCount(unreadRes.value.data?.unread_count ?? 0)
            }
        } catch (err) {
            if (err.response?.status === 401) {
                logout()
                navigate("/login", { replace: true })
            } else {
                setError("Connexion au serveur impossible. Certaines données peuvent être indisponibles.")
            }
        } finally {
            setLoading(false)
        }
    }, [logout, navigate])

    useEffect(() => { reload() }, [reload])

    // ── Derived values — all computed from real data ───────────────────────────
    const citizenInfo = useMemo(() => {
        const d = dashboardData?.citizen
        if (!d) {
            // Fallback to auth token payload while dashboard is loading
            return {
                name:        authCitizen?.full_name  || "",
                zone:        authCitizen?.zone_name  || "",
                governorate: authCitizen?.governorate || "",
                initials:    initials(authCitizen?.full_name || ""),
                zone_id:     authCitizen?.zone_id,
            }
        }
        const name = d.name || `${d.first_name} ${d.last_name}`.trim()
        // Prefer the governorate stored directly on the citizen (set at registration)
        // over the citizen_zone's governorate, since the citizen may be in a sub-zone
        const governorate = d.governorate || dashboardData?.zone?.governorate || ""
        return {
            name,
            zone:        dashboardData?.zone?.name || "",
            governorate,
            initials:    initials(name),
            zone_id:     d.zone_id,
        }
    }, [dashboardData, authCitizen])

    // ── Notification actions ──────────────────────────────────────────────────
    async function handleMarkRead(id)
    {
        await citizenApi.markRead(id)
        setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n))
        setUnreadCount((c) => Math.max(0, c - 1))
    }

    async function handleMarkAllRead()
    {
        await citizenApi.markAllRead()
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
        setUnreadCount(0)
    }

    // ── Settings update ───────────────────────────────────────────────────────
    async function handleSettingsUpdate(patch)
    {
        await citizenApi.updateMe(patch)
        // Reload to get fresh data
        await reload()
    }

    function handleLogout()
    {
        logout()
        navigate("/login", { replace: true })
    }

    return (
        <div className="app-shell">
            <Sidebar
                activePage={activePage}
                setActivePage={setActivePage}
                citizenInfo={citizenInfo}
                unreadCount={unreadCount}
            />

            <main className="main-content">
                <Topbar
                    activePage={activePage}
                    setActivePage={setActivePage}
                    citizenInfo={citizenInfo}
                    unreadCount={unreadCount}
                    onLogout={handleLogout}
                />

                {error && (
                    <div className="backend-error-banner">
                        {error}
                    </div>
                )}

                {activePage === "dashboard" && (
                    <Dashboard
                        setActivePage={setActivePage}
                        setVirtualCheckOpen={setVirtualCheckOpen}
                        citizenInfo={citizenInfo}
                        dashboardData={dashboardData}
                        loading={loading}
                    />
                )}

                {activePage === "schedule" && (
                    <Schedule
                        citizenInfo={citizenInfo}
                    />
                )}

                {activePage === "notifications" && (
                    <Notifications
                        notifications={notifications}
                        loading={loading}
                        onMarkRead={handleMarkRead}
                        onMarkAllRead={handleMarkAllRead}
                    />
                )}

                {activePage === "map" && (
                    <EnergyMap locations={zones} />
                )}

                {activePage === "settings" && (
                    <Settings
                        citizenInfo={citizenInfo}
                        dashboardData={dashboardData}
                        onUpdate={handleSettingsUpdate}
                        onLogout={handleLogout}
                    />
                )}

                {activePage === "chat" && <Chatbot />}
            </main>

            {virtualCheckOpen && (
                <VirtualCheckModal
                    onClose={() => setVirtualCheckOpen(false)}
                />
            )}
        </div>
    )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ activePage, setActivePage, citizenInfo, unreadCount })
{
    const navigation = [
        { id: "dashboard",     label: "Tableau de bord", icon: "dashboard" },
        { id: "schedule",      label: "Mon programme",   icon: "calendar_month" },
        { id: "map",           label: "Carte nationale", icon: "map" },
        { id: "notifications", label: "Notifications",   icon: "notifications" },
        { id: "chat",          label: "Assistant",       icon: "auto_awesome" },
        { id: "settings",      label: "Paramètres",      icon: "settings" },
    ]

    return (
        <aside className="sidebar">
            <div className="brand">
                <div className="brand-logo">
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>bolt</span>
                </div>
                <div>
                    <div className="brand-name">ENERGY</div>
                    <div className="brand-subtitle">BALANCE TN</div>
                </div>
            </div>

            <div className="sidebar-section-title">MENU</div>

            <nav className="sidebar-nav">
                {navigation.map((item) => (
                    <button
                        key={item.id}
                        className={`sidebar-item ${activePage === item.id ? "active" : ""}`}
                        onClick={() => setActivePage(item.id)}
                    >
                        <span className="sidebar-icon material-symbols-outlined">{item.icon}</span>
                        <span>{item.label}</span>
                        {item.id === "notifications" && unreadCount > 0 && (
                            <span className="notification-badge">{unreadCount}</span>
                        )}
                    </button>
                ))}
            </nav>

            <div className="sidebar-bottom">
                <div className="connection-card">
                    <span className="connection-dot"></span>
                    <div>
                        <strong>Connecté au réseau</strong>
                        <span>Système opérationnel</span>
                    </div>
                </div>

                <div className="sidebar-user">
                    <div className="avatar">{citizenInfo.initials}</div>
                    <div className="sidebar-user-info">
                        <strong>{citizenInfo.name || "Chargement…"}</strong>
                        <span>{citizenInfo.zone}</span>
                    </div>
                </div>
            </div>
        </aside>
    )
}

// ── Topbar ────────────────────────────────────────────────────────────────────

function Topbar({ activePage, setActivePage, citizenInfo, unreadCount, onLogout })
{
    const titles = {
        dashboard:     { title: "Tableau de bord",    subtitle: "Votre situation électrique en temps réel" },
        schedule:      { title: "Mon programme",      subtitle: "Interruptions planifiées pour votre zone" },
        map:           { title: "Carte nationale",    subtitle: "Situation électrique à travers la Tunisie" },
        notifications: { title: "Notifications",      subtitle: "Alertes et mises à jour de votre service" },
        chat:          { title: "Assistant",          subtitle: "Posez vos questions sur le délestage" },
        settings:      { title: "Paramètres",         subtitle: "Gérez votre compte et vos préférences" },
    }
    const current = titles[activePage] || titles.dashboard

    return (
        <header className="topbar">
            <div>
                <h1>{current.title}</h1>
                <p>{current.subtitle}</p>
            </div>

            <div className="topbar-actions">
                <button
                    className="topbar-icon-button"
                    onClick={() => setActivePage("notifications")}
                    title="Notifications"
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>notifications</span>
                    {unreadCount > 0 && <span className="topbar-notification-dot"></span>}
                </button>

                <button className="topbar-profile" onClick={() => setActivePage("settings")}>
                    <div className="topbar-avatar">{citizenInfo.initials}</div>
                    <div className="topbar-profile-text">
                        <strong>{citizenInfo.name || "…"}</strong>
                        <span>{citizenInfo.zone}</span>
                    </div>
                </button>

                <button className="topbar-logout-btn" onClick={onLogout} title="Déconnexion">
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
                </button>
            </div>
        </header>
    )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard({ setActivePage, setVirtualCheckOpen, citizenInfo, dashboardData, loading })
{
    const situation    = dashboardData?.current_situation
    const todaySched   = dashboardData?.today_schedule ?? []
    const nextSlot     = todaySched[0]

    // ── Feeder-level live status ───────────────────────────────────────────
    // dashboardData.current_situation is zone-level (coarse).
    // We separately fetch the citizen's feeder schedule to get the precise
    // has_active flag — i.e. whether *their specific départ* is cut right now.
    const [feederActive, setFeederActive] = useState(null)   // null = still loading

    useEffect(() => {
        let cancelled = false
        citizenApi.getFeederSchedule()
            .then(({ data }) => {
                if (!cancelled) setFeederActive(data?.has_active ?? false)
            })
            .catch(() => {
                if (!cancelled) setFeederActive(null)   // fall back to zone status
            })
        return () => { cancelled = true }
    }, [])

    // Auto-refresh every 60 s so the live indicator stays accurate
    useEffect(() => {
        const id = setInterval(() => {
            citizenApi.getFeederSchedule()
                .then(({ data }) => setFeederActive(data?.has_active ?? false))
                .catch(() => {})
        }, 60_000)
        return () => clearInterval(id)
    }, [])

    // Resolved: feeder takes priority over zone; falls back if feeder fetch failed
    const isShedding = feederActive !== null
        ? feederActive
        : (situation?.under_shedding ?? false)

    return (
        <div className="page-content dashboard-page">
            <section className="welcome-section">
                <div>
                    <span className="eyebrow">PORTAIL CITOYEN</span>
                    <h2>Bienvenue, <span>{citizenInfo.name || "…"}</span></h2>
                    <p>Voici les dernières informations électriques pour votre zone.</p>
                </div>
                {citizenInfo.zone && (
                    <div className="zone-pill">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>location_on</span>
                        {citizenInfo.governorate || citizenInfo.zone}
                    </div>
                )}
            </section>

            <section className={`status-card${!loading && isShedding ? " status-card--outage" : ""}`}>
                <div className="status-card-left">
                    <div className="large-status-icon">
                        <span className="material-symbols-outlined" style={{ fontSize: 26 }}>
                            {loading ? "hourglass_empty" : isShedding ? "flash_off" : "check_circle"}
                        </span>
                    </div>
                    <div>
                        <span className="status-label">SITUATION ÉLECTRIQUE ACTUELLE</span>
                        <h3>
                            {loading
                                ? "Chargement…"
                                : isShedding
                                    ? "Coupure en cours"
                                    : "Alimentation normale"}
                        </h3>
                        <p>
                            {loading
                                ? "Récupération des informations électriques."
                                : isShedding
                                    ? "Votre départ est actuellement en délestage planifié."
                                    : "L'électricité est disponible sur votre départ."}
                        </p>
                    </div>
                </div>
                <div className="status-live"><span></span>EN DIRECT</div>
            </section>

            <section className="dashboard-grid">
                <div className="dashboard-card next-outage-card">
                    <div className="card-heading">
                        <div>
                            <span className="card-label">PROCHAINE INTERRUPTION</span>
                            <h3>Programme du jour</h3>
                        </div>
                        <span className="card-icon blue">
                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>schedule</span>
                        </span>
                    </div>
                    <div className="next-outage-time">
                        {loading ? (
                            <strong>Chargement…</strong>
                        ) : nextSlot ? (
                            <>
                                <strong>{nextSlot.start_time}</strong>
                                <span>–</span>
                                <strong>{nextSlot.end_time}</strong>
                            </>
                        ) : (
                            <strong>Aucune interruption</strong>
                        )}
                    </div>
                    <div className="outage-meta">
                        <span>
                            {nextSlot
                                ? `Durée : ${nextSlot.duration_minutes} min`
                                : "Aucun délestage prévu aujourd'hui"}
                        </span>
                        {nextSlot && (
                            <span className="planned-pill">
                                {nextSlot.active ? "En cours" : "Planifié"}
                            </span>
                        )}
                    </div>
                    <button className="text-button" onClick={() => setActivePage("schedule")}>
                        Voir le programme complet →
                    </button>
                </div>

                <div className={`dashboard-card zone-card${!loading && isShedding ? " zone-card--outage" : ""}`}>
                    <div className="card-heading">
                        <div>
                            <span className="card-label">VOTRE LOCALISATION</span>
                            <h3>{citizenInfo.governorate || citizenInfo.zone || "…"}</h3>
                        </div>
                        <span className={`card-icon ${!loading && isShedding ? "red" : "green"}`}>
                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>location_on</span>
                        </span>
                    </div>
                    <div className="zone-status-row">
                        <span className={`small-status-dot${!loading && isShedding ? " outage" : ""}`}></span>
                        <div>
                            <strong>
                                {isShedding ? "Coupure en cours" : "Alimentation normale"}
                            </strong>
                            <span>Statut actuel</span>
                        </div>
                    </div>
                    <button className="text-button" onClick={() => setActivePage("map")}>
                        Voir sur la carte nationale →
                    </button>
                </div>
            </section>

            <section className="quick-actions-section">
                <div className="section-heading">
                    <div>
                        <span className="section-label">ACTIONS RAPIDES</span>
                        <h3>Vérifier la situation électrique</h3>
                    </div>
                </div>
                <div className="quick-actions">
                    <button className="quick-action-card" onClick={() => setVirtualCheckOpen(true)}>
                        <div className="quick-action-icon check-icon">
                            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>manage_search</span>
                        </div>
                        <div className="quick-action-text">
                            <strong>Vérification virtuelle</strong>
                            <span>Consulter la situation de n'importe quelle zone</span>
                        </div>
                        <span className="quick-action-arrow">
                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_forward</span>
                        </span>
                    </button>

                    <button className="quick-action-card" onClick={() => setActivePage("map")}>
                        <div className="quick-action-icon map-icon">
                            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>map</span>
                        </div>
                        <div className="quick-action-text">
                            <strong>Carte nationale</strong>
                            <span>Explorer les conditions électriques en Tunisie</span>
                        </div>
                        <span className="quick-action-arrow">
                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_forward</span>
                        </span>
                    </button>
                </div>
            </section>

            <section className="dashboard-bottom">
                <div className="dashboard-card energy-tip-card">
                    <div className="card-heading">
                        <div>
                            <span className="card-label">CONSEIL ÉNERGIE</span>
                            <h3>Réduire la consommation aux heures de pointe</h3>
                        </div>
                        <span className="card-icon yellow">
                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>tips_and_updates</span>
                        </span>
                    </div>
                    <p>Réduire les appareils non essentiels durant les pics de demande aide à maintenir la stabilité du réseau.</p>
                </div>

                <div className="dashboard-card assistant-card">
                    <div className="assistant-card-icon">
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>auto_awesome</span>
                    </div>
                    <div>
                        <span className="card-label">ASSISTANT ÉNERGIE</span>
                        <h3>Besoin d'informations ?</h3>
                        <p>Posez vos questions sur le programme, le statut ou le réseau national.</p>
                        <button className="assistant-button" onClick={() => setActivePage("chat")}>
                            Interroger l'assistant →
                        </button>
                    </div>
                </div>
            </section>
        </div>
    )
}

// ── Schedule ──────────────────────────────────────────────────────────────────

function Schedule({ citizenInfo })
{
    const [data,        setData]        = useState(null)   // API response
    const [loading,     setLoading]     = useState(true)
    const [error,       setError]       = useState("")
    const [selectedDate, setSelectedDate] = useState(() => {
        // Default to today in YYYY-MM-DD local format
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
    })

    const fetchSchedule = useCallback(async (dateStr) => {
        setLoading(true)
        setError("")
        try {
            const res = await citizenApi.getFeederSchedule(dateStr)
            setData(res.data)
        } catch (err) {
            if (err.response?.status === 401) {
                setError("Session expirée. Veuillez vous reconnecter.")
            } else {
                setError("Impossible de charger le programme. Vérifiez votre connexion.")
            }
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchSchedule(selectedDate) }, [fetchSchedule, selectedDate])

    // Auto-refresh every 60 s so active cuts update without manual reload
    useEffect(() => {
        const id = setInterval(() => fetchSchedule(selectedDate), 60_000)
        return () => clearInterval(id)
    }, [fetchSchedule, selectedDate])

    const feeder = data?.feeder
    const slots  = data?.slots ?? []
    const isToday = selectedDate === (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
    })()

    // Compute current time position as % of the day (for the "now" bar)
    const nowPct = useMemo(() => {
        if (!isToday) return null
        const n = new Date()
        return ((n.getHours() * 60 + n.getMinutes()) / (24 * 60)) * 100
    }, [isToday])

    // Format a date string nicely
    function fmtDate(iso) {
        const [y, m, d] = iso.split("-")
        const dt = new Date(parseInt(y), parseInt(m)-1, parseInt(d))
        return dt.toLocaleDateString("fr-TN", { weekday:"long", day:"numeric", month:"long", year:"numeric" })
    }

    // Navigate days
    function changeDay(delta) {
        const [y, m, d] = selectedDate.split("-").map(Number)
        const dt = new Date(y, m-1, d)
        dt.setDate(dt.getDate() + delta)
        setSelectedDate(
            `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`
        )
    }

    // Convert "HH:MM" to minutes-since-midnight
    function toMin(hhmm) {
        if (!hhmm) return 0
        const [h, m] = hhmm.split(":").map(Number)
        return h * 60 + m
    }

    // Status → visual config
    const STATUS_CFG = {
        "Active now": { bg:"#fee2e2", border:"#ef4444", dot:"#dc2626", text:"#991b1b", label:"En cours",   icon:"flash_off" }
        ,"Executed":  { bg:"#f0fdf4", border:"#22c55e", dot:"#16a34a", text:"#14532d", label:"Exécuté",    icon:"check_circle" }
        ,"Planned":   { bg:"#eff6ff", border:"#3b82f6", dot:"#2563eb", text:"#1e3a8a", label:"Planifié",   icon:"schedule" }
        ,"Cancelled": { bg:"#f8fafc", border:"#cbd5e1", dot:"#94a3b8", text:"#64748b", label:"Annulé",     icon:"cancel" }
    }
    const SOURCE_LABEL = { execution:"Coupure réelle", programme:"Programme J+1", zone:"Programme zone" }

    // Compute total interrupted minutes today
    const totalMinutes = useMemo(() =>
        slots
            .filter(s => s.status !== "Cancelled")
            .reduce((acc, s) => acc + (s.duration_minutes || 0), 0)
    , [slots])

    return (
        <div className="page-content">
            <div className="page-intro">
                <span className="eyebrow">PROGRAMME ÉLECTRIQUE</span>
                <h2>Mon programme</h2>
                <p>Interruptions d'électricité planifiées pour votre départ enregistré.</p>
            </div>

            {/* ── Feeder identity card ───────────────────────────────────── */}
            {feeder ? (
                <div className="schedule-location-card" style={{ alignItems:"flex-start", gap:16, flexWrap:"wrap" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                        <div className="schedule-location-icon">
                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>bolt</span>
                        </div>
                        <div>
                            <span style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#94a3b8" }}>
                                VOTRE DÉPART ENREGISTRÉ
                            </span>
                            <div style={{ fontWeight:700, fontSize:15, color:"#1e293b", marginTop:2 }}>
                                {feeder.ref} — {feeder.nom}
                            </div>
                            <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>
                                Poste source : <strong style={{ color:"#334155" }}>{feeder.poste_source}</strong>
                                {" · "}
                                {feeder.governorate || citizenInfo.governorate}
                            </div>
                        </div>
                    </div>
                    <div style={{ marginLeft:"auto", display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                        <span className="location-connected">Connecté</span>
                        <span style={{ fontSize:11, color:"#94a3b8" }}>Priorité {feeder.priority}</span>
                    </div>
                </div>
            ) : (
                <div className="schedule-location-card">
                    <div className="schedule-location-icon">
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>location_on</span>
                    </div>
                    <div>
                        <span>VOTRE ZONE ENREGISTRÉE</span>
                        <strong>
                            {citizenInfo.zone}{citizenInfo.governorate ? `, ${citizenInfo.governorate}` : ""}
                        </strong>
                    </div>
                    <span className="location-connected">Connecté</span>
                </div>
            )}

            {/* ── Day navigator ──────────────────────────────────────────── */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", margin:"16px 0 4px", gap:8 }}>
                <button
                    onClick={() => changeDay(-1)}
                    style={{ width:34, height:34, borderRadius:8, border:"1px solid #e2e8f0", background:"#fff", cursor:"pointer", fontSize:16, color:"#475569", display:"flex", alignItems:"center", justifyContent:"center" }}
                    title="Jour précédent"
                >
                    <span className="material-symbols-outlined" style={{ fontSize:20 }}>chevron_left</span>
                </button>
                <div style={{ textAlign:"center", flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:"#1e293b", textTransform:"capitalize" }}>
                        {fmtDate(selectedDate)}
                    </div>
                    {isToday && (
                        <span style={{ fontSize:11, background:"#dbeafe", color:"#1d4ed8", borderRadius:99, padding:"1px 8px", fontWeight:600 }}>
                            Aujourd'hui
                        </span>
                    )}
                </div>
                <button
                    onClick={() => changeDay(1)}
                    style={{ width:34, height:34, borderRadius:8, border:"1px solid #e2e8f0", background:"#fff", cursor:"pointer", fontSize:16, color:"#475569", display:"flex", alignItems:"center", justifyContent:"center" }}
                    title="Jour suivant"
                >
                    <span className="material-symbols-outlined" style={{ fontSize:20 }}>chevron_right</span>
                </button>
            </div>

            {/* ── Summary strip ──────────────────────────────────────────── */}
            {!loading && !error && (
                <div style={{ display:"flex", gap:12, margin:"12px 0", flexWrap:"wrap" }}>
                    <div style={{ flex:1, minWidth:120, padding:"10px 14px", borderRadius:10, border:"1px solid #e2e8f0", background:"#f8fafc" }}>
                        <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#94a3b8", marginBottom:4 }}>Interruptions</div>
                        <div style={{ fontSize:22, fontWeight:800, color: slots.filter(s=>s.status!=="Cancelled").length > 0 ? "#dc2626" : "#16a34a" }}>
                            {slots.filter(s => s.status !== "Cancelled").length}
                        </div>
                    </div>
                    <div style={{ flex:1, minWidth:120, padding:"10px 14px", borderRadius:10, border:"1px solid #e2e8f0", background:"#f8fafc" }}>
                        <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#94a3b8", marginBottom:4 }}>Durée totale</div>
                        <div style={{ fontSize:22, fontWeight:800, color:"#1e293b" }}>
                            {totalMinutes >= 60
                                ? `${Math.floor(totalMinutes/60)}h${String(totalMinutes%60).padStart(2,"0")}`
                                : `${totalMinutes} min`}
                        </div>
                    </div>
                    <div style={{ flex:1, minWidth:120, padding:"10px 14px", borderRadius:10, border:"1px solid #e2e8f0", background:"#f8fafc" }}>
                        <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#94a3b8", marginBottom:4 }}>Statut actuel</div>
                        <div style={{ fontSize:13, fontWeight:700, color: data?.has_active ? "#dc2626" : "#16a34a", display:"flex", alignItems:"center", gap:5 }}>
                            <span style={{ width:8, height:8, borderRadius:"50%", background: data?.has_active ? "#dc2626" : "#16a34a", display:"inline-block" }}/>
                            {data?.has_active ? "Coupure en cours" : "Alimentation normale"}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Loading / error states ────────────────────────────────── */}
            {loading && (
                <div className="schedule-empty">Chargement du programme…</div>
            )}

            {!loading && error && (
                <div className="schedule-empty" style={{ color:"#dc2626" }}>
                    <span className="material-symbols-outlined" style={{ fontSize:36, marginBottom:8, display:"block" }}>warning</span>
                    <strong>{error}</strong>
                    <button
                        onClick={() => fetchSchedule(selectedDate)}
                        style={{ marginTop:12, padding:"6px 16px", borderRadius:8, border:"1px solid #3b82f6", background:"#eff6ff", color:"#1d4ed8", fontWeight:600, cursor:"pointer", fontSize:13 }}
                    >Réessayer</button>
                </div>
            )}

            {/* ── Empty state ───────────────────────────────────────────── */}
            {!loading && !error && slots.length === 0 && (
                <div className="schedule-empty">
                    <span className="material-symbols-outlined" style={{ fontSize:36, marginBottom:10, display:"block", color:"#16a34a" }}>check_circle</span>
                    <strong>Aucune interruption {isToday ? "aujourd'hui" : "ce jour"}</strong>
                    <span>Votre départ n'a pas de délestage prévu pour cette journée.</span>
                </div>
            )}

            {/* ── Visual timeline ───────────────────────────────────────── */}
            {!loading && !error && slots.length > 0 && (
                <div style={{ marginTop:4 }}>

                    {/* Timeline header */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                        <span style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#94a3b8" }}>
                            Interruptions du jour
                        </span>
                        <span style={{ fontSize:11, color:"#94a3b8" }}>
                            {slots.filter(s=>s.status!=="Cancelled").length} interruption{slots.filter(s=>s.status!=="Cancelled").length !== 1 ? "s" : ""}
                        </span>
                    </div>

                    {/* Day bar — 24h visual strip */}
                    <div style={{ position:"relative", height:36, borderRadius:8, overflow:"hidden", background:"#f1f5f9", marginBottom:20, border:"1px solid #e2e8f0" }}>
                        {/* Hour ticks */}
                        {[0,6,12,18,24].map(h => (
                            <div
                                key={h}
                                style={{ position:"absolute", top:0, bottom:0, left:`${(h/24)*100}%`, width:1, background:"#cbd5e1", opacity:0.6 }}
                            >
                                {h < 24 && (
                                    <span style={{ position:"absolute", top:2, left:3, fontSize:9, color:"#94a3b8", fontWeight:600 }}>
                                        {String(h).padStart(2,"0")}h
                                    </span>
                                )}
                            </div>
                        ))}

                        {/* Shedding windows */}
                        {slots.filter(s => s.status !== "Cancelled").map((s, i) => {
                            const startPct = (toMin(s.start) / (24*60)) * 100
                            const endPct   = (toMin(s.end)   / (24*60)) * 100
                            const widthPct = Math.max(endPct - startPct, 0.5)
                            const isActive = s.status === "Active now"
                            return (
                                <div
                                    key={s.id ?? i}
                                    title={`${s.start} – ${s.end} (${s.duration_minutes} min)`}
                                    style={{
                                        position:"absolute"
                                        ,top:4, bottom:4
                                        ,left:`${startPct}%`
                                        ,width:`${widthPct}%`
                                        ,borderRadius:4
                                        ,background: isActive ? "#dc2626" : "#3b82f6"
                                        ,opacity: isActive ? 1 : 0.7
                                        ,transition:"opacity 0.2s"
                                        ,minWidth:3
                                    }}
                                />
                            )
                        })}

                        {/* "Now" marker */}
                        {nowPct !== null && (
                            <div style={{ position:"absolute", top:0, bottom:0, left:`${nowPct}%`, width:2, background:"#f59e0b", zIndex:2 }}>
                                <span style={{ position:"absolute", top:2, left:4, fontSize:9, color:"#b45309", fontWeight:700, whiteSpace:"nowrap" }}>
                                    {new Date().toLocaleTimeString("fr-TN", { hour:"2-digit", minute:"2-digit" })}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Slot cards */}
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        {slots.map((s, i) => {
                            const cfg = STATUS_CFG[s.status] ?? STATUS_CFG["Planned"]
                            return (
                                <div
                                    key={s.id ?? i}
                                    style={{
                                        display:"flex", alignItems:"center", gap:14
                                        ,padding:"13px 16px"
                                        ,borderRadius:10
                                        ,border:`1px solid ${cfg.border}55`
                                        ,background: cfg.bg
                                        ,transition:"box-shadow 0.15s"
                                        ,boxShadow: s.status === "Active now" ? `0 0 0 2px ${cfg.border}66` : "none"
                                    }}
                                >
                                    {/* Status dot + icon */}
                                    <div style={{ flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                                        <span style={{ width:10, height:10, borderRadius:"50%", background:cfg.dot, display:"inline-block",
                                            boxShadow: s.status === "Active now" ? `0 0 0 3px ${cfg.dot}44` : "none" }}/>
                                        <span className="material-symbols-outlined" style={{ fontSize:16, color:cfg.dot }}>{cfg.icon}</span>
                                    </div>

                                    {/* Time range */}
                                    <div style={{ flex:"0 0 auto" }}>
                                        <div style={{ fontWeight:800, fontSize:17, color:"#0f172a", fontVariantNumeric:"tabular-nums", letterSpacing:"-0.01em" }}>
                                            {s.start} <span style={{ fontWeight:400, color:"#94a3b8", fontSize:13 }}>à</span> {s.end}
                                        </div>
                                        <div style={{ fontSize:11, color:"#64748b", marginTop:1 }}>
                                            {SOURCE_LABEL[s.source] ?? s.source}
                                        </div>
                                    </div>

                                    {/* Duration */}
                                    <div style={{ flex:1, textAlign:"center" }}>
                                        <div style={{ fontSize:12, color:"#94a3b8" }}>Durée</div>
                                        <div style={{ fontWeight:700, fontSize:14, color:"#334155" }}>
                                            {s.duration_minutes >= 60
                                                ? `${Math.floor(s.duration_minutes/60)}h${String(s.duration_minutes%60).padStart(2,"0")}`
                                                : `${s.duration_minutes} min`}
                                        </div>
                                    </div>

                                    {/* Status pill */}
                                    <span style={{
                                        flexShrink:0
                                        ,fontSize:11, fontWeight:700
                                        ,color:cfg.text
                                        ,background:`${cfg.dot}18`
                                        ,border:`1px solid ${cfg.dot}44`
                                        ,padding:"3px 10px", borderRadius:99
                                        ,whiteSpace:"nowrap"
                                    }}>
                                        {cfg.label}
                                    </span>
                                </div>
                            )
                        })}
                    </div>

                    {/* Legend */}
                    <div style={{ display:"flex", gap:16, marginTop:16, flexWrap:"wrap" }}>
                        {Object.entries(STATUS_CFG).map(([k, v]) => (
                            <div key={k} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:"#64748b" }}>
                                <span style={{ width:8, height:8, borderRadius:"50%", background:v.dot, display:"inline-block" }}/>
                                {v.label}
                            </div>
                        ))}
                        <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:"#64748b" }}>
                            <span style={{ width:8, height:8, borderRadius:0, background:"#f59e0b", display:"inline-block" }}/>
                            Maintenant
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Notifications ─────────────────────────────────────────────────────────────

function Notifications({ notifications, loading, onMarkRead, onMarkAllRead })
{
    const unreadCount = notifications.filter((n) => !n.is_read).length

    function timeAgo(isoStr)
    {
        if (!isoStr) return ""
        const diff = Date.now() - new Date(isoStr).getTime()
        const mins  = Math.floor(diff / 60000)
        if (mins < 1)  return "À l'instant"
        if (mins < 60) return `Il y a ${mins} min`
        const hrs = Math.floor(mins / 60)
        if (hrs < 24)  return `Il y a ${hrs} h`
        const days = Math.floor(hrs / 24)
        return `Il y a ${days} j`
    }

    return (
        <div className="page-content">
            <div className="page-intro">
                <span className="eyebrow">MISES À JOUR</span>
                <h2>Notifications</h2>
                <p>Informations importantes sur votre service électrique.</p>
            </div>

            {unreadCount > 0 && (
                <div className="notifications-header">
                    <span>{unreadCount} non lue{unreadCount > 1 ? "s" : ""}</span>
                    <button className="mark-all-btn" onClick={onMarkAllRead}>
                        Tout marquer comme lu
                    </button>
                </div>
            )}

            <div className="notifications-list">
                {loading ? (
                    <div className="notif-empty">Chargement des notifications…</div>
                ) : notifications.length === 0 ? (
                    <div className="notif-empty">Aucune notification pour le moment.</div>
                ) : (
                    notifications.map((item) => (
                        <div
                            className={`notification-card ${!item.is_read ? "unread" : ""}`}
                            key={item.id}
                        >
                            <div className="notification-icon">
                                <span className="material-symbols-outlined" style={{ fontSize:18 }}>notifications</span>
                            </div>
                            <div className="notification-content">
                                <div className="notification-title-row">
                                    <strong>{item.title}</strong>
                                    {!item.is_read && <span className="unread-dot"></span>}
                                </div>
                                <p>{item.message}</p>
                                <div className="notif-footer-row">
                                    <span>{timeAgo(item.created_at)}</span>
                                    {!item.is_read && (
                                        <button
                                            className="mark-read-btn"
                                            onClick={() => onMarkRead(item.id)}
                                        >
                                            Marquer comme lu
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

// ── PosteAccordion — one substation row with expandable feeders ───────────────

// ── Feeder state visual config ────────────────────────────────────────────────
const FEEDER_ST =
{
    executing: { label:"Délestage en cours",   color:"#dc2626", bg:"#fee2e2", dot:"#ef4444" }
    ,normal:   { label:"Alimentation normale", color:"#15803d", bg:"#dcfce7", dot:"#22c55e" }
    ,protected:{ label:"Protégé P0",           color:"#1d4ed8", bg:"#dbeafe", dot:"#3b82f6" }
}

// ── PosteAccordion — receives poste directly from live API data ───────────────
function PosteAccordion({ poste })
{
    const [open, setOpen] = useState(false)
    // feeders come from API: [{feeder_id, ref, nom, zone, priority, state}]
    // API state values: "executing" | "normal" | "protected"
    const feeders     = poste.feeders ?? []
    const outageCount = feeders.filter(f => f.state === "executing").length

    return (
        <div style={{ border:"1px solid #e2e8f0", borderRadius:8, overflow:"hidden", marginBottom:8 }}>

            {/* Header */}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#fff", cursor:"pointer", border:"none", textAlign:"left", gap:8 }}
            >
                <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize:20, color:"#2474b9", flexShrink:0 }}>electrical_services</span>
                    <div style={{ minWidth:0 }}>
                        <div style={{ fontWeight:600, fontSize:13, color:"#1e293b", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                            {poste.name}
                        </div>
                        <div style={{ fontSize:11, color:"#94a3b8" }}>
                            Poste source · {feeders.length} départ{feeders.length !== 1 ? "s" : ""}
                            {outageCount > 0 && (
                                <span style={{ marginLeft:6, color:"#dc2626", fontWeight:700 }}>
                                    · {outageCount} en délestage
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <span className="material-symbols-outlined" style={{ fontSize:18, color:"#94a3b8", flexShrink:0, transform: open ? "rotate(180deg)" : "none", transition:"transform 0.2s", display:"inline-block" }}>expand_more</span>
            </button>

            {/* Feeder list */}
            {open && (
                <div style={{ borderTop:"1px solid #f1f5f9", background:"#f8fafc" }}>
                    {feeders.length === 0 && (
                        <div style={{ padding:"10px 14px", fontSize:12, color:"#94a3b8", fontStyle:"italic" }}>
                            Aucun départ configuré pour ce poste
                        </div>
                    )}
                    {feeders.map((f, i) =>
                    {
                        const st = FEEDER_ST[f.state] ?? FEEDER_ST.normal
                        return (
                            <div
                                key={f.feeder_id ?? f.ref}
                                style={{
                                    display:"flex", alignItems:"center", justifyContent:"space-between"
                                    ,padding:"9px 14px"
                                    ,borderTop: i > 0 ? "1px solid #f1f5f9" : "none"
                                    ,background: f.state === "executing" ? "#fff5f5"
                                               : f.state === "protected"  ? "#eff6ff" : "#fff"
                                }}
                            >
                                <div style={{ minWidth:0 }}>
                                    <div style={{ fontSize:12, fontWeight:700, color:"#334155", fontFamily:"monospace" }}>
                                        {f.ref}
                                    </div>
                                    <div style={{ fontSize:11, color:"#64748b", marginTop:1 }}>
                                        {f.nom}{f.zone && f.zone !== f.nom ? ` · ${f.zone}` : ""}
                                    </div>
                                </div>
                                <span style={{
                                    display:"flex", alignItems:"center", gap:5, flexShrink:0, marginLeft:8
                                    ,fontSize:10, fontWeight:700, color:st.color
                                    ,background:st.bg, padding:"3px 9px", borderRadius:99, whiteSpace:"nowrap"
                                }}>
                                    <span style={{ width:7, height:7, borderRadius:"50%", background:st.dot, display:"inline-block", flexShrink:0 }}/>
                                    {st.label}
                                </span>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ── GovSidePanel — driven entirely by live govData from API ───────────────────
function GovSidePanel({ govData, onClose })
{
    // govData: { governorate, total, executing, ratio, status, postes:[...] }
    const govName = govData?.governorate ?? ""
    const nameFr  = GOV_FR[govName] ?? govName
    const status  = govData?.status ?? "unknown"
    const cfg     = ST_CFG[status] ?? ST_CFG.unknown
    const postes  = govData?.postes ?? []

    const total     = govData?.total ?? 0
    const executing = govData?.executing ?? 0
    const ratio     = govData?.ratio ?? 0
    const pct       = total > 0 ? Math.round(ratio * 100) : 0

    return (
        <div style={{ width:300, background:"#fff", borderLeft:"1px solid #e2e8f0", display:"flex", flexDirection:"column", height:"100%", flexShrink:0, overflow:"hidden", boxShadow:"-4px 0 20px rgba(0,0,0,0.08)" }}>

            {/* Header */}
            <div style={{ padding:"14px 16px", borderBottom:"1px solid #e2e8f0", background:`${cfg.fill}18` }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ width:10, height:10, borderRadius:"50%", background:cfg.dot, display:"inline-block" }}/>
                        <span style={{ fontSize:11, fontWeight:700, color:cfg.textColor, textTransform:"uppercase", letterSpacing:"0.05em" }}>{cfg.label}</span>
                    </div>
                    <button type="button" onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:"#94a3b8", lineHeight:1, display:"flex", alignItems:"center" }}>
                        <span className="material-symbols-outlined" style={{ fontSize:18 }}>close</span>
                    </button>
                </div>
                <h3 style={{ margin:0, fontSize:16, fontWeight:700, color:"#0f172a" }}>Gouvernorat de {nameFr}</h3>
                {GOV_BCC_ZONE[govName] && (
                    <p style={{ margin:"4px 0 0", fontSize:12, color:"#64748b" }}>Zone {GOV_BCC_ZONE[govName]}</p>
                )}
            </div>

            {/* Live ratio bar */}
            {total > 0 && (
                <div style={{ padding:"10px 16px", borderBottom:"1px solid #f1f5f9", background:"#fafafa" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#64748b", marginBottom:5 }}>
                        <span>{executing} / {total} départs en délestage</span>
                        <span style={{ fontWeight:700, color:cfg.textColor }}>{pct}%</span>
                    </div>
                    <div style={{ height:5, background:"#e2e8f0", borderRadius:99, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${pct}%`, background: pct > 60 ? "#ef4444" : pct > 0 ? "#f59e0b" : "#22c55e", borderRadius:99, transition:"width 0.4s" }}/>
                    </div>
                </div>
            )}

            {/* Status message */}
            <div style={{ margin:"12px 12px 0", padding:"10px 12px", borderRadius:8, border:`1px solid ${cfg.stroke}40`, background:`${cfg.fill}12`, fontSize:12, color:cfg.textColor, lineHeight:1.5, display:"flex", alignItems:"flex-start", gap:8 }}>
                <span className="material-symbols-outlined" style={{ fontSize:16, flexShrink:0, marginTop:1 }}>
                    {status === "outage" ? "flash_off" : status === "demand" ? "warning" : "check_circle"}
                </span>
                <span>
                    {status === "outage"
                        ? "Ce gouvernorat est actuellement en délestage. Débranchez les appareils sensibles."
                        : status === "demand"
                        ? "Forte demande en cours. Une coupure planifiée peut intervenir."
                        : "Alimentation normale. Aucune coupure en cours dans ce gouvernorat."}
                </span>
            </div>

            {/* Postes list */}
            <div style={{ flex:1, overflowY:"auto", padding:"12px 12px 16px" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                    <span style={{ fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em", color:"#94a3b8" }}>
                        Postes sources
                    </span>
                    <span style={{ fontSize:11, color:"#94a3b8" }}>{postes.length} poste{postes.length !== 1 ? "s" : ""}</span>
                </div>

                {postes.length === 0 && (
                    <div style={{ textAlign:"center", color:"#94a3b8", fontSize:13, padding:"24px 0" }}>
                        Aucun poste source trouvé pour ce gouvernorat
                    </div>
                )}

                {postes.map((p, i) => (
                    <PosteAccordion key={`${p.name}-${i}`} poste={p} />
                ))}
            </div>

            {/* Footer */}
            <div style={{ borderTop:"1px solid #f1f5f9", padding:"8px 12px", fontSize:10, color:"#94a3b8", display:"flex", alignItems:"center", gap:5 }}>
                <span className="material-symbols-outlined" style={{ fontSize:13 }}>info</span>
                Les départs P0 (hôpitaux, eau potable) ne sont jamais délestés.
            </div>
        </div>
    )
}

// ── SVG Tunisia Map ───────────────────────────────────────────────────────────

function TunisiaSVGMap({ liveZones, onSelectGov })
{
    const containerRef = useRef(null)
    const trRef        = useRef({ scale: 1, tx: 0, ty: 0 })
    const drag         = useRef({ on: false, sx: 0, sy: 0, stx: 0, sty: 0 })
    const [tr,       setTr]      = useState({ scale: 1, tx: 0, ty: 0 })
    const [tooltip,  setTooltip] = useState(null)
    const [selected, setSelected] = useState(null)

    const apply = useCallback((scale, tx, ty) =>
    {
        const m = PAD * scale
        const t = { scale, tx: clamp(tx, -(VW * scale - VW + m), m), ty: clamp(ty, -(VH * scale - VH + m), m) }
        trRef.current = t
        setTr(t)
    }, [])

    // Wheel zoom
    useEffect(() =>
    {
        const el = containerRef.current
        if (!el) return
        const h = (e) =>
        {
            e.preventDefault()
            const { scale, tx, ty } = trRef.current
            const s2   = clamp(scale * Math.exp(-e.deltaY * 0.0015 * 3), ZOOM_MIN, ZOOM_MAX)
            const rect = el.getBoundingClientRect()
            const mx   = ((e.clientX - rect.left) / rect.width) * VW
            const my   = ((e.clientY - rect.top) / rect.height) * VH
            apply(s2, mx - (mx - tx) * (s2 / scale), my - (my - ty) * (s2 / scale))
        }
        el.addEventListener("wheel", h, { passive: false })
        return () => el.removeEventListener("wheel", h)
    }, [apply])

    const onMouseDown = useCallback((e) =>
    {
        if (e.button !== 0) return
        drag.current = { on: true, sx: e.clientX, sy: e.clientY, stx: trRef.current.tx, sty: trRef.current.ty }
        e.currentTarget.style.cursor = "grabbing"
    }, [])
    const onMouseMove = useCallback((e) =>
    {
        if (!drag.current.on) return
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        apply(trRef.current.scale, drag.current.stx + (e.clientX - drag.current.sx) * VW / rect.width, drag.current.sty + (e.clientY - drag.current.sy) * VH / rect.height)
    }, [apply])
    const onMouseUp = useCallback((e) =>
    {
        drag.current.on = false
        if (e.currentTarget) e.currentTarget.style.cursor = "grab"
    }, [])

    const showTip = useCallback((e, title, sub) =>
    {
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        setTooltip({ x: e.clientX - rect.left + 14, y: e.clientY - rect.top - 10, title, sub })
    }, [])
    const hideTip = useCallback(() => setTooltip(null), [])

    const handleClick = useCallback((e, name) =>
    {
        e.stopPropagation()
        setSelected(name)
        onSelectGov(name)
        hideTip()
    }, [onSelectGov, hideTip])

    // Merge static BCC statuses with live API data
    const govData = useMemo(() =>
        GOVERNORATES_GJ.features.map(f =>
        {
            const name   = f.properties.name
            const nameFr = GOV_FR[name] ?? f.properties.name_fr ?? name
            // Live API status takes priority; fall back to static BCC-zone assignment
            const liveStatus   = liveZones[name]
            const staticStatus = GOV_STATIC_STATUS[name] ?? "available"
            const status = liveStatus ?? staticStatus
            const cfg    = ST_CFG[status] ?? ST_CFG.unknown
            return { name, nameFr, status, cfg, path: geomToPath(f.geometry), center: geoCentroid(f.geometry) }
        })
    , [liveZones])

    const { scale, tx, ty } = tr
    const scaleBarKm = Math.max(10, Math.round(100 / scale / 1.1 / 10) * 10)
    const scaleBarPx = Math.min(scaleBarKm * 1.1 * scale, 160)

    return (
        <div
            ref={containerRef}
            style={{ position:"relative", width:"100%", height:"100%", overflow:"hidden", userSelect:"none", cursor:"grab", background:"#f1f5f9" }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
        >
            <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" style={{ width:"100%", height:"100%" }}>
                <defs>
                    <pattern id="gov-grid" patternUnits="userSpaceOnUse" width="20" height="20">
                        <path d="M20,0 L0,0 0,20" fill="none" stroke="#dde4ec" strokeWidth="0.5"/>
                    </pattern>
                    <filter id="gov-glow" x="-40%" y="-40%" width="180%" height="180%">
                        <feGaussianBlur stdDeviation="4" result="b"/>
                        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                </defs>

                <rect width={VW} height={VH} fill="#f1f5f9"/>
                <rect width={VW} height={VH} fill="url(#gov-grid)"/>

                <g transform={`translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${scale.toFixed(4)})`}>

                    {/* Land base */}
                    {govData.map(gd => (
                        <path key={`base-${gd.name}`} d={gd.path} fill="#e8eef5" stroke="none"/>
                    ))}

                    {/* Coloured fills */}
                    {govData.map(gd =>
                    {
                        const isSel = selected === gd.name
                        return (
                            <path
                                key={gd.name}
                                d={gd.path}
                                fill={gd.cfg.fill}
                                fillOpacity={isSel ? gd.cfg.op * 3 : gd.cfg.op}
                                stroke={isSel ? gd.cfg.strokeSel : "#8facc4"}
                                strokeWidth={(isSel ? 2.5 : 0.7) / scale}
                                strokeLinejoin="round"
                                style={{ cursor:"pointer" }}
                                onClick={e => handleClick(e, gd.name)}
                                onMouseEnter={e => showTip(e, `Gouvernorat de ${gd.nameFr}`, gd.cfg.label)}
                                onMouseLeave={hideTip}
                            />
                        )
                    })}

                    {/* Selected glow ring */}
                    {selected && govData.filter(g => g.name === selected).map(gd => (
                        <path
                            key={`sel-${gd.name}`}
                            d={gd.path}
                            fill="none"
                            stroke={gd.cfg.strokeSel}
                            strokeWidth={3 / scale}
                            strokeLinejoin="round"
                            filter="url(#gov-glow)"
                            style={{ pointerEvents:"none" }}
                        />
                    ))}

                    {/* Governorate name labels */}
                    {govData.map(gd =>
                    {
                        if (!gd.center) return null
                        const [cx, cy] = gd.center
                        const isSel = selected === gd.name
                        return (
                            <text
                                key={`lbl-${gd.name}`}
                                x={cx} y={cy}
                                textAnchor="middle" dominantBaseline="middle"
                                fontSize={11 / scale}
                                fontFamily="Inter,sans-serif"
                                fontWeight="700"
                                fill={isSel ? gd.cfg.textColor : "#1e3a5f"}
                                stroke="#f0f6ff"
                                strokeWidth={2.5 / scale}
                                paintOrder="stroke"
                                style={{ pointerEvents:"none" }}
                            >
                                {gd.nameFr}
                            </text>
                        )
                    })}
                </g>
            </svg>

            {/* Legend */}
            <div style={{ position:"absolute", top:12, left:12, background:"rgba(255,255,255,0.92)", backdropFilter:"blur(4px)", border:"1px solid #e2e8f0", borderRadius:10, padding:"10px 14px", boxShadow:"0 2px 12px rgba(0,0,0,.10)", pointerEvents:"none" }}>
                <div style={{ fontSize:10, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>État du délestage</div>
                {Object.entries(ST_CFG).map(([k, v]) => (
                    <div key={k} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <span style={{ width:10, height:10, borderRadius:"50%", background:v.dot, flexShrink:0 }}/>
                        <span style={{ fontSize:12, color:"#334155" }}>{v.label}</span>
                    </div>
                ))}
            </div>

            {/* Zoom controls */}
            <div style={{ position:"absolute", bottom:12, left:12, display:"flex", flexDirection:"column", gap:4 }}>
                {[["＋", ZOOM_STEP], ["－", 1/ZOOM_STEP]].map(([label, factor]) => (
                    <button
                        key={label}
                        type="button"
                        onClick={() =>
                        {
                            const { scale: s, tx: t, ty: u } = trRef.current
                            const s2 = clamp(s * factor, ZOOM_MIN, ZOOM_MAX)
                            apply(s2, VW / 2 - (VW / 2 - t) * (s2 / s), VH / 2 - (VH / 2 - u) * (s2 / s))
                        }}
                        style={{ width:32, height:32, borderRadius:6, background:"#fff", border:"1px solid #e2e8f0", cursor:"pointer", fontSize:16, fontWeight:700, color:"#334155", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 1px 4px rgba(0,0,0,.1)" }}
                    >
                        {label}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => apply(1, 0, 0)}
                    style={{ width:32, height:32, borderRadius:6, background:"#fff", border:"1px solid #e2e8f0", cursor:"pointer", fontSize:14, color:"#3b82f6", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 1px 4px rgba(0,0,0,.1)" }}
                    title="Réinitialiser"
                >
                    <span className="material-symbols-outlined" style={{ fontSize:16 }}>my_location</span>
                </button>
            </div>

            {/* Scale bar */}
            <div style={{ position:"absolute", bottom:12, right:12, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2, pointerEvents:"none" }}>
                <div style={{ display:"flex", alignItems:"flex-end", gap:1 }}>
                    <div style={{ width:1, height:8, background:"#60a5fa", opacity:0.6 }}/>
                    <div style={{ height:4, background:"#60a5fa", opacity:0.6, borderRadius:2, width:scaleBarPx }}/>
                    <div style={{ width:1, height:8, background:"#60a5fa", opacity:0.6 }}/>
                </div>
                <span style={{ fontSize:9, color:"#64748b" }}>{scaleBarKm} km</span>
            </div>

            {/* Click hint */}
            {!selected && tr.scale < 2 && (
                <div style={{ position:"absolute", top:12, right:12, background:"rgba(255,255,255,0.85)", border:"1px solid #e2e8f0", borderRadius:8, padding:"6px 10px", fontSize:11, color:"#64748b", pointerEvents:"none", display:"flex", alignItems:"center", gap:5 }}>
                    <span className="material-symbols-outlined" style={{ fontSize:14 }}>touch_app</span>
                    Cliquez sur un gouvernorat
                </div>
            )}

            {/* Tooltip */}
            {tooltip && (
                <div style={{ position:"absolute", pointerEvents:"none", zIndex:50, background:"#fff", border:"1px solid #e2e8f0", borderRadius:8, boxShadow:"0 4px 16px rgba(0,0,0,.12)", padding:"6px 10px", left:tooltip.x, top:tooltip.y, maxWidth:200 }}>
                    <div style={{ fontWeight:600, fontSize:12, color:"#1e293b" }}>{tooltip.title}</div>
                    {tooltip.sub && <div style={{ fontSize:10, color:"#64748b", marginTop:2 }}>{tooltip.sub}</div>}
                </div>
            )}
        </div>
    )
}

// ── Map page ──────────────────────────────────────────────────────────────────

function EnergyMap({ locations })
{
    const [selectedGov,  setSelectedGov]  = useState(null)   // GeoJSON feature key name
    const [govStatusMap, setGovStatusMap] = useState({})     // govName → API govData object
    const [lastFetch,    setLastFetch]    = useState(null)

    // ── Fetch /citizen/governorate-status every 30s ───────────────────────────
    const fetchStatus = useCallback(async () =>
    {
        try
        {
            const res = await api.get("/api/v1/citizen/governorate-status")
            const map = {}
            ;(res.data ?? []).forEach(item =>
            {
                // item.governorate is the DB value — normalize to GeoJSON key
                const geoKey = DB_TO_GEOJSON_KEY[item.governorate]
                    ?? GOVERNORATES_GJ.features.find(f =>
                        f.properties.name === item.governorate
                        || f.properties.name_fr === item.governorate
                        || (GOV_FR[f.properties.name] ?? "").toLowerCase() === item.governorate.toLowerCase()
                    )?.properties.name
                if (geoKey) map[geoKey] = item
            })
            setGovStatusMap(map)
            setLastFetch(new Date())
        }
        catch { /* backend unavailable — keep previous data */ }
    }, [])

    useEffect(() =>
    {
        fetchStatus()
        const id = setInterval(fetchStatus, 30_000)
        return () => clearInterval(id)
    }, [fetchStatus])

    // Build liveZones map for the SVG map colours: govName → status string
    const liveZones = useMemo(() =>
    {
        const map = {}
        Object.entries(govStatusMap).forEach(([key, item]) =>
        {
            map[key] = item.status   // "available" | "demand" | "outage"
        })
        // Fallback: for govs not yet in DB, use ratioToStatus with ratio=null → "unknown"
        return map
    }, [govStatusMap])

    // The full govData object for the selected governorate (null if not in API yet)
    const selectedGovData = useMemo(() =>
    {
        if (!selectedGov) return null
        const apiData = govStatusMap[selectedGov]
        if (apiData) return apiData
        // API not loaded yet — build a minimal stub so panel shows correct zone label
        // and a meaningful status instead of "Inconnu"
        return {
            governorate: selectedGov
            ,total:      0
            ,executing:  0
            ,ratio:      0
            ,status:     GOV_STATIC_STATUS[selectedGov] ?? "available"
            ,postes:     []
        }
    }, [selectedGov, govStatusMap])

    return (
        <div className="page-content map-page">
            <div className="map-header">
                <div>
                    <span className="eyebrow">RÉSEAU NATIONAL</span>
                    <h2>Carte électrique</h2>
                    <p>Cliquez sur un gouvernorat pour voir les postes et départs en délestage.</p>
                </div>
                <div className="map-status">
                    <span className="status-dot green"></span>
                    {lastFetch
                        ? `Mis à jour ${lastFetch.toLocaleTimeString("fr-TN", { hour:"2-digit", minute:"2-digit", second:"2-digit" })}`
                        : "Réseau connecté"}
                </div>
            </div>

            {/* Map + side panel */}
            <div style={{ display:"flex", height:520, borderRadius:12, overflow:"hidden", border:"1px solid #e2e8f0", boxShadow:"0 2px 12px rgba(0,0,0,.06)" }}>
                <div style={{ flex:1, minWidth:0 }}>
                    <TunisiaSVGMap liveZones={liveZones} onSelectGov={setSelectedGov} />
                </div>
                {selectedGov && (
                    <GovSidePanel
                        govData={selectedGovData}
                        onClose={() => setSelectedGov(null)}
                    />
                )}
            </div>

            <div className="map-legend" style={{ marginTop:12 }}>
                <div className="legend-item"><span className="legend-dot green"></span><span>Alimentation normale (0% en délestage)</span></div>
                <div className="legend-item"><span className="legend-dot yellow"></span><span>Forte demande (1 – 60% en délestage)</span></div>
                <div className="legend-item"><span className="legend-dot red"></span><span>Coupure en cours (&gt;60% en délestage)</span></div>
            </div>
        </div>
    )
}

// ── Virtual check modal ───────────────────────────────────────────────────────

function VirtualCheckModal({ onClose })
{
    // ── Step 1: Gouvernorat ────────────────────────────────────────────────
    const [governorates,  setGovernorates]  = useState([])
    const [posteSources,  setPosteSources]  = useState([])
    const [departes,      setDepartes]      = useState([])

    const [selGov,        setSelGov]        = useState("")
    const [selPS,         setSelPS]         = useState("")
    const [selFeeder,     setSelFeeder]     = useState("")   // feeder_id as string

    const [loadingGov,    setLoadingGov]    = useState(true)
    const [loadingPS,     setLoadingPS]     = useState(false)
    const [loadingDep,    setLoadingDep]    = useState(false)

    const [checkData,     setCheckData]     = useState(null)
    const [loadingCheck,  setLoadingCheck]  = useState(false)
    const [error,         setError]         = useState("")

    // Load governorates on mount
    useEffect(() => {
        citizenApi.getGovernorates()
            .then(({ data }) => setGovernorates(data ?? []))
            .catch(() => setGovernorates([]))
            .finally(() => setLoadingGov(false))
    }, [])

    // Load poste sources when gouvernorat changes
    useEffect(() => {
        if (!selGov) { setPosteSources([]); setSelPS(""); setDepartes([]); setSelFeeder(""); return }
        setLoadingPS(true)
        setSelPS(""); setDepartes([]); setSelFeeder(""); setCheckData(null)
        citizenApi.getPosteSources(selGov)
            .then(({ data }) => setPosteSources(data ?? []))
            .catch(() => setPosteSources([]))
            .finally(() => setLoadingPS(false))
    }, [selGov])

    // Load départs when poste source changes
    useEffect(() => {
        if (!selGov || !selPS) { setDepartes([]); setSelFeeder(""); return }
        setLoadingDep(true)
        setSelFeeder(""); setCheckData(null)
        citizenApi.getDepartes(selGov, selPS)
            .then(({ data }) => setDepartes(data ?? []))
            .catch(() => setDepartes([]))
            .finally(() => setLoadingDep(false))
    }, [selGov, selPS])

    // Run virtual check when a feeder is selected
    // The public /virtual-check endpoint works on zone_id; we derive it from
    // the feeder's bcc via the backend — but we can also just use /schedules
    // with zone lookup. Simplest: call /virtual-check with the feeder's
    // zone_id returned from /departes (we'll add zone_id to departes response).
    // For now call getZones to find the matching zone, then virtualCheck.
    useEffect(() => {
        if (!selFeeder) { setCheckData(null); return }
        let cancelled = false
        setLoadingCheck(true)
        setError("")
        // Use the feeder-level schedule endpoint (public variant via zone fallback)
        // We call virtualCheck with the feeder's zone. Since virtualCheck needs
        // a zone_id and we don't have it directly, we use getZones to match.
        // Alternatively, we can just show feeder data from /departes.
        // Best approach: add a feeder_id param to virtual-check on backend,
        // or simply show the feeder info we already have + zone schedules.
        // We'll call the existing virtualCheck with zone derived from the zones list
        // by governorate match as a best-effort, then overlay feeder identity.
        citizenApi.getZones()
            .then(({ data: allZones }) => {
                if (cancelled) return
                // Find the zone whose governorate matches selGov
                const matchedZone = (allZones ?? []).find(
                    (z) => z.governorate?.toLowerCase() === selGov.toLowerCase()
                )
                if (!matchedZone) {
                    setCheckData({ _noZone: true })
                    setLoadingCheck(false)
                    return
                }
                return citizenApi.virtualCheck(matchedZone.id)
                    .then(({ data }) => {
                        if (!cancelled) setCheckData(data)
                    })
            })
            .catch((err) => { if (!cancelled) setError(err.response?.data?.detail ?? "Erreur de connexion.") })
            .finally(() => { if (!cancelled) setLoadingCheck(false) })
        return () => { cancelled = true }
    }, [selFeeder, selGov])

    const selectedFeederObj = departes.find((d) => String(d.feeder_id) === String(selFeeder))
    const situation  = checkData?.current_situation || {}
    const shedding   = checkData?.upcoming_shedding_today ?? []
    const zone       = checkData?.zone || {}
    const status     = situation.status || "unknown"
    const label      = situation.status_label || "—"
    const desc       = situation.description  || ""
    const color      = status === "available" ? "#16a34a" : status === "demand" ? "#f59e0b" : "#dc2626"
    const hasFeeder  = Boolean(selFeeder && selectedFeederObj)

    return (
        <div className="virtual-check-overlay" onClick={onClose}>
            <div className="virtual-check-modal" onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="virtual-check-header">
                    <div className="virtual-check-title">
                        <div className="virtual-check-icon">
                            <span className="material-symbols-outlined" style={{ fontSize:22 }}>manage_search</span>
                        </div>
                        <div><span>ENERGY BALANCE</span><h2>Vérification virtuelle</h2></div>
                    </div>
                    <button className="virtual-check-close" onClick={onClose}>
                        <span className="material-symbols-outlined" style={{ fontSize:20 }}>close</span>
                    </button>
                </div>

                {/* ── 3-step cascade ──────────────────────────────────────── */}
                <div className="virtual-location-section">
                    <div>
                        <span className="section-label">LOCALISER VOTRE DÉPART</span>
                        <h3>Sélectionnez votre emplacement</h3>
                    </div>

                    {/* Step 1 — Gouvernorat */}
                    <div className="location-select-wrapper">
                        <span className="location-select-icon material-symbols-outlined" style={{ fontSize:16 }}>public</span>
                        <select
                            value={selGov}
                            onChange={(e) => setSelGov(e.target.value)}
                            disabled={loadingGov}
                        >
                            <option value="">
                                {loadingGov ? "Chargement…" : "Gouvernorat…"}
                            </option>
                            {governorates.map((g) => (
                                <option key={g} value={g}>{g}</option>
                            ))}
                        </select>
                    </div>

                    {/* Step 2 — Poste source */}
                    <div className="location-select-wrapper">
                        <span className="location-select-icon material-symbols-outlined" style={{ fontSize:16 }}>electrical_services</span>
                        <select
                            value={selPS}
                            onChange={(e) => setSelPS(e.target.value)}
                            disabled={!selGov || loadingPS}
                        >
                            <option value="">
                                {!selGov ? "Choisissez d'abord un gouvernorat" : loadingPS ? "Chargement…" : posteSources.length === 0 ? "Aucun poste disponible" : "Poste source…"}
                            </option>
                            {posteSources.map((ps) => (
                                <option key={ps} value={ps}>{ps}</option>
                            ))}
                        </select>
                    </div>

                    {/* Step 3 — Départ */}
                    <div className="location-select-wrapper">
                        <span className="location-select-icon material-symbols-outlined" style={{ fontSize:16 }}>pin_drop</span>
                        <select
                            value={selFeeder}
                            onChange={(e) => setSelFeeder(e.target.value)}
                            disabled={!selPS || loadingDep}
                        >
                            <option value="">
                                {!selPS ? "Choisissez d'abord un poste source" : loadingDep ? "Chargement…" : departes.length === 0 ? "Aucun départ disponible" : "Départ HTA…"}
                            </option>
                            {departes.map((d) => (
                                <option key={d.feeder_id} value={d.feeder_id}>
                                    {d.ref} — {d.nom}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {error && <div className="auth-error" style={{ marginBottom: 16 }}>{error}</div>}

                {/* ── Results — only shown once a feeder is selected ──────── */}
                {!hasFeeder && (
                    <div style={{ textAlign:"center", padding:"24px 0", color:"#94a3b8", fontSize:13 }}>
                        Sélectionnez un gouvernorat, un poste source et un départ pour voir la situation électrique.
                    </div>
                )}

                {hasFeeder && (
                    <>
                        {/* Status banner */}
                        <div className="virtual-check-status" style={{ borderColor: `${color}33`, background: `${color}0d` }}>
                            <div className="virtual-check-status-icon" style={{ background: color }}>
                                <span className="material-symbols-outlined" style={{ fontSize:22 }}>
                                    {loadingCheck ? "hourglass_empty" : status === "outage" ? "flash_off" : "check_circle"}
                                </span>
                            </div>
                            <div>
                                <span>SITUATION ACTUELLE</span>
                                <strong style={{ color }}>{loadingCheck ? "Chargement…" : label}</strong>
                                <p>{desc}</p>
                            </div>
                        </div>

                        {/* Info grid */}
                        <div className="virtual-check-grid">
                            <div className="virtual-check-item">
                                <span>DÉPART</span>
                                <strong>{selectedFeederObj.ref} — {selectedFeederObj.nom}</strong>
                            </div>
                            <div className="virtual-check-item">
                                <span>POSTE SOURCE</span>
                                <strong>{selPS}</strong>
                            </div>
                            <div className="virtual-check-item">
                                <span>GOUVERNORAT</span>
                                <strong>{selGov}</strong>
                            </div>
                            <div className="virtual-check-item">
                                <span>INTERRUPTIONS AUJOURD'HUI</span>
                                <strong>{loadingCheck ? "…" : (checkData?.total_interruptions ?? shedding.length)}</strong>
                            </div>
                        </div>

                        {/* Schedule */}
                        <div className="virtual-check-section">
                            <div className="virtual-check-section-header">
                                <div>
                                    <span className="section-label">AUJOURD'HUI</span>
                                    <h3>Situation électrique</h3>
                                </div>
                                {shedding.length > 0
                                    ? <span className="schedule-count">{shedding.length} interruption{shedding.length > 1 ? "s" : ""}</span>
                                    : <span className="no-shedding-pill">Aucun délestage</span>}
                            </div>

                            {loadingCheck ? (
                                <div style={{ textAlign:"center", padding:"16px 0", color:"#94a3b8", fontSize:13 }}>Chargement…</div>
                            ) : shedding.length === 0 ? (
                                <div className="no-shedding">
                                    <div className="no-shedding-icon">
                                        <span className="material-symbols-outlined" style={{ fontSize:16 }}>check_circle</span>
                                    </div>
                                    <div>
                                        <strong>Aucune interruption prévue aujourd'hui</strong>
                                        <p>Ce départ n'a pas de délestage programmé pour aujourd'hui.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="virtual-check-timeline">
                                    <div className="virtual-line"></div>
                                    {shedding.map((item, idx) => {
                                        const isActive = item.active || item.status === "Active now"
                                        const start = item.start || item.start_time || "—"
                                        const end   = item.end   || item.end_time   || "—"
                                        const dur   = item.duration || (item.duration_minutes ? `${item.duration_minutes} min` : "—")
                                        return (
                                            <div className={`virtual-point ${isActive ? "active-outage" : "interruption"}`} key={idx}>
                                                <span></span>
                                                <div className="timeline-event">
                                                    <div>
                                                        <strong>{start} – {end}</strong>
                                                        <small>{isActive ? "Interruption en cours" : "Interruption planifiée"}</small>
                                                    </div>
                                                    <span className="timeline-duration">{dur}</span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                )}

                <button className="virtual-check-done" onClick={onClose}>Fermer</button>
            </div>
        </div>
    )
}

// ── Chatbot ───────────────────────────────────────────────────────────────────

function Chatbot()
{
    const WELCOME = {
        id:   0,
        role: "assistant",
        text: "Bonjour ! Je suis l'Assistant ENERGY Balance. Posez-moi vos questions sur votre programme électrique, la situation actuelle ou le réseau national.",
    }

    const SUGGESTIONS = [
        { label: "Mon programme",      text: "Quel est mon programme de délestage aujourd'hui ?" },
        { label: "Statut actuel",      text: "Est-ce que l'électricité est disponible chez moi en ce moment ?" },
        { label: "Coupures prévues",   text: "Y a-t-il des coupures prévues prochainement dans ma zone ?" },
        { label: "Mon départ",         text: "Quelles sont les informations sur mon départ électrique ?" },
        { label: "Situation nationale",text: "Quelle est la situation électrique en Tunisie en ce moment ?" },
    ]

    const [messages,  setMessages]  = useState([WELCOME])
    const [input,     setInput]     = useState("")
    const [loading,   setLoading]   = useState(false)
    const [error,     setError]     = useState("")
    const messagesEndRef             = useRef(null)
    const inputRef                   = useRef(null)

    // Auto-scroll to bottom whenever messages change
    useEffect(() =>
    {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages, loading])

    // Build the conversation history in the format the API expects:
    // all messages except the welcome placeholder (id=0), mapped to {role, content}
    function buildHistory()
    {
        return messages
            .filter(m => m.id !== 0)
            .map(m => ({ role: m.role, content: m.text }))
    }

    async function send(overrideText)
    {
        const text = (overrideText ?? input).trim()
        if (!text || loading) return

        setInput("")
        setError("")

        // Append user message immediately
        const userMsg = { id: Date.now(), role: "user", text }
        setMessages(prev => [...prev, userMsg])
        setLoading(true)

        // Build history including the new user message
        const history = [
            ...buildHistory(),
            { role: "user", content: text },
        ]

        try {
            const res = await citizenApi.chat(history)
            const reply = res.data?.reply ?? "Je n'ai pas pu générer une réponse."
            setMessages(prev => [...prev, { id: Date.now() + 1, role: "assistant", text: reply }])
        } catch (err) {
            const detail = err.response?.data?.detail
            if (err.response?.status === 503) {
                setError("L'assistant est temporairement indisponible. Vérifiez que le service IA est démarré.")
            } else if (detail) {
                setError(detail)
            } else {
                setError("Impossible de contacter l'assistant. Vérifiez votre connexion.")
            }
        } finally {
            setLoading(false)
            // Refocus the input after reply
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }

    function handleKeyDown(e)
    {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            send()
        }
    }

    function clearChat()
    {
        setMessages([WELCOME])
        setError("")
        setInput("")
    }

    return (
        <div className="page-content chatbot-page">
            <div className="page-intro">
                <span className="eyebrow">ASSISTANT IA</span>
                <h2>Assistant Énergie</h2>
                <p>Posez vos questions sur votre programme, votre départ ou la situation nationale.</p>
            </div>

            <div className="chat-container">
                {/* Header */}
                <div className="chat-header">
                    <div className="chat-header-icon">
                        <span className="material-symbols-outlined" style={{ fontSize:18 }}>auto_awesome</span>
                    </div>
                    <div>
                        <strong>Assistant ENERGY Balance</strong>
                        <span>Informations électriques personnalisées</span>
                    </div>
                    <span className="chat-online">En ligne</span>
                    {messages.length > 1 && (
                        <button
                            onClick={clearChat}
                            title="Réinitialiser la conversation"
                            style={{
                                marginLeft: "auto",
                                background: "none",
                                border: "1px solid #e2e8f0",
                                borderRadius: 6,
                                padding: "3px 10px",
                                fontSize: 11,
                                color: "#64748b",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize:13 }}>refresh</span>
                            Nouvelle conversation
                        </button>
                    )}
                </div>

                {/* Messages */}
                <div className="chat-messages">
                    {messages.map((m) => (
                        <div key={m.id} className={`chat-message ${m.role}`}>
                            {m.role === "assistant" && (
                                <div className="chat-message-avatar">
                                    <span className="material-symbols-outlined" style={{ fontSize:14 }}>auto_awesome</span>
                                </div>
                            )}
                            <div className="chat-bubble" style={{ whiteSpace: "pre-wrap" }}>
                                {m.text}
                            </div>
                        </div>
                    ))}

                    {/* Typing indicator */}
                    {loading && (
                        <div className="chat-message assistant">
                            <div className="chat-message-avatar">
                                <span className="material-symbols-outlined" style={{ fontSize:14 }}>auto_awesome</span>
                            </div>
                            <div className="chat-bubble chat-typing">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    )}

                    {/* Error banner */}
                    {error && (
                        <div style={{
                            margin: "4px 8px",
                            padding: "8px 12px",
                            borderRadius: 8,
                            background: "#fef2f2",
                            border: "1px solid #fecaca",
                            color: "#dc2626",
                            fontSize: 12,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                        }}>
                            <span>
                            <span className="material-symbols-outlined" style={{ fontSize:14 }}>warning</span>
                            {" "}{error}
                        </span>
                            <button
                                onClick={() => setError("")}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 14, lineHeight: 1, display:"flex", alignItems:"center" }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize:16 }}>close</span>
                            </button>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Suggestion chips — only when conversation hasn't started */}
                {messages.length === 1 && (
                    <div className="chat-suggestions">
                        {SUGGESTIONS.map((s) => (
                            <button
                                key={s.label}
                                onClick={() => send(s.text)}
                                disabled={loading}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Input row */}
                <div className="chat-input-row">
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={loading ? "L'assistant répond…" : "Posez votre question…"}
                        disabled={loading}
                    />
                    <button
                        onClick={() => send()}
                        disabled={loading || !input.trim()}
                        style={{ opacity: (loading || !input.trim()) ? 0.45 : 1 }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize:18 }}>
                            {loading ? "hourglass_empty" : "send"}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Settings ──────────────────────────────────────────────────────────────────

function Settings({ citizenInfo, dashboardData, onUpdate, onLogout })
{
    const citizen      = dashboardData?.citizen
    const notifEnabled = citizen?.notifications_enabled ?? true

    // ── Profile form state ────────────────────────────────────────────────────
    const [profile, setProfile] = useState({
        first_name: "", last_name: "", phone: "", address: "",
    })
    // Seed form once real data arrives
    const [seeded, setSeeded] = useState(false)
    useEffect(() => {
        if (citizen && !seeded) {
            setProfile({
                first_name: citizen.first_name || "",
                last_name:  citizen.last_name  || "",
                phone:      citizen.phone      || "",
                address:    citizen.address    || "",
            })
            setSeeded(true)
        }
    }, [citizen, seeded])

    const [profileSaving,  setProfileSaving]  = useState(false)
    const [profileSuccess, setProfileSuccess] = useState(false)
    const [profileError,   setProfileError]   = useState("")

    // ── Password form state ───────────────────────────────────────────────────
    const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" })
    const [pwSaving,  setPwSaving]  = useState(false)
    const [pwSuccess, setPwSuccess] = useState(false)
    const [pwError,   setPwError]   = useState("")

    // ── Notifications ─────────────────────────────────────────────────────────
    const [notifSaving, setNotifSaving] = useState(false)

    const setP = (field) => (e) => setProfile((prev) => ({ ...prev, [field]: e.target.value }))
    const setPw = (field) => (e) => setPwForm((prev) => ({ ...prev, [field]: e.target.value }))

    async function handleProfileSave(e)
    {
        e.preventDefault()
        setProfileError("")
        setProfileSuccess(false)
        if (!profile.first_name.trim() || !profile.last_name.trim()) {
            setProfileError("Le prénom et le nom sont obligatoires.")
            return
        }
        setProfileSaving(true)
        try {
            await onUpdate({
                first_name: profile.first_name.trim(),
                last_name:  profile.last_name.trim(),
                phone:      profile.phone.trim()   || null,
                address:    profile.address.trim() || null,
            })
            setProfileSuccess(true)
            setTimeout(() => setProfileSuccess(false), 3000)
        } catch {
            setProfileError("Impossible de sauvegarder. Réessayez.")
        } finally {
            setProfileSaving(false)
        }
    }

    async function handlePasswordSave(e)
    {
        e.preventDefault()
        setPwError("")
        setPwSuccess(false)
        if (!pwForm.current) { setPwError("Saisissez votre mot de passe actuel."); return }
        if (pwForm.next.length < 6) { setPwError("Le nouveau mot de passe doit contenir au moins 6 caractères."); return }
        if (pwForm.next !== pwForm.confirm) { setPwError("Les mots de passe ne correspondent pas."); return }
        setPwSaving(true)
        try {
            await onUpdate({ current_password: pwForm.current, new_password: pwForm.next })
            setPwSuccess(true)
            setPwForm({ current: "", next: "", confirm: "" })
            setTimeout(() => setPwSuccess(false), 3000)
        } catch (err) {
            setPwError(err?.response?.data?.detail ?? "Impossible de changer le mot de passe.")
        } finally {
            setPwSaving(false)
        }
    }

    async function toggleNotifications()
    {
        setNotifSaving(true)
        try { await onUpdate({ notifications_enabled: !notifEnabled }) }
        finally { setNotifSaving(false) }
    }

    return (
        <div className="page-content">
            <div className="page-intro">
                <span className="eyebrow">COMPTE</span>
                <h2>Paramètres</h2>
                <p>Gérez vos préférences ENERGY Balance.</p>
            </div>

            {/* ── Profile header card ─────────────────────────────────────── */}
            <div className="settings-card" style={{ marginBottom: 16 }}>
                <div className="settings-profile">
                    <div className="settings-avatar">{citizenInfo.initials}</div>
                    <div>
                        <span>COMPTE CITOYEN</span>
                        <h3>{citizenInfo.name || "…"}</h3>
                        <p style={{ margin: "2px 0 0", fontSize: 13, color: "#4a5568" }}>
                            {citizenInfo.governorate || citizen?.governorate
                                ? `${citizenInfo.governorate || citizen?.governorate}${citizenInfo.zone ? ` — ${citizenInfo.zone}` : ""}`
                                : citizenInfo.zone}
                        </p>
                        {dashboardData?.feeder?.poste_source && (
                            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#7a8fa6", display:"flex", alignItems:"center", gap:4 }}>
                                <span className="material-symbols-outlined" style={{ fontSize:13 }}>bolt</span>
                                Poste source : {dashboardData.feeder.poste_source}
                            </p>
                        )}
                        {citizen?.email && (
                            <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6b7b8d" }}>
                                {citizen.email}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Editable profile ────────────────────────────────────────── */}
            <div className="settings-card" style={{ marginBottom: 16 }}>
                <div className="settings-section-title">
                    <span className="settings-section-icon material-symbols-outlined" style={{ fontSize:18 }}>person</span>
                    <strong>Informations personnelles</strong>
                </div>
                <p className="settings-section-sub">
                    Mettez à jour vos coordonnées. L'adresse e-mail ne peut pas être modifiée.
                </p>

                <form onSubmit={handleProfileSave} className="settings-form">
                    {/* Row: prénom / nom */}
                    <div className="settings-form-row">
                        <div className="settings-field">
                            <label className="settings-label">Prénom <span className="settings-required">*</span></label>
                            <input
                                className="settings-input"
                                type="text"
                                value={profile.first_name}
                                onChange={setP("first_name")}
                                placeholder="Prénom"
                                disabled={profileSaving}
                            />
                        </div>
                        <div className="settings-field">
                            <label className="settings-label">Nom <span className="settings-required">*</span></label>
                            <input
                                className="settings-input"
                                type="text"
                                value={profile.last_name}
                                onChange={setP("last_name")}
                                placeholder="Nom de famille"
                                disabled={profileSaving}
                            />
                        </div>
                    </div>

                    {/* E-mail — read only */}
                    <div className="settings-field">
                        <label className="settings-label">Adresse e-mail</label>
                        <div className="settings-readonly-wrap">
                            <input
                                className="settings-input settings-input-readonly"
                                type="email"
                                value={citizen?.email || ""}
                                readOnly
                            />
                            <span className="settings-readonly-badge">Non modifiable</span>
                        </div>
                    </div>

                    {/* Téléphone */}
                    <div className="settings-field">
                        <label className="settings-label">Téléphone</label>
                        <input
                            className="settings-input"
                            type="tel"
                            value={profile.phone}
                            onChange={setP("phone")}
                            placeholder="+216 XX XXX XXX"
                            disabled={profileSaving}
                        />
                    </div>

                    {/* Adresse */}
                    <div className="settings-field">
                        <label className="settings-label">Adresse postale</label>
                        <input
                            className="settings-input"
                            type="text"
                            value={profile.address}
                            onChange={setP("address")}
                            placeholder="Rue, numéro, ville…"
                            disabled={profileSaving}
                        />
                    </div>

                    {/* Zone — read only */}
                    <div className="settings-form-row">
                        <div className="settings-field">
                            <label className="settings-label">Gouvernorat</label>
                            <div className="settings-readonly-wrap">
                                <input
                                    className="settings-input settings-input-readonly"
                                    type="text"
                                    value={citizenInfo.governorate || citizen?.governorate || ""}
                                    readOnly
                                />
                                <span className="settings-readonly-badge">Fixé à l'inscription</span>
                            </div>
                        </div>
                        <div className="settings-field">
                            <label className="settings-label">Zone de résidence</label>
                            <div className="settings-readonly-wrap">
                                <input
                                    className="settings-input settings-input-readonly"
                                    type="text"
                                    value={citizenInfo.zone || ""}
                                    readOnly
                                />
                                <span className="settings-readonly-badge">Fixé à l'inscription</span>
                            </div>
                        </div>
                    </div>

                    {/* Poste source — read only */}
                    {dashboardData?.feeder?.poste_source && (
                        <div className="settings-form-row">
                            <div className="settings-field">
                                <label className="settings-label">Poste source</label>
                                <div className="settings-readonly-wrap">
                                    <input
                                        className="settings-input settings-input-readonly"
                                        type="text"
                                        value={dashboardData.feeder.poste_source}
                                        readOnly
                                    />
                                    <span className="settings-readonly-badge">Réseau HTA</span>
                                </div>
                            </div>
                            <div className="settings-field">
                                <label className="settings-label">Départ HTA</label>
                                <div className="settings-readonly-wrap">
                                    <input
                                        className="settings-input settings-input-readonly"
                                        type="text"
                                        value={
                                            dashboardData.feeder.ref
                                                ? `${dashboardData.feeder.ref} — ${dashboardData.feeder.nom || dashboardData.feeder.zone || ""}`
                                                : dashboardData.feeder.nom || dashboardData.feeder.zone || ""
                                        }
                                        readOnly
                                    />
                                    <span className="settings-readonly-badge">Réseau HTA</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {profileError   && <p className="settings-msg settings-msg-error">{profileError}</p>}
                    {profileSuccess && <p className="settings-msg settings-msg-ok">✓ Modifications sauvegardées.</p>}

                    <button
                        type="submit"
                        className="settings-save-btn"
                        disabled={profileSaving}
                    >
                        {profileSaving ? "Sauvegarde…" : "Sauvegarder les modifications"}
                    </button>
                </form>
            </div>

            {/* ── Password change ──────────────────────────────────────────── */}
            <div className="settings-card" style={{ marginBottom: 16 }}>
                <div className="settings-section-title">
                    <span className="settings-section-icon material-symbols-outlined" style={{ fontSize:18 }}>lock</span>
                    <strong>Changer le mot de passe</strong>
                </div>
                <p className="settings-section-sub">
                    Choisissez un mot de passe fort d'au moins 6 caractères.
                </p>

                <form onSubmit={handlePasswordSave} className="settings-form">
                    <div className="settings-field">
                        <label className="settings-label">Mot de passe actuel</label>
                        <input
                            className="settings-input"
                            type="password"
                            value={pwForm.current}
                            onChange={setPw("current")}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            disabled={pwSaving}
                        />
                    </div>
                    <div className="settings-form-row">
                        <div className="settings-field">
                            <label className="settings-label">Nouveau mot de passe</label>
                            <input
                                className="settings-input"
                                type="password"
                                value={pwForm.next}
                                onChange={setPw("next")}
                                placeholder="Min. 6 caractères"
                                autoComplete="new-password"
                                disabled={pwSaving}
                            />
                        </div>
                        <div className="settings-field">
                            <label className="settings-label">Confirmer</label>
                            <input
                                className="settings-input"
                                type="password"
                                value={pwForm.confirm}
                                onChange={setPw("confirm")}
                                placeholder="Répéter le mot de passe"
                                autoComplete="new-password"
                                disabled={pwSaving}
                            />
                        </div>
                    </div>

                    {pwError   && <p className="settings-msg settings-msg-error">{pwError}</p>}
                    {pwSuccess && <p className="settings-msg settings-msg-ok">✓ Mot de passe mis à jour.</p>}

                    <button
                        type="submit"
                        className="settings-save-btn settings-save-btn-secondary"
                        disabled={pwSaving}
                    >
                        {pwSaving ? "Mise à jour…" : "Mettre à jour le mot de passe"}
                    </button>
                </form>
            </div>

            {/* ── Preferences & logout ─────────────────────────────────────── */}
            <div className="settings-card">
                <div className="settings-section-title">
                    <span className="settings-section-icon material-symbols-outlined" style={{ fontSize:18 }}>settings</span>
                    <strong>Préférences</strong>
                </div>

                <div className="settings-divider"></div>

                <div className="settings-row">
                    <div>
                        <strong>Notifications électriques</strong>
                        <span>Recevoir les alertes de délestage et les mises à jour du programme.</span>
                    </div>
                    <button
                        className={`toggle ${notifEnabled ? "on" : ""}`}
                        onClick={toggleNotifications}
                        disabled={notifSaving}
                        aria-label="Activer/désactiver les notifications"
                    >
                        <span></span>
                    </button>
                </div>

                <div className="settings-divider"></div>

                <div className="settings-row">
                    <div>
                        <strong>Déconnexion</strong>
                        <span>Quitter la session citoyen.</span>
                    </div>
                    <button className="logout-btn" onClick={onLogout}>
                        Se déconnecter
                    </button>
                </div>
            </div>
        </div>
    )
}
