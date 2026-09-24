import { useState } from 'react'
import { useAlertStore } from '../../stores/alertStore'

function Icon({ name, size = 16, className = '' })
{
    return (
        <span
            className={`material-symbols-outlined ${className}`}
            style={{ fontSize: size }}
        >
            {name}
        </span>
    )
}

// ── Severity colour helpers ───────────────────────────────────────────────────
function chipStyle(alerts)
{
    const hasUnhandled = alerts.some((a) => a.ackStatus === 'unhandled')
    if (hasUnhandled)
    {
        return 'bg-error-container text-on-error-container border-error/60'
    }
    return 'bg-tertiary-container text-tertiary border-tertiary/50'
}

function chipDot(alerts)
{
    const hasUnhandled = alerts.some((a) => a.ackStatus === 'unhandled')
    return hasUnhandled ? 'bg-error animate-ping' : 'bg-tertiary'
}

// ── Analyse Détaillée modal ───────────────────────────────────────────────────
function AnalyseDetailModal({ alert, onClose, onAcknowledge })
{
    if (!alert) return null

    const typeLabel =
        alert.type === 'bcc_execution' ? 'Deficit d\'execution BCC'  :
        alert.type === 'consumption'   ? 'Consommation anormale'      :
        'Anomalie frequence'

    const statusColor =
        alert.ackStatus === 'unhandled' ? 'text-error' :
        alert.ackStatus === 'handling'  ? 'text-tertiary' :
        'text-[#4ade80]'

    const statusLabel =
        alert.ackStatus === 'unhandled' ? 'Non pris en charge'          :
        alert.ackStatus === 'handling'  ? `Pris en charge a ${alert.ackTime}` :
        'Resolu'

    return (
        <div
            className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex items-center justify-center p-space-md"
            onClick={onClose}
        >
            <div
                className="bg-surface-container-low border border-error-container rounded w-full max-w-lg flex flex-col shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-space-lg py-space-md bg-error-container/30 border-b border-error-container shrink-0">
                    <div className="flex items-center gap-space-sm">
                        <Icon name="crisis_alert" size={20} className="text-error" />
                        <div>
                            <h3 className="font-sans font-bold text-sm text-on-surface">
                                Analyse Detaillee — {typeLabel}
                            </h3>
                            <p className="font-mono text-[10px] text-on-surface-variant">
                                Depuis {alert.since} · Ref: {alert.id}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-space-xs rounded hover:bg-surface-container-high text-on-surface transition-colors"
                        type="button"
                    >
                        <Icon name="close" size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-space-lg flex flex-col gap-space-md">

                    {/* Status */}
                    <div className="grid grid-cols-2 gap-space-sm font-mono text-xs">
                        {alert.crc && (
                            <div className="bg-surface-container rounded p-space-sm border border-surface-container-high">
                                <p className="text-[9px] text-on-surface-variant uppercase mb-0.5">CRC concerne</p>
                                <p className="font-bold text-on-surface">{alert.crc}</p>
                            </div>
                        )}
                        {alert.bcc && (
                            <div className="bg-surface-container rounded p-space-sm border border-surface-container-high">
                                <p className="text-[9px] text-on-surface-variant uppercase mb-0.5">BCC en deficit</p>
                                <p className="font-bold text-on-surface">{alert.bcc}</p>
                            </div>
                        )}
                        <div className="bg-surface-container rounded p-space-sm border border-surface-container-high">
                            <p className="text-[9px] text-on-surface-variant uppercase mb-0.5">Deficit</p>
                            <p className="font-bold text-error">{alert.mwDeficit} MW</p>
                        </div>
                        <div className="bg-surface-container rounded p-space-sm border border-surface-container-high">
                            <p className="text-[9px] text-on-surface-variant uppercase mb-0.5">Statut</p>
                            <p className={`font-bold ${statusColor}`}>{statusLabel}</p>
                        </div>
                    </div>

                    {/* Detail */}
                    <div className="bg-surface-container-lowest border border-surface-container-high rounded p-space-md font-mono text-xs text-on-surface-variant leading-relaxed">
                        {alert.detail}
                    </div>

                    {/* Timeline */}
                    <div className="flex flex-col gap-space-xs font-mono text-[10px]">
                        <p className="text-on-surface-variant uppercase tracking-wider">Chronologie</p>
                        <div className="flex items-center gap-space-sm">
                            <span className="w-2 h-2 rounded-full bg-error shrink-0" />
                            <span className="text-on-surface">{alert.since} — Deficit detecte</span>
                        </div>
                        {alert.ackTime && (
                            <div className="flex items-center gap-space-sm">
                                <span className="w-2 h-2 rounded-full bg-tertiary shrink-0" />
                                <span className="text-on-surface">{alert.ackTime} — CRC a accuse reception</span>
                            </div>
                        )}
                    </div>

                    {/* Action */}
                    {alert.ackStatus === 'unhandled' && (
                        <div className="flex items-center gap-space-sm px-space-md py-space-sm bg-error-container/20 border border-error-container/50 rounded font-mono text-[10px] text-error">
                            <Icon name="warning" size={14} className="animate-pulse shrink-0" />
                            <span>Le CRC n'a pas encore accuse reception. Contactez-le directement.</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-space-lg py-space-md border-t border-surface-container-high flex items-center justify-between shrink-0">
                    <div className="font-mono text-[9px] text-on-surface-variant flex items-center gap-1">
                        <Icon name="schedule" size={12} className="text-secondary" />
                        <span>Alerte enregistree dans l'audit DN</span>
                    </div>
                    <div className="flex items-center gap-space-sm">
                        <button
                            onClick={onClose}
                            className="px-space-md py-space-xs rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono text-xs transition-colors border border-surface-container-high"
                            type="button"
                        >
                            Fermer
                        </button>
                        {alert.ackStatus === 'unhandled' && (
                            <button
                                onClick={() => { onAcknowledge(alert.id); onClose() }}
                                className="px-space-md py-space-xs rounded bg-secondary-container text-on-secondary-container font-mono text-xs font-bold transition-all"
                                type="button"
                            >
                                Marquer comme traite
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Alerts centre slide panel ─────────────────────────────────────────────────
function AlertsCenterPanel({ isOpen, onClose })
{
    const { activeAlerts, acknowledgeAlert, resolveAlert, openPanel } = useAlertStore()
    const [detailAlert, setDetailAlert] = useState(null)

    const alerts = activeAlerts()

    const handleOpen = () =>
    {
        openPanel()   // clears badge + stops glow
    }

    // Group by CRC
    const grouped = alerts.reduce
    (
        (acc, a) =>
        {
            const key = a.crc ?? 'National'
            if (!acc[key]) acc[key] = []
            acc[key].push(a)
            return acc
        }
        ,{}
    )

    const groupColor = (groupAlerts) =>
    {
        if (groupAlerts.some((a) => a.ackStatus === 'unhandled'))
        {
            return 'text-error border-error/40 bg-error-container/20'
        }
        return 'text-tertiary border-tertiary/40 bg-tertiary-container/30'
    }

    return (
        <>
            {/* Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-[55] bg-transparent"
                    onClick={onClose}
                />
            )}

            {/* Panel */}
            <div
                className={`fixed top-14 bottom-8 right-0 w-96 max-w-[90vw] bg-surface-container-low shadow-2xl z-[56] flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-space-lg py-space-md bg-error-container/20 border-b border-error-container/50 shrink-0">
                    <div className="flex items-center gap-space-sm">
                        <Icon name="crisis_alert" size={20} className="text-error" />
                        <div>
                            <h2 className="font-sans font-bold text-sm text-on-surface uppercase tracking-wider">
                                Centre d'Alertes
                            </h2>
                            <p className="font-mono text-[10px] text-on-surface-variant">
                                {alerts.length} alerte{alerts.length > 1 ? 's' : ''} active{alerts.length > 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); onClose() }}
                        className="p-space-xs rounded hover:bg-surface-container-high text-on-surface transition-colors"
                        title="Fermer"
                        type="button"
                    >
                        <Icon name="close" size={18} />
                    </button>
                </div>

                {/* Alert groups */}
                <div className="flex-1 overflow-y-auto p-space-md flex flex-col gap-space-md">
                    {alerts.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full gap-space-md text-on-surface-variant">
                            <Icon name="check_circle" size={40} className="text-[#4ade80]" />
                            <p className="font-mono text-sm">Aucune alerte active</p>
                        </div>
                    )}

                    {Object.entries(grouped).map
                    (
                        ([groupName, groupAlerts]) => (
                            <div
                                key={groupName}
                                className={`rounded border p-space-md flex flex-col gap-space-sm ${groupColor(groupAlerts)}`}
                            >
                                {/* Group header */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-space-sm">
                                        <span className={`w-2 h-2 rounded-full ${groupAlerts.some((a) => a.ackStatus === 'unhandled') ? 'bg-error animate-ping' : 'bg-tertiary'}`} />
                                        <span className="font-mono text-xs font-bold uppercase tracking-wider">
                                            {groupName}
                                        </span>
                                    </div>
                                    <span className="font-mono text-[10px]">
                                        {groupAlerts.length} issue{groupAlerts.length > 1 ? 's' : ''}
                                    </span>
                                </div>

                                {/* Individual alerts */}
                                {groupAlerts.map
                                (
                                    (a) =>
                                    {
                                        const isUnhandled = a.ackStatus === 'unhandled'
                                        const isHandling  = a.ackStatus === 'handling'

                                        return (
                                            <div
                                                key={a.id}
                                                className="bg-surface-container-lowest border border-surface-container-high rounded p-space-sm flex flex-col gap-space-xs"
                                            >
                                                <div className="flex items-start justify-between gap-space-sm">
                                                    <div className="flex flex-col gap-0.5">
                                                        {a.bcc && (
                                                            <span className="font-mono text-xs font-bold text-on-surface">{a.bcc}</span>
                                                        )}
                                                        <span className={`font-mono text-sm font-bold ${isUnhandled ? 'text-error' : 'text-tertiary'}`}>
                                                            {a.mwDeficit} MW
                                                        </span>
                                                        <span className="font-mono text-[10px] text-on-surface-variant">
                                                            Depuis {a.since}
                                                            {a.ackTime && ` · Pris en charge a ${a.ackTime}`}
                                                        </span>
                                                    </div>
                                                    <span className={`shrink-0 px-space-xs py-0.5 rounded font-mono text-[9px] font-bold border ${isUnhandled ? 'bg-error-container/40 text-error border-error/40' : isHandling ? 'bg-tertiary-container/40 text-tertiary border-tertiary/40' : 'bg-[#16a34a]/20 text-[#4ade80] border-[#16a34a]/40'}`}>
                                                        {isUnhandled ? 'NON TRAITE' : isHandling ? 'EN COURS' : 'RESOLU'}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-space-xs">
                                                    <button
                                                        onClick={() => setDetailAlert(a)}
                                                        className="flex-1 flex items-center justify-center gap-space-xs px-space-sm py-space-xs rounded bg-surface-container hover:bg-surface-container-high border border-surface-container-high text-on-surface-variant hover:text-on-surface font-mono text-[10px] transition-colors"
                                                        type="button"
                                                    >
                                                        <Icon name="open_in_new" size={12} />
                                                        <span>Analyse Detaillee</span>
                                                    </button>
                                                    {isHandling && (
                                                        <button
                                                            onClick={() => resolveAlert(a.id)}
                                                            className="px-space-sm py-space-xs rounded bg-[#16a34a]/20 border border-[#16a34a]/40 text-[#4ade80] font-mono text-[10px] hover:bg-[#16a34a]/30 transition-colors"
                                                            type="button"
                                                        >
                                                            Marquer resolu
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    }
                                )}
                            </div>
                        )
                    )}
                </div>

                {/* Footer */}
                <div className="px-space-lg py-space-md border-t border-surface-container-high shrink-0 font-mono text-[10px] text-on-surface-variant flex items-center gap-1">
                    <Icon name="verified_user" size={12} className="text-secondary" />
                    <span>Toutes les alertes sont enregistrees dans l'audit DN</span>
                </div>
            </div>

            {/* Detail modal (above the panel) */}
            {detailAlert && (
                <AnalyseDetailModal
                    alert={detailAlert}
                    onClose={() => setDetailAlert(null)}
                    onAcknowledge={acknowledgeAlert}
                />
            )}
        </>
    )
}

// ── The thin alert bar (rendered in InternalLayout) ───────────────────────────
export default function AlertBar({ showBar = true })
{
    const { activeAlerts, newAlertCount, panelOpened, openPanel, isPanelOpen, closePanel } = useAlertStore()

    const alerts   = activeAlerts()
    const hasNew   = newAlertCount > 0
    const glowing  = !panelOpened && alerts.length > 0

    // Always render the panel portal so the bell button works even with 0 alerts
    if (!showBar || alerts.length === 0)
    {
        return (
            <AlertsCenterPanel
                isOpen={isPanelOpen}
                onClose={closePanel}
            />
        )
    }

    // Group by CRC for chips
    const crcGroups = alerts.reduce
    (
        (acc, a) =>
        {
            const key = a.crc ?? 'National'
            if (!acc[key]) acc[key] = []
            acc[key].push(a)
            return acc
        }
        ,{}
    )

    const handleOpenPanel = () =>
    {
        openPanel()   // sets isPanelOpen=true, clears badge, stops glow
    }

    return (
        <>
            {/* Thin alert bar */}
            <div
                className={`relative flex items-center justify-between px-space-lg py-space-xs bg-surface-container-lowest border-b ${glowing ? 'border-error/70' : 'border-surface-container-high'} shrink-0 z-40 overflow-hidden`}
                style={glowing
                    ? { boxShadow: '0 0 0 0 rgba(255, 68, 68, 0.4)', animation: 'alertGlow 2s ease-in-out infinite' }
                    : {}
                }
            >
                {/* Glow pulse overlay — stops when panel is opened */}
                {glowing && (
                    <div className="absolute inset-0 pointer-events-none">
                        <div
                            className="absolute inset-0 border border-error/40 rounded-none"
                            style={{ animation: 'borderPulse 2s ease-in-out infinite' }}
                        />
                    </div>
                )}

                {/* Left — alert chips */}
                <div className="flex items-center gap-space-sm overflow-x-auto">
                    <div className="flex items-center gap-space-xs shrink-0">
                        <Icon
                            name="crisis_alert"
                            size={14}
                            className={`${glowing ? 'text-error' : 'text-tertiary'}`}
                        />
                        <span className="font-mono text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider">
                            {alerts.length} ALERTE{alerts.length > 1 ? 'S' : ''} ACTIVE{alerts.length > 1 ? 'S' : ''}
                        </span>
                    </div>

                    <span className="text-on-surface-variant/40">|</span>

                    {Object.entries(crcGroups).map
                    (
                        ([name, groupAlerts]) =>
                        {
                            const hasUnhandled = groupAlerts.some((a) => a.ackStatus === 'unhandled')
                            const color        = hasUnhandled
                                ? 'bg-error-container/60 text-error border-error/50'
                                : 'bg-tertiary-container/60 text-tertiary border-tertiary/40'

                            return (
                                <div
                                    key={name}
                                    className={`flex items-center gap-1 px-space-sm py-0.5 rounded border font-mono text-[10px] font-bold shrink-0 ${color}`}
                                >
                                    <span className={`w-1.5 h-1.5 rounded-full ${hasUnhandled ? 'bg-error animate-ping' : 'bg-tertiary'}`} />
                                    <span>{name}</span>
                                    {groupAlerts.length > 1 && (
                                        <span className="opacity-70">[{groupAlerts.length}]</span>
                                    )}
                                </div>
                            )
                        }
                    )}

                    {hasNew && (
                        <span className="px-space-xs py-0.5 rounded bg-error-container text-on-error-container font-mono text-[9px] font-bold animate-pulse shrink-0">
                            +{newAlertCount} NOUVEAU{newAlertCount > 1 ? 'X' : ''}
                        </span>
                    )}
                </div>

                {/* Right — open button */}
                <button
                    onClick={handleOpenPanel}
                    className={`flex items-center gap-space-xs px-space-md py-space-xs rounded font-mono text-[10px] font-bold uppercase tracking-wider transition-all shrink-0 ml-space-md ${glowing ? 'bg-error-container text-on-error-container hover:bg-error-container/80 animate-pulse' : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest border border-surface-container-high'}`}
                    type="button"
                >
                    <Icon name="open_in_new" size={12} />
                    <span>Ouvrir Centre d'Alertes</span>
                </button>
            </div>

            {/* Animation styles */}
            <style>{`
                @keyframes borderPulse
                {
                    0%, 100% { opacity: 0.3; }
                    50%       { opacity: 1;   }
                }
                @keyframes alertGlow
                {
                    0%, 100% { box-shadow: 0 0  4px rgba(255, 68, 68, 0.2); }
                    50%       { box-shadow: 0 0 12px rgba(255, 68, 68, 0.6), 0 0 20px rgba(255, 68, 68, 0.2); }
                }
            `}</style>

            {/* Alerts centre slide panel */}
            <AlertsCenterPanel
                isOpen={isPanelOpen}
                onClose={closePanel}
            />
        </>
    )
}
