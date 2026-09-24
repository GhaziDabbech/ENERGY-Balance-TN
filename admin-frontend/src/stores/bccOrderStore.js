import { create }  from 'zustand'
import { persist } from 'zustand/middleware'

// ── Persisted BCC order store ─────────────────────────────────────────────────
// Orders flow from CRC → BCC, two types:
//   type: 'urgence'  → cut additional MW immediately (red)
//   type: 'realim'   → restore MW (green/blue)
//
// States (same pattern as CRC urgenceStore):
//   'pending'      → blocking modal shown
//   'acknowledged' → BCC pressed "Reçu", floating badge shown
//   'executed'     → BCC completed action, removed from store
//
// Shape: { id, orderRef, issuedAt, time, type, mwTarget, targetBCC, status, acknowledgedAt }

export const useBccOrderStore = create
(
    persist
    (
        (set, get) =>
        ({
            orders:    []
            ,modalOpen: false

            // Called by CRC when dispatching to BCCs (future backend integration)
            ,addOrder: (order) =>
            {
                const now  = new Date()
                const hhmm = `${String(now.getHours()).padStart(2,'0')}h${String(now.getMinutes()).padStart(2,'0')}`
                const type = order.type ?? 'urgence'
                const prefix = type === 'realim' ? 'REA' : 'URG'
                const ref  = `${prefix}-BCC3-${String(get().orders.length + 1).padStart(3,'0')}`

                set
                (
                    (state) =>
                    {
                        // Rule: if a new urgence arrives, cancel all pending/acknowledged realim orders.
                        // Shedding takes absolute priority over restoration.
                        const filteredOrders = type === 'urgence'
                            ? state.orders.filter((o) => o.type !== 'realim')
                            : state.orders

                        return {
                            orders:
                            [
                                ...filteredOrders
                                ,{
                                    id:              Date.now()
                                    ,orderRef:       ref
                                    ,issuedAt:       now.toISOString()
                                    ,time:           hhmm
                                    ,type
                                    ,mwTarget:       order.mwTarget
                                    ,targetBCC:      order.targetBCC ?? 'BCC 3'
                                    ,status:         'pending'
                                    ,acknowledgedAt: null
                                }
                            ]
                        }
                    }
                )
            }

            // Step 1 — BCC presses "Reçu — Pris en charge"
            ,acknowledgeReceipt: (id) =>
            {
                set
                (
                    (state) =>
                    ({
                        orders: state.orders.map
                        (
                            (o) => o.id === id
                                ? { ...o, status: 'acknowledged', acknowledgedAt: new Date().toISOString() }
                                : o
                        )
                    })
                )
            }

            // Step 2 — BCC executes and presses confirm
            ,executeComplete: (id) =>
            {
                set
                (
                    (state) =>
                    ({
                        orders: state.orders.filter((o) => o.id !== id)
                    })
                )
            }

            ,clearAll: () => set({ orders: [] })

            // Cancel all realim orders — called when an urgence is active (shedding priority)
            ,cancelRealimOrders: () =>
            {
                set((state) => ({ orders: state.orders.filter((o) => o.type !== 'realim') }))
            }

            ,setModalOpen: (val) => set({ modalOpen: val })

            // Seed demo — one urgence cut + one réalimentation, both pending
            ,seedDemo: () =>
            {
                set
                (
                    {
                        modalOpen: false
                        ,orders:
                        [
                            {
                                id:              800001
                                ,orderRef:       'URG-BCC3-001'
                                ,issuedAt:       new Date(Date.now() - 5 * 60 * 1000).toISOString()
                                ,time:           '14h52'
                                ,type:           'urgence'
                                ,mwTarget:       8
                                ,targetBCC:      'BCC 3'
                                ,status:         'pending'
                                ,acknowledgedAt: null
                            }
                            ,{
                                id:              800002
                                ,orderRef:       'REA-BCC3-001'
                                ,issuedAt:       new Date(Date.now() - 2 * 60 * 1000).toISOString()
                                ,time:           '14h55'
                                ,type:           'realim'
                                ,mwTarget:       6
                                ,targetBCC:      'BCC 3'
                                ,status:         'pending'
                                ,acknowledgedAt: null
                            }
                        ]
                    }
                )
            }
        })
        ,{ name: 'steg-bcc-orders' }
    )
)
