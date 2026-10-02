import { create }  from 'zustand'
import { persist } from 'zustand/middleware'

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
                const ref  = order.orderRef
                    ?? `URG-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(get().urgences.length + 1).padStart(3,'0')}`

                set
                (
                    (state) =>
                    ({
                        realims: state.realims
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
                                ,mwDispatched:   0    // MW already sent to BCCs by this CRC
                            }
                        ]
                    })
                )
            }

            // Called by DN when emitting a réalimentation order (partial or full restore)
            // type: 'partielle' | 'totale'
            ,addRealim: (order) =>
            {
                const now  = new Date()
                const hhmm = `${String(now.getHours()).padStart(2,'0')}h${String(now.getMinutes()).padStart(2,'0')}`
                // Use the real DB ref when provided (CRC receiving via WS).
                const ref  = order.orderRef
                    ?? `REA-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(get().realims.filter((r) => r.status !== 'cancelled').length + 1).padStart(3,'0')}`

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
                                ,mwDispatched:   0    // MW already sent to BCCs by this CRC
                            }
                        ]
                    })
                )
                // NOTE: do NOT call api.post() here — DNDashboard.handleRealimEmis handles it.
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

            // Partial dispatch — CRC sends mwSent MW to BCCs, reducing the obligation.
            // Removes the realim when fully covered (remaining <= 0.5).
            ,partialRealim: (id, mwSent, crcZone = 'nord') =>
            {
                set
                (
                    (state) =>
                    ({
                        realims: state.realims
                            .map((r) =>
                            {
                                if (r.id !== id) return r
                                const mwDispatched = (r.mwDispatched ?? 0) + mwSent
                                const mwTarget     = crcZone === 'sud' ? (r.mwSud ?? r.mwNord ?? r.mwTotal ?? 0) : (r.mwNord ?? r.mwTotal ?? 0)
                                const remaining    = mwTarget - mwDispatched
                                return { ...r, mwDispatched, status: remaining <= 0.5 ? 'dispatched' : r.status }
                            })
                            .filter((r) => r.status !== 'dispatched')
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

            // Step 2 — CRC dispatches MW to BCCs (may be partial).
            // Increments mwDispatched. Removes the order only when the full
            // CRC-zone MW has been dispatched (remaining <= 0).
            // crcZone: 'nord' | 'sud' — determines which field to compare against.
            ,partialDispatch: (id, mwSent, crcZone = 'nord') =>
            {
                set
                (
                    (state) =>
                    ({
                        urgences: state.urgences
                            .map((o) =>
                            {
                                if (o.id !== id) return o
                                const mwDispatched = (o.mwDispatched ?? 0) + mwSent
                                const mwTarget     = crcZone === 'sud' ? (o.mwSud ?? o.mwNord ?? 0) : (o.mwNord ?? 0)
                                const remaining    = mwTarget - mwDispatched
                                // Mark as dispatched when fully covered — filter removes it below
                                return { ...o, mwDispatched, status: remaining <= 0.5 ? 'dispatched' : o.status }
                            })
                            .filter((o) => o.status !== 'dispatched')
                    })
                )
            }

            // Legacy: used by old code paths — maps to full dispatch (mwSent = full target)
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

            // Evict urgences/realims by DB order_ref — called when liveStore
            // marks an order completed/cancelled so the CRC button stops flashing.
            ,evictByRef: (orderRef) =>
            {
                set
                (
                    (state) =>
                    ({
                        urgences: state.urgences.filter((o) => o.orderRef !== orderRef)
                        ,realims: state.realims.filter((r) => r.orderRef !== orderRef)
                    })
                )
            }

            // Track whether the CRC urgence modal is open
            // Used to hide the floating badge while the modal covers it
            ,setModalOpen: (val) => set({ modalOpen: val })

            // seedDemo is intentionally disabled — the app now receives real DB
            // orders via liveStore + WebSocket.  Injecting hardcoded fake orders
            // here caused duplicate blocking modals that stacked on every login.
            ,seedDemo: () => {}      // no-op
        })
        ,{
            name: 'steg-urgences'
            // Only persist modalOpen — urgences and realims are rebuilt from
            // the WebSocket / REST on every mount. Persisting them caused the
            // "Délestage d'urgence" button to stay permanently animated because
            // acknowledged orders from previous sessions survived navigation.
            ,partialize: (state) => ({ modalOpen: state.modalOpen })
        }
    )
)
