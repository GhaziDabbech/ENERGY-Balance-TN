import { create } from 'zustand'

// ── Alert types ───────────────────────────────────────────────────────────────
// 'bcc_execution'  — BCC did not execute the planned shedding
// 'consumption'    — national consumption spiked above J-1 forecast
// 'frequency'      — grid frequency dropped below threshold

// ── Ack status ────────────────────────────────────────────────────────────────
// 'unhandled'  — problem exists, DN/CRC has NOT acknowledged
// 'handling'   — operator pressed "Recu — En cours de traitement"
// 'resolved'   — issue is resolved (auto or manual)

export const useAlertStore = create((set, get) => ({

    // ── State — populated at runtime by useAlertSync from live DB data ────────
    alerts: [],

    // Number of alerts added since DN last opened the panel
    newAlertCount: 0,

    // Whether the DN has opened the panel at least once (stops the glow)
    panelOpened: false,

    // Whether the alerts panel is currently open
    isPanelOpen: false,

    // ── Actions ───────────────────────────────────────────────────────────────
    addAlert: (alert) =>
        set((s) => {
            // Never add duplicates
            if (s.alerts.find((a) => a.id === alert.id)) return s
            return {
                alerts:        [...s.alerts, alert],
                newAlertCount: s.newAlertCount + 1,
                panelOpened:   false,
            }
        }),

    acknowledgeAlert: (id) => {
        const now  = new Date()
        const hhmm = `${String(now.getHours()).padStart(2,'0')}h${String(now.getMinutes()).padStart(2,'0')}`
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

    // Called when DN opens the alerts panel
    openPanel:  () => set({ panelOpened: true, newAlertCount: 0, isPanelOpen: true }),
    closePanel: () => set({ isPanelOpen: false }),

    // Computed helpers
    activeAlerts: () => get().alerts.filter((a) => a.ackStatus !== 'resolved'),
    crcAlerts:    (crcName) => get().alerts.filter((a) => a.crc === crcName && a.ackStatus !== 'resolved'),
    hasUnhandled: () => get().alerts.some((a) => a.ackStatus === 'unhandled'),
}))
