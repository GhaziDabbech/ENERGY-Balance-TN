import { useEffect, useMemo, useState } from "react";
import L from "leaflet";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";
import AuthScreen from "./AuthScreen.jsx";
import StaffConsole from "./StaffConsole.jsx";
import { apiFetch, getToken, setToken, getStaffSession, setStaffSession } from "./api.js";

const EMPTY_CITIZEN = { name: "", zone: "", governorate: "" };

function initials(name) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

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
   APP
========================================================= */

function App() {
  const [token, setTokenState] = useState(getToken());
  const [staffSession, setStaffSessionState] = useState(getStaffSession());
  const [activePage, setActivePage] = useState("dashboard");
  const [dashboardData, setDashboardData] = useState(null);
  const [backendLoading, setBackendLoading] = useState(true);
  const [backendError, setBackendError] = useState("");

  const logout = () => {
    setToken(null);
    setTokenState(null);
    setDashboardData(null);
    setActivePage("dashboard");
  };

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;

    async function loadDashboard() {
      setBackendLoading(true);
      setBackendError("");
      try {
        const dashboard = await apiFetch("/api/citizen/dashboard", {}, token);
        if (!cancelled) setDashboardData(dashboard);
      } catch (error) {
        if (cancelled) return;
        if (error.status === 401) {
          logout();
          return;
        }
        setBackendError(error.message || "Could not connect to the backend.");
      } finally {
        if (!cancelled) setBackendLoading(false);
      }
    }

    loadDashboard();
    const timer = setInterval(loadDashboard, 60000); // refresh every minute
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token]);

  const citizenData = useMemo(() => {
    const c = dashboardData?.citizen;
    if (!c) return EMPTY_CITIZEN;
    return {
      name: c.name || `${c.first_name} ${c.last_name}`.trim(),
      zone: dashboardData?.zone?.name || c.zone_name || "",
      governorate: dashboardData?.zone?.governorate || c.governorate || "",
    };
  }, [dashboardData]);

  const notificationItems = useMemo(() => buildNotifications(dashboardData), [dashboardData]);

  if (staffSession) {
    return (
      <StaffConsole
        session={staffSession}
        onLogout={() => {
          setStaffSession(null);
          setStaffSessionState(null);
        }}
      />
    );
  }

  if (!token) {
    return (
      <AuthScreen
        onCitizenLogin={(newToken) => {
          setToken(newToken);
          setTokenState(newToken);
        }}
        onStaffLogin={(session) => {
          setStaffSession(session);
          setStaffSessionState(session);
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        citizenData={citizenData}
        notificationCount={notificationItems.filter((n) => n.unread).length}
        onLogout={logout}
      />

      <main className="main-content">
        <Topbar activePage={activePage} setActivePage={setActivePage} citizenData={citizenData} />

        {backendError && (
          <div className="backend-error-banner">
            Backend connection error: {backendError}
          </div>
        )}

        {activePage === "dashboard" && (
          <Dashboard
            setActivePage={setActivePage}
            citizenData={citizenData}
            dashboardData={dashboardData}
            backendLoading={backendLoading}
          />
        )}

        {activePage === "schedule" && <Schedule citizenData={citizenData} dashboardData={dashboardData} />}

        {activePage === "notifications" && <Notifications items={notificationItems} />}

        {activePage === "map" && <EnergyMap dashboardData={dashboardData} />}

        {activePage === "settings" && <Settings citizenData={citizenData} onLogout={logout} />}

        {activePage === "chat" && <Chatbot />}
      </main>
    </div>
  );
}

function buildNotifications(dashboardData) {
  if (!dashboardData) return [];
  const items = [];
  const active = dashboardData.current_situation?.active_shedding;
  if (active) {
    items.push({
      id: "active",
      title: "Interruption in progress",
      message: `Electricity is cut in ${dashboardData.zone.name} until about ${active.end}.`,
      time: "Now",
      unread: true,
    });
  }
  (dashboardData.today_schedule || [])
    .filter((item) => !item.active)
    .forEach((item) => {
      items.push({
        id: `planned-${item.id}`,
        title: "Planned interruption",
        message: `A cut is planned in ${dashboardData.zone.name} on ${item.date} from ${item.start} to ${item.end}.`,
        time: item.date,
        unread: true,
      });
    });
  items.push({
    id: "tip",
    title: "Energy information",
    message: "Reduce unnecessary consumption during peak hours (13:00-15:00 and 18:00-22:00).",
    time: "Tip",
    unread: false,
  });
  return items;
}

/* =========================================================
   SIDEBAR
========================================================= */

function Sidebar({ activePage, setActivePage, citizenData = EMPTY_CITIZEN, notificationCount = 0, onLogout }) {
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
      label: "My Zone Map",
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

            {item.id === "notifications" && notificationCount > 0 && (
              <span className="notification-badge">
                {notificationCount}
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
            {initials(citizenData.name)}
          </div>

          <div className="sidebar-user-info">
            <strong>{citizenData.name}</strong>
            <span>{citizenData.zone}</span>
          </div>
        </div>
        <button className="sidebar-logout" onClick={onLogout}>
          Log out
        </button>
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
  citizenData = EMPTY_CITIZEN,
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
      title: "My Zone Map",
      subtitle:
        "Your zone's location and live status",
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
  citizenData = EMPTY_CITIZEN,
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
            {dashboardData?.current_situation?.under_shedding ? "!" : "✓"}
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
              <span className="planned-pill">{dashboardData.today_schedule[0].status}</span>
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
            View my zone on the map →
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
              setActivePage("schedule")
            }
          >
            <div className="quick-action-icon check-icon">
              ◷
            </div>
            <div className="quick-action-text">
              <strong>
                My Schedule
              </strong>
              <span>
                All planned interruptions in your zone
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
                View My Zone
              </strong>
              <span>
                Your zone's location and live status
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
              Ask about your schedule or your
              zone's electricity status.
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
   SCHEDULE
========================================================= */

function Schedule({ citizenData = EMPTY_CITIZEN, dashboardData }) {
  const items = dashboardData?.today_schedule || [];
  return (
    <div className="page-content">
      <div className="page-intro">
        <span className="eyebrow">ELECTRICITY SCHEDULE</span>
        <h2>My Schedule</h2>
        <p>Approved electricity interruptions for your registered zone (today and tomorrow).</p>
      </div>

      <div className="schedule-location-card">
        <div className="schedule-location-icon">⌖</div>
        <div>
          <span>YOUR REGISTERED LOCATION</span>
          <strong>
            {citizenData.zone}, {citizenData.governorate}
          </strong>
        </div>
        <span className="location-connected">Connected</span>
      </div>

      <div className="schedule-list">
        {items.length === 0 && (
          <div className="schedule-row">
            <div className="schedule-date">
              <span>No interruption planned in your zone.</span>
            </div>
          </div>
        )}
        {items.map((item) => (
          <div className="schedule-row" key={item.id}>
            <div className="schedule-date">
              <span>{item.date}</span>
            </div>
            <div className="schedule-time">
              <strong>{item.start}</strong>
              <span>to</span>
              <strong>{item.end}</strong>
            </div>
            <div className="schedule-duration">
              <span>Duration</span>
              <strong>{item.duration}</strong>
            </div>
            <span className="planned-pill">{item.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================================================
   NOTIFICATIONS
========================================================= */

function Notifications({ items = [] }) {
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
        {items.map((item) => (
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

function EnergyMap({ dashboardData }) {
  const zone = dashboardData?.zone;
  const situation = dashboardData?.current_situation;
  const mapLocations =
    zone && zone.latitude != null
      ? [
          {
            id: zone.id,
            name: zone.name,
            latitude: zone.latitude,
            longitude: zone.longitude,
            currentStatus: situation?.status || "unknown",
            currentStatusLabel: situation?.status_label || zone.electricity_status,
            currentDescription: situation?.description || "",
            shedding: dashboardData?.today_schedule || [],
          },
        ]
      : [];
  const center = mapLocations.length
    ? [mapLocations[0].latitude, mapLocations[0].longitude]
    : [33.8869, 9.5375];

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
            MY ZONE
          </span>

          <h2>Electricity Map</h2>

          <p>
            Your registered zone and its live
            electricity status.
          </p>
        </div>

        <div className="map-status">
          <span className="status-dot green"></span>
          Grid Connected
        </div>
      </div>

      <div className="real-map-wrapper">
        <MapContainer
          key={center.join(",")}
          center={center}
          zoom={mapLocations.length ? 13 : 6}
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
                        No interruption planned.
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
        "Hello! I’m the ENERGY Balance Assistant. Ask me when the electricity will be cut or come back in your zone. You can write in French, Arabic, English or Tunisian Derja.",
    },
  ]);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const sendMessage = async (text) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || sending) return;

    setMessages((previous) => [...previous, { id: Date.now(), role: "user", text: trimmed }]);
    setInput("");
    setSending(true);

    try {
      const data = await apiFetch("/api/chat/citizen", {
        method: "POST",
        body: JSON.stringify({ message: trimmed }),
      });
      setMessages((previous) => [...previous, { id: Date.now() + 1, role: "assistant", text: data.reply }]);
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        {
          id: Date.now() + 1,
          role: "assistant",
          text:
            error.status === 401
              ? "Your session expired. Please log in again."
              : "The assistant is not available right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setSending(false);
    }
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
          {sending && (
            <div className="chat-message assistant">
              <div className="chat-message-avatar">✦</div>
              <div className="chat-bubble chat-typing">Thinking…</div>
            </div>
          )}
        </div>

        <div className="chat-suggestions">
          <button
            onClick={() => sendMessage("What is my electricity schedule today?")}
          >
            My schedule
          </button>

          <button
            onClick={() => sendMessage("Is electricity currently available?")}
          >
            Current status
          </button>

          <button
            onClick={() => sendMessage("Are there upcoming interruptions?")}
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
            onClick={() => sendMessage()}
            disabled={sending}
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

function Settings({ citizenData = EMPTY_CITIZEN, onLogout }) {
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
            {initials(citizenData.name)}
          </div>

          <div>
            <span>ACCOUNT</span>

            <h3>{citizenData.name}</h3>

            <p>
              {citizenData.zone},{" "}
              {citizenData.governorate}
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
        <div className="settings-divider"></div>

        <div className="settings-row">
          <div>
            <strong>Log out</strong>
            <span>End your session on this device.</span>
          </div>
          <button className="settings-logout" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;