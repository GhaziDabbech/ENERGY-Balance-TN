/**
 * useCRCDashboard
 *
 * Fetches /api/v1/dashboard every 30s and returns only the data
 * relevant to a specific CRC (filtered by crc_name).
 */
import { useState, useEffect, useCallback } from 'react'
import api from '../lib/api'
import { useGridStore } from '../stores/gridStore'
import { useLiveStore }  from '../stores/liveStore'

const POLL_INTERVAL = 30_000

export function useCRCDashboard(crcName = 'CRC Nord')
{
    const [data,        setData]        = useState(null)
    const [loading,     setLoading]     = useState(true)
    const [lastUpdated, setLastUpdated] = useState(null)

    const setActiveCuts = useGridStore((s) => s.setActiveCuts)

    // Re-fetch immediately when auto-exec fires or a manual execution happens
    const tsReloadSignal = useLiveStore((s) => s.tsReloadSignal)

    const fetch = useCallback(async (isInitial = false) =>
    {
        if (isInitial) setLoading(true)
        try
        {
            const { data: res } = await api.get('/api/v1/dashboard')

            // Filter to this CRC's BCCs only
            const crcSummary = res.crc_summary?.[crcName] ?? null
            const bccRows    = res.bcc_rows?.filter((b) => b.crc === crcName) ?? []
            const liveCuts   = res.live_cuts?.filter((c) => c.crc_name === crcName) ?? []

            setData({ crcSummary, bccRows, liveCuts, national: res.national })
            setLastUpdated(new Date())

            // Push national active cuts into shared store → StatusBar
            if (res?.national?.active_cuts != null)
                setActiveCuts(res.national.active_cuts)
        }
        catch (err)
        {
            console.warn('[useCRCDashboard] API unreachable')
        }
        finally
        {
            if (isInitial) setLoading(false)
        }
    }, [crcName, setActiveCuts])

    // Initial fetch + 30-second polling
    useEffect
    (
        () =>
        {
            fetch(true)
            const t = setInterval(() => fetch(false), POLL_INTERVAL)
            return () => clearInterval(t)
        }
        ,[fetch]
    )

    // Immediate re-fetch when a WS execution event fires (auto-exec, manual exec, restore)
    useEffect
    (
        () =>
        {
            if (tsReloadSignal === 0) return
            fetch(false)
        }
        ,[tsReloadSignal] // eslint-disable-line react-hooks/exhaustive-deps
    )

    return { data, loading, lastUpdated }
}
