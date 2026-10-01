/**
 * useAlertSync
 *
 * Single source-of-truth that watches live dashboard data and pushes
 * real-time alerts into alertStore.  Every category discussed:
 *
 *  DÉFICIT / PRODUCTION
 *    ✓ national_deficit     — réalisé < consigne by > MW_DEFICIT_THRESHOLD
 *    ✓ crc_deficit          — per-CRC réalisé < consigne by > CRC_DEFICIT_THRESHOLD
 *    ✓ frequency_low        — fréquence < FREQ_VIGILANCE_HZ
 *    ✓ frequency_critical   — fréquence < FREQ_CRITICAL_HZ
 *
 *  DÉLESTAGE / EXÉCUTION  (driven by live_cuts from useDNDashboard)
 *    ✓ feeder_overdue       — any cut feeder elapsed > FEEDER_MAX_MIN
 *    ✓ p0_affected          — a cut feeder is tagged P0 (hospital / water / security)
 *    ✓ bcc_execution        — BCC statut CRITIQUE or SOUS-CONSIGNE
 *    ✓ bcc_tolerance        — BCC |écart| > BCC_TOLERANCE_MW (±1.5 MW)
 *    ✓ bcc_not_executed     — BCC has consigne > 0 but 0 active cuts
 *
 *  RÉSEAU / TOPOLOGIE  (driven by network_alerts from dashboard, if present)
 *    ✓ line_tripped         — HTB line tripped flag from backend
 *    ✓ substation_lost      — HTB substation out of service flag
 *
 *  SYSTÈME / SCADA
 *    ✓ telemetry_loss       — BCC marked telemetry_lost in backend payload
 *    ✓ bcc_offline          — BCC marked offline in backend payload
 *
 * Auto-resolve: when the underlying condition clears the alert is moved to
 * 'resolved' automatically — unless the operator has already set it to
 * 'handling', in which case it stays until manually resolved.
 */
import { useEffect, useRef } from 'react'
import { useAlertStore } from '../stores/alertStore'
import { useGridStore }  from '../stores/gridStore'

// ── Thresholds (match backend settings defaults) ──────────────────────────────
const MW_DEFICIT_THRESHOLD   = -10    // MW  — national écart below this → alert
const CRC_DEFICIT_THRESHOLD  = -8     // MW  — per-CRC écart below this  → alert
const FREQ_VIGILANCE_HZ      = 49.95  // Hz  — warning
const FREQ_CRITICAL_HZ       = 49.80  // Hz  — critical
const FEEDER_MAX_MIN         = 45     // min — overdue cut threshold
const BCC_TOLERANCE_MW       = 1.5    // MW  — tolerance band for BCC MW balance

// ── Internal helpers ──────────────────────────────────────────────────────────
function nowHHMM() {
    const n = new Date()
    return `${String(n.getHours()).padStart(2,'0')}h${String(n.getMinutes()).padStart(2,'0')}`
}

function bccScope(crc) {
    if (!crc) return 'national'
    return crc.toLowerCase().includes('nord') ? 'crc_nord' : 'crc_sud'
}

export function useAlertSync(dbData) {
    const { alerts, addAlert, updateAlert, resolveAlert } = useAlertStore()
    const { frequency } = useGridStore()

    // Track which alert ids we've emitted this mount to avoid re-adding resolved ones
    const tracked = useRef(new Set())

    // Sync tracked set with current store state on each render (handles HMR / remount)
    useEffect(() => {
        tracked.current = new Set(alerts.map((a) => a.id))
    }, []) // intentionally once

    // ── Helper: emit or update; auto-resolve when condition clears ─────────────
    function emit(id, alertData) {
        const existing = alerts.find((a) => a.id === id)
        if (!existing) {
            addAlert({ id, ...alertData })
            tracked.current.add(id)
        } else if (existing.ackStatus === 'resolved') {
            // Condition re-triggered after resolve → re-add fresh
            addAlert({ id: `${id}-${Date.now()}`, ...alertData })
        } else {
            // Update mutable fields (MW values may worsen between polls)
            updateAlert(id, {
                mwDeficit: alertData.mwDeficit ?? existing.mwDeficit,
                detail:    alertData.detail    ?? existing.detail,
            })
        }
    }

    function autoResolve(id) {
        const existing = alerts.find((a) => a.id === id)
        if (existing && existing.ackStatus === 'unhandled') {
            resolveAlert(id)
            tracked.current.delete(id)
        }
        // If 'handling' — leave for operator to close manually
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BLOCK A — driven by dbData (polls every ~30 s)
    // ═══════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        if (!dbData) return

        const national  = dbData.national   ?? {}
        const bccRows   = dbData.bcc_rows   ?? []
        const liveCuts  = dbData.live_cuts  ?? []
        const netAlerts = dbData.network_alerts ?? []   // optional backend field
        const hhmm      = nowHHMM()

        // ── A1. National deficit ───────────────────────────────────────────────
        const natEcart   = national.ecart ?? 0
        const natRealise = national.realise  ?? 0
        const natConsigne= national.consigne ?? 0
        const natDefPct  = natConsigne > 0
            ? Math.abs(natEcart / natConsigne * 100)
            : 0

        if (natEcart < MW_DEFICIT_THRESHOLD) {
            emit('national-deficit', {
                type:      'national_deficit',
                severity:  natDefPct > 15 ? 'critical' : 'warning',
                scope:     'national',
                title:     `Déficit national — ${natEcart.toFixed(1)} MW`,
                detail:    `Réalisé ${natRealise.toFixed(1)} MW / Consigne ${natConsigne.toFixed(1)} MW. Écart ${natEcart.toFixed(1)} MW (${natDefPct.toFixed(1)}% sous consigne).`,
                crc:       null,
                bcc:       null,
                bccId:     null,
                mwDeficit: natEcart,
                since:     hhmm,
                isP0:      false,
                autoResolve: true,
            })
        } else {
            autoResolve('national-deficit')
        }

        // ── A2. Per-CRC deficit ────────────────────────────────────────────────
        const crcSummary = dbData.crc_summary ?? {}
        for (const [crcName, crc] of Object.entries(crcSummary)) {
            const crcEcart = crc.ecart ?? 0
            const id       = `crc-deficit-${crcName.toLowerCase().replace(/\s+/g, '-')}`

            if (crcEcart < CRC_DEFICIT_THRESHOLD) {
                const crcDefPct = crc.consigne > 0
                    ? Math.abs(crcEcart / crc.consigne * 100)
                    : 0
                emit(id, {
                    type:      'crc_deficit',
                    severity:  crcDefPct > 20 ? 'critical' : 'warning',
                    scope:     bccScope(crcName),
                    title:     `Déficit ${crcName} — ${crcEcart.toFixed(1)} MW`,
                    detail:    `Réalisé ${crc.realise?.toFixed(1)} MW / Consigne ${crc.consigne?.toFixed(1)} MW. Écart ${crcEcart.toFixed(1)} MW (${crcDefPct.toFixed(1)}%).`,
                    crc:       crcName,
                    bcc:       null,
                    bccId:     null,
                    mwDeficit: crcEcart,
                    since:     hhmm,
                    isP0:      false,
                    autoResolve: true,
                })
            } else {
                autoResolve(id)
            }
        }

        // ── A3. BCC anomalies (CRITIQUE / SOUS-CONSIGNE) ──────────────────────
        for (const bcc of bccRows) {
            const id = `bcc-${bcc.id}-execution`

            if (['CRITIQUE', 'SOUS-CONSIGNE'].includes(bcc.statut)) {
                const isCrit = bcc.statut === 'CRITIQUE'
                emit(id, {
                    type:      'bcc_execution',
                    severity:  isCrit ? 'critical' : 'warning',
                    scope:     bccScope(bcc.crc),
                    title:     `${bcc.name} — Écart ${bcc.ecart?.toFixed(1)} MW`,
                    detail:    `Statut : ${bcc.statut}. Réalisé ${bcc.realise?.toFixed(1)} MW / Consigne ${bcc.consigne?.toFixed(1)} MW. Écart ${bcc.ecart?.toFixed(1)} MW.`,
                    crc:       bcc.crc,
                    bcc:       bcc.name,
                    bccId:     bcc.id,
                    mwDeficit: bcc.ecart ?? 0,
                    since:     hhmm,
                    isP0:      false,
                    autoResolve: true,
                })
            } else {
                autoResolve(id)
            }
        }

        // ── A4. BCC MW tolerance (±1.5 MW) ────────────────────────────────────
        for (const bcc of bccRows) {
            const id    = `bcc-${bcc.id}-tolerance`
            const ecart = bcc.ecart ?? 0

            // Only flag when BCC is otherwise conformant — CRITIQUE/SOUS-CONSIGNE
            // are already handled by A3 and are far worse than tolerance.
            if (!['CRITIQUE', 'SOUS-CONSIGNE'].includes(bcc.statut)
                && Math.abs(ecart) > BCC_TOLERANCE_MW)
            {
                emit(id, {
                    type:      'bcc_tolerance',
                    severity:  'warning',
                    scope:     bccScope(bcc.crc),
                    title:     `${bcc.name} — Tolérance dépassée (${ecart >= 0 ? '+' : ''}${ecart.toFixed(1)} MW)`,
                    detail:    `MW réalisé hors tolérance ±${BCC_TOLERANCE_MW} MW. Consigne ${bcc.consigne?.toFixed(1)} MW, Réalisé ${bcc.realise?.toFixed(1)} MW, Écart ${ecart.toFixed(1)} MW.`,
                    crc:       bcc.crc,
                    bcc:       bcc.name,
                    bccId:     bcc.id,
                    mwDeficit: ecart,
                    since:     hhmm,
                    isP0:      false,
                    autoResolve: true,
                })
            } else {
                autoResolve(id)
            }
        }

        // ── A5. BCC not executed (consigne > 0, zero active cuts) ─────────────
        for (const bcc of bccRows) {
            const id        = `bcc-${bcc.id}-not-executed`
            const hasCuts   = liveCuts.some((c) => c.bcc_id === bcc.id || c.bcc_name === bcc.name)
            const hasConsigne = (bcc.consigne ?? 0) > 0

            if (hasConsigne && !hasCuts && bcc.realise === 0) {
                emit(id, {
                    type:      'bcc_not_executed',
                    severity:  'critical',
                    scope:     bccScope(bcc.crc),
                    title:     `${bcc.name} — Programme non exécuté`,
                    detail:    `Consigne ${bcc.consigne?.toFixed(1)} MW validée mais aucun départ HTA manœuvré. Réalisé : 0 MW.`,
                    crc:       bcc.crc,
                    bcc:       bcc.name,
                    bccId:     bcc.id,
                    mwDeficit: -(bcc.consigne ?? 0),
                    since:     hhmm,
                    isP0:      false,
                    autoResolve: true,
                })
            } else {
                autoResolve(id)
            }
        }

        // ── A6. Feeder overdue (> 45 min) and P0 affected ─────────────────────
        const seenOverdue = new Set()
        const seenP0      = new Set()

        for (const cut of liveCuts) {
            const elapsed = cut.elapsed_min ?? 0
            const isP0    = cut.is_p0 ?? cut.priority === 0 ?? false
            const cutId   = cut.execution_id ?? cut.feeder_ref

            // P0 affected — highest priority, always critical
            if (isP0) {
                const p0Id = `p0-affected-${cutId}`
                seenP0.add(p0Id)
                emit(p0Id, {
                    type:      'p0_affected',
                    severity:  'critical',
                    scope:     bccScope(cut.crc_name),
                    title:     `P0 — ${cut.feeder_nom ?? cut.feeder_ref} hors tension`,
                    detail:    `Infrastructure critique (P0) affectée par délestage. Départ ${cut.feeder_ref} (${cut.feeder_nom}), BCC ${cut.bcc_name}, ${cut.mw_shed} MW. Durée : ${elapsed} min.`,
                    crc:       cut.crc_name ?? null,
                    bcc:       cut.bcc_name ?? null,
                    bccId:     cut.bcc_id   ?? null,
                    mwDeficit: -(cut.mw_shed ?? 0),
                    since:     hhmm,
                    isP0:      true,
                    autoResolve: true,
                })
            }

            // Overdue feeder (> 45 min, non-P0 already covered above)
            if (elapsed > FEEDER_MAX_MIN) {
                const overdueId = `feeder-overdue-${cutId}`
                seenOverdue.add(overdueId)
                emit(overdueId, {
                    type:      'feeder_overdue',
                    severity:  isP0 ? 'critical' : 'warning',
                    scope:     bccScope(cut.crc_name),
                    title:     `Dépassement 45 min — ${cut.feeder_ref} (${elapsed} min)`,
                    detail:    `Départ ${cut.feeder_ref} (${cut.feeder_nom ?? '—'}) en coupure depuis ${elapsed} min. BCC ${cut.bcc_name}, ${cut.mw_shed} MW.  Rotation requise.`,
                    crc:       cut.crc_name ?? null,
                    bcc:       cut.bcc_name ?? null,
                    bccId:     cut.bcc_id   ?? null,
                    mwDeficit: 0,
                    since:     hhmm,
                    isP0:      isP0,
                    autoResolve: true,
                })
            }
        }

        // Auto-resolve overdue / P0 alerts whose feeders are no longer active
        for (const a of alerts) {
            if (a.type === 'feeder_overdue' && !seenOverdue.has(a.id)) autoResolve(a.id)
            if (a.type === 'p0_affected'    && !seenP0.has(a.id))      autoResolve(a.id)
        }

        // ── A7. SCADA / BCC offline or telemetry loss ─────────────────────────
        for (const bcc of bccRows) {
            const offlineId   = `bcc-${bcc.id}-offline`
            const telemetryId = `bcc-${bcc.id}-telemetry-loss`

            if (bcc.is_offline) {
                emit(offlineId, {
                    type:      'bcc_offline',
                    severity:  'critical',
                    scope:     bccScope(bcc.crc),
                    title:     `${bcc.name} — Connexion SCADA perdue`,
                    detail:    `Le poste ${bcc.name} ne répond plus au SCADA. Vérifier la liaison de télécommande.`,
                    crc:       bcc.crc,
                    bcc:       bcc.name,
                    bccId:     bcc.id,
                    mwDeficit: 0,
                    since:     hhmm,
                    isP0:      false,
                    autoResolve: true,
                })
            } else {
                autoResolve(offlineId)
            }

            if (bcc.telemetry_lost) {
                emit(telemetryId, {
                    type:      'telemetry_loss',
                    severity:  'warning',
                    scope:     bccScope(bcc.crc),
                    title:     `${bcc.name} — Perte de télémesurage`,
                    detail:    `Aucune donnée télémétrée reçue de ${bcc.name} depuis plusieurs cycles. Vérifier le concentrateur RTU.`,
                    crc:       bcc.crc,
                    bcc:       bcc.name,
                    bccId:     bcc.id,
                    mwDeficit: 0,
                    since:     hhmm,
                    isP0:      false,
                    autoResolve: true,
                })
            } else {
                autoResolve(telemetryId)
            }
        }

        // ── A8. Network alerts (HTB lines / substations) from backend ──────────
        for (const na of netAlerts) {
            const naId = `net-${na.id ?? na.element_id ?? na.ref}`
            emit(naId, {
                type:      na.type ?? 'line_tripped',   // 'line_tripped' | 'substation_lost'
                severity:  'critical',
                scope:     'national',
                title:     na.title ?? `Réseau HTB — ${na.ref ?? naId}`,
                detail:    na.detail ?? `Anomalie réseau HTB détectée sur ${na.ref}. Vérifier topologie SIG.`,
                crc:       na.crc ?? null,
                bcc:       null,
                bccId:     null,
                mwDeficit: na.mw_impact ?? 0,
                since:     hhmm,
                isP0:      na.is_p0 ?? false,
                autoResolve: false,   // network faults require manual close
            })
        }

    }, [dbData])   // re-runs every dashboard poll (~30 s)

    // ═══════════════════════════════════════════════════════════════════════════
    // BLOCK B — frequency (updates every 2 s from gridStore WebSocket)
    // ═══════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        const critId = 'grid-frequency-critical'
        const warnId = 'grid-frequency-low'
        const hhmm   = nowHHMM()

        if (frequency < FREQ_CRITICAL_HZ) {
            // Critical supersedes warning
            autoResolve(warnId)
            emit(critId, {
                type:      'frequency_critical',
                severity:  'critical',
                scope:     'national',
                title:     `Fréquence critique — ${frequency.toFixed(2)} Hz`,
                detail:    `Fréquence réseau ${frequency.toFixed(2)} Hz en dessous du seuil critique (${FREQ_CRITICAL_HZ} Hz). Mobilisation réserve primaire immédiate requise.`,
                crc:       null,
                bcc:       null,
                bccId:     null,
                mwDeficit: 0,
                since:     hhmm,
                isP0:      false,
                autoResolve: true,
            })
        } else {
            autoResolve(critId)

            if (frequency < FREQ_VIGILANCE_HZ) {
                emit(warnId, {
                    type:      'frequency_low',
                    severity:  'warning',
                    scope:     'national',
                    title:     `Fréquence en vigilance — ${frequency.toFixed(2)} Hz`,
                    detail:    `Fréquence réseau ${frequency.toFixed(2)} Hz en dessous du seuil nominal (${FREQ_VIGILANCE_HZ} Hz). Surveillance active — réserve secondaire en attente.`,
                    crc:       null,
                    bcc:       null,
                    bccId:     null,
                    mwDeficit: 0,
                    since:     hhmm,
                    isP0:      false,
                    autoResolve: true,
                })
            } else {
                autoResolve(warnId)
            }
        }
    }, [frequency])
}
