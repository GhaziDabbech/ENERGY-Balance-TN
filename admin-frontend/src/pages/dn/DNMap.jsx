import { useState, useRef, useCallback } from 'react'
import TunisiaMap          from '../../components/shared/TunisiaMap'
import { useNetworkStore } from '../../stores/networkStore'

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
    const { crcs, version, lastSaved } = useNetworkStore()

    // CRC quick-status pills (toolbar only)
    const crcStats = crcs.map(crc =>
    {
        const total  = crc.bccs.reduce((s,b) => s+(b.targetMW??0), 0)
        const actual = crc.bccs.reduce((s,b) => s+(b.actualMW??0), 0)
        const alerts = crc.bccs.filter(b => b.status !== 'ok').length
        return { ...crc, total, actual, alerts }
    })

    return (
        <div className="flex flex-col w-full h-full">

            {/* ── Toolbar ──────────────────────────────────────────────────── */}
            <section className="w-full bg-surface-container-low px-space-lg py-space-sm flex flex-wrap items-center justify-between gap-space-md shadow-md z-30 shrink-0">
                <div className="flex items-center gap-space-md flex-wrap">

                    {/* View switcher */}
                    <div className="flex items-center gap-space-xs p-space-xs rounded bg-surface-container-lowest">
                        <button
                            onClick={onSwitchToDashboard}
                            className="flex items-center gap-space-xs px-space-md py-space-xs rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all font-body-sm text-body-sm"
                            type="button"
                        >
                            <Icon name="dashboard" size={16} />
                            <span>Tableau de bord</span>
                        </button>
                        <button
                            className="flex items-center gap-space-xs px-space-md py-space-xs rounded bg-surface-container-high text-secondary font-body-sm text-body-sm shadow-sm"
                            type="button"
                        >
                            <Icon name="map" size={16} filled />
                            <span>Cartographie SIG</span>
                        </button>
                    </div>

                    <div className="h-4 w-px bg-surface-container-highest hidden md:block" />

                    {/* CRC quick-status pills */}
                    <div className="flex items-center gap-space-xs">
                        {crcStats.map(crc => (
                            <div
                                key={crc.id}
                                className="flex items-center gap-space-xs px-space-sm py-space-xs rounded border bg-surface-container border-surface-container-high font-label-caps text-[10px] text-on-surface-variant"
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${crc.alerts > 0 ? 'bg-tertiary' : 'bg-[#4ade80]'}`} />
                                <span>{crc.name}</span>
                                <span className="font-label-telemetry-sm text-[10px]">
                                    {crc.actual.toFixed(0)}/{crc.total} MW
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: version + zoom */}
                <div className="flex items-center gap-space-md">
                    <div className="hidden lg:flex items-center gap-space-sm bg-surface-container-lowest px-space-md py-space-xs rounded font-label-telemetry-sm text-label-telemetry-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                        <span className="text-on-surface-variant">RÉSEAU v{version}</span>
                        {lastSaved && (
                            <span className="text-secondary">
                                {new Date(lastSaved).toLocaleTimeString('fr-TN', { hour:'2-digit', minute:'2-digit' })}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center bg-surface-container-lowest p-space-xs rounded gap-space-xs">
                        <button onClick={() => mapControls.current?.zoomIn()}  className="w-7 h-7 flex items-center justify-center rounded bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors" type="button"><Icon name="add" size={15}/></button>
                        <button onClick={() => mapControls.current?.zoomOut()} className="w-7 h-7 flex items-center justify-center rounded bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors" type="button"><Icon name="remove" size={15}/></button>
                        <button onClick={() => mapControls.current?.reset()}   className="w-7 h-7 flex items-center justify-center rounded bg-surface-container hover:bg-surface-container-high text-secondary transition-colors" type="button"><Icon name="crop_free" size={15}/></button>
                    </div>
                </div>
            </section>

            {/* ── Map (TunisiaMap owns the aside internally) ───────────────── */}
            <div className="flex-1 overflow-hidden">
                <TunisiaMap
                    scope="all"
                    onReady={ctrl => { mapControls.current = ctrl }}
                />
            </div>
        </div>
    )
}
