/**
 * useDNMapSync
 *
 * Bridges the DN dashboard poll → networkStore zone colours.
 *
 * Every time dbData arrives from useDNDashboard it:
 *  1. Matches each bcc_row to a networkStore BCC entry
 *  2. Derives a colour-status: 'ok' | 'warn' | 'crit'
 *  3. Calls updateBccTelemetry so map polygons recolour immediately
 *
 * Matching strategy (most-reliable first):
 *   a) backend row.id === bcc.dbId          (already synced in a previous poll)
 *   b) bcc number extracted from both names  ("BCC 5 — Sfax" → 5)
 *   c) exact name string match
 *   d) prefix match after normalising dashes (em-dash ↔ hyphen)
 *
 * Status mapping:
 *   CONFORME / INACTIF   → ok
 *   ATTENTION / SOUS-CONSIGNE → warn
 *   CRITIQUE             → crit
 *
 * Also flags: if a BCC has consigne > 0 but realise === 0 → force 'crit'
 * (catches the "not executed yet" case that reads as INACTIF in some backends)
 */
import { useEffect } from 'react'
import { useNetworkStore } from '../stores/networkStore'

const STATUT_TO_STATUS = {
    CONFORME:           'ok'
    ,'SOUS-CONSIGNE':   'warn'
    ,ATTENTION:         'warn'
    ,CRITIQUE:          'crit'
    ,INACTIF:           'ok'
}

// Extract the BCC number from a name string, e.g. "BCC 5 — Sfax" → 5
function bccNum(name)
{
    const m = String(name ?? '').match(/BCC\s*(\d+)/i)
    return m ? parseInt(m[1], 10) : null
}

// Normalise name for loose comparison: lower-case, collapse whitespace, unify dashes
function norm(s)
{
    return String(s ?? '')
        .toLowerCase()
        .replace(/[—–-]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
}

export function useDNMapSync(dbData)
{
    const { crcs, updateBccTelemetry } = useNetworkStore()

    useEffect(() =>
    {
        if (!dbData?.bcc_rows) return

        const allBccs = crcs.flatMap(c => c.bccs)

        for (const row of dbData.bcc_rows)
        {
            const rowNum  = bccNum(row.name)
            const rowNorm = norm(row.name)

            const storeBcc = allBccs.find(b =>
                // a) already paired by dbId from a previous poll
                (b.dbId && b.dbId === row.id)
                // b) BCC number match (most robust across dash/encoding differences)
                || (rowNum !== null && bccNum(b.name) === rowNum)
                // c) exact normalised name
                || norm(b.name) === rowNorm
                // d) prefix: "BCC 5" matches "BCC 5 — Sfax"
                || norm(b.name).startsWith(rowNorm)
                || rowNorm.startsWith(norm(b.name))
            )

            if (!storeBcc) continue

            // Derive map status — force crit when consigne > 0 but realise = 0
            const baseStatus = STATUT_TO_STATUS[row.statut] ?? 'ok'
            const status     = (baseStatus === 'ok' && (row.consigne ?? 0) > 0 && (row.realise ?? 0) === 0)
                ? 'crit'
                : baseStatus

            updateBccTelemetry(storeBcc.id, {
                actualMW:       row.realise   ?? storeBcc.actualMW
                ,targetMW:      row.consigne  ?? storeBcc.targetMW
                ,status
                ,ecart:         row.ecart
                ,statut:        row.statut
                ,operator:      row.operateur ?? storeBcc.operator
                ,dbId:          row.id
                ,is_offline:    row.is_offline    ?? false
                ,telemetry_lost:row.telemetry_lost ?? false
            })
        }
    }, [dbData])   // eslint-disable-line react-hooks/exhaustive-deps
}
