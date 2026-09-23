import { useEffect, useMemo, useState } from "react";
import L from "leaflet";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

/* =========================================================
   LEAFLET ICON FIX
========================================================= */

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

/* =========================================================
   FASTAPI CONNECTION
========================================================= */

const API_BASE_URL = "http://127.0.0.1:8000";
const DEMO_CITIZEN_ID = 1;

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = `Backend request failed (${response.status})`;

    try {
      const errorData = await response.json();
      message = errorData.detail || message;
    } catch {
      // Keep the default message when the backend does not return JSON.
    }

    throw new Error(message);
  }

  return response.json();
}

function normalizeZone(zone) {
  const rawStatus = String(zone.electricity_status || zone.currentStatus || "Unknown");
  const normalized = rawStatus.toLowerCase();

  let currentStatus = "unknown";
  if (normalized.includes("scheduled") || normalized.includes("emergency") || normalized.includes("outage")) {
    currentStatus = "outage";
  } else if (normalized.includes("high demand") || normalized.includes("demand")) {
    currentStatus = "demand";
  } else if (normalized.includes("available") || normalized.includes("normal")) {
    currentStatus = "available";
  }

  return {
    ...zone,
    currentStatus,
    currentStatusLabel:
      zone.currentStatusLabel || rawStatus,
    currentDescription:
      zone.currentDescription ||
      (currentStatus === "outage"
        ? "This location is currently experiencing an electricity interruption."
        : currentStatus === "demand"
          ? "Electricity is available, but demand is currently high in this location."
          : currentStatus === "available"
            ? "Electricity is currently available in this location."
            : "The current electricity status is not available."),
    shedding: Array.isArray(zone.shedding) ? zone.shedding : [],
  };
}

/* =========================================================
   MOCK DATA
   Later this data will come from FastAPI.
========================================================= */

const citizen = {
  name: "Mohamed Ghazi",
  zone: "Sfax Centre",
  governorate: "Sfax",
};

/*
  Every location has:
  - currentStatus
  - currentStatusLabel
  - currentDescription
  - today's shedding schedule
*/

const locations = [
  {
    id: "tunis-centre",
    name: "Tunis Centre",
    governorate: "Tunis",
    latitude: 36.8065,
    longitude: 10.1815,
    currentStatus: "available",
    currentStatusLabel: "Power Available",
    currentDescription:
      "Electricity is currently available in this location.",
    shedding: [],
  },
  {
    id: "ariana",
    name: "Ariana",
    governorate: "Ariana",
    latitude: 36.8665,
    longitude: 10.1647,
    currentStatus: "demand",
    currentStatusLabel: "High Demand",
    currentDescription:
      "Electricity is currently available, but demand is high in this location.",
    shedding: [
      {
        start: "18:00",
        end: "18:45",
        duration: "45 min",
        status: "Planned",
      },
    ],
  },
  {
    id: "ben-arous",
    name: "Ben Arous",
    governorate: "Ben Arous",
    latitude: 36.7531,
    longitude: 10.2282,
    currentStatus: "available",
    currentStatusLabel: "Power Available",
    currentDescription:
      "Electricity is currently available in this location.",
    shedding: [],
  },
  {
    id: "nabeul",
    name: "Nabeul",
    governorate: "Nabeul",
    latitude: 36.4513,
    longitude: 10.7357,
    currentStatus: "outage",
    currentStatusLabel: "Currently Under Shedding",
    currentDescription:
      "This location is currently experiencing a planned electricity interruption.",
    shedding: [
      {
        start: "14:00",
        end: "14:45",
        duration: "45 min",
        status: "Active now",
      },
      {
        start: "20:00",
        end: "20:45",
        duration: "45 min",
        status: "Planned",
      },
    ],
  },
  {
    id: "bizerte",
    name: "Bizerte Centre",
    governorate: "Bizerte",
    latitude: 37.2746,
    longitude: 9.8739,
    currentStatus: "available",
    currentStatusLabel: "Power Available",
    currentDescription:
      "Electricity is currently available in this location.",
    shedding: [],
  },
  {
    id: "beja",
    name: "Béja",
    governorate: "Béja",
    latitude: 36.7256,
    longitude: 9.1817,
    currentStatus: "demand",
    currentStatusLabel: "High Demand",
    currentDescription:
      "Electricity is currently available, but demand is high in this location.",
    shedding: [],
  },
  {
    id: "jendouba",
    name: "Jendouba",
    governorate: "Jendouba",
    latitude: 36.5011,
    longitude: 8.7802,
    currentStatus: "available",
    currentStatusLabel: "Power Available",
    currentDescription:
      "Electricity is currently available in this location.",
    shedding: [],
  },
  {
    id: "kef",
    name: "Le Kef",
    governorate: "Le Kef",
    latitude: 36.1742,
    longitude: 8.7049,
    currentStatus: "available",
    currentStatusLabel: "Power Available",
    currentDescription:
      "Electricity is currently available in this location.",
    shedding: [],
  },
  {
    id: "zaghouan",
    name: "Zaghouan",
    governorate: "Zaghouan",
    latitude: 36.4029,
    longitude: 10.1429,
    currentStatus: "available",
    currentStatusLabel: "Power Available",
    currentDescription:
      "Electricity is currently available in this location.",
    shedding: [],
  },
  {
    id: "siliana",
    name: "Siliana",
    governorate: "Siliana",
    latitude: 36.0849,
    longitude: 9.3708,
    currentStatus: "demand",
    currentStatusLabel: "High Demand",
    currentDescription:
      "Electricity is currently available, but demand is high in this location.",
    shedding: [],
  },
  {
    id: "sousse",
    name: "Sousse",
    governorate: "Sousse",
    latitude: 35.8256,
    longitude: 10.63699,
    currentStatus: "available",
    currentStatusLabel: "Power Available",
    currentDescription:
      "Electricity is currently available in this location.",
    shedding: [],
  },
  {
    id: "monastir",
    name: "Monastir",
    governorate: "Monastir",
    latitude: 35.7643,
    longitude: 10.8113,
    currentStatus: "demand",
    currentStatusLabel: "High Demand",
    currentDescription:
      "Electricity is currently available, but demand is high in this location.",
    shedding: [
      {
        start: "16:00",
        end: "16:45",
        duration: "45 min",
        status: "Planned",
      },
    ],
  },
  {
    id: "mahdia",
    name: "Mahdia",
    governorate: "Mahdia",
    latitude: 35.5047,
    longitude: 11.0622,
    currentStatus: "available",
    currentStatusLabel: "Power Available",
    currentDescription:
      "Electricity is currently available in this location.",
    shedding: [],
  },
  {
    id: "sfax-centre",
    name: "Sfax Centre",
    governorate: "Sfax",
    latitude: 34.7406,
    longitude: 10.7603,
    currentStatus: "available",
    currentStatusLabel: "Power Available",
    currentDescription:
      "Electricity is currently available in this location.",
    shedding: [
      {
        start: "14:00",
        end: "14:45",
        duration: "45 min",
        status: "Planned",
      },
      {
        start: "19:00",
        end: "19:45",
        duration: "45 min",
        status: "Planned",
      },
    ],
  },
  {
    id: "sakiet-ezzit",
    name: "Sakiet Ezzit",
    governorate: "Sfax",
    latitude: 34.7867,
    longitude: 10.7117,
    currentStatus: "demand",
    currentStatusLabel: "High Demand",
    currentDescription:
      "Electricity is currently available, but demand is high in this location.",
    shedding: [
      {
        start: "16:00",
        end: "16:45",
        duration: "45 min",
        status: "Planned",
      },
    ],
  },
  {
    id: "gabes",
    name: "Gabès",
    governorate: "Gabès",
    latitude: 33.8815,
    longitude: 10.0982,
    currentStatus: "available",
    currentStatusLabel: "Power Available",
    currentDescription:
      "Electricity is currently available in this location.",
    shedding: [],
  },
  {
    id: "medenine",
    name: "Médenine",
    governorate: "Médenine",
    latitude: 33.3549,
    longitude: 10.5055,
    currentStatus: "demand",
    currentStatusLabel: "High Demand",
    currentDescription:
      "Electricity is currently available, but demand is high in this location.",
    shedding: [],
  },
  {
    id: "tataouine",
    name: "Tataouine",
    governorate: "Tataouine",
    latitude: 32.9297,
    longitude: 10.4518,
    currentStatus: "available",
    currentStatusLabel: "Power Available",
    currentDescription:
      "Electricity is currently available in this location.",
    shedding: [],
  },
  {
    id: "kebili",
    name: "Kébili",
    governorate: "Kébili",
    latitude: 33.7044,
    longitude: 8.969,
    currentStatus: "available",
    currentStatusLabel: "Power Available",
    currentDescription:
      "Electricity is currently available in this location.",
    shedding: [],
  },
  {
    id: "tozeur",
    name: "Tozeur",
    governorate: "Tozeur",
    latitude: 33.9197,
    longitude: 8.1335,
    currentStatus: "demand",
    currentStatusLabel: "High Demand",
    currentDescription:
      "Electricity is currently available, but demand is high in this location.",
    shedding: [],
  },
  {
    id: "gafsa",
    name: "Gafsa",
    governorate: "Gafsa",
    latitude: 34.425,
    longitude: 8.7842,
    currentStatus: "available",
    currentStatusLabel: "Power Available",
    currentDescription:
      "Electricity is currently available in this location.",
    shedding: [],
  },
  {
    id: "kairouan",
    name: "Kairouan",
    governorate: "Kairouan",
    latitude: 35.6781,
    longitude: 10.0963,
    currentStatus: "outage",
    currentStatusLabel: "Currently Under Shedding",
    currentDescription:
      "This location is currently experiencing a planned electricity interruption.",
    shedding: [
      {
        start: "15:00",
        end: "15:45",
        duration: "45 min",
        status: "Active now",
      },
    ],
  },
  {
    id: "kasserine",
    name: "Kasserine",
    governorate: "Kasserine",
    latitude: 35.1676,
    longitude: 8.8365,
    currentStatus: "available",
    currentStatusLabel: "Power Available",
    currentDescription:
      "Electricity is currently available in this location.",
    shedding: [],
  },
  {
    id: "sidibouzid",
    name: "Sidi Bouzid",
    governorate: "Sidi Bouzid",
    latitude: 35.0382,
    longitude: 9.4849,
    currentStatus: "demand",
    currentStatusLabel: "High Demand",
    currentDescription:
      "Electricity is currently available, but demand is high in this location.",
    shedding: [],
  },
];

/* =========================================================
   SCHEDULE DATA
========================================================= */

const personalSchedule = [
  {
    id: 1,
    date: "September 22, 2026",
    start: "14:00",
    end: "14:45",
    duration: "45 min",
    status: "Planned",
  },
  {
    id: 2,
    date: "September 22, 2026",
    start: "19:00",
    end: "19:45",
    duration: "45 min",
    status: "Planned",
  },
];

/* =========================================================
   NOTIFICATIONS
========================================================= */

const notifications = [
  {
    id: 1,
    title: "Schedule updated",
    message:
      "Tomorrow's electricity schedule has been updated.",
    time: "10 min ago",
    unread: true,
  },
  {
    id: 2,
    title: "Planned interruption",
    message:
      "Your area has a planned interruption tomorrow at 14:00.",
    time: "1 hour ago",
    unread: true,
  },
  {
    id: 3,
    title: "Energy information",
    message:
      "Remember to reduce unnecessary consumption during peak hours.",
    time: "Yesterday",
    unread: false,
  },
];

/* =========================================================
   APP
========================================================= */

function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [virtualCheckOpen, setVirtualCheckOpen] = useState(false);
  const [zones, setZones] = useState([]);
  const [dashboardData, setDashboardData] = useState(null);
  const [backendLoading, setBackendLoading] = useState(true);
  const [backendError, setBackendError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadBackendData() {
      setBackendLoading(true);
      setBackendError("");

      try {
        const [zonesData, dashboard] = await Promise.all([
          apiFetch("/api/zones"),
          apiFetch(`/api/citizen/dashboard/${DEMO_CITIZEN_ID}`),
        ]);

        if (cancelled) return;

        const normalizedZones = (Array.isArray(zonesData) ? zonesData : []).map(normalizeZone);
        setZones(normalizedZones);
        setDashboardData(dashboard);
      } catch (error) {
        if (cancelled) return;
        console.error("ENERGY Balance backend connection error:", error);
        setBackendError(error.message || "Could not connect to the backend.");
      } finally {
        if (!cancelled) setBackendLoading(false);
      }
    }

    loadBackendData();

    return () => {
      cancelled = true;
    };
  }, []);

  const frontendCitizen = useMemo(() => {
    const backendCitizen = dashboardData?.citizen;
    const backendZone = dashboardData?.zone;

    if (!backendCitizen) return citizen;

    const firstName = backendCitizen.first_name || "";
    const lastName = backendCitizen.last_name || "";

    return {
      ...citizen,
      name:
        `${firstName} ${lastName}`.trim() ||
        backendCitizen.name ||
        citizen.name,
      zone:
        backendZone?.name ||
        dashboardData?.zone?.name ||
        citizen.zone,
      governorate:
        backendZone?.governorate ||
        backendCitizen.governorate ||
        citizen.governorate,
    };
  }, [dashboardData]);

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
      />

      <main className="main-content">
        <Topbar
          activePage={activePage}
          setActivePage={setActivePage}
          citizenData={frontendCitizen}
        />

        {backendError && (
          <div
            style={{
              margin: "18px 24px 0",
              padding: "12px 16px",
              borderRadius: "12px",
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              color: "#9a3412",
              fontSize: "14px",
            }}
          >
            Backend connection error: {backendError}. The dashboard is showing demo data.
          </div>
        )}

        {activePage === "dashboard" && (
          <Dashboard
            setActivePage={setActivePage}
            setVirtualCheckOpen={setVirtualCheckOpen}
            citizenData={frontendCitizen}
            dashboardData={dashboardData}
            backendLoading={backendLoading}
          />
        )}

        {activePage === "schedule" && <Schedule />}

        {activePage === "notifications" && (
          <Notifications />
        )}

        {activePage === "map" && (
          <EnergyMap locations={zones.length ? zones : locations} />
        )}

        {activePage === "settings" && <Settings />}

        {activePage === "chat" && <Chatbot />}
      </main>

      {virtualCheckOpen && (
        <VirtualCheckModal
          onClose={() => setVirtualCheckOpen(false)}
          zones={zones.length ? zones : locations}
        />
      )}
    </div>
  );
}

/* =========================================================
   SIDEBAR
========================================================= */

function Sidebar({ activePage, setActivePage }) {
  const navigation = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: "⌂",
    },
    {
      id: "schedule",
      label: "My Schedule",
      icon: "◷",
    },
    {
      id: "map",
      label: "National Grid",
      icon: "⌖",
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: "♢",
    },
    {
      id: "chat",
      label: "Energy Assistant",
      icon: "✦",
    },
    {
      id: "settings",
      label: "Settings",
      icon: "⚙",
    },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">
          ⚡
        </div>

        <div>
          <div className="brand-name">
            ENERGY
          </div>
          <div className="brand-subtitle">
            BALANCE TN
          </div>
        </div>
      </div>

      <div className="sidebar-section-title">
        MAIN MENU
      </div>

      <nav className="sidebar-nav">
        {navigation.map((item) => (
          <button
            key={item.id}
            className={`sidebar-item ${
              activePage === item.id
                ? "active"
                : ""
            }`}
            onClick={() =>
              setActivePage(item.id)
            }
          >
            <span className="sidebar-icon">
              {item.icon}
            </span>

            <span>{item.label}</span>

            {item.id === "notifications" && (
              <span className="notification-badge">
                2
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="connection-card">
          <span className="connection-dot"></span>

          <div>
            <strong>Grid Connected</strong>
            <span>System operational</span>
          </div>
        </div>

        <div className="sidebar-user">
          <div className="avatar">
            MG
          </div>

          <div className="sidebar-user-info">
            <strong>{citizen.name}</strong>
            <span>{citizen.zone}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* =========================================================
   TOPBAR
========================================================= */

function Topbar({
  activePage,
  setActivePage,
  citizenData = citizen,
}) {
  const titles = {
    dashboard: {
      title: "Dashboard",
      subtitle:
        "Monitor your electricity situation",
    },
    schedule: {
      title: "My Schedule",
      subtitle:
        "Your electricity interruption schedule",
    },
    map: {
      title: "National Grid",
      subtitle:
        "Explore electricity conditions across Tunisia",
    },
    notifications: {
      title: "Notifications",
      subtitle:
        "Stay updated about electricity conditions",
    },
    chat: {
      title: "Energy Assistant",
      subtitle:
        "Ask questions about electricity services",
    },
    settings: {
      title: "Settings",
      subtitle:
        "Manage your account preferences",
    },
  };

  const current =
    titles[activePage] || titles.dashboard;

  return (
    <header className="topbar">
      <div>
        <h1>{current.title}</h1>
        <p>{current.subtitle}</p>
      </div>

      <div className="topbar-actions">
        <button
          className="topbar-icon-button"
          onClick={() =>
            setActivePage("notifications")
          }
          title="Notifications"
        >
          ♢
          <span className="topbar-notification-dot"></span>
        </button>

        <button
          className="topbar-profile"
          onClick={() =>
            setActivePage("settings")
          }
        >
          <div className="topbar-avatar">
            MG
          </div>

          <div className="topbar-profile-text">
            <strong>{citizenData.name}</strong>
            <span>{citizenData.zone}</span>
          </div>
        </button>
      </div>
    </header>
  );
}

/* =========================================================
   DASHBOARD
========================================================= */

function Dashboard({
  setActivePage,
  setVirtualCheckOpen,
  citizenData = citizen,
  dashboardData,
  backendLoading,
}) {
  return (
    <div className="page-content dashboard-page">
      <section className="welcome-section">
        <div>
          <span className="eyebrow">
            CITIZEN PORTAL
          </span>

          <h2>
            Welcome back,{" "}
            <span>{citizenData.name}</span>
          </h2>

          <p>
            Here is the latest electricity
            information for your area.
          </p>
        </div>

        <div className="zone-pill">
          <span>⌖</span>
          {citizenData.zone}, {citizenData.governorate}
        </div>
      </section>

      <section className="status-card">
        <div className="status-card-left">
          <div className="large-status-icon">
            ✓
          </div>

          <div>
            <span className="status-label">
              CURRENT ELECTRICITY STATUS
            </span>

            <h3>
              {backendLoading
                ? "Loading..."
                : dashboardData?.current_situation?.status_label ||
                  dashboardData?.zone?.electricity_status ||
                  "Power Available"}
            </h3>

            <p>
              {backendLoading
                ? "Loading the latest electricity information."
                : dashboardData?.current_situation?.description ||
                  "Electricity is currently available in your area."}
            </p>
          </div>
        </div>

        <div className="status-live">
          <span></span>
          LIVE
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="dashboard-card next-outage-card">
          <div className="card-heading">
            <div>
              <span className="card-label">
                NEXT INTERRUPTION
              </span>

              <h3>Today's schedule</h3>
            </div>

            <span className="card-icon blue">
              ◷
            </span>
          </div>

          <div className="next-outage-time">
            {dashboardData?.today_schedule?.length ? (
              <>
                <strong>{dashboardData.today_schedule[0].start_time}</strong>
                <span>–</span>
                <strong>{dashboardData.today_schedule[0].end_time}</strong>
              </>
            ) : (
              <strong>No interruption</strong>
            )}
          </div>

          <div className="outage-meta">
            <span>
              {dashboardData?.today_schedule?.length
                ? `Duration: ${dashboardData.today_schedule[0].duration_minutes} min`
                : "No shedding scheduled today"}
            </span>
            {dashboardData?.today_schedule?.length ? (
              <span className="planned-pill">Planned</span>
            ) : null}
          </div>

          <button
            className="text-button"
            onClick={() =>
              setActivePage("schedule")
            }
          >
            View full schedule →
          </button>
        </div>

        <div className="dashboard-card zone-card">
          <div className="card-heading">
            <div>
              <span className="card-label">
                YOUR LOCATION
              </span>

              <h3>{citizenData.zone}</h3>
            </div>

            <span className="card-icon green">
              ⌖
            </span>
          </div>

          <div className="zone-status-row">
            <span className="small-status-dot"></span>

            <div>
              <strong>
                {dashboardData?.current_situation?.status_label ||
                  dashboardData?.zone?.electricity_status ||
                  "Power Available"}
              </strong>
              <span>
                Current status
              </span>
            </div>
          </div>

          <button
            className="text-button"
            onClick={() =>
              setActivePage("map")
            }
          >
            View on national grid →
          </button>
        </div>
      </section>

      <section className="quick-actions-section">
        <div className="section-heading">
          <div>
            <span className="section-label">
              QUICK ACTIONS
            </span>

            <h3>
              Check electricity information
            </h3>
          </div>
        </div>

        <div className="quick-actions">
          <button
            className="quick-action-card"
            onClick={() =>
              setVirtualCheckOpen(true)
            }
          >
            <div className="quick-action-icon check-icon">
              ⌕
            </div>

            <div className="quick-action-text">
              <strong>
                Virtual Check
              </strong>

              <span>
                Check any location's current
                status and today's shedding
              </span>
            </div>

            <span className="quick-action-arrow">
              →
            </span>
          </button>

          <button
            className="quick-action-card"
            onClick={() =>
              setActivePage("map")
            }
          >
            <div className="quick-action-icon map-icon">
              ⌖
            </div>

            <div className="quick-action-text">
              <strong>
                View National Grid
              </strong>

              <span>
                Explore electricity conditions
                across Tunisia
              </span>
            </div>

            <span className="quick-action-arrow">
              →
            </span>
          </button>
        </div>
      </section>

      <section className="dashboard-bottom">
        <div className="dashboard-card energy-tip-card">
          <div className="card-heading">
            <div>
              <span className="card-label">
                ENERGY TIP
              </span>

              <h3>
                Reduce peak consumption
              </h3>
            </div>

            <span className="card-icon yellow">
              ⚡
            </span>
          </div>

          <p>
            Try to reduce unnecessary electricity
            use during high-demand periods. This
            helps maintain grid stability.
          </p>
        </div>

        <div className="dashboard-card assistant-card">
          <div className="assistant-card-icon">
            ✦
          </div>

          <div>
            <span className="card-label">
              ENERGY ASSISTANT
            </span>

            <h3>
              Need information?
            </h3>

            <p>
              Ask about your schedule, electricity
              status, or the national grid.
            </p>

            <button
              className="assistant-button"
              onClick={() =>
                setActivePage("chat")
              }
            >
              Ask Assistant →
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/* =========================================================
   VIRTUAL CHECK
========================================================= */

function VirtualCheckModal({ onClose, zones: availableZones = locations }) {
  const [selectedLocationId, setSelectedLocationId] = useState(
    String(availableZones[0]?.id ?? "")
  );
  const [checkData, setCheckData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedLocationId) return;

    let cancelled = false;

    async function loadVirtualCheck() {
      setLoading(true);
      setError("");

      try {
        const data = await apiFetch(
          `/api/virtual-check?zone_id=${encodeURIComponent(selectedLocationId)}`
        );

        if (!cancelled) {
          setCheckData(data);
        }
      } catch (requestError) {
        if (!cancelled) {
          console.error("Virtual Check error:", requestError);
          setError(
            requestError.message ||
              "Could not retrieve the selected location information."
          );
          setCheckData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadVirtualCheck();

    return () => {
      cancelled = true;
    };
  }, [selectedLocationId]);

  const selectedFallback =
    availableZones.find(
      (location) => String(location.id) === String(selectedLocationId)
    ) || availableZones[0];

  const selectedLocation = checkData?.zone || selectedFallback || {};
  const currentSituation = checkData?.current_situation || {};
  const shedding = Array.isArray(checkData?.upcoming_shedding_today)
    ? checkData.upcoming_shedding_today
    : selectedFallback?.shedding || [];

  const currentStatus =
    currentSituation.status ||
    selectedLocation.currentStatus ||
    selectedLocation.electricity_status ||
    "unknown";

  const currentStatusLabel =
    currentSituation.status_label ||
    selectedLocation.currentStatusLabel ||
    selectedLocation.electricity_status ||
    "Unknown";

  const currentDescription =
    currentSituation.description ||
    selectedLocation.currentDescription ||
    "No current electricity information is available.";

  const statusColor =
    currentStatus === "available" ||
    String(currentStatus).toLowerCase().includes("available")
      ? "#16a34a"
      : currentStatus === "demand" ||
          String(currentStatus).toLowerCase().includes("demand")
        ? "#f59e0b"
        : "#dc2626";

  const hasShedding = shedding.length > 0;

  return (
    <div
      className="virtual-check-overlay"
      onClick={onClose}
    >
      <div
        className="virtual-check-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="virtual-check-header">
          <div className="virtual-check-title">
            <div className="virtual-check-icon">⌕</div>

            <div>
              <span>ENERGY BALANCE</span>
              <h2>Virtual Check</h2>
            </div>
          </div>

          <button
            className="virtual-check-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="virtual-location-section">
          <div>
            <span className="section-label">
              SELECT LOCATION
            </span>

            <h3>Where do you want to check?</h3>

            <p>
              Select any location to see its current
              electricity situation and today's
              shedding schedule.
            </p>
          </div>

          <div className="location-select-wrapper">
            <span className="location-select-icon">⌖</span>

            <select
              value={selectedLocationId}
              onChange={(event) =>
                setSelectedLocationId(event.target.value)
              }
            >
              {availableZones.map((location) => (
                <option
                  key={location.id}
                  value={location.id}
                >
                  {location.name}, {location.governorate}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div
            style={{
              marginBottom: "16px",
              padding: "12px 14px",
              borderRadius: "10px",
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              color: "#9a3412",
            }}
          >
            {error}
          </div>
        )}

        <div
          className="virtual-check-status"
          style={{
            borderColor: `${statusColor}33`,
            background: `${statusColor}0d`,
          }}
        >
          <div
            className="virtual-check-status-icon"
            style={{
              background: statusColor,
            }}
          >
            {loading ? "…" : currentStatus === "outage" ? "!" : "✓"}
          </div>

          <div>
            <span>CURRENT SITUATION</span>

            <strong style={{ color: statusColor }}>
              {loading ? "Loading..." : currentStatusLabel}
            </strong>

            <p>{currentDescription}</p>
          </div>
        </div>

        <div className="virtual-check-grid">
          <div className="virtual-check-item">
            <span>LOCATION</span>
            <strong>{selectedLocation.name || "—"}</strong>
          </div>

          <div className="virtual-check-item">
            <span>GOVERNORATE</span>
            <strong>{selectedLocation.governorate || "—"}</strong>
          </div>

          <div className="virtual-check-item">
            <span>DATE</span>
            <strong>
              {checkData?.date
                ? new Date(`${checkData.date}T00:00:00`).toLocaleDateString(
                    "en-US",
                    {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    }
                  )
                : new Date().toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
            </strong>
          </div>

          <div className="virtual-check-item">
            <span>TODAY'S INTERRUPTIONS</span>
            <strong>{checkData?.total_interruptions ?? shedding.length}</strong>
          </div>
        </div>

        <div className="virtual-check-section">
          <div className="virtual-check-section-header">
            <div>
              <span className="section-label">TODAY</span>

              <h3>Electricity situation</h3>
            </div>

            {hasShedding ? (
              <span className="schedule-count">
                {shedding.length} interruption
                {shedding.length > 1 ? "s" : ""}
              </span>
            ) : (
              <span className="no-shedding-pill">
                No shedding
              </span>
            )}
          </div>

          {!hasShedding ? (
            <div className="no-shedding">
              <div className="no-shedding-icon">✓</div>

              <div>
                <strong>
                  No upcoming interruption today
                </strong>

                <p>
                  No electricity shedding is currently
                  scheduled for this location today.
                </p>
              </div>
            </div>
          ) : (
            <div className="virtual-check-timeline">
              <div className="virtual-line"></div>

              <div className="virtual-point available">
                <span></span>

                <div>
                  <strong>Current situation</strong>

                  <small>
                    {currentStatusLabel}
                  </small>
                </div>
              </div>

              {shedding.map((item, index) => {
                const itemStatus =
                  item.status ||
                  (item.active ? "Active now" : "Planned");

                const start =
                  item.start ||
                  item.start_time ||
                  "—";
                const end =
                  item.end ||
                  item.end_time ||
                  "—";
                const duration =
                  item.duration ||
                  `${item.duration_minutes ?? "—"} min`;

                return (
                  <div
                    className={`virtual-point ${
                      itemStatus === "Active now"
                        ? "active-outage"
                        : "interruption"
                    }`}
                    key={`${start}-${index}`}
                  >
                    <span></span>

                    <div className="timeline-event">
                      <div>
                        <strong>
                          {start} – {end}
                        </strong>

                        <small>
                          {itemStatus === "Active now"
                            ? "Interruption active now"
                            : "Upcoming planned interruption"}
                        </small>
                      </div>

                      <span className="timeline-duration">
                        {duration}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="virtual-location-preview">
          <div className="virtual-location-preview-icon">
            ⌖
          </div>

          <div>
            <span>CHECKED LOCATION</span>

            <strong>{selectedLocation.name || "—"}</strong>

            <small>
              {selectedLocation.latitude != null &&
              selectedLocation.longitude != null
                ? `${Number(selectedLocation.latitude).toFixed(4)}, ${Number(
                    selectedLocation.longitude
                  ).toFixed(4)}`
                : "Coordinates unavailable"}
            </small>
          </div>
        </div>

        <div className="virtual-check-info">
          <div>ℹ</div>

          <p>
            This check retrieves the selected location
            directly from the ENERGY Balance backend.
            Current status and today's schedule come
            from the database.
          </p>
        </div>

        <button
          className="virtual-check-done"
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   SCHEDULE
========================================================= */

function Schedule() {
  return (
    <div className="page-content">
      <div className="page-intro">
        <span className="eyebrow">
          ELECTRICITY SCHEDULE
        </span>

        <h2>My Schedule</h2>

        <p>
          Planned electricity interruptions for
          your registered location.
        </p>
      </div>

      <div className="schedule-location-card">
        <div className="schedule-location-icon">
          ⌖
        </div>

        <div>
          <span>YOUR REGISTERED LOCATION</span>
          <strong>
            {citizen.zone}, {citizen.governorate}
          </strong>
        </div>

        <span className="location-connected">
          Connected
        </span>
      </div>

      <div className="schedule-list">
        {personalSchedule.map((item) => (
          <div
            className="schedule-row"
            key={item.id}
          >
            <div className="schedule-date">
              <span>{item.date}</span>
            </div>

            <div className="schedule-time">
              <strong>
                {item.start}
              </strong>

              <span>to</span>

              <strong>
                {item.end}
              </strong>
            </div>

            <div className="schedule-duration">
              <span>Duration</span>
              <strong>
                {item.duration}
              </strong>
            </div>

            <span className="planned-pill">
              {item.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================================================
   NOTIFICATIONS
========================================================= */

function Notifications() {
  return (
    <div className="page-content">
      <div className="page-intro">
        <span className="eyebrow">
          UPDATES
        </span>

        <h2>Notifications</h2>

        <p>
          Important information about your
          electricity service.
        </p>
      </div>

      <div className="notifications-list">
        {notifications.map((item) => (
          <div
            className={`notification-card ${
              item.unread
                ? "unread"
                : ""
            }`}
            key={item.id}
          >
            <div className="notification-icon">
              ♢
            </div>

            <div className="notification-content">
              <div className="notification-title-row">
                <strong>
                  {item.title}
                </strong>

                {item.unread && (
                  <span className="unread-dot"></span>
                )}
              </div>

              <p>{item.message}</p>

              <span>{item.time}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================================================
   MAP
========================================================= */

function EnergyMap({ locations: mapLocations = locations }) {
  const center = [
    33.8869,
    9.5375,
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case "available":
        return "#16a34a";

      case "demand":
        return "#f59e0b";

      case "outage":
        return "#dc2626";

      default:
        return "#64748b";
    }
  };

  const createEnergyIcon = (status) => {
    const color =
      getStatusColor(status);

    return L.divIcon({
      className:
        "energy-marker-wrapper",

      html: `
        <div
          class="energy-marker"
          style="
            background: ${color};
            box-shadow:
              0 0 0 6px ${color}22,
              0 6px 15px rgba(0, 0, 0, 0.25);
          "
        >
          <div class="energy-marker-center"></div>
        </div>
      `,

      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14],
    });
  };

  return (
    <div className="page-content map-page">
      <div className="map-header">
        <div>
          <span className="eyebrow">
            NATIONAL GRID
          </span>

          <h2>Electricity Map</h2>

          <p>
            Explore electricity conditions
            across Tunisia using live backend zone data.
          </p>
        </div>

        <div className="map-status">
          <span className="status-dot green"></span>
          Grid Connected
        </div>
      </div>

      <div className="real-map-wrapper">
        <MapContainer
          center={center}
          zoom={6}
          minZoom={5}
          maxZoom={18}
          scrollWheelZoom={true}
          zoomControl={true}
          className="real-map"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {mapLocations.map((location) => (
            <Marker
              key={location.id}
              position={[
                location.latitude,
                location.longitude,
              ]}
              icon={createEnergyIcon(
                location.currentStatus
              )}
            >
              <Popup>
                <div className="map-popup">
                  <div className="map-popup-title">
                    <span
                      className="popup-indicator"
                      style={{
                        background:
                          getStatusColor(
                            location.currentStatus
                          ),
                      }}
                    />

                    <strong>
                      {location.name}
                    </strong>
                  </div>

                  <div
                    className="popup-status"
                    style={{
                      color:
                        getStatusColor(
                          location.currentStatus
                        ),
                    }}
                  >
                    {
                      location.currentStatusLabel
                    }
                  </div>

                  <div className="popup-divider"></div>

                  <p className="popup-description">
                    {
                      location.currentDescription
                    }
                  </p>

                  <div className="popup-schedule">
                    {location.shedding.length ===
                    0 ? (
                      <span>
                        No shedding scheduled
                        today.
                      </span>
                    ) : (
                      <>
                        <strong>
                          Today's schedule
                        </strong>

                        {location.shedding.map(
                          (
                            item,
                            index
                          ) => (
                            <span
                              key={index}
                            >
                              {item.start} –{" "}
                              {item.end}{" "}
                              <small>
                                (
                                {
                                  item.duration
                                }
                                )
                              </small>
                            </span>
                          )
                        )}
                      </>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        <div className="map-live-badge">
          <span className="live-pulse"></span>
          Live Map
        </div>
      </div>

      <div className="map-legend">
        <div className="legend-item">
          <span className="legend-dot green"></span>
          <span>Power Available</span>
        </div>

        <div className="legend-item">
          <span className="legend-dot yellow"></span>
          <span>High Demand</span>
        </div>

        <div className="legend-item">
          <span className="legend-dot red"></span>
          <span>Scheduled Outage</span>
        </div>
      </div>

      <div className="map-note">
        <strong>About this map</strong>

        <span>
          Map locations and electricity statuses
          are currently demonstration data across Tunisia. The
          geographic map is provided by
          OpenStreetMap.
        </span>
      </div>
    </div>
  );
}

/* =========================================================
   CHATBOT
========================================================= */

function Chatbot() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: "assistant",
      text:
        "Hello! I’m the ENERGY Balance Assistant. Ask me about your electricity schedule, current status, or the national grid.",
    },
  ]);

  const [input, setInput] = useState("");

  const sendMessage = () => {
    const trimmed =
      input.trim();

    if (!trimmed) return;

    const userMessage = {
      id: Date.now(),
      role: "user",
      text: trimmed,
    };

    const assistantMessage = {
      id: Date.now() + 1,
      role: "assistant",
      text:
        "I received your question. Once connected to the ENERGY Balance backend, I will retrieve verified electricity information for your selected area.",
    };

    setMessages((previous) => [
      ...previous,
      userMessage,
      assistantMessage,
    ]);

    setInput("");
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      sendMessage();
    }
  };

  return (
    <div className="page-content chatbot-page">
      <div className="page-intro">
        <span className="eyebrow">
          AI ASSISTANT
        </span>

        <h2>Energy Assistant</h2>

        <p>
          Ask questions about electricity
          information and services.
        </p>
      </div>

      <div className="chat-container">
        <div className="chat-header">
          <div className="chat-header-icon">
            ✦
          </div>

          <div>
            <strong>
              ENERGY Balance Assistant
            </strong>

            <span>
              Verified electricity information
            </span>
          </div>

          <span className="chat-online">
            Online
          </span>
        </div>

        <div className="chat-messages">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`chat-message ${
                message.role
              }`}
            >
              {message.role ===
                "assistant" && (
                <div className="chat-message-avatar">
                  ✦
                </div>
              )}

              <div className="chat-bubble">
                {message.text}
              </div>
            </div>
          ))}
        </div>

        <div className="chat-suggestions">
          <button
            onClick={() =>
              setInput(
                "What is my electricity schedule today?"
              )
            }
          >
            My schedule
          </button>

          <button
            onClick={() =>
              setInput(
                "Is electricity currently available?"
              )
            }
          >
            Current status
          </button>

          <button
            onClick={() =>
              setInput(
                "Are there upcoming interruptions?"
              )
            }
          >
            Upcoming interruptions
          </button>
        </div>

        <div className="chat-input-row">
          <input
            value={input}
            onChange={(event) =>
              setInput(event.target.value)
            }
            onKeyDown={handleKeyDown}
            placeholder="Ask about electricity..."
          />

          <button
            onClick={sendMessage}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   SETTINGS
========================================================= */

function Settings() {
  const [notificationsEnabled, setNotificationsEnabled] =
    useState(true);

  return (
    <div className="page-content">
      <div className="page-intro">
        <span className="eyebrow">
          ACCOUNT
        </span>

        <h2>Settings</h2>

        <p>
          Manage your ENERGY Balance preferences.
        </p>
      </div>

      <div className="settings-card">
        <div className="settings-profile">
          <div className="settings-avatar">
            MG
          </div>

          <div>
            <span>ACCOUNT</span>

            <h3>{citizen.name}</h3>

            <p>
              {citizen.zone},{" "}
              {citizen.governorate}
            </p>
          </div>
        </div>

        <div className="settings-divider"></div>

        <div className="settings-row">
          <div>
            <strong>
              Electricity notifications
            </strong>

            <span>
              Receive updates about schedule
              changes and interruptions.
            </span>
          </div>

          <button
            className={`toggle ${
              notificationsEnabled
                ? "on"
                : ""
            }`}
            onClick={() =>
              setNotificationsEnabled(
                !notificationsEnabled
              )
            }
          >
            <span></span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;