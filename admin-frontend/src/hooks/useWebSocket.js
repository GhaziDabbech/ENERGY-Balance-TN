/**
 * useWebSocket
 *
 * Connects to ws://localhost:8000/ws?token=<jwt> on mount.
 * Dispatches incoming events into liveStore so all dashboards
 * update in real time without polling.
 *
 * Events handled:
 *   connected        — server confirms connection
 *   new_order        — DN created an order → add to store
 *   order_acked      — CRC pressed Reçu    → update status
 *   order_executed   — BCC confirmed exec  → update status
 *   order_cancelled  — DN cancelled        → update status
 *   new_execution    — BCC cut a feeder    → add execution
 *   execution_restored — BCC restored      → update execution
 *
 * Reconnects automatically after 3 s on unexpected disconnect.
 */
import { useEffect, useRef } from 'react'
import { useAuthStore }  from '../stores/authStore'
import { useLiveStore }  from '../stores/liveStore'

const WS_BASE      = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'
const RECONNECT_MS = 3000

export function useWebSocket() {
    const token        = useAuthStore((s) => s.token)
    const store        = useLiveStore()
    const wsRef        = useRef(null)
    const retryRef     = useRef(null)
    const mountedRef   = useRef(true)

    useEffect(() => {
        mountedRef.current = true
        if (!token) return

        function connect() {
            if (!mountedRef.current) return
            const ws = new WebSocket(`${WS_BASE}/ws?token=${token}`)
            wsRef.current = ws

            ws.onopen = () => {
                store.setWsConnected(true)
                // keep-alive ping every 25 s
                retryRef.current = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) ws.send('ping')
                }, 25_000)
            }

            ws.onmessage = (evt) => {
                let data
                try { data = JSON.parse(evt.data) } catch { return }
                if (data === 'pong') return

                switch (data.event) {
                    case 'new_order':
                        // If urgence arrives, cancel any active realim in store
                        if (data.order_type === 'urgence') store.cancelRealimOrders()
                        store.addOrUpdateOrder({
                            id:            data.order_id  ?? Date.now(),
                            order_ref:     data.order_ref,
                            order_type:    data.order_type,
                            mw_total:      data.mw_total,
                            mw_nord:       data.mw_nord  ?? 0,
                            mw_sud:        data.mw_sud   ?? 0,
                            status:        data.status   ?? 'pending',
                            issued_at:     data.issued_at,
                            target_crc_id: data.target_crc_id ?? null,
                            acks:          [],
                        })
                        break

                    case 'order_acked':
                        store.updateOrderStatus(data.order_id, 'acknowledged')
                        break

                    case 'order_executed':
                        store.updateOrderStatus(data.order_id, data.order_status ?? 'executing')
                        break

                    case 'order_cancelled':
                        store.updateOrderStatus(data.order_id, 'cancelled')
                        break

                    case 'new_execution':
                        store.addExecution(data.execution)
                        break

                    case 'execution_restored':
                        store.updateExecution(data.execution_id, { status: 'restored', ended_at: data.ended_at })
                        break

                    default:
                        break
                }
            }

            ws.onerror = () => {
                store.setWsConnected(false)
            }

            ws.onclose = () => {
                store.setWsConnected(false)
                clearInterval(retryRef.current)
                if (mountedRef.current) {
                    // Auto-reconnect
                    retryRef.current = setTimeout(connect, RECONNECT_MS)
                }
            }
        }

        connect()

        return () => {
            mountedRef.current = false
            clearInterval(retryRef.current)
            clearTimeout(retryRef.current)
            if (wsRef.current) wsRef.current.close()
        }
    }, [token]) // reconnect if token changes (re-login)
}
