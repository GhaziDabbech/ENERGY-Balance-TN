/**
 * useJ1Reminder
 *
 * Mounted once inside DNDashboard.
 * Every 60 seconds it checks whether the J+1 programme for tomorrow has been
 * submitted yet (via GET /api/v1/programmes/j1-status).
 *
 * Behaviour:
 *  1. If the programme is already validated → clear any pending reminder state.
 *  2. If the current time >= rappelHeure AND the programme is missing AND the
 *     reminder hasn't fired today → fire the in-app reminder toast and call
 *     onReminder() so DNDashboard can show a banner/toast.
 *  3. If the current time >= autoZeroHour (rappelHeure + 2 h) AND the programme
 *     is still missing → submit an all-zero programme automatically and call
 *     onAutoZero() so DNDashboard can display a warning.
 *
 * Props:
 *   onReminder  — () => void  called once per day when reminder fires
 *   onAutoZero  — () => void  called once when auto-zero fires
 *
 * Returns:
 *   { j1Status, j1ProgrammeDate, reminderActive, autoZeroFired }
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import api from '../lib/api'
import { useProgrammesStore } from '../stores/programmesStore'

const POLL_MS = 60_000   // poll every 60 s

// Parse 'HH:MM' string → { h, m } (24-h)
function parseHM(hhmm)
{
    const [h, m] = (hhmm ?? '20:00').split(':').map(Number)
    return { h: h || 0, m: m || 0 }
}

// Return minutes-since-midnight for the current local time
function minutesNow()
{
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
}

// Build all-zero 48-slot national programme for a given date string
function buildZeroSlots(programmeDateStr)
{
    const slots = []
    for (let i = 0; i < 48; i++)
    {
        const h = Math.floor(i / 2)
        const m = (i % 2) * 30
        slots.push({
            time_slot:   `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
            ,mw_national: 0
            ,mw_nord:     0
            ,mw_sud:      0
        })
    }
    return slots
}

export function useJ1Reminder({ onReminder, onAutoZero } = {})
{
    const {
        rappelActif
        ,rappelHeure
        ,j1Status
        ,j1ProgrammeDate
        ,hasReminderFiredToday
        ,markReminderFired
        ,resetReminderFired
        ,setJ1Status
    } = useProgrammesStore()

    const [autoZeroFired, setAutoZeroFired] = useState(false)
    const autoZeroRef = useRef(false)   // prevents re-firing within same session

    // Fetch J+1 status from backend and update store
    const checkStatus = useCallback(async () =>
    {
        try
        {
            const { data } = await api.get('/api/v1/programmes/j1-status')
            setJ1Status(data.status, data.programme_id, data.programme_date)
            return data
        }
        catch
        {
            return null
        }
    }, [setJ1Status])

    // Submit auto-zero programme
    const submitAutoZero = useCallback(async (programmeDateStr) =>
    {
        if (autoZeroRef.current) return
        autoZeroRef.current = true
        setAutoZeroFired(true)

        try
        {
            await api.post('/api/v1/programmes/dn-submit', {
                programme_date: programmeDateStr
                ,slots:         buildZeroSlots(programmeDateStr)
                ,auto_zero:     true
            })
            setJ1Status('validated', null, programmeDateStr)
            resetReminderFired()
        }
        catch (err)
        {
            console.error('[J1Reminder] auto-zero submit failed:', err?.response?.data ?? err.message)
        }

        if (onAutoZero) onAutoZero()
    }, [setJ1Status, resetReminderFired, onAutoZero])

    useEffect(() =>
    {
        let timerId = null

        const tick = async () =>
        {
            const data = await checkStatus()
            if (!data) return

            const hasProgramme = data.has_programme && data.status !== 'no_programme'

            // Programme exists — make sure any fired reminder is cleared
            if (hasProgramme)
            {
                autoZeroRef.current = false
                setAutoZeroFired(false)
                return
            }

            if (!rappelActif) return

            const { h: rh, m: rm } = parseHM(rappelHeure)
            const reminderMin = rh * 60 + rm
            const autoZeroMin = reminderMin + 120   // 2 h after reminder
            const nowMin      = minutesNow()

            // Auto-zero threshold reached
            if (nowMin >= autoZeroMin && !autoZeroRef.current)
            {
                await submitAutoZero(data.programme_date)
                return
            }

            // Reminder threshold reached (but not yet auto-zero window)
            if (nowMin >= reminderMin && !hasReminderFiredToday())
            {
                markReminderFired()
                if (onReminder) onReminder()
            }
        }

        // Run immediately on mount, then every POLL_MS
        tick()
        timerId = setInterval(tick, POLL_MS)

        return () => clearInterval(timerId)
    }, [
        rappelActif
        ,rappelHeure
        ,checkStatus
        ,submitAutoZero
        ,hasReminderFiredToday
        ,markReminderFired
        ,onReminder
    ])

    return {
        j1Status
        ,j1ProgrammeDate
        ,autoZeroFired
        ,reminderActive: rappelActif
    }
}
