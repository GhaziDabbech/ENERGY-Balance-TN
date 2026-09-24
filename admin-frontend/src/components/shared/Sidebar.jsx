import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore }             from '../../stores/authStore'

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

const NAV_DN =
[
    { label: 'Supervision DN',           path: '/dn/dashboard',  icon: 'grid_view',   matchPaths: ['/dn/dashboard', '/dn/map'] }
    ,{ label: 'Analyse & Historique ENS',path: '/dn/historique', icon: 'query_stats'  }
    ,{ label: 'Éditeur SIG & Topologie', path: '/dn/sig',        icon: 'map',         matchPaths: ['/dn/sig'] }
    ,{ label: 'Paramètres & Seuils',     path: '/dn/parametres', icon: 'tune'         }
    ,{ label: 'Simulateur Réseau',       path: '/dn/simulateur', icon: 'science'      }
]

const NAV_CRC =
[
    { label: 'Tableau de bord CRC',       path: '/crc/dashboard',  icon: 'grid_view'   }
    ,{ label: 'Analyse & Historique ENS', path: '/crc/historique', icon: 'query_stats' }
]

const NAV_BCC =
[
    { label: 'Tableau de bord BCC',       path: '/bcc/dashboard',  icon: 'domain'       }
    ,{ label: 'Analyse & Historique ENS', path: '/bcc/historique', icon: 'query_stats'  }
    ,{ label: 'Gestion des Départs HTA',  path: '/bcc/departs',    icon: 'tune'         }
]

export default function Sidebar({ collapsed = false, onToggle })
{
    const { user }   = useAuthStore()
    const navigate   = useNavigate()
    const location   = useLocation()

    const nav =
        user?.role === 'DN'  ? NAV_DN  :
        user?.role === 'CRC' ? NAV_CRC :
        NAV_BCC

    return (
        <aside className={`fixed left-0 top-14 bottom-8 bg-surface-container-low z-40 flex flex-col justify-between shadow-[1px_0_8px_rgba(0,0,0,0.3)] transition-all duration-300 overflow-hidden ${collapsed ? 'w-14' : 'w-64'}`}>

            {/* Nav links */}
            <div className="flex flex-col py-space-md">
                {!collapsed && (
                    <div className="px-space-lg py-space-xs font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-space-xs whitespace-nowrap">
                        Architecture Téléconduite
                    </div>
                )}
                <nav className="flex flex-col px-space-sm gap-space-xs">
                    {nav.map
                    (
                        ({ label, path, icon, matchPaths }) =>
                        {
                            const isActive = matchPaths
                                ? matchPaths.includes(location.pathname)
                                : location.pathname === path

                            return (
                                <button
                                    key={label}
                                    onClick={() => navigate(path)}
                                    title={collapsed ? label : undefined}
                                    className={`flex items-center gap-space-md px-space-sm py-space-sm rounded transition-all text-left ${
                                        collapsed ? 'justify-center' : ''
                                    } ${
                                        isActive
                                            ? 'bg-surface-container-high text-secondary'
                                            : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                                    }`}
                                    type="button"
                                >
                                    <Icon name={icon} size={20} className="shrink-0" />
                                    {!collapsed && (
                                        <span className="font-body-md text-body-md whitespace-nowrap overflow-hidden">
                                            {label}
                                        </span>
                                    )}
                                </button>
                            )
                        }
                    )}
                </nav>
            </div>

            {/* Bottom — cycle indicator + collapse button */}
            <div className="p-space-sm">
                {!collapsed && (
                    <div className="bg-surface-container-lowest p-space-sm rounded mb-space-sm">
                        <div className="flex justify-between font-label-caps text-label-caps text-on-surface-variant mb-space-xs">
                            <span>CYCLE AUTOMATE</span>
                            <span className="font-label-telemetry-sm text-secondary">20 ms</span>
                        </div>
                        <div className="w-full bg-surface-container-high h-1 rounded">
                            <div className="bg-secondary h-1 rounded" style={{ width: '92%' }} />
                        </div>
                    </div>
                )}
                <button
                    onClick={onToggle}
                    title={collapsed ? 'Étendre Pupitre' : 'Réduire Pupitre'}
                    className={`w-full flex items-center gap-space-sm px-space-sm py-space-sm rounded bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors font-body-sm text-body-sm ${collapsed ? 'justify-center' : 'justify-center'}`}
                    type="button"
                >
                    <Icon
                        name={collapsed ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left'}
                        size={18}
                        className="shrink-0"
                    />
                    {!collapsed && <span className="whitespace-nowrap">Réduire Pupitre</span>}
                </button>
            </div>
        </aside>
    )
}
