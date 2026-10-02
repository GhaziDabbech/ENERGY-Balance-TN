/**
 * useTimeseries
 *
 * Fetches /api/v1/kpis/timeseries for today and refreshes every 5 minutes
 * so the chart cursor moves forward as new slots complete.
 *
 * Props:
 *   crcId — optional CRC id to filter (pass null for national DN view)
 *
 * Returns:
 *   { slots, totalEns, loading, error }
 *
 * Slot shape:
 *   { slot, slot_end, slot_idx, mw_plan, mw_real, is_past, is_now }
 */
import { useState, useEffect, useCallback } from 'react'
import api from '../lib/api'
import { useLiveStore } from '../stores/liveStore'

const REFRESH_MS = 5 * 60 * 1000   // 5 minutes

export function useTimeseries(crcId = null) {
    const [slots,      setSlots]      = useState([])
    const [totalEns,   setTotalEns]   = useState(0)
    const [planSource, setPlanSource] = useState(null)   // "programme" | "fallback_profile" | null
    const [loading,    setLoading]    = useState(true)
    const [error,      setError]      = useState(null)

    // Subscribe to the WS-triggered reload signal so the chart updates
    // immediately when auto-exec fires or a feeder is restored — without
    // waiting for the next 5-minute polling interval.
    const tsReloadSignal = useLiveStore((s) => s.tsReloadSignal)

    const fetchData = useCallback(async () => {
        try {
            const params = { interval_min: 30 }
            if (crcId != null) params.crc_id = crcId

            const { data } = await api.get('/api/v1/kpis/timeseries', { params })
            setSlots(data.slots       ?? [])
            setTotalEns(data.total_ens_mwh ?? 0)
            setPlanSource(data.plan_source ?? null)
            setError(null)
        } catch (err) {
            console.warn('[useTimeseries] fetch failed:', err.message)
            setError('Données indisponibles')
        } finally {
            setLoading(false)
        }
    }, [crcId])

    // Initial fetch + 5-minute polling interval
    useEffect(() => {
        setLoading(true)
        fetchData()
        const t = setInterval(fetchData, REFRESH_MS)
        return () => clearInterval(t)
    }, [fetchData])

    // Immediate re-fetch on WS-triggered signal (skip signal=0 to avoid double-fetch on mount)
    useEffect(() => {
        if (tsReloadSignal === 0) return
        fetchData()
    }, [tsReloadSignal]) // eslint-disable-line react-hooks/exhaustive-deps

    return { slots, totalEns, planSource, loading, error }
}
