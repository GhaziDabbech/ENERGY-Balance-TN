/**
 * useOrders
 *
 * Loads active orders from the DB on mount and pushes them into liveStore.
 * WebSocket then keeps them up to date in real time.
 *
 * Call once high up in the component tree (InternalLayout) so all
 * dashboards share the same data.
 */
import { useEffect } from 'react'
import api           from '../lib/api'
import { useLiveStore } from '../stores/liveStore'

export function useOrders() {
    const setOrders     = useLiveStore((s) => s.setOrders)
    const setExecutions = useLiveStore((s) => s.setExecutions)

    useEffect(() => {
        let cancelled = false

        async function load() {
            try {
                // Active orders (pending / acknowledged / executing)
                const [ordersRes, execRes] = await Promise.all([
                    api.get('/api/v1/orders', {
                        params: { limit: 50 },
                    }),
                    api.get('/api/v1/executions', {
                        params: { status: 'executing', limit: 100 },
                    }),
                ])
                if (cancelled) return
                // Filter to only active orders
                const active = (ordersRes.data || []).filter(
                    (o) => ['pending','acknowledged','executing'].includes(o.status)
                )
                setOrders(active)
                setExecutions(execRes.data || [])
            } catch (err) {
                // Non-fatal — WebSocket will keep things up to date
                console.warn('[useOrders] initial load failed:', err.message)
            }
        }

        load()
        return () => { cancelled = true }
    }, [setOrders, setExecutions])
}
