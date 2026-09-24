import { useEffect }       from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore }    from '../stores/authStore'

function Icon({ name, size = 18, className = '' })
{
    return (
        <span className={`material-symbols-outlined ${className}`} style={{ fontSize: size }}>
            {name}
        </span>
    )
}

export default function AdminLayout()
{
    const { user, logout } = useAuthStore()
    const navigate         = useNavigate()

    // Guard — only ADMIN role can access this layout
    useEffect
    (
        () =>
        {
            if (!user)              navigate('/login',  { replace: true })
            else if (user.role !== 'ADMIN') navigate('/login', { replace: true })
        }
        ,[user, navigate]
    )

    if (!user || user.role !== 'ADMIN') return null

    const handleLogout = () =>
    {
        logout()
        navigate('/login')
    }

    return (
        <div className="min-h-screen bg-background text-on-surface flex flex-col">

            {/* ── Top bar ─────────────────────────────────────────────────── */}
            <header className="fixed top-0 left-0 right-0 z-50 h-12 bg-surface-container-lowest border-b border-surface-container-high flex items-center justify-between px-space-xl shadow-md">
                <div className="flex items-center gap-space-md">
                    <div className="flex items-center gap-space-sm">
                        <div className="w-7 h-7 bg-secondary-container flex items-center justify-center">
                            <Icon name="shield_person" size={16} className="text-on-secondary-container" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-mono text-xs font-bold text-secondary uppercase tracking-wide">
                                STEG — Administration Système
                            </span>
                            <span className="font-mono text-[9px] text-on-surface-variant">
                                Accès restreint · Personnel DSI uniquement
                            </span>
                        </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-space-xs px-space-sm py-space-xs bg-surface-container border border-surface-container-high font-mono text-[9px] text-on-surface-variant">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
                        <span>BASE DE DONNÉES CONNECTÉE</span>
                    </div>
                </div>
                <div className="flex items-center gap-space-md">
                    <div className="text-right">
                        <p className="font-mono text-[10px] text-on-surface font-semibold">{user.displayName}</p>
                        <p className="font-mono text-[9px] text-on-surface-variant uppercase">Administrateur Système</p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-space-xs px-space-md py-space-xs bg-surface-container hover:bg-error-container/30 hover:text-error text-on-surface-variant font-mono text-[10px] border border-surface-container-high transition-colors"
                        type="button"
                    >
                        <Icon name="logout" size={14} />
                        <span>Déconnexion</span>
                    </button>
                </div>
            </header>

            {/* ── Main content ─────────────────────────────────────────────── */}
            <main className="pt-12 flex-1 overflow-auto">
                <Outlet />
            </main>
        </div>
    )
}
