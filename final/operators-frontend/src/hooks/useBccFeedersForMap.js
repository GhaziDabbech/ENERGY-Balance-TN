/**
 * useBccFeedersForMap
 *
 * Fetches feeders for a selected BCC and enriches them with live execution
 * state from the dashboard's live_cuts array.
 *
 * Returns a list of enriched feeder objects:
 * {
 *   id, ref, nom, poste_source, zone, governorate,
 *   mw_nominal, priority, statut,
 *   // enriched:
 *   state:        'cut' | 'executing' | 'proposed' | 'protected' | 'idle'
 *   elapsed_min:  number | null   — minutes in current cut, null if not cutting
 *   overdue:      boolean         — true if elapsed > 45 min
 *   execution_id: number | null
 * }
 *
 * priority === 'P0'               → state = 'protected' always
 * found in live_cuts              → state = 'executing', elapsed from cut
 * priority P3-P5, not cutting     → state = 'proposed'  (candidate to cut next)
 * otherwise                       → state = 'idle'
 */
import { useState, useEffect, useRef } from 'react'
import api from '../lib/api'

export function useBccFeedersForMap(bccId, liveCuts = [])
{
    const [feeders,  setFeeders]  = useState([])
    const [loading,  setLoading]  = useState(false)
    const [error,    setError]    = useState(null)
    const prevBccId = useRef(null)

    // Re-fetch when the selected BCC changes
    useEffect(() =>
    {
        if (!bccId) { setFeeders([]); return }
        if (bccId === prevBccId.current) return   // same BCC, no refetch needed

        prevBccId.current = bccId
        let cancelled = false

        setLoading(true)
        setError(null)

        api.get('/api/v1/feeders', { params: { bcc_id: bccId } })
            .then(({ data }) =>
            {
                if (cancelled) return
                setFeeders(enrich(data, liveCuts))
                setLoading(false)
            })
            .catch(() =>
            {
                if (cancelled) return
                setError('Impossible de charger les départs HTA')
                setLoading(false)
            })

        return () => { cancelled = true }
    }, [bccId])  // eslint-disable-line react-hooks/exhaustive-deps

    // Re-enrich when live_cuts changes (same BCC, new cut started or restored)
    useEffect(() =>
    {
        if (!feeders.length) return
        setFeeders(prev => enrich(prev, liveCuts))
    }, [liveCuts])  // eslint-disable-line react-hooks/exhaustive-deps

    return { feeders, loading, error }
}

// ── Enrichment helper ─────────────────────────────────────────────────────────
function enrich(rawFeeders, liveCuts)
{
    return rawFeeders.map(f =>
    {
        // P0 — always protected, never shed
        if (f.priority === 'P0')
        {
            return { ...f, state: 'protected', elapsed_min: null, overdue: false, execution_id: null }
        }

        // Check if currently executing
        const cut = liveCuts.find(c => c.feeder_ref === f.ref || c.feeder_id === f.id)
        if (cut)
        {
            return {
                ...f
                ,state:        'executing'
                ,elapsed_min:  cut.elapsed_min ?? null
                ,overdue:      cut.overdue ?? false
                ,execution_id: cut.execution_id ?? null
                ,mw_shed:      cut.mw_shed ?? f.mw_nominal
            }
        }

        // P3-P5 not cutting → proposed candidate
        const prio = parseInt(f.priority?.replace('P', '') ?? '4', 10)
        if (prio >= 3)
        {
            return { ...f, state: 'proposed', elapsed_min: null, overdue: false, execution_id: null }
        }

        // P1-P2 not cutting → idle (available but not a first-cut candidate)
        return { ...f, state: 'idle', elapsed_min: null, overdue: false, execution_id: null }
    })
}
