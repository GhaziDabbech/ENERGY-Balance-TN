import { create } from 'zustand'

// ── Alert categories ──────────────────────────────────────────────────────────
//
//  DÉFICIT / PRODUCTION
//    'national_deficit'     — national réalisé < consigne by > threshold
//    'crc_deficit'          — CRC réalisé < consigne régionale
//    'frequency_low'        — fréquence réseau < 49.95 Hz
//    'frequency_critical'   — fréquence réseau < 49.80 Hz
//
//  DÉLESTAGE / EXÉCUTION
//    'bcc_execution'        — BCC is CRITIQUE or SOUS-CONSIGNE (ecart < -threshold)
//    'feeder_overdue'       — feeder cut for > 45 min without rotation
//    'bcc_not_executed'     — programme validated but BCC hasn't maneuvered any feeder
//    'bcc_tolerance'        — BCC MW écart outside ±1.5 MW tolerance
//
//  RÉSEAU / TOPOLOGIE
//    'p0_affected'          — a feeder cut contains P0 site (hospital / water / security)
//    'line_tripped'         — HTB 225 kV / 150 kV line tripped automatically
//    'substation_lost'      — HTB substation out of service
//
//  SYSTÈME / SCADA
//    'telemetry_loss'       — no telemetry data from BCC for > N seconds
//    'bcc_offline'          — BCC SCADA connection lost
//    'cycle_blocked'        — rotation cycle has not progressed
//
//  OPÉRATIONNEL
//    'programme_not_set'    — J+1 programme not validated before deadline (from j1_reminder)
//    'programme_auto_zero'  — deadline passed, zero programme applied
//
// ── Scope ─────────────────────────────────────────────────────────────────────
//    'national'   | 'crc_nord' | 'crc_sud' | 'bcc'
//
// ── Severity ──────────────────────────────────────────────────────────────────
//    'critical'   — pulsing red, highest priority (P0 affected, freq critical, deficit >25%)
//    'warning'    — amber, needs attention (ecart >10%, feeder overdue, frequency vigilance)
//    'info'       — blue/grey, informational (order applied, rotation validated)
//
// ── Ack status ────────────────────────────────────────────────────────────────
//    'unhandled'  — problem exists, operator has NOT acknowledged
//    'handling'   — operator pressed "Pris en compte — En cours"
//    'resolved'   — issue resolved (auto or manual)

// ── Notification types (J+1 system) ──────────────────────────────────────────
//    'j1_reminder'    — DN: programme J+1 non saisi, rappel automatique
//    'j1_auto_zero'   — DN: délai dépassé, programme zéro appliqué automatiquement
//    'j1_published'   — CRC: DN a validé le programme J+1
//    'j1_assigned'    — BCC: CRC a diffusé la consigne

// ── Full alert shape ──────────────────────────────────────────────────────────
// {
//   id          : string           — unique, stable key (e.g. 'bcc-3-execution')
//   type        : string           — one of the categories above
//   severity    : 'critical' | 'warning' | 'info'
//   scope       : 'national' | 'crc_nord' | 'crc_sud' | 'bcc'
//   title       : string           — short human-readable label
//   detail      : string           — full technical description
//   crc         : string | null    — 'CRC Nord' | 'CRC Sud' | null
//   bcc         : string | null    — 'BCC 3' etc. | null
//   bccId       : number | null    — BCC numeric id
//   mwDeficit   : number           — MW value (negative = under-consigne)
//   since       : string           — 'HHhMM' timestamp when alert was raised
//   ackStatus   : string           — 'unhandled' | 'handling' | 'resolved'
//   ackTime     : string | null    — 'HHhMM' timestamp when acknowledged
//   isP0        : boolean          — true if P0 (critical infrastructure) is affected
//   autoResolve : boolean          — if true, store auto-resolves when condition clears
// }

export const useAlertStore = create((set, get) => ({

    // ── Operational alerts — populated at runtime by useAlertSync ─────────────
    alerts: [],

    // System notifications (J+1, reminders) — separate from operational alerts
    // Shape: { id, type, title, body, severity, createdAt, ackStatus }
    notifications: [],

    // Whether the alerts panel is currently open
    isPanelOpen: false,

    // ── Alert CRUD ────────────────────────────────────────────────────────────
    addAlert: (alert) =>
        set((s) => {
            if (s.alerts.find((a) => a.id === alert.id)) return s
            // Build a fully-shaped alert with safe defaults
            const shaped = {
                severity:    'warning',
                scope:       'national',
                title:       alert.type ?? 'Alerte',
                detail:      '',
                crc:         null,
                bcc:         null,
                bccId:       null,
                mwDeficit:   0,
                since:       _nowHHMM(),
                ackStatus:   'unhandled',
                ackTime:     null,
                isP0:        false,
                autoResolve: true,
                ...alert,
            }
            return { alerts: [...s.alerts, shaped] }
        }),

    // Update mutable fields of an existing alert (mwDeficit, detail, etc.)
    // without changing ackStatus — used when the underlying condition worsens.
    updateAlert: (id, patch) =>
        set((s) => ({
            alerts: s.alerts.map((a) => a.id === id ? { ...a, ...patch } : a),
        })),

    acknowledgeAlert: (id) => {
        const hhmm = _nowHHMM()
        set((s) => ({
            alerts: s.alerts.map((a) =>
                a.id === id ? { ...a, ackStatus: 'handling', ackTime: hhmm } : a
            ),
        }))
    },

    resolveAlert: (id) =>
        set((s) => ({
            alerts: s.alerts.map((a) =>
                a.id === id ? { ...a, ackStatus: 'resolved' } : a
            ),
        })),

    // ── Notification actions ──────────────────────────────────────────────────
    addNotification: ({ type, title, body, severity = 'info' }) =>
        set((s) => {
            const filtered = s.notifications.filter((n) => n.type !== type)
            return {
                notifications: [
                    {
                        id:        `notif-${type}-${Date.now()}`,
                        type, title, body, severity,
                        createdAt: _nowHHMM(':'),
                        ackStatus: 'unhandled',
                    },
                    ...filtered,
                ],
            }
        }),

    acknowledgeNotification: (id) =>
        set((s) => ({
            notifications: s.notifications.map((n) =>
                n.id === id ? { ...n, ackStatus: 'handling' } : n
            ),
        })),

    resolveNotification: (type) =>
        set((s) => ({
            notifications: s.notifications.filter((n) => n.type !== type),
        })),

    // ── Panel control ─────────────────────────────────────────────────────────
    openPanel:  () => set({ isPanelOpen: true  }),
    closePanel: () => set({ isPanelOpen: false }),

    // ── Computed helpers ──────────────────────────────────────────────────────
    activeAlerts: () => get().alerts.filter((a) => a.ackStatus !== 'resolved'),

    crcAlerts: (crcName) =>
        get().alerts.filter((a) => a.crc === crcName && a.ackStatus !== 'resolved'),

    hasUnhandled: () =>
        get().alerts.some((a) => a.ackStatus === 'unhandled'),

    // Live badge: unhandled operational + unhandled system notifications
    unreadCount: () => {
        const s = get()
        const ops   = s.alerts.filter((a) => a.ackStatus === 'unhandled').length
        const notif = s.notifications.filter((n) => n.ackStatus === 'unhandled').length
        return ops + notif
    },
}))

// ── Shared time helper ────────────────────────────────────────────────────────
function _nowHHMM(sep = 'h') {
    const n = new Date()
    return `${String(n.getHours()).padStart(2,'0')}${sep}${String(n.getMinutes()).padStart(2,'0')}`
}
