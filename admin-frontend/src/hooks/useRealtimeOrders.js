/**
 * useRealtimeOrders
 *
 * Opens a WebSocket connection to the backend when the user is logged in.
 * Listens for real-time events and syncs them into the appropriate Zustand
 * stores (urgenceStore for CRC, bccOrderStore for BCC).
 *
 * Events handled:
 *   new_order       → new urgence or réalimentation emitted by DN
 *   order_acked     → a CRC/BCC pressed Reçu
 *   order_executed  → a BCC confirmed execution
 *   order_cancelled → DN or contra-order cancelled an active order
 */
import { useEffect, useRef } from 'react'
import { useAuthStore }       from '../stores/authStore'
import { useUrgenceStore }    from '../stores/urgenceStore'
import { useBccOrderStore }   from '../stores/bccOrderStore'

const WS_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000')
    .replace(/^http/, 'ws')   // http → ws, https → wss

export function useRealtimeOrders()
{
    const { user, token }           = useAuthStore()
    const { addUrgence, addRealim } = useUrgenceStore()
    const { addOrder }              = useBccOrderStore()
    const wsRef                     = useRef(null)
    const reconnectTimer            = useRef(null)

    useEffect
    (
        () =>
        {
            if (!user || !token) return

            let dead = false

            function connect()
            {
                if (dead) return
                const ws = new WebSocket(`${WS_BASE}/ws?token=${token}`)
                wsRef.current = ws

                ws.onopen = () =>
                {
                    console.info('[WS] Connected — role:', user.role)
                    // Keep-alive ping every 30s
                    ws._pingInterval = setInterval
                    (
                        () => ws.readyState === WebSocket.OPEN && ws.send('ping')
                        ,30_000
                    )
                }

                ws.onmessage = (evt) =>
                {
                    let msg
                    try { msg = JSON.parse(evt.data) } catch { return }

                    if (msg === 'pong' || msg?.event === 'connected') return

                    switch (msg.event)
                    {
                        case 'new_order':
                        {
                            const now  = new Date()
                            const hhmm = `${String(now.getHours()).padStart(2,'0')}h${String(now.getMinutes()).padStart(2,'0')}`

                            if (msg.order_type === 'urgence')
                            {
                                // CRC receives urgence from DN
                                if (user.role === 'CRC')
                                {
                                    useUrgenceStore.getState().urgences.some
                                    (
                                        (o) => o.orderRef === msg.order_ref
                                    ) || addUrgence
                                    ({
                                        mwTotal: msg.mw_total
                                        ,mwNord: msg.mw_nord
                                        ,mwSud:  msg.mw_sud
                                    })
                                }
                                // BCC receives urgence from CRC
                                if (user.role === 'BCC')
                                {
                                    useBccOrderStore.getState().orders.some
                                    (
                                        (o) => o.orderRef === msg.order_ref
                                    ) || addOrder
                                    ({
                                        type:      'urgence'
                                        ,mwTarget: msg.mw_nord   // BCC sees CRC-level MW
                                        ,targetBCC: `BCC ${user.bcc_id}`
                                    })
                                }
                            }

                            if (msg.order_type === 'realim')
                            {
                                if (user.role === 'CRC')
                                {
                                    useUrgenceStore.getState().realims.some
                                    (
                                        (r) => r.orderRef === msg.order_ref
                                    ) || addRealim
                                    ({
                                        type:   msg.sub_type ?? 'partielle'
                                        ,mwTotal: msg.mw_total
                                        ,mwNord:  msg.mw_nord
                                        ,mwSud:   msg.mw_sud
                                    })
                                }
                                if (user.role === 'BCC')
                                {
                                    useBccOrderStore.getState().orders.some
                                    (
                                        (o) => o.orderRef === msg.order_ref
                                    ) || addOrder
                                    ({
                                        type:      'realim'
                                        ,mwTarget: msg.mw_nord
                                        ,targetBCC: `BCC ${user.bcc_id}`
                                    })
                                }
                            }
                            break
                        }

                        case 'order_cancelled':
                        {
                            // Contra-order: remove from local stores
                            if (user.role === 'CRC')
                            {
                                const { urgences, realims } = useUrgenceStore.getState()
                                // Mark matching entries as cancelled
                                useUrgenceStore.setState
                                ({
                                    urgences: urgences.map((o) =>
                                        o.orderRef === msg.order_ref
                                            ? { ...o, status: 'cancelled' } : o
                                    )
                                    ,realims: realims.map((r) =>
                                        r.orderRef === msg.order_ref
                                            ? { ...r, status: 'cancelled' } : r
                                    )
                                })
                            }
                            break
                        }

                        default:
                            break
                    }
                }

                ws.onerror = (err) =>
                {
                    console.warn('[WS] Error:', err)
                }

                ws.onclose = (evt) =>
                {
                    clearInterval(ws._pingInterval)
                    console.info('[WS] Closed — code:', evt.code)
                    // Auto-reconnect unless closed intentionally (4001 = bad token)
                    if (!dead && evt.code !== 4001)
                    {
                        reconnectTimer.current = setTimeout(connect, 3000)
                    }
                }
            }

            connect()

            return () =>
            {
                dead = true
                clearTimeout(reconnectTimer.current)
                if (wsRef.current)
                {
                    clearInterval(wsRef.current._pingInterval)
                    wsRef.current.close()
                }
            }
        }
        // Re-connect when token changes (new login)
        // eslint-disable-next-line react-hooks/exhaustive-deps
        ,[token]
    )
}
