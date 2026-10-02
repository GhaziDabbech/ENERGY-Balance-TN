/**
 * useOrders
 *
 * Loads active orders from the DB on mount and pushes them into liveStore.
 * WebSocket then keeps them up to date in real time.
 *
 * Call once high up in the component tree (InternalLayout) so all
 * dashboards share the same data.
 *
 * Self-healing: any order that is still 'pending'/'acknowledged'/'executing'
 * but has zero active executions (all restored or no executions at all AND
 * the order was issued more than a grace period ago) is auto-completed here.
 * This cleans up orders that got stuck before the /complete endpoint existed.
 */
import { useEffect } from 'react'
import api                  from '../lib/api'
import { useLiveStore }     from '../stores/liveStore'
import { useBccOrderStore } from '../stores/bccOrderStore'

// Orders older than this with no active executions are considered stale and
// auto-completed. 4 hours covers any realistic operational window.
const STALE_ORDER_MS = 4 * 60 * 60 * 1000

export function useOrders() {
    const setOrders     = useLiveStore((s) => s.setOrders)
    const setExecutions = useLiveStore((s) => s.setExecutions)

    useEffect(() => {
        let cancelled = false

        async function load() {
            try {
                // Fetch active orders + all current executions in parallel
                const [ordersRes, execRes] = await Promise.all([
                    api.get('/api/v1/orders', { params: { limit: 50 } }),
                    api.get('/api/v1/executions', { params: { status: 'executing', limit: 100 } }),
                ])
                if (cancelled) return

                const activeExecOrderIds = new Set(
                    (execRes.data || []).map((e) => e.order_id).filter(Boolean)
                )
                const now = Date.now()

                // Partition: truly active vs stuck (no live executions + past grace period)
                const genuinelyActive = []
                const stuckOrders     = []

                for (const o of (ordersRes.data || [])) {
                    if (!['pending','acknowledged','executing'].includes(o.status)) continue

                    const age = now - new Date(o.issued_at).getTime()
                    const hasActiveExec = activeExecOrderIds.has(o.id)

                    // An order is stuck when it has no active executions AND is old enough
                    // that it can't still be legitimately in-flight (grace = STALE_ORDER_MS)
                    if (!hasActiveExec && age > STALE_ORDER_MS) {
                        stuckOrders.push(o)
                    } else {
                        genuinelyActive.push(o)
                    }
                }

                // Self-heal: complete stuck orders in the background (fire-and-forget)
                stuckOrders.forEach((o) => {
                    api.patch(`/api/v1/orders/${o.id}/complete`)
                        .catch((err) => console.warn(`[useOrders] Could not auto-complete stuck order ${o.id}:`, err.message))
                })

                setOrders(genuinelyActive)
                setExecutions(execRes.data || [])

                // ── Evict stale legacy orders from bccOrderStore ──────────────
                // bccOrderStore persists to localStorage, so old copies survive
                // logout/login cycles.  Now that we have the authoritative DB list,
                // drop any legacy entry whose orderRef is already covered by a real
                // DB order (it will be shown via liveStore instead) OR that has no
                // DB match at all and is therefore a ghost from a previous session.
                const dbRefs = new Set(genuinelyActive.map((o) => o.order_ref))
                const legacy = useBccOrderStore.getState().orders
                if (legacy.length > 0) {
                    useBccOrderStore.setState({
                        orders: legacy.filter(
                            (o) => !dbRefs.has(o.orderRef)  // keep only truly local-only orders
                                && ['pending','acknowledged'].includes(o.status)
                                // Hard age-cap: drop anything older than 4 h that has no DB
                                // counterpart — it is definitively stale.
                                && (Date.now() - new Date(o.issuedAt).getTime()) < 4 * 60 * 60 * 1000
                        ),
                    })
                }
            } catch (err) {
                // Non-fatal — WebSocket will keep things up to date
                console.warn('[useOrders] initial load failed:', err.message)
            }
        }

        load()
        return () => { cancelled = true }
    }, [setOrders, setExecutions])
}
