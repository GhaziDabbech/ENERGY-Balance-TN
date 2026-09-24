/**
 * useDNDashboard
 *
 * Fetches /api/v1/dashboard every 30 seconds and exposes
 * all data needed by the DN dashboard in one clean object.
 * Also pushes activeCuts into gridStore so StatusBar reads it.
 * Falls back to null when API is unreachable.
 */
import { useState, useEffect, useCallback } from 'react'
import api from '../lib/api'
import { useGridStore } from '../stores/gridStore'

const POLL_INTERVAL = 30_000   // 30 seconds

export function useDNDashboard()
{
    const [data,    setData]    = useState(null)
    const [loading, setLoading] = useState(true)
    const [error,   setError]   = useState(null)
    const [lastUpdated, setLastUpdated] = useState(null)

    const setActiveCuts = useGridStore((s) => s.setActiveCuts)

    const fetchData = useCallback(async (isInitial = false) =>
    {
        if (isInitial) setLoading(true)
        try
        {
            const { data: res } = await api.get('/api/v1/dashboard')
            setData(res)
            setError(null)
            setLastUpdated(new Date())

            // Push national active cuts into shared store → StatusBar reads it
            if (res?.national?.active_cuts != null)
                setActiveCuts(res.national.active_cuts)
        }
        catch (err)
        {
            console.warn('[useDNDashboard] API unreachable — using last data or fallback')
            setError('Impossible de joindre le serveur')
        }
        finally
        {
            if (isInitial) setLoading(false)
        }
    }, [setActiveCuts])

    useEffect
    (
        () =>
        {
            fetchData(true)
            const t = setInterval(() => fetchData(false), POLL_INTERVAL)
            return () => clearInterval(t)
        }
        ,[fetchData]
    )

    return { data, loading, error, lastUpdated, refetch: () => fetchData(false) }
}
