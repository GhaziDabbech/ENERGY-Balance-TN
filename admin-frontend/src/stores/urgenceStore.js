import { create }  from 'zustand'
import { persist } from 'zustand/middleware'
import api          from '../lib/api'

// ── Persisted urgence orders store ───────────────────────────────────────────
// Each order goes through three states:
//   'pending'      → blocking modal shown, CRC has not pressed anything yet
//   'acknowledged' → CRC pressed "Reçu — Pris en charge", floating badge shown
//   'dispatched'   → CRC distributed MW to BCCs, fully removed from store
//
// Shape of each order:
//   { id, orderRef, issuedAt, time, mwTotal, mwNord, mwSud, targetCRC, status, acknowledgedAt }

export const useUrgenceStore = create
(
    persist
    (
        (set, get) =>
        ({
            urgences:    []      // all active urgence orders (pending + acknowledged)
            ,realims:    []      // all active réalimentation orders { id, orderRef, issuedAt, time, type, mwTotal, mwNord, mwSud, status, cancelledBy }
            ,modalOpen:  false   // true while CRCUrgenceModal is open — hides the floating badge

            // Called by DN when emitting an urgence order
            // Also auto-cancels any pending réalimentation (contre-ordre logic)
            ,addUrgence: (order) =>
            {
                const now  = new Date()
                const hhmm = `${String(now.getHours()).padStart(2,'0')}h${String(now.getMinutes()).padStart(2,'0')}`
                const ref  = `URG-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(get().urgences.length + 1).padStart(3,'0')}`

                // Snapshot pending realims before clearing them (for contra-order notice)
                const cancelledRealims = get().realims.filter
                (
                    (r) => r.status === 'pending' || r.status === 'acknowledged'
                )

                set
                (
                    (state) =>
                    ({
                        // Cancel all active realims — keep for audit trail
                        realims: state.realims.map
                        (
                            (r) => (r.status === 'pending' || r.status === 'acknowledged')
                                ? { ...r, status: 'cancelled', cancelledBy: ref }
                                : r
                        )
                        ,urgences:
                        [
                            ...state.urgences
                            ,{
                                id:              Date.now()
                                ,orderRef:       ref
                                ,issuedAt:       now.toISOString()
                                ,time:           hhmm
                                ,mwTotal:        order.mwTotal
                                ,mwNord:         order.mwNord
                                ,mwSud:          order.mwSud
                                ,targetCRC:      'both'
                                ,status:         'pending'
                                ,acknowledgedAt: null
                                // Embed cancelled realim info for the contra-order notice
                                ,cancelledRealims: cancelledRealims.length > 0 ? cancelledRealims : null
                            }
                        ]
                    })
                )

                // Persist to backend async — local state already updated above
                api.post('/api/v1/orders',
                {
                    order_type:    'urgence'
                    ,mw_total:     order.mwTotal
                    ,mw_nord:      order.mwNord
                    ,mw_sud:       order.mwSud
                    ,target_crc_id: null
                }).catch((err) => console.error('[urgenceStore] Failed to persist urgence to backend:', err))
            }

            // Called by DN when emitting a réalimentation order (partial or full restore)
            // type: 'partielle' | 'totale'
            ,addRealim: (order) =>
            {
                const now  = new Date()
                const hhmm = `${String(now.getHours()).padStart(2,'0')}h${String(now.getMinutes()).padStart(2,'0')}`
                const ref  = `REA-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(get().realims.filter((r) => r.status !== 'cancelled').length + 1).padStart(3,'0')}`

                set
                (
                    (state) =>
                    ({
                        realims:
                        [
                            ...state.realims
                            ,{
                                id:              Date.now()
                                ,orderRef:       ref
                                ,issuedAt:       now.toISOString()
                                ,time:           hhmm
                                ,type:           order.type ?? 'partielle'
                                ,mwTotal:        order.mwTotal
                                ,mwNord:         order.mwNord
                                ,mwSud:          order.mwSud
                                ,status:         'pending'
                                ,cancelledBy:    null
                                ,executedNord:   0
                                ,executedSud:    0
                            }
                        ]
                    })
                )

                // Persist to backend async
                api.post('/api/v1/orders',
                {
                    order_type:     'realim'
                    ,sub_type:      order.type ?? 'partielle'
                    ,mw_total:      order.mwTotal
                    ,mw_nord:       order.mwNord
                    ,mw_sud:        order.mwSud
                    ,target_crc_id: null
                }).catch((err) => console.error('[urgenceStore] Failed to persist realim to backend:', err))
            }

            // Mark a realim as fully executed (remove from active list)
            ,completeRealim: (id) =>
            {
                set
                (
                    (state) =>
                    ({
                        realims: state.realims.filter((r) => r.id !== id)
                    })
                )
            }

            // Manual cancel by DN
            ,cancelRealim: (id) =>
            {
                set
                (
                    (state) =>
                    ({
                        realims: state.realims.map
                        (
                            (r) => r.id === id ? { ...r, status: 'cancelled', cancelledBy: 'DN-MANUAL' } : r
                        )
                    })
                )
            }

            // Step 1 — CRC presses "Reçu — Pris en charge"
            // Closes the blocking modal, switches to floating badge
            ,acknowledgeReceipt: (id) =>
            {
                set
                (
                    (state) =>
                    ({
                        urgences: state.urgences.map
                        (
                            (o) => o.id === id
                                ? { ...o, status: 'acknowledged', acknowledgedAt: new Date().toISOString() }
                                : o
                        )
                    })
                )
            }

            // Step 2 — CRC completes BCC distribution and presses "Envoyer aux BCCs"
            // Fully removes the order — floating badge disappears
            ,dispatchComplete: (id) =>
            {
                set
                (
                    (state) =>
                    ({
                        urgences: state.urgences.filter((o) => o.id !== id)
                    })
                )
            }

            // Legacy alias — used in old code, maps to dispatchComplete
            ,acknowledgeUrgence: (id) =>
            {
                set
                (
                    (state) =>
                    ({
                        urgences: state.urgences.filter((o) => o.id !== id)
                    })
                )
            }

            // Clear all (utility for dev/demo)
            ,clearAll: () => set({ urgences: [], realims: [] })

            // Track whether the CRC urgence modal is open
            // Used to hide the floating badge while the modal covers it
            ,setModalOpen: (val) => set({ modalOpen: val })

            // Seed demo pending orders — always resets to the 2-order demo state
            // Called on every CRC login for demo purposes
            ,seedDemo: () =>
            {
                set
                (
                    {
                        modalOpen: false
                        ,realims:  []
                        ,urgences:
                        [
                            {
                                id:              900001
                                ,orderRef:       'URG-2026-0903-001'
                                ,issuedAt:       new Date(Date.now() - 8 * 60 * 1000).toISOString()   // 8 min ago
                                ,time:           '14h47'
                                ,mwTotal:        82
                                ,mwNord:         54
                                ,mwSud:          28
                                ,targetCRC:      'both'
                                ,status:         'pending'
                                ,acknowledgedAt: null
                            }
                            ,{
                                id:              900002
                                ,orderRef:       'URG-2026-0903-002'
                                ,issuedAt:       new Date(Date.now() - 3 * 60 * 1000).toISOString()   // 3 min ago
                                ,time:           '14h52'
                                ,mwTotal:        50
                                ,mwNord:         33
                                ,mwSud:          17
                                ,targetCRC:      'both'
                                ,status:         'pending'
                                ,acknowledgedAt: null
                            }
                        ]
                    }
                )
            }
        })
        ,{ name: 'steg-urgences' }
    )
)
