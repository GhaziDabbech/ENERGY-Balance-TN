/**
 * liveStore — single source of truth for real-time operational state.
 *
 * Populated two ways:
 *   1. REST fetch on mount  (useOrders hook)
 *   2. WebSocket push       (useWebSocket hook)
 *
 * Consumed by:
 *   - DNDashboard  (show active orders, their status)
 *   - CRCDashboard (show orders targeted at this CRC, ack button)
 *   - BCCDashboard (show orders targeted at this BCC, execute button)
 *   - StatusBar    (active cuts count)
 */
import { create } from 'zustand'

export const useLiveStore = create((set, get) => ({

    // ── Active orders from backend ────────────────────────────────────────────
    // Shape matches OrderOut schema:
    // { id, order_ref, order_type, mw_total, mw_nord, mw_sud,
    //   status, issued_at, target_crc_id, acks: [] }
    orders: [],

    // ── Live executions (currently cutting) ──────────────────────────────────
    // Shape matches ExecutionOut schema:
    // { id, feeder_id, bcc_id, mw_shed, started_at, status }
    executions: [],

    // ── WebSocket connection status ───────────────────────────────────────────
    wsConnected: false,

    // ── Setters called by useOrders (REST) ────────────────────────────────────
    setOrders: (orders) => set({ orders }),
    setExecutions: (executions) => set({ executions }),

    // ── Updaters called by useWebSocket (push events) ─────────────────────────

    // New order broadcast from DN
    addOrUpdateOrder: (order) => set((s) => {
        const exists = s.orders.find((o) => o.id === order.id)
        if (exists) {
            return { orders: s.orders.map((o) => o.id === order.id ? { ...o, ...order } : o) }
        }
        return { orders: [order, ...s.orders] }
    }),

    // Order status changed (ack / execute / cancel)
    updateOrderStatus: (orderId, status, extra = {}) => set((s) => ({
        orders: s.orders.map((o) =>
            o.id === orderId ? { ...o, status, ...extra } : o
        ),
    })),

    // Cancel all active realim orders (urgence priority rule)
    cancelRealimOrders: () => set((s) => ({
        orders: s.orders.map((o) =>
            o.order_type === 'realim' && ['pending','acknowledged','executing'].includes(o.status)
                ? { ...o, status: 'cancelled' }
                : o
        ),
    })),

    // New execution started at a BCC
    addExecution: (execution) => set((s) => ({
        executions: [execution, ...s.executions],
    })),

    // Execution restored
    updateExecution: (execId, patch) => set((s) => ({
        executions: s.executions.map((e) =>
            e.id === execId ? { ...e, ...patch } : e
        ),
    })),

    setWsConnected: (v) => set({ wsConnected: v }),

    // ── Derived helpers ───────────────────────────────────────────────────────
    activeOrders: () => get().orders.filter(
        (o) => ['pending','acknowledged','executing'].includes(o.status)
    ),

    activeOrdersForCrc: (crcId) => get().orders.filter(
        (o) => ['pending','acknowledged','executing'].includes(o.status)
             && (o.target_crc_id === null || o.target_crc_id === crcId)
    ),

    activeOrdersForBcc: () => get().orders.filter(
        (o) => ['pending','acknowledged','executing'].includes(o.status)
    ),

    activeCutsCount: () => get().executions.filter((e) => e.status === 'executing').length,
}))
