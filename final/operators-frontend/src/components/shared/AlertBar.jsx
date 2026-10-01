import { useState, useMemo } from 'react'
import { useAlertStore } from '../../stores/alertStore'

function Icon({ name, size = 16, className = '' })
{
    return (
        <span className={`material-symbols-outlined ${className}`} style={{ fontSize: size }}>
            {name}
        </span>
    )
}

// ── Config maps ───────────────────────────────────────────────────────────────

const TYPE_META = {
    // Déficit / production
    national_deficit:   { label: 'Déficit national',          icon: 'trending_down',       cat: 'Déficit'   }
    ,crc_deficit:       { label: 'Déficit régional',           icon: 'alt_route',           cat: 'Déficit'   }
    ,frequency_low:     { label: 'Fréquence — Vigilance',      icon: 'ssid_chart',          cat: 'Déficit'   }
    ,frequency_critical:{ label: 'Fréquence — Critique',       icon: 'ssid_chart',          cat: 'Déficit'   }
    // Délestage / exécution
    ,bcc_execution:     { label: 'Déficit exécution BCC',      icon: 'electric_bolt',       cat: 'Exécution' }
    ,feeder_overdue:    { label: 'Départ > 45 min',            icon: 'timer_off',           cat: 'Exécution' }
    ,bcc_not_executed:  { label: 'Programme non exécuté',      icon: 'block',               cat: 'Exécution' }
    ,bcc_tolerance:     { label: 'Tolérance MW dépassée',      icon: 'tune',                cat: 'Exécution' }
    // Réseau / topologie
    ,p0_affected:       { label: 'Infrastructure P0 affectée', icon: 'local_hospital',      cat: 'Réseau'    }
    ,line_tripped:      { label: 'Ligne HTB déclenchée',       icon: 'power_off',           cat: 'Réseau'    }
    ,substation_lost:   { label: 'Poste HTB hors service',     icon: 'location_off',        cat: 'Réseau'    }
    // Système / SCADA
    ,telemetry_loss:    { label: 'Perte télémesurage',         icon: 'signal_disconnected', cat: 'SCADA'     }
    ,bcc_offline:       { label: 'BCC hors ligne',             icon: 'wifi_off',            cat: 'SCADA'     }
    ,cycle_blocked:     { label: 'Cycle automate bloqué',      icon: 'loop',                cat: 'SCADA'     }
    // Opérationnel
    ,programme_not_set: { label: 'Programme J+1 manquant',     icon: 'event_busy',          cat: 'Opérationnel' }
    ,programme_auto_zero:{ label: 'Programme zéro appliqué',   icon: 'event_available',     cat: 'Opérationnel' }
}

const SEVERITY_STYLE = {
    critical: {
        border:      'border-error/50'
        ,bg:         'bg-error-container/15'
        ,headerBg:   'bg-error-container/30'
        ,icon:       'text-error'
        ,iconBg:     'bg-error-container/50'
        ,titleCls:   'text-error'
        ,dot:        'bg-error animate-ping'
        ,badge:      'bg-error-container text-on-error-container'
        ,badgeLabel: 'CRITIQUE'
        ,barColor:   'bg-error'
    }
    ,warning: {
        border:      'border-tertiary/40'
        ,bg:         'bg-tertiary-container/10'
        ,headerBg:   'bg-tertiary-container/20'
        ,icon:       'text-tertiary'
        ,iconBg:     'bg-tertiary-container/50'
        ,titleCls:   'text-tertiary'
        ,dot:        'bg-tertiary animate-pulse'
        ,badge:      'bg-tertiary-container text-tertiary'
        ,badgeLabel: 'ATTENTION'
        ,barColor:   'bg-tertiary'
    }
    ,info: {
        border:      'border-secondary/30'
        ,bg:         'bg-secondary-container/10'
        ,headerBg:   'bg-secondary-container/20'
        ,icon:       'text-secondary'
        ,iconBg:     'bg-secondary-container/50'
        ,titleCls:   'text-secondary'
        ,dot:        'bg-secondary'
        ,badge:      'bg-secondary-container text-on-secondary-container'
        ,badgeLabel: 'INFO'
        ,barColor:   'bg-secondary'
    }
}

const ACK_STYLE = {
    unhandled: { cls: 'bg-error-container/40 text-error border-error/40',       label: 'NON TRAITÉ'  }
    ,handling: { cls: 'bg-tertiary-container/40 text-tertiary border-tertiary/40', label: 'EN COURS'    }
    ,resolved: { cls: 'bg-[#16a34a]/20 text-[#4ade80] border-[#16a34a]/40',     label: 'RÉSOLU'      }
}

const SCOPE_LABEL = {
    national:  'National'
    ,crc_nord: 'CRC Nord'
    ,crc_sud:  'CRC Sud'
    ,bcc:      'BCC'
}

// Tabs
const FILTER_TABS = [
    { key: 'all',       label: 'Toutes'        }
    ,{ key: 'unhandled',label: 'Non traitées'  }
    ,{ key: 'national', label: 'National'      }
    ,{ key: 'crc_nord', label: 'CRC Nord'      }
    ,{ key: 'crc_sud',  label: 'CRC Sud'       }
    ,{ key: 'bcc',      label: 'Locales (BCC)' }
]

// ── Analyse Détaillée modal ───────────────────────────────────────────────────
function AnalyseDetailModal({ alert: a, onClose, onAcknowledge, onResolve })
{
    if (!a) return null

    const meta      = TYPE_META[a.type] ?? { label: a.type, icon: 'warning', cat: '—' }
    const sevStyle  = SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.warning
    const ackStyle  = ACK_STYLE[a.ackStatus] ?? ACK_STYLE.unhandled

    const mwLabel = a.mwDeficit
        ? `${a.mwDeficit >= 0 ? '+' : ''}${Number(a.mwDeficit).toFixed(1)} MW`
        : '—'

    return (
        <div
            className="fixed inset-0 z-[62] bg-background/80 backdrop-blur-sm flex items-center justify-center p-space-md"
            onClick={onClose}
        >
            <div
                className={`bg-surface-container-low border ${sevStyle.border} w-full max-w-lg flex flex-col shadow-2xl overflow-hidden`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`flex items-center justify-between px-space-lg py-space-md ${sevStyle.headerBg} border-b ${sevStyle.border} shrink-0`}>
                    <div className="flex items-center gap-space-sm">
                        <div className={`w-8 h-8 flex items-center justify-center shrink-0 ${sevStyle.iconBg}`}>
                            <Icon name={meta.icon} size={18} className={sevStyle.icon} />
                        </div>
                        <div>
                            <h3 className="font-sans font-bold text-sm text-on-surface">
                                {meta.label}
                            </h3>
                            <p className="font-mono text-[10px] text-on-surface-variant">
                                {a.isP0 && <span className="text-error font-bold mr-space-sm">⚠ P0</span>}
                                Depuis {a.since} · ID: <span className="opacity-60">{a.id}</span>
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-space-xs hover:bg-surface-container-high text-on-surface transition-colors"
                        type="button"
                    >
                        <Icon name="close" size={18} />
                    </button>
                </div>

                {/* P0 banner */}
                {a.isP0 && (
                    <div className="flex items-center gap-space-sm px-space-lg py-space-sm bg-error text-background font-mono text-xs font-bold">
                        <Icon name="local_hospital" size={14} />
                        <span>INFRASTRUCTURE CRITIQUE P0 — Rétablissement prioritaire requis</span>
                    </div>
                )}

                {/* Body */}
                <div className="p-space-lg flex flex-col gap-space-md overflow-y-auto max-h-[60vh]">

                    {/* Meta grid */}
                    <div className="grid grid-cols-2 gap-space-sm font-mono text-xs">
                        <div className="bg-surface-container p-space-sm border border-surface-container-high">
                            <p className="text-[9px] text-on-surface-variant uppercase mb-0.5">Catégorie</p>
                            <p className="font-bold text-on-surface">{meta.cat}</p>
                        </div>
                        <div className="bg-surface-container p-space-sm border border-surface-container-high">
                            <p className="text-[9px] text-on-surface-variant uppercase mb-0.5">Portée</p>
                            <p className="font-bold text-on-surface">{SCOPE_LABEL[a.scope] ?? a.scope}</p>
                        </div>
                        {a.crc && (
                            <div className="bg-surface-container p-space-sm border border-surface-container-high">
                                <p className="text-[9px] text-on-surface-variant uppercase mb-0.5">CRC concerné</p>
                                <p className="font-bold text-on-surface">{a.crc}</p>
                            </div>
                        )}
                        {a.bcc && (
                            <div className="bg-surface-container p-space-sm border border-surface-container-high">
                                <p className="text-[9px] text-on-surface-variant uppercase mb-0.5">BCC concerné</p>
                                <p className="font-bold text-on-surface">{a.bcc}</p>
                            </div>
                        )}
                        <div className="bg-surface-container p-space-sm border border-surface-container-high">
                            <p className="text-[9px] text-on-surface-variant uppercase mb-0.5">Écart MW</p>
                            <p className={`font-bold ${sevStyle.titleCls}`}>{mwLabel}</p>
                        </div>
                        <div className="bg-surface-container p-space-sm border border-surface-container-high">
                            <p className="text-[9px] text-on-surface-variant uppercase mb-0.5">Statut</p>
                            <p className={`font-bold text-xs px-space-xs py-0.5 inline-block border ${ackStyle.cls}`}>
                                {ackStyle.label}
                            </p>
                        </div>
                    </div>

                    {/* Detail text */}
                    <div className="bg-surface-container-lowest border border-surface-container-high p-space-md font-mono text-xs text-on-surface-variant leading-relaxed">
                        {a.detail || '—'}
                    </div>

                    {/* Timeline */}
                    <div className="flex flex-col gap-space-xs font-mono text-[10px]">
                        <p className="text-on-surface-variant uppercase tracking-wider font-semibold">Chronologie</p>
                        <div className="flex items-center gap-space-sm">
                            <span className={`w-2 h-2 shrink-0 ${sevStyle.dot}`} />
                            <span className="text-on-surface">{a.since} — Alerte détectée</span>
                        </div>
                        {a.ackTime && (
                            <div className="flex items-center gap-space-sm">
                                <span className="w-2 h-2 bg-tertiary shrink-0" />
                                <span className="text-on-surface">{a.ackTime} — Pris en charge par l'opérateur</span>
                            </div>
                        )}
                    </div>

                    {/* Unhandled warning */}
                    {a.ackStatus === 'unhandled' && (
                        <div className="flex items-center gap-space-sm px-space-md py-space-sm bg-error-container/20 border border-error-container/50 font-mono text-[10px] text-error">
                            <Icon name="warning" size={14} className="animate-pulse shrink-0" />
                            <span>Alerte non encore acquittée. Contactez le responsable CRC/BCC directement.</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-space-lg py-space-md border-t border-surface-container-high flex items-center justify-between shrink-0 bg-surface-container-lowest">
                    <div className="font-mono text-[9px] text-on-surface-variant flex items-center gap-1">
                        <Icon name="verified_user" size={12} className="text-secondary" />
                        <span>Enregistrée dans l'audit DN</span>
                    </div>
                    <div className="flex items-center gap-space-sm">
                        <button
                            onClick={onClose}
                            className="px-space-md py-space-xs bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono text-xs transition-colors border border-surface-container-high"
                            type="button"
                        >
                            Fermer
                        </button>
                        {a.ackStatus === 'unhandled' && (
                            <button
                                onClick={() => { onAcknowledge(a.id); onClose() }}
                                className="px-space-md py-space-xs bg-secondary-container text-on-secondary-container font-mono text-xs font-bold transition-all hover:bg-secondary"
                                type="button"
                            >
                                Pris en compte
                            </button>
                        )}
                        {a.ackStatus === 'handling' && (
                            <button
                                onClick={() => { onResolve(a.id); onClose() }}
                                className="px-space-md py-space-xs bg-[#16a34a]/20 border border-[#16a34a]/40 text-[#4ade80] font-mono text-xs font-bold transition-all hover:bg-[#16a34a]/30"
                                type="button"
                            >
                                Marquer résolu
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Alert card ────────────────────────────────────────────────────────────────
function AlertCard({ a, onDetail })
{
    const { acknowledgeAlert, resolveAlert } = useAlertStore()
    const meta     = TYPE_META[a.type] ?? { label: a.type, icon: 'warning', cat: '—' }
    const sevStyle = SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.warning
    const ackStyle = ACK_STYLE[a.ackStatus] ?? ACK_STYLE.unhandled

    const mwLabel = a.mwDeficit
        ? `${a.mwDeficit >= 0 ? '+' : ''}${Number(a.mwDeficit).toFixed(1)} MW`
        : null

    return (
        <div className={`border ${sevStyle.border} ${sevStyle.bg} flex flex-col overflow-hidden`}>
            {/* Severity left bar */}
            <div className="flex">
                <div className={`w-1 shrink-0 ${sevStyle.barColor}`} />

                <div className="flex-1 p-space-sm flex flex-col gap-space-xs">

                    {/* Top row — icon + title + status badge */}
                    <div className="flex items-start gap-space-sm">
                        <div className={`w-6 h-6 flex items-center justify-center shrink-0 mt-0.5 ${sevStyle.iconBg}`}>
                            <Icon name={a.isP0 ? 'local_hospital' : meta.icon} size={13} className={sevStyle.icon} />
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-space-xs flex-wrap">
                                {a.isP0 && (
                                    <span className="px-space-xs py-0.5 bg-error text-background font-mono text-[9px] font-bold shrink-0">
                                        P0
                                    </span>
                                )}
                                <span className={`font-mono text-xs font-bold ${sevStyle.titleCls} leading-tight`}>
                                    {a.title}
                                </span>
                            </div>
                            <div className="flex items-center gap-space-sm mt-0.5 flex-wrap">
                                {a.bcc && (
                                    <span className="font-mono text-[10px] text-on-surface-variant">{a.bcc}</span>
                                )}
                                {a.crc && !a.bcc && (
                                    <span className="font-mono text-[10px] text-on-surface-variant">{a.crc}</span>
                                )}
                                <span className="font-mono text-[10px] text-on-surface-variant">
                                    Depuis {a.since}
                                </span>
                                {mwLabel && (
                                    <span className={`font-mono text-[10px] font-bold ${sevStyle.titleCls}`}>
                                        {mwLabel}
                                    </span>
                                )}
                            </div>
                        </div>

                        <span className={`shrink-0 px-space-xs py-0.5 font-mono text-[9px] font-bold border ${ackStyle.cls}`}>
                            {ackStyle.label}
                        </span>
                    </div>

                    {/* Action row */}
                    <div className="flex items-center gap-space-xs pt-space-xs border-t border-surface-container-high/40">
                        <button
                            onClick={() => onDetail(a)}
                            className="flex-1 flex items-center justify-center gap-space-xs px-space-sm py-space-xs bg-surface-container hover:bg-surface-container-high border border-surface-container-high text-on-surface-variant hover:text-on-surface font-mono text-[10px] transition-colors"
                            type="button"
                        >
                            <Icon name="open_in_new" size={11} />
                            <span>Analyse Détaillée</span>
                        </button>

                        {a.ackStatus === 'unhandled' && (
                            <button
                                onClick={() => acknowledgeAlert(a.id)}
                                className="px-space-sm py-space-xs bg-secondary-container/30 text-secondary border border-secondary/30 font-mono text-[10px] hover:bg-secondary-container/60 transition-colors"
                                type="button"
                            >
                                ACQ
                            </button>
                        )}

                        {a.ackStatus === 'handling' && (
                            <button
                                onClick={() => resolveAlert(a.id)}
                                className="px-space-sm py-space-xs bg-[#16a34a]/20 border border-[#16a34a]/40 text-[#4ade80] font-mono text-[10px] hover:bg-[#16a34a]/30 transition-colors"
                                type="button"
                            >
                                Résolu
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
    const { alerts: rawAlerts, activeAlerts, acknowledgeAlert, resolveAlert, notifications } = useAlertStore()
    const [detailAlert, setDetailAlert] = useState(null)
    const [activeTab,   setActiveTab]   = useState('all')

    const alerts = activeAlerts()

    // Counts per tab
    const tabCounts = useMemo(() => ({
        all:       alerts.length
        ,unhandled:alerts.filter((a) => a.ackStatus === 'unhandled').length
        ,national: alerts.filter((a) => a.scope === 'national').length
        ,crc_nord: alerts.filter((a) => a.scope === 'crc_nord').length
        ,crc_sud:  alerts.filter((a) => a.scope === 'crc_sud').length
        ,bcc:      alerts.filter((a) => a.scope === 'bcc' || (a.bcc && a.scope !== 'national' && !a.scope?.startsWith('crc'))).length
    }), [alerts])

    // Filtered list
    const filtered = useMemo(() => {
        let list = [...alerts]

        if (activeTab === 'unhandled') list = list.filter((a) => a.ackStatus === 'unhandled')
        else if (activeTab === 'national') list = list.filter((a) => a.scope === 'national')
        else if (activeTab === 'crc_nord') list = list.filter((a) => a.scope === 'crc_nord')
        else if (activeTab === 'crc_sud')  list = list.filter((a) => a.scope === 'crc_sud')
        else if (activeTab === 'bcc')      list = list.filter((a) => a.bcc != null)

        // P0 pinned at top, then by severity (critical → warning → info), then unhandled first
        const sevOrder = { critical: 0, warning: 1, info: 2 }
        const ackOrder = { unhandled: 0, handling: 1, resolved: 2 }
        list.sort((a, b) => {
            if (a.isP0 !== b.isP0) return a.isP0 ? -1 : 1
            const sevDiff = (sevOrder[a.severity] ?? 2) - (sevOrder[b.severity] ?? 2)
            if (sevDiff !== 0) return sevDiff
            return (ackOrder[a.ackStatus] ?? 2) - (ackOrder[b.ackStatus] ?? 2)
        })

        return list
    }, [alerts, activeTab])

    // Active system notifications (non-resolved)
    const sysNotifs = notifications.filter((n) => n.ackStatus !== 'resolved')

    // Summary counts for the header
    const critCount = alerts.filter((a) => a.severity === 'critical').length
    const warnCount = alerts.filter((a) => a.severity === 'warning').length

    return (
        <>
            {/* Overlay */}
            {isOpen && (
                <div className="fixed inset-0 z-[55] bg-transparent" onClick={onClose} />
            )}

            {/* Panel */}
            <div
                className={`fixed top-14 bottom-8 right-0 w-[420px] max-w-[95vw] bg-surface-container-low shadow-2xl z-[56] flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                {/* ── Panel header ─────────────────────────────────────────── */}
                <div className="flex items-center justify-between px-space-lg py-space-md bg-surface-container border-b border-surface-container-high shrink-0">
                    <div className="flex items-center gap-space-sm">
                        <Icon name="crisis_alert" size={20} className={critCount > 0 ? 'text-error' : 'text-tertiary'} />
                        <div>
                            <h2 className="font-sans font-bold text-sm text-on-surface uppercase tracking-wider">
                                Centre d'Alertes
                            </h2>
                            <p className="font-mono text-[10px] text-on-surface-variant">
                                {alerts.length} alerte{alerts.length !== 1 ? 's' : ''} active{alerts.length !== 1 ? 's' : ''}
                                {critCount > 0 && (
                                    <span className="ml-space-sm text-error font-bold">{critCount} critique{critCount > 1 ? 's' : ''}</span>
                                )}
                                {warnCount > 0 && (
                                    <span className="ml-space-sm text-tertiary">{warnCount} attention</span>
                                )}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); onClose() }}
                        className="p-space-xs hover:bg-surface-container-high text-on-surface transition-colors"
                        title="Fermer"
                        type="button"
                    >
                        <Icon name="close" size={18} />
                    </button>
                </div>

                {/* ── Filter tabs ───────────────────────────────────────────── */}
                <div className="flex items-center gap-0 border-b border-surface-container-high shrink-0 overflow-x-auto bg-surface-container-lowest">
                    {FILTER_TABS.map((tab) => {
                        const count  = tabCounts[tab.key] ?? 0
                        const active = activeTab === tab.key
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex items-center gap-space-xs px-space-md py-space-sm font-mono text-[10px] whitespace-nowrap transition-colors border-b-2 shrink-0 ${active ? 'border-secondary text-secondary bg-surface-container font-bold' : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container/50'}`}
                                type="button"
                            >
                                <span>{tab.label}</span>
                                {count > 0 && (
                                    <span className={`px-space-xs py-0.5 font-bold ${active ? 'bg-secondary text-background' : 'bg-surface-container-high text-on-surface-variant'}`}>
                                        {count}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>

                {/* ── Alert list ────────────────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto flex flex-col gap-space-xs p-space-sm">

                    {/* System notifications (J+1) — shown at top when present */}
                    {activeTab === 'all' && sysNotifs.length > 0 && (
                        <div className="flex flex-col gap-space-xs mb-space-xs">
                            <p className="font-mono text-[9px] text-on-surface-variant uppercase tracking-wider px-space-xs">
                                Notifications système
                            </p>
                            {sysNotifs.map((n) => {
                                const sevStyle = SEVERITY_STYLE[
                                    n.severity === 'crit' ? 'critical'
                                    : n.severity === 'warn' ? 'warning'
                                    : 'info'
                                ]
                                return (
                                    <div
                                        key={n.id}
                                        className={`border ${sevStyle.border} ${sevStyle.bg} flex overflow-hidden`}
                                    >
                                        <div className={`w-1 shrink-0 ${sevStyle.barColor}`} />
                                        <div className="flex-1 p-space-sm flex items-start gap-space-sm">
                                            <div className={`w-6 h-6 flex items-center justify-center shrink-0 ${sevStyle.iconBg}`}>
                                                <Icon name="notifications_active" size={13} className={sevStyle.icon} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`font-mono text-xs font-bold ${sevStyle.titleCls}`}>{n.title}</p>
                                                <p className="font-mono text-[10px] text-on-surface-variant mt-0.5 leading-relaxed">{n.body}</p>
                                                <p className="font-mono text-[9px] text-on-surface-variant mt-space-xs">{n.createdAt}</p>
                                            </div>
                                            <span className={`shrink-0 px-space-xs py-0.5 font-mono text-[9px] font-bold border ${n.ackStatus === 'handling' ? ACK_STYLE.handling.cls : ACK_STYLE.unhandled.cls}`}>
                                                {n.ackStatus === 'handling' ? 'EN COURS' : 'NON TRAITÉ'}
                                            </span>
                                        </div>
                                    </div>
                                )
                            })}
                            <div className="border-t border-surface-container-high mt-space-xs" />
                        </div>
                    )}

                    {/* Empty state */}
                    {filtered.length === 0 && (
                        <div className="flex flex-col items-center justify-center flex-1 gap-space-md text-on-surface-variant py-12">
                            <Icon name="check_circle" size={40} className="text-[#4ade80] opacity-70" />
                            <p className="font-mono text-xs">Aucune alerte dans cette catégorie</p>
                        </div>
                    )}

                    {/* Alert cards */}
                    {filtered.map((a) => (
                        <AlertCard key={a.id} a={a} onDetail={setDetailAlert} />
                    ))}
                </div>

                {/* ── Footer ───────────────────────────────────────────────── */}
                <div className="px-space-lg py-space-sm border-t border-surface-container-high shrink-0 bg-surface-container-lowest font-mono text-[10px] text-on-surface-variant flex items-center gap-space-xs">
                    <Icon name="verified_user" size={12} className="text-secondary" />
                    <span>Toutes les alertes sont enregistrées dans l'audit DN</span>
                </div>
            </div>

            {/* Detail modal — layered above the panel */}
            {detailAlert && (
                <AnalyseDetailModal
                    alert={detailAlert}
                    onClose={() => setDetailAlert(null)}
                    onAcknowledge={acknowledgeAlert}
                    onResolve={resolveAlert}
                />
            )}
        </>
    )
}

// ── The thin alert bar (rendered in InternalLayout, above page content) ───────
export default function AlertBar({ showBar = true })
{
    const { activeAlerts, unreadCount, openPanel, isPanelOpen, closePanel } = useAlertStore()

    const alerts   = activeAlerts()
    const newCount = unreadCount()
    const hasNew   = newCount > 0
    // Glow only while the panel is closed and there are unhandled alerts
    const glowing  = !isPanelOpen && alerts.some((a) => a.ackStatus === 'unhandled')

    // Always render the panel so the TopBar bell button can open it
    if (!showBar || alerts.length === 0)
    {
        return (
            <AlertsCenterPanel isOpen={isPanelOpen} onClose={closePanel} />
        )
    }

    // Derive the worst severity for bar colouring
    const hasCritical = alerts.some((a) => a.severity === 'critical' && a.ackStatus !== 'resolved')

    // Group by scope label for chips
    const scopeGroups = alerts.reduce((acc, a) => {
        const key = a.crc ?? (a.scope === 'national' ? 'National' : SCOPE_LABEL[a.scope] ?? 'National')
        if (!acc[key]) acc[key] = []
        acc[key].push(a)
        return acc
    }, {})

    return (
        <>
            {/* ── Thin alert bar ──────────────────────────────────────────── */}
            <div
                className={`relative flex items-center justify-between px-space-lg py-space-xs bg-surface-container-lowest border-b ${glowing ? 'border-error/70' : 'border-surface-container-high'} shrink-0 z-40 overflow-hidden`}
                style={glowing ? { animation: 'alertGlow 2s ease-in-out infinite' } : {}}
            >
                {/* Pulse border overlay */}
                {glowing && (
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 border border-error/40" style={{ animation: 'borderPulse 2s ease-in-out infinite' }} />
                    </div>
                )}

                {/* Left — count + scope chips */}
                <div className="flex items-center gap-space-sm overflow-x-auto">
                    <div className="flex items-center gap-space-xs shrink-0">
                        <Icon
                            name="crisis_alert"
                            size={14}
                            className={hasCritical ? 'text-error' : 'text-tertiary'}
                        />
                        <span className="font-mono text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider">
                            {alerts.length} ALERTE{alerts.length > 1 ? 'S' : ''} ACTIVE{alerts.length > 1 ? 'S' : ''}
                        </span>
                    </div>

                    <span className="text-on-surface-variant/40 shrink-0">|</span>

                    {Object.entries(scopeGroups).map(([name, group]) => {
                        const hasCrit    = group.some((a) => a.severity === 'critical' && a.ackStatus === 'unhandled')
                        const hasWarn    = group.some((a) => a.ackStatus === 'unhandled')
                        const colorCls   = hasCrit
                            ? 'bg-error-container/60 text-error border-error/50'
                            : hasWarn
                                ? 'bg-tertiary-container/60 text-tertiary border-tertiary/40'
                                : 'bg-surface-container-high text-on-surface-variant border-surface-container-highest'
                        const dotCls     = hasCrit ? 'bg-error animate-ping' : hasWarn ? 'bg-tertiary' : 'bg-on-surface-variant/40'
                        return (
                            <div
                                key={name}
                                className={`flex items-center gap-1 px-space-sm py-0.5 border font-mono text-[10px] font-bold shrink-0 ${colorCls}`}
                            >
                                <span className={`w-1.5 h-1.5 ${dotCls}`} />
                                <span>{name}</span>
                                {group.length > 1 && <span className="opacity-70">[{group.length}]</span>}
                            </div>
                        )
                    })}

                    {hasNew && (
                        <span className="px-space-xs py-0.5 bg-error-container text-on-error-container font-mono text-[9px] font-bold animate-pulse shrink-0">
                            +{newCount} NOUVEAU{newCount > 1 ? 'X' : ''}
                        </span>
                    )}
                </div>

                {/* Right — open panel button */}
                <button
                    onClick={openPanel}
                    className={`flex items-center gap-space-xs px-space-md py-space-xs font-mono text-[10px] font-bold uppercase tracking-wider transition-all shrink-0 ml-space-md ${hasCritical && glowing ? 'bg-error-container text-on-error-container hover:bg-error-container/80 animate-pulse' : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest border border-surface-container-high'}`}
                    type="button"
                >
                    <Icon name="open_in_new" size={12} />
                    <span>Centre d'Alertes</span>
                </button>
            </div>

            <style>{`
                @keyframes borderPulse {
                    0%, 100% { opacity: 0.3; }
                    50%      { opacity: 1; }
                }
                @keyframes alertGlow {
                    0%, 100% { box-shadow: 0 0  4px rgba(255,68,68,0.2); }
                    50%      { box-shadow: 0 0 12px rgba(255,68,68,0.6), 0 0 20px rgba(255,68,68,0.2); }
                }
            `}</style>

            <AlertsCenterPanel isOpen={isPanelOpen} onClose={closePanel} />
        </>
    )
}
