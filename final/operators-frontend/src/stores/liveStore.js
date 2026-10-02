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
import { persist } from 'zustand/middleware'

export const useLiveStore = create(
persist(
(set, get) => ({

    // ── Active orders from backend ────────────────────────────────────────────
    // Shape matches OrderOut schema:
    // { id, order_ref, order_type, mw_total, mw_nord, mw_sud,
    //   status, issued_at, target_crc_id, acks: [] }
    orders: [],

    // IDs of orders the BCC operator has completed this session.
    // Persisted so a navigation-triggered remount + DB re-fetch can't resurrect
    // a dismissed order (race between optimistic update and backend commit).
    // Stored as an Array in localStorage (Set is not JSON-serializable).
    completedOrderIds: [],

    // ── Live executions (currently cutting) ──────────────────────────────────
    // Shape matches ExecutionOut schema:
    // { id, feeder_id, bcc_id, mw_shed, started_at, status }
    executions: [],

    // ── WebSocket connection status ───────────────────────────────────────────
    wsConnected: false,

    // ── Setters called by useOrders (REST) ────────────────────────────────────
    // On each REST fetch, if there are no active CRC urgences in the DB snapshot,
    // reset frozenUrgenceDelta to 0 to clear any stale persisted value from a
    // previous session. If active urgences exist, preserve the current value —
    // BCCDashboard's useEffect will set it correctly for this specific BCC.
    setOrders: (orders) => {
        set((s) => {
            // Protect any order that was optimistically completed this session
            // (operator pressed "Reçu", mission was met, handleExecute fired).
            // s.completedOrderIds persists across navigation so a stale DB fetch
            // on remount never restores a dismissed order back to 'acknowledged'.
            const completedSet = new Set(s.completedOrderIds ?? [])

            const merged = orders.map((o) =>
                completedSet.has(o.id) ? { ...o, status: 'completed' } : o
            )

            // If there are no active CRC-issued urgences in the fresh DB snapshot,
            // reset frozenUrgenceDelta — it's a stale persisted value from a previous
            // session. This prevents the phantom URG segment on the progress bar.
            const hasActiveCrcUrgence = merged.some(
                (o) => o.order_type === 'urgence'
                    && ['pending','acknowledged','executing'].includes(o.status)
                    && o.issued_by_role !== 'DN'
            )

            return {
                orders: merged,
                // Only reset — never set here (BCCDashboard useEffect sets it per-BCC).
                frozenUrgenceDelta: hasActiveCrcUrgence ? s.frozenUrgenceDelta : 0,
            }
        })
    },
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
    updateOrderStatus: (orderId, status, extra = {}) => set((s) => {
        // When an order is marked completed, record its ID so setOrders()
        // never lets a stale DB fetch resurrect it after a navigation remount.
        const prev = s.completedOrderIds ?? []
        const completedOrderIds = status === 'completed' && !prev.includes(orderId)
            ? [...prev, orderId]
            : prev
        return {
            orders: s.orders.map((o) =>
                o.id === orderId ? { ...o, status, ...extra } : o
            ),
            completedOrderIds,
        }
    }),

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

    // ── Feeder tile reload signal ─────────────────────────────────────────────
    // Incrementing this counter tells useBCCState to re-run overlayExecState()
    // so feeder tiles reflect the new execution state without a full page reload.
    // Incremented by useWebSocket on new_execution / execution_restored events.
    execReloadSignal: 0,
    bumpExecReload: () => set((s) => ({ execReloadSignal: s.execReloadSignal + 1 })),

    // ── Timeseries reload signal ──────────────────────────────────────────────
    // Incrementing this counter triggers useTimeseries to re-fetch immediately.
    // Bumped by useWebSocket on auto_exec_slot / new_execution / execution_restored
    // so the CRC and DN charts update in real-time without waiting for the 5-min poll.
    tsReloadSignal: 0,
    bumpTsReload: () => set((s) => ({ tsReloadSignal: s.tsReloadSignal + 1 })),

    // BCC's current active MW — updated by BCCDashboard on every render
    // so BCCOrderPopup can read it without prop-drilling
    bccActiveMW:    0,
    bccActiveMWSet: false,   // flips true once BCCDashboard writes the first real value
    setBccActiveMW: (mw) => set({ bccActiveMW: mw, bccActiveMWSet: true }),

    // BCC's J+1 consigne target — written by BCCDashboard so BCCOrderPopup can
    // compute the excess-only check (only MW above J+1 counts toward URG coverage).
    bccTarget: 0,
    setBccTarget: (mw) => set({ bccTarget: mw }),

    // Frozen urgence delta — the peak urgence MW seen this session.
    // Persists so the progress bar keeps showing the URG segment even after
    // individual orders are dismissed.
    frozenUrgenceDelta: 0,
    setFrozenUrgenceDelta: (mw) => set({ frozenUrgenceDelta: mw }),
    // Called when a realim order completes — permanently reduces frozenUrgenceDelta
    // so the URG segment shrinks and stays shrunk (URG first, then J+1 implicitly).
    applyRealimToFrozen: (realimMW) => set((s) => ({
        frozenUrgenceDelta: Math.max(0, s.frozenUrgenceDelta - realimMW),
    })),
    resetFrozenUrgenceDelta: () => set({ frozenUrgenceDelta: 0 }),

    // MW baseline at acknowledgement time — keyed by order id.
    // An urgence order is only "met" when (activeMW - baseline) >= mwTarget,
    // i.e. the BCC has cut that many additional MW *since* pressing Reçu.
    ackBaselines: {},
    setAckBaseline: (orderId, mw) => set((s) => ({
        ackBaselines: { ...s.ackBaselines, [String(orderId)]: mw }
    })),
    clearAckBaseline: (orderId) => set((s) => {
        const next = { ...s.ackBaselines }
        delete next[String(orderId)]
        delete next[orderId]   // also clear numeric key if it somehow exists
        return { ackBaselines: next }
    }),

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
}),
{
    name: 'steg-live',
    // Only persist these fields across navigation/refresh.
    // Everything else is rebuilt from the REST fetch / WebSocket on mount.
    partialize: (state) => ({
        frozenUrgenceDelta: state.frozenUrgenceDelta,
        // Prevents a stale DB fetch from resurrecting dismissed orders.
        // Cleared on logout (auth store calls liveStore.reset or page reloads).
        completedOrderIds:  state.completedOrderIds,
        // Persisted so isMet checks keep working after navigation / HMR.
        // Cleared per-order when an order is completed (clearAckBaseline).
        ackBaselines:       state.ackBaselines,
    }),
}
))
