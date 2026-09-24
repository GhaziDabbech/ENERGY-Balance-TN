/**
 * useAlertSync
 *
 * Watches the live dashboard data (dbData from useDNDashboard) and
 * pushes real alerts into alertStore whenever the DB reports an anomaly.
 *
 * Alert sources:
 *   1. BCC anomaly  — a BCC is CRITIQUE or SOUS-CONSIGNE (ecart < threshold)
 *   2. Consumption spike — national realise is below consigne by > threshold
 *   3. Frequency drop   — grid frequency from gridStore < 49.95 Hz
 *
 * Idempotent: alerts are keyed by id so duplicates are never added.
 * An alert is auto-resolved when the underlying condition disappears.
 */
import { useEffect, useRef } from 'react'
import { useAlertStore } from '../stores/alertStore'
import { useGridStore }  from '../stores/gridStore'

const MW_DEFICIT_THRESHOLD  = -10   // MW — alert if national ecart below this
const FREQ_LOW_THRESHOLD    = 49.95 // Hz — alert if frequency below this

export function useAlertSync(dbData) {
    const { alerts, addAlert, resolveAlert } = useAlertStore()
    const { frequency } = useGridStore()

    // Track which alert ids we've already added to avoid flooding
    const trackedIds = useRef(new Set(alerts.map((a) => a.id)))

    useEffect(() => {
        if (!dbData) return

        const national  = dbData.national  ?? {}
        const bccRows   = dbData.bcc_rows  ?? []
        const now       = new Date()
        const hhmm      = `${String(now.getHours()).padStart(2,'0')}h${String(now.getMinutes()).padStart(2,'0')}`

        // ── 1. BCC anomalies ──────────────────────────────────────────────────
        for (const bcc of bccRows) {
            if (!['CRITIQUE', 'SOUS-CONSIGNE'].includes(bcc.statut)) {
                // Resolve if previously alerted
                const existingId = `bcc-${bcc.id}-deficit`
                const existing   = alerts.find((a) => a.id === existingId)
                if (existing && existing.ackStatus !== 'resolved') {
                    resolveAlert(existingId)
                    trackedIds.current.delete(existingId)
                }
                continue
            }

            const alertId = `bcc-${bcc.id}-deficit`
            if (trackedIds.current.has(alertId)) {
                // Already in store — it may have been resolved by user; don't re-add
                continue
            }

            addAlert({
                id:        alertId,
                type:      'bcc_execution',
                crc:       bcc.crc,
                bcc:       bcc.name,
                mwDeficit: bcc.ecart,
                since:     hhmm,
                ackStatus: 'unhandled',
                ackTime:   null,
                detail:    `Ecart ${bcc.ecart > 0 ? '+' : ''}${bcc.ecart.toFixed(1)} MW. Statut : ${bcc.statut}. Realise ${bcc.realise} MW / consigne ${bcc.consigne} MW.`,
            })
            trackedIds.current.add(alertId)
        }

        // ── 2. National consumption spike ─────────────────────────────────────
        const nationalEcart = national.ecart ?? 0
        const consumptionId = 'national-consumption-spike'

        if (nationalEcart < MW_DEFICIT_THRESHOLD) {
            if (!trackedIds.current.has(consumptionId)) {
                addAlert({
                    id:        consumptionId,
                    type:      'consumption',
                    crc:       null,
                    bcc:       null,
                    mwDeficit: nationalEcart,
                    since:     hhmm,
                    ackStatus: 'unhandled',
                    ackTime:   null,
                    detail:    `Consommation ${Math.abs(nationalEcart).toFixed(1)} MW au-dessus de la consigne nationale. Realise : ${national.realise} MW / Consigne : ${national.consigne} MW.`,
                })
                trackedIds.current.add(consumptionId)
            }
        } else {
            // Deficit resolved — auto-resolve alert
            const existing = alerts.find((a) => a.id === consumptionId)
            if (existing && existing.ackStatus !== 'resolved') {
                resolveAlert(consumptionId)
                trackedIds.current.delete(consumptionId)
            }
        }
    }, [dbData])   // re-run every time dbData refreshes (every 30s)

    // ── 3. Frequency drop — driven by gridStore (updates more frequently) ─────
    useEffect(() => {
        const freqId = 'grid-frequency-low'

        if (frequency < FREQ_LOW_THRESHOLD) {
            if (!trackedIds.current.has(freqId)) {
                const now  = new Date()
                const hhmm = `${String(now.getHours()).padStart(2,'0')}h${String(now.getMinutes()).padStart(2,'0')}`
                addAlert({
                    id:        freqId,
                    type:      'frequency',
                    crc:       null,
                    bcc:       null,
                    mwDeficit: 0,
                    since:     hhmm,
                    ackStatus: 'unhandled',
                    ackTime:   null,
                    detail:    `Frequence reseau : ${frequency.toFixed(2)} Hz — en dessous du seuil nominal (49,95 Hz). Surveillance active.`,
                })
                trackedIds.current.add(freqId)
            }
        } else {
            // Frequency recovered — auto-resolve
            const existing = alerts.find((a) => a.id === freqId)
            if (existing && existing.ackStatus !== 'resolved') {
                resolveAlert(freqId)
                trackedIds.current.delete(freqId)
            }
        }
    }, [frequency])
}
