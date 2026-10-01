import { useRef }            from 'react'
import TunisiaMap            from '../../components/shared/TunisiaMap'
import { useNetworkStore }   from '../../stores/networkStore'
import { useDNDashboard }    from '../../hooks/useDNDashboard'
import { useDNMapSync }      from '../../hooks/useDNMapSync'

function Icon({ name, size = 20, className = '', filled = false })
{
    return (
        <span
            className={`material-symbols-outlined ${className}`}
            style={{ fontSize: size, fontVariationSettings: filled ? "'FILL' 1" : "'FILL' 0" }}
        >
            {name}
        </span>
    )
}

export default function DNMap({ onSwitchToDashboard })
{
    const mapControls = useRef(null)

    // ── Live dashboard data ───────────────────────────────────────────────────
    const { data: dbData, lastUpdated } = useDNDashboard()

    // ── Sync dashboard → networkStore so map zones recolour ──────────────────
    useDNMapSync(dbData)

    // ── CRC quick-status pills (toolbar) — from networkStore (already synced) ─
    const { crcs, version, lastSaved } = useNetworkStore()

    const crcStats = crcs.map(crc =>
    {
        // Prefer live API data when available, fall back to networkStore
        const apiSummary = dbData?.crc_summary?.[crc.name]
        const total      = apiSummary?.consigne ?? crc.bccs.reduce((s,b) => s+(b.targetMW??0), 0)
        const actual     = apiSummary?.realise  ?? crc.bccs.reduce((s,b) => s+(b.actualMW??0), 0)
        const ecart      = apiSummary?.ecart    ?? (actual - total)
        const alerts     = crc.bccs.filter(b => b.status !== 'ok').length
        const hasCrit    = crc.bccs.some(b => b.status === 'crit')
        return { ...crc, total, actual, ecart, alerts, hasCrit }
    })

    // Active cuts count for the status strip
    const activeCuts = dbData?.national?.active_cuts ?? 0

    // Last synced label
    const syncLabel = lastUpdated
        ? lastUpdated.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
        : '—'

    return (
        <div className="flex flex-col w-full h-full">

            {/* ── Toolbar ──────────────────────────────────────────────────── */}
            <section className="w-full bg-surface-container-low px-space-lg py-space-sm flex flex-wrap items-center justify-between gap-space-md shadow-md z-30 shrink-0">
                <div className="flex items-center gap-space-md flex-wrap">

                    {/* View switcher */}
                    <div className="flex items-center gap-space-xs p-space-xs bg-surface-container-lowest">
                        <button
                            onClick={onSwitchToDashboard}
                            className="flex items-center gap-space-xs px-space-md py-space-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all font-body-sm text-body-sm"
                            type="button"
                        >
                            <Icon name="dashboard" size={16} />
                            <span>Tableau de bord</span>
                        </button>
                        <button
                            className="flex items-center gap-space-xs px-space-md py-space-xs bg-surface-container-high text-secondary font-body-sm text-body-sm shadow-sm"
                            type="button"
                        >
                            <Icon name="map" size={16} filled />
                            <span>Cartographie SIG</span>
                        </button>
                    </div>

                    <div className="h-4 w-px bg-surface-container-highest hidden md:block" />

                    {/* CRC live pills */}
                    <div className="flex items-center gap-space-xs">
                        {crcStats.map(crc =>
                        {
                            const hasProblem = crc.alerts > 0
                            const isCrit     = crc.hasCrit
                            const dotCls     = isCrit
                                ? 'bg-error animate-ping'
                                : hasProblem ? 'bg-tertiary animate-pulse' : 'bg-[#4ade80]'
                            const pillCls    = isCrit
                                ? 'border-error/50 bg-error-container/20 text-error'
                                : hasProblem
                                    ? 'border-tertiary/40 bg-tertiary-container/10 text-tertiary'
                                    : 'border-surface-container-high bg-surface-container text-on-surface-variant'
                            const ecartStr   = crc.ecart != null
                                ? `${crc.ecart >= 0 ? '+' : ''}${crc.ecart.toFixed(0)} MW`
                                : null

                            return (
                                <div
                                    key={crc.id}
                                    className={`flex items-center gap-space-xs px-space-sm py-space-xs border font-label-caps text-[10px] ${pillCls}`}
                                >
                                    <span className={`w-1.5 h-1.5 shrink-0 ${dotCls}`} />
                                    <span>{crc.name}</span>
                                    <span className="font-label-telemetry-sm text-[10px] font-bold">
                                        {crc.actual.toFixed(0)}/{crc.total} MW
                                    </span>
                                    {ecartStr && hasProblem && (
                                        <span className={`text-[9px] font-bold ${isCrit ? 'text-error' : 'text-tertiary'}`}>
                                            ({ecartStr})
                                        </span>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    {/* Active cuts badge */}
                    {activeCuts > 0 && (
                        <div className="flex items-center gap-space-xs px-space-sm py-space-xs border border-tertiary/40 bg-tertiary-container/10 font-label-caps text-[10px] text-tertiary">
                            <span className="w-1.5 h-1.5 bg-tertiary animate-pulse shrink-0" />
                            <span>{activeCuts} COUPURE{activeCuts > 1 ? 'S' : ''} ACTIVES</span>
                        </div>
                    )}
                </div>

                {/* Right: version + sync time + zoom */}
                <div className="flex items-center gap-space-md">
                    <div className="hidden lg:flex items-center gap-space-sm bg-surface-container-lowest px-space-md py-space-xs font-label-telemetry-sm text-label-telemetry-sm">
                        <span className="w-1.5 h-1.5 bg-secondary animate-pulse" />
                        <span className="text-on-surface-variant">RÉSEAU v{version}</span>
                        {lastUpdated && (
                            <span className="text-secondary">
                                SYNCHRO {syncLabel}
                            </span>
                        )}
                        {lastSaved && !lastUpdated && (
                            <span className="text-secondary">
                                {new Date(lastSaved).toLocaleTimeString('fr-TN', { hour:'2-digit', minute:'2-digit' })}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center bg-surface-container-lowest p-space-xs gap-space-xs">
                        <button
                            onClick={() => mapControls.current?.zoomIn()}
                            className="w-7 h-7 flex items-center justify-center bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors"
                            type="button"
                        >
                            <Icon name="add" size={15}/>
                        </button>
                        <button
                            onClick={() => mapControls.current?.zoomOut()}
                            className="w-7 h-7 flex items-center justify-center bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors"
                            type="button"
                        >
                            <Icon name="remove" size={15}/>
                        </button>
                        <button
                            onClick={() => mapControls.current?.reset()}
                            className="w-7 h-7 flex items-center justify-center bg-surface-container hover:bg-surface-container-high text-secondary transition-colors"
                            type="button"
                        >
                            <Icon name="crop_free" size={15}/>
                        </button>
                    </div>
                </div>
            </section>

            {/* ── Map ──────────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-hidden">
                <TunisiaMap
                    scope="all"
                    liveCuts={dbData?.live_cuts ?? []}
                    lastSynced={lastUpdated}
                    onReady={ctrl => { mapControls.current = ctrl }}
                />
            </div>
        </div>
    )
}
