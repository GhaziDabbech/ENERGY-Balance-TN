/**
 * useFeeders
 *
 * Loads the BCC's feeder catalogue from GET /api/v1/feeders, which now
 * returns hours_since_last_cut per feeder (computed by the backend from
 * the executions table).
 *
 * Also fetches the DN-configured cooldown threshold from
 * GET /api/v1/settings/crc-split → intervalle_min_heures (default 8h).
 *
 * Cooldown rule (equity / rotation):
 *   If hours_since_last_cut < intervalle_min_heures  → status = 'cooldown'
 *   P0 feeders                                       → status = 'locked'
 *   Otherwise                                        → status = 'available'
 *
 * 'cooldown' tiles are displayed but cannot be selected by the BCC operator.
 *
 * This is the single source of truth — BCCDeparts writes to the same
 * endpoint, so any catalogue change is reflected here on next load.
 */
import { useState, useEffect, useCallback } from 'react'
import api from '../lib/api'

const COOLDOWN_FALLBACK_H = 8   // used if settings endpoint is unreachable

function buildTileState(f, cooldownHours) {
    if (f.priority === 'P0') {
        return {
            ref:                  f.ref
            ,nom:                 f.nom
            ,mw:                  f.mw_nominal
            ,priority:            f.priority
            ,zone:                f.zone ?? ''
            ,status:              'locked'
            ,elapsed:             0
            ,locked:              true
            ,hoursAgoCut:         f.hours_since_last_cut ?? null
            ,inCooldown:          false
            ,dbId:                f.id
        }
    }

    const hoursAgo   = f.hours_since_last_cut   // null = never cut
    const inCooldown = hoursAgo !== null && hoursAgo < cooldownHours

    return {
        ref:          f.ref
        ,nom:         f.nom
        ,mw:          f.mw_nominal
        ,priority:    f.priority
        ,zone:        f.zone ?? ''
        ,status:      inCooldown ? 'cooldown' : 'available'
        ,elapsed:     0
        ,locked:      false
        ,hoursAgoCut: hoursAgo
        ,inCooldown:  inCooldown
        ,cooldownRemaining: inCooldown
            ? Math.ceil(cooldownHours - hoursAgo)   // hours left in cooldown
            : 0
        ,dbId:        f.id
    }
}

export function useFeeders() {
    const [feeders,         setFeeders]         = useState([])
    const [postes,          setPostes]          = useState(null)
    const [feederDbMap,     setFeederDbMap]     = useState({})
    const [dbIdToRef,       setDbIdToRef]       = useState({})
    const [cooldownHours,   setCooldownHours]   = useState(COOLDOWN_FALLBACK_H)
    const [loading,         setLoading]         = useState(true)
    const [error,           setError]           = useState(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            // Fetch feeders and settings in parallel
            const [feedersRes, settingsRes] = await Promise.allSettled([
                api.get('/api/v1/feeders'),
                api.get('/api/v1/settings/crc-split'),
            ])

            const raw      = feedersRes.status === 'fulfilled' ? (feedersRes.value.data ?? []) : []
            const threshold = settingsRes.status === 'fulfilled'
                ? (settingsRes.value.data?.intervalle_min_heures ?? COOLDOWN_FALLBACK_H)
                : COOLDOWN_FALLBACK_H

            setCooldownHours(threshold)
            setFeeders(raw)

            // Build lookup maps
            const fwdMap = {}
            const revMap = {}
            raw.forEach((f) => { fwdMap[f.ref] = f.id; revMap[f.id] = f.ref })
            setFeederDbMap(fwdMap)
            setDbIdToRef(revMap)

            // Group into postes
            const posteMap = {}
            raw.forEach((f) => {
                const key = f.poste_source ?? 'Autres'
                if (!posteMap[key]) {
                    posteMap[key] = {
                        id:       key.toLowerCase().replace(/\s+/g, '-')
                        ,label:   key
                        ,sub:     ''
                        ,feeders: []
                    }
                }
                posteMap[key].feeders.push(buildTileState(f, threshold))
            })

            // Sub-label: count + MW (excluding locked/cooldown from available MW)
            Object.values(posteMap).forEach((p) => {
                const total     = p.feeders.reduce((s, f) => s + f.mw, 0)
                const inCooldown = p.feeders.filter((f) => f.inCooldown).length
                const suffix    = inCooldown > 0 ? ` · ${inCooldown} en repos` : ''
                p.sub = `${p.feeders.length} départs · ${total.toFixed(1)} MW${suffix}`
            })

            setPostes(Object.values(posteMap))
            setError(null)
        } catch (err) {
            console.warn('[useFeeders] load failed:', err.message)
            setError(err.message)
            setPostes([])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    return { feeders, postes, feederDbMap, dbIdToRef, cooldownHours, loading, error, reload: load }
}
