import { useState, useEffect } from 'react'
import { useNavigate }                 from 'react-router-dom'
import { useAuthStore }                from '../../stores/authStore'
import { useAlertStore }               from '../../stores/alertStore'
import { useGridStore }                from '../../stores/gridStore'

function Icon({ name, size = 20, className = '' })
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

// ── Notification Dropdown ─────────────────────────────────────────────────────
function NotificationDropdown({ onClose, onOpenPanel })
{
    const { activeAlerts, acknowledgeAlert, notifications, acknowledgeNotification, resolveNotification } = useAlertStore()
    const alerts = activeAlerts()

    // Show the 5 most recent operational alerts (newest first)
    const recentAlerts = [...alerts].reverse().slice(0, 5)

    // System notifications (J+1 reminders, published programme, auto-zero)
    const sysNotifs = notifications.filter((n) => n.ackStatus !== 'resolved')

    const totalCount = recentAlerts.length + sysNotifs.length

    const alertTypeLabel = (type) =>
        type === 'bcc_execution' ? 'Déficit exécution BCC' :
        type === 'consumption'   ? 'Consommation anormale'  :
        type === 'frequency'     ? 'Anomalie fréquence'     :
        'Alerte système'

    const alertTypeIcon = (type) =>
        type === 'bcc_execution' ? 'electric_bolt' :
        type === 'consumption'   ? 'trending_up'   :
        type === 'frequency'     ? 'ssid_chart'    :
        'warning'

    // Severity → style mapping for system notifications
    const notifStyle = (severity, ackStatus) =>
    {
        if (ackStatus === 'handling') return { bg: 'bg-tertiary-container/20', icon: 'text-tertiary', iconBg: 'bg-tertiary-container/40', dot: 'text-tertiary' }
        switch (severity)
        {
            case 'crit': return { bg: 'bg-error-container/10', icon: 'text-error', iconBg: 'bg-error-container/40', dot: 'text-error' }
            case 'warn': return { bg: 'bg-tertiary-container/10', icon: 'text-tertiary', iconBg: 'bg-tertiary-container/30', dot: 'text-tertiary' }
            default:     return { bg: 'bg-secondary-container/10', icon: 'text-secondary', iconBg: 'bg-secondary-container/30', dot: 'text-secondary' }
        }
    }

    const notifIcon = (type) =>
        type === 'j1_reminder'  ? 'notifications_active' :
        type === 'j1_auto_zero' ? 'warning'              :
        type === 'j1_published' ? 'event_available'      :
        type === 'j1_assigned'  ? 'event_available'      :
        'info'

    return (
        <>
            {/* Invisible overlay to catch outside clicks */}
            <div
                className="fixed inset-0 z-[58]"
                onClick={onClose}
            />

            {/* Dropdown panel */}
            <div className="absolute right-0 top-10 w-80 bg-surface-container-low border border-surface-container-high shadow-2xl z-[59] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-space-md py-space-sm bg-surface-container border-b border-surface-container-high shrink-0">
                    <div className="flex items-center gap-space-sm">
                        <Icon name="notifications" size={15} className="text-secondary" />
                        <span className="font-sans font-bold text-xs text-on-surface uppercase tracking-wider">
                            Notifications
                        </span>
                        {totalCount > 0 && (
                            <span className="px-space-xs py-0.5 rounded-full bg-error-container text-on-error-container font-mono text-[9px] font-bold">
                                {totalCount}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-space-xs rounded hover:bg-surface-container-high text-on-surface-variant transition-colors"
                        type="button"
                    >
                        <Icon name="close" size={15} />
                    </button>
                </div>

                {/* Notification list */}
                <div className="flex flex-col max-h-80 overflow-y-auto">
                    {totalCount === 0 && (
                        <div className="flex flex-col items-center justify-center py-8 gap-space-sm text-on-surface-variant">
                            <Icon name="notifications_none" size={32} className="opacity-40" />
                            <span className="font-mono text-xs">Aucune notification</span>
                        </div>
                    )}

                    {/* ── System notifications (J+1) — shown first ─────────── */}
                    {sysNotifs.map((n) =>
                    {
                        const s = notifStyle(n.severity, n.ackStatus)
                        return (
                            <div
                                key={n.id}
                                className={`flex items-start gap-space-sm px-space-md py-space-sm border-b border-surface-container-high/50 transition-colors hover:bg-surface-container ${s.bg}`}
                            >
                                {/* Icon */}
                                <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 mt-0.5 ${s.iconBg}`}>
                                    <Icon name={notifIcon(n.type)} size={14} className={s.icon} />
                                </div>

                                {/* Content */}
                                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-space-xs">
                                        <span className="font-mono text-[10px] font-bold text-on-surface truncate">
                                            {n.title}
                                        </span>
                                        <span className="font-mono text-[9px] text-on-surface-variant shrink-0">
                                            {n.createdAt}
                                        </span>
                                    </div>
                                    <span className="font-mono text-[10px] text-on-surface-variant leading-relaxed">
                                        {n.body}
                                    </span>
                                    <span className={`font-mono text-[9px] font-bold ${s.dot}`}>
                                        {n.ackStatus === 'handling' ? '● Pris en compte' : '● Non traité'}
                                    </span>
                                </div>

                                {/* Quick ack / dismiss */}
                                {n.ackStatus === 'unhandled' && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); acknowledgeNotification(n.id) }}
                                        className="shrink-0 mt-0.5 px-space-xs py-0.5 rounded bg-secondary-container/30 text-secondary border border-secondary/30 font-mono text-[9px] hover:bg-secondary-container/60 transition-colors"
                                        title="Marquer comme lu"
                                        type="button"
                                    >
                                        ACK
                                    </button>
                                )}
                                {n.ackStatus === 'handling' && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); resolveNotification(n.type) }}
                                        className="shrink-0 mt-0.5 px-space-xs py-0.5 rounded bg-surface-container-high text-on-surface-variant border border-surface-container-highest font-mono text-[9px] hover:bg-surface-container-highest transition-colors"
                                        title="Fermer"
                                        type="button"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        )
                    })}

                    {/* ── Operational alerts ───────────────────────────────── */}
                    {recentAlerts.map((a) =>
                    {
                        const isUnhandled = a.ackStatus === 'unhandled'
                        const isHandling  = a.ackStatus === 'handling'

                        return (
                            <div
                                key={a.id}
                                className={`flex items-start gap-space-sm px-space-md py-space-sm border-b border-surface-container-high/50 transition-colors hover:bg-surface-container ${isUnhandled ? 'bg-error-container/10' : ''}`}
                            >
                                {/* Icon */}
                                <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 mt-0.5 ${isUnhandled ? 'bg-error-container/40' : isHandling ? 'bg-tertiary-container/40' : 'bg-surface-container-high'}`}>
                                    <Icon
                                        name={alertTypeIcon(a.type)}
                                        size={14}
                                        className={isUnhandled ? 'text-error' : isHandling ? 'text-tertiary' : 'text-on-surface-variant'}
                                    />
                                </div>

                                {/* Content */}
                                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-space-xs">
                                        <span className="font-mono text-[10px] font-bold text-on-surface truncate">
                                            {alertTypeLabel(a.type)}
                                        </span>
                                        <span className="font-mono text-[9px] text-on-surface-variant shrink-0">
                                            {a.since}
                                        </span>
                                    </div>
                                    <span className="font-mono text-[10px] text-on-surface-variant truncate">
                                        {a.bcc ? `${a.bcc} · ` : ''}{a.crc ?? 'National'} · {a.mwDeficit} MW
                                    </span>
                                    <span className={`font-mono text-[9px] font-bold ${isUnhandled ? 'text-error' : isHandling ? 'text-tertiary' : 'text-[#4ade80]'}`}>
                                        {isUnhandled ? '● Non traité' : isHandling ? '● En cours' : '● Résolu'}
                                    </span>
                                </div>

                                {/* Quick ack */}
                                {isUnhandled && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); acknowledgeAlert(a.id) }}
                                        className="shrink-0 mt-0.5 px-space-xs py-0.5 rounded bg-secondary-container/30 text-secondary border border-secondary/30 font-mono text-[9px] hover:bg-secondary-container/60 transition-colors"
                                        title="Accuser réception"
                                        type="button"
                                    >
                                        ACK
                                    </button>
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* Footer — open full panel */}
                <button
                    onClick={() => { onClose(); onOpenPanel() }}
                    className="flex items-center justify-center gap-space-sm px-space-md py-space-sm bg-surface-container hover:bg-surface-container-high border-t border-surface-container-high text-secondary font-mono text-[10px] font-bold uppercase tracking-wider transition-colors"
                    type="button"
                >
                    <Icon name="open_in_new" size={12} />
                    <span>Ouvrir le Centre d'Alertes</span>
                </button>
            </div>
        </>
    )
}

export default function TopBar()
{
    const { user, logout }    = useAuthStore()
    const { frequency }       = useGridStore()
    const { unreadCount, openPanel, notifications } = useAlertStore()
    const badgeCount = unreadCount()
    const navigate            = useNavigate()
    const [time, setTime]     = useState(new Date())
    const [profileOpen, setProfileOpen]   = useState(false)
    const [notifOpen,   setNotifOpen]     = useState(false)

    useEffect
    (
        () =>
        {
            const t = setInterval(() => setTime(new Date()), 1000)
            return () => clearInterval(t)
        }
        ,[]
    )

    // Close profile dropdown on outside click
    useEffect
    (
        () =>
        {
            if (!profileOpen) return
            const handler = () => setProfileOpen(false)
            document.addEventListener('mousedown', handler)
            return () => document.removeEventListener('mousedown', handler)
        }
        ,[profileOpen]
    )

    const pad = (n) => String(n).padStart(2, '0')

    const localStr =
        `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())} UTC+1`

    const utcStr =
        `TU ${pad(time.getUTCHours())}:${pad(time.getUTCMinutes())}:${pad(time.getUTCSeconds())}`

    return (
        <header className="fixed top-0 left-0 right-0 h-14 bg-surface-container-low/95 backdrop-blur-md z-50 shadow-[0_1px_8px_rgba(0,0,0,0.4)]">
            <div className="h-14 w-full px-space-lg flex items-center justify-between gap-space-md">

                {/* Left — logo + frequency + tabs */}
                <div className="flex items-center gap-space-lg shrink-0">

                    {/* Logo + identity */}
                    <div className="flex flex-col">
                        <div className="flex items-center gap-space-sm">
                            <span className="font-headline-sm text-headline-sm text-primary tracking-wide uppercase">
                                STEG CONDUITE
                            </span>
                            <span className="px-space-sm py-space-xs rounded bg-surface-container-highest text-on-surface-variant font-label-caps text-label-caps tracking-wider">
                                PROD 225/150/90/30 kV
                            </span>
                        </div>
                        <div className="flex items-center gap-space-sm font-label-telemetry-sm text-label-telemetry-sm text-on-surface-variant">
                            <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                            <span>RÉSEAU INTERCONNECTÉ</span>
                        </div>
                    </div>

                    {/* Frequency badge */}
                    <div className="hidden xl:flex items-center bg-surface-container px-space-md py-space-xs rounded gap-space-md">
                        <div className="flex flex-col">
                            <span className="font-label-caps text-label-caps text-on-surface-variant">FRÉQUENCE RÉSEAU</span>
                            <span className={`font-label-telemetry-md text-label-telemetry-md ${frequency < 49.8 ? 'text-error animate-pulse' : frequency < 49.95 ? 'text-tertiary' : 'text-secondary'}`}>
                                {frequency.toFixed(2)} Hz
                            </span>
                        </div>
                        <div className={`flex items-center gap-space-xs px-space-sm py-space-xs rounded ${frequency < 49.8 ? 'bg-error-container' : 'bg-surface-container-high'}`}>
                            <span className={`w-2 h-2 rounded-full ${frequency < 49.8 ? 'bg-error animate-ping' : frequency < 49.95 ? 'bg-tertiary' : 'bg-secondary'}`} />
                            <span className={`font-label-telemetry-sm text-label-telemetry-sm ${frequency < 49.8 ? 'text-on-error-container font-bold' : 'text-on-surface'}`}>
                                {frequency < 49.8 ? 'ALERTE' : frequency < 49.95 ? 'VIGILANCE' : 'NOMINALE'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Right — clock, user, actions */}
                <div className="flex items-center gap-space-md shrink-0">

                    {/* Clock */}
                    <div className="hidden lg:flex flex-col items-end bg-surface-container px-space-md py-space-xs rounded font-label-telemetry-sm text-label-telemetry-sm">
                        <span className="text-primary">{localStr}</span>
                        <span className="text-on-surface-variant">{utcStr}</span>
                    </div>

                    {/* User info */}
                    {user && (
                        <div className="hidden md:flex items-center gap-space-md pl-space-md">
                            <div className="flex flex-col items-end leading-tight">
                                <span className="font-headline-sm text-body-sm text-on-surface font-semibold">
                                    {user.displayName}
                                </span>
                                <span className="font-label-caps text-label-caps text-on-surface-variant">
                                    OPÉRATEUR {user.role} · {user.zone?.toUpperCase()}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Notifications */}
                    <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
                        <button
                            onClick={() => setNotifOpen((v) => !v)}
                            className={`relative p-space-sm rounded bg-surface-container transition-colors text-on-surface flex items-center justify-center ${badgeCount > 0 ? 'hover:bg-error-container/30' : 'hover:bg-surface-container-high'} ${notifOpen ? 'bg-surface-container-high ring-1 ring-secondary/40' : ''}`}
                            title="Notifications"
                            type="button"
                        >
                            <Icon name="notifications" size={20} className={badgeCount > 0 ? 'text-error' : ''} />
                            {badgeCount > 0 && (
                                <span className="absolute -top-1 -right-1 px-space-xs bg-error-container text-on-error-container rounded-full font-label-telemetry-sm text-[10px] leading-none py-0.5 font-bold animate-pulse">
                                    {badgeCount}
                                </span>
                            )}
                        </button>

                        {notifOpen && (
                            <NotificationDropdown
                                onClose={() => setNotifOpen(false)}
                                onOpenPanel={() => { openPanel() }}
                            />
                        )}
                    </div>

                    {/* Avatar + profile dropdown */}
                    <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
                        <button
                            onClick={() => setProfileOpen((v) => !v)}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${profileOpen ? 'bg-secondary-container ring-2 ring-secondary' : 'bg-primary hover:bg-secondary-container hover:ring-2 hover:ring-secondary/50'}`}
                            title="Profil et session"
                            type="button"
                        >
                            <Icon name="person" size={18} className={profileOpen ? 'text-on-secondary-container' : 'text-on-primary'} />
                        </button>

                        {/* Dropdown */}
                        {profileOpen && (
                            <div className="absolute right-0 top-10 w-64 bg-surface-container-low border border-surface-container-high shadow-2xl z-[60] flex flex-col overflow-hidden">

                                {/* User info header */}
                                <div className="px-space-md py-space-md bg-surface-container border-b border-surface-container-high">
                                    <div className="flex items-center gap-space-sm">
                                        <div className="w-9 h-9 rounded-full bg-secondary-container flex items-center justify-center shrink-0">
                                            <Icon name="person" size={18} className="text-on-secondary-container" />
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="font-sans font-bold text-xs text-on-surface truncate">
                                                {user?.displayName}
                                            </span>
                                            <span className="font-mono text-[10px] text-on-surface-variant truncate">
                                                {user?.username}
                                            </span>
                                            <span className={`font-mono text-[9px] font-bold uppercase mt-space-xs px-space-xs py-0.5 self-start ${user?.role === 'DN' ? 'bg-secondary-container/40 text-secondary' : user?.role === 'CRC' ? 'bg-tertiary-container/40 text-tertiary' : 'bg-surface-container text-on-surface-variant'}`}>
                                                {user?.role}{user?.zone ? ` · ${user.zone}` : ''}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col py-space-xs">
                                    <button
                                        onClick={() => { setProfileOpen(false); navigate('/change-password') }}
                                        className="flex items-center gap-space-sm px-space-md py-space-sm hover:bg-surface-container text-on-surface-variant hover:text-on-surface font-mono text-xs transition-colors text-left"
                                        type="button"
                                    >
                                        <Icon name="lock_reset" size={15} className="text-secondary" />
                                        <span>Changer le mot de passe</span>
                                    </button>

                                    <div className="border-t border-surface-container-high mx-space-md my-space-xs" />

                                    <button
                                        onClick={() => { setProfileOpen(false); logout(); navigate('/login') }}
                                        className="flex items-center gap-space-sm px-space-md py-space-sm hover:bg-error-container/20 text-on-surface-variant hover:text-error font-mono text-xs transition-colors text-left"
                                        type="button"
                                    >
                                        <Icon name="power_settings_new" size={15} className="text-error" />
                                        <span>Déconnexion sécurisée</span>
                                    </button>
                                </div>

                                {/* Session info footer */}
                                <div className="px-space-md py-space-xs bg-surface-container-lowest border-t border-surface-container-high flex items-center gap-space-xs font-mono text-[9px] text-on-surface-variant">
                                    <Icon name="shield" size={11} className="text-secondary" />
                                    <span>Session chiffrée TLS 1.3</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    )
}
