import { useState, useEffect }      from 'react'
import { useNavigate }              from 'react-router-dom'
import { useAuthStore }             from '../../stores/authStore'
import { useAlertStore }            from '../../stores/alertStore'
import { useGridStore }             from '../../stores/gridStore'

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

export default function TopBar()
{
    const { user, logout }    = useAuthStore()
    const { frequency }       = useGridStore()
    const { newAlertCount, openPanel } = useAlertStore()
    const navigate            = useNavigate()
    const [time, setTime]     = useState(new Date())
    const [profileOpen, setProfileOpen] = useState(false)

    useEffect
    (
        () =>
        {
            const t = setInterval(() => setTime(new Date()), 1000)
            return () => clearInterval(t)
        }
        ,[]
    )

    // Close dropdown on outside click
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
                    <button
                        onClick={openPanel}
                        className={`relative p-space-sm rounded bg-surface-container transition-colors text-on-surface flex items-center justify-center ${newAlertCount > 0 ? 'hover:bg-error-container/30 animate-pulse' : 'hover:bg-surface-container-high'}`}
                        title="Alertes actives"
                        type="button"
                    >
                        <Icon name="notifications" size={20} className={newAlertCount > 0 ? 'text-error' : ''} />
                        {newAlertCount > 0 && (
                            <span className="absolute -top-1 -right-1 px-space-xs bg-error-container text-on-error-container rounded-full font-label-telemetry-sm text-[10px] leading-none py-0.5 font-bold">
                                {newAlertCount}
                            </span>
                        )}
                    </button>

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
