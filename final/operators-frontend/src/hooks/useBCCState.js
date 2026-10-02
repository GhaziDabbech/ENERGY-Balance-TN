/**
 * useBCCState
 *
 * Loads the BCC feeder catalogue from the API (via useFeeders) then
 * overlays the current execution state from the DB, returning an
 * initialised postes array and dbExecIds map ready for BCCDashboard.
 *
 * Replaces the old approach that accepted a static POSTES constant —
 * the feeder catalogue is now dynamic so changes made in BCCDeparts
 * (add / edit / delete) are reflected immediately on next mount.
 */
import { useState, useEffect, useCallback } from 'react'
import api                    from '../lib/api'
import { useFeeders }         from './useFeeders'
import { useLiveStore }       from '../stores/liveStore'

export function useBCCState() {
    const { postes: cataloguePostes, dbIdToRef, cooldownHours, loading: feedersLoading, error: feedersError } = useFeeders()

    // Subscribe to the reload signal — bumped by useWebSocket on any execution event.
    // Using getState() avoids re-rendering the hook on every liveStore write;
    // we only react to the specific counter field.
    const execReloadSignal = useLiveStore((s) => s.execReloadSignal)

    const [initialPostes,    setInitialPostes]    = useState(null)
    const [initialDbExecIds, setInitialDbExecIds] = useState({})
    const [loading,          setLoading]          = useState(true)

    const overlayExecState = useCallback(async (postes, cancelled) => {
        try {
            const [execRes, restoredRes] = await Promise.all([
                api.get('/api/v1/executions', { params: { status: 'executing', limit: 100 } }),
                api.get('/api/v1/executions', { params: { status: 'restored',  limit: 100 } }),
            ])
            if (cancelled?.value) return

            const execs    = execRes.data    ?? []
            const restored = restoredRes.data ?? []

            const execByRef = {}
            const execIds   = {}
            for (const exec of execs) {
                const ref = dbIdToRef[exec.feeder_id]
                if (ref) { execByRef[ref] = exec; execIds[ref] = exec.id }
            }

            const today = new Date().toDateString()
            const restoredTodayRefs = new Set(
                restored
                    .filter((e) => new Date(e.ended_at || e.started_at).toDateString() === today)
                    .map((e) => dbIdToRef[e.feeder_id])
                    .filter(Boolean)
            )

            const updatedPostes = postes.map((poste) => ({
                ...poste,
                feeders: poste.feeders.map((f) => {
                    if (f.locked) return f

                    const exec = execByRef[f.ref]
                    if (exec) {
                        const elapsedMin = Math.round((Date.now() - new Date(exec.started_at).getTime()) / 60000)
                        return { ...f, status: elapsedMin >= 45 ? 'overdue' : 'executing', elapsed: elapsedMin }
                    }
                    const stillInCooldown = f.hoursAgoCut !== null && f.hoursAgoCut < cooldownHours
                    if (restoredTodayRefs.has(f.ref) && stillInCooldown) {
                        return { ...f, status: 'restored', elapsed: 0 }
                    }
                    return f
                })
            }))

            setInitialPostes(updatedPostes)
            setInitialDbExecIds(execIds)
        } catch (err) {
            console.warn('[useBCCState] Failed to load execution state:', err.message)
            setInitialPostes(postes)
        } finally {
            if (!cancelled?.value) setLoading(false)
        }
    }, [dbIdToRef, cooldownHours])

    // Run overlay on mount (when feeders finish loading)
    useEffect(() => {
        if (feedersLoading || cataloguePostes === null) return
        const cancelled = { value: false }
        overlayExecState(cataloguePostes, cancelled)
        return () => { cancelled.value = true }
    }, [feedersLoading, cataloguePostes, overlayExecState])

    // Re-run overlay whenever a new_execution or execution_restored WS event fires.
    // execReloadSignal starts at 0 — skip the first run (mount handles it above).
    useEffect(() => {
        if (execReloadSignal === 0 || feedersLoading || cataloguePostes === null) return
        const cancelled = { value: false }
        overlayExecState(cataloguePostes, cancelled)
        return () => { cancelled.value = true }
    }, [execReloadSignal]) // eslint-disable-line react-hooks/exhaustive-deps

    return {
        initialPostes
        ,initialDbExecIds
        ,cooldownHours
        ,loading: feedersLoading || loading
        ,feedersError
    }
}
