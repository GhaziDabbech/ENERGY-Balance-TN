/**
 * useCRCDashboard
 *
 * Fetches /api/v1/dashboard every 30s and returns only the data
 * relevant to a specific CRC (filtered by crc_name).
 */
import { useState, useEffect, useCallback } from 'react'
import api from '../lib/api'
import { useGridStore } from '../stores/gridStore'

const POLL_INTERVAL = 30_000

export function useCRCDashboard(crcName = 'CRC Nord')
{
    const [data,        setData]        = useState(null)
    const [loading,     setLoading]     = useState(true)
    const [lastUpdated, setLastUpdated] = useState(null)

    const setActiveCuts = useGridStore((s) => s.setActiveCuts)

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

    return { data, loading, lastUpdated }
}
