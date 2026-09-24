import { useState, useEffect } from 'react'
import { useGridStore } from '../../stores/gridStore'

function Icon({ name, size = 14, className = '' })
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

export default function StatusBar()
{
    const [time, setTime] = useState(new Date())

    const { frequency, activeCuts, production, consumption, getStatus } = useGridStore()

    useEffect
    (
        () =>
        {
            const t = setInterval(() => setTime(new Date()), 1000)
            return () => clearInterval(t)
        }
        ,[]
    )

    const pad  = (n) => String(n).padStart(2, '0')
    const date = `${pad(time.getDate())}/${pad(time.getMonth() + 1)}/${time.getFullYear()}`
    const timeStr = `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`

    // Frequency colour
    const freqCls = frequency < 49.8
        ? 'text-error font-bold animate-pulse'
        : frequency < 49.95
            ? 'text-tertiary font-semibold'
            : 'text-[#4ade80] font-semibold'

    // Tension status derived from grid balance
    const status = getStatus()
    const tensionLabel  = status === 'ok'   ? 'ÉQUILIBRÉ'
                        : status === 'warn' ? 'TENSION MODÉRÉE'
                        :                    'DÉFICIT SÉVÈRE'
    const tensionDotCls = status === 'ok'   ? 'bg-secondary'
                        : status === 'warn' ? 'bg-tertiary animate-pulse'
                        :                    'bg-error animate-ping'
    const tensionTxtCls = status === 'ok'   ? 'text-on-surface'
                        : status === 'warn' ? 'text-tertiary font-semibold'
                        :                    'text-error font-bold'

    const balance = production - consumption
    const reserveLabel = balance >= 0
        ? `RÉSERVE ${Math.abs(balance).toFixed(0)} MW`
        : `DÉFICIT ${Math.abs(balance).toFixed(0)} MW`

    // Active cuts badge colour
    const cutsBadgeCls = activeCuts === 0
        ? 'text-[#4ade80]'
        : activeCuts < 10
            ? 'text-tertiary-fixed-dim'
            : 'text-error font-bold'
    const cutsDotCls = activeCuts === 0
        ? 'bg-[#4ade80]'
        : activeCuts < 10
            ? 'bg-tertiary-fixed-dim animate-ping'
            : 'bg-error animate-ping'

    return (
        <footer className="fixed bottom-0 left-0 right-0 h-8 bg-surface-container-lowest z-50 shadow-[0_-1px_6px_rgba(0,0,0,0.5)]">
            <div className="h-8 w-full px-space-lg flex items-center justify-between font-label-telemetry-sm text-label-telemetry-sm">

                {/* Left */}
                <div className="flex items-center gap-space-lg">
                    <div className="flex items-center gap-space-sm text-on-surface-variant">
                        <Icon name="schedule" size={16} className="text-primary" />
                        <span>{date} • {timeStr}</span>
                    </div>
                    <div className="flex items-center gap-space-xs">
                        <span className={`w-2 h-2 rounded-full ${cutsDotCls}`} />
                        <span className={cutsBadgeCls}>
                            {activeCuts} DÉLESTAGE{activeCuts !== 1 ? 'S' : ''} EN COURS
                        </span>
                    </div>
                    <div className="hidden sm:flex items-center gap-space-xs">
                        <Icon name="electric_bolt" size={13} className={freqCls} />
                        <span className={freqCls}>{frequency.toFixed(2)} Hz</span>
                    </div>
                </div>

                {/* Right */}
                <div className="flex items-center gap-space-md">
                    <div className="flex items-center gap-space-xs px-space-md py-space-xs rounded bg-surface-container">
                        <span className={`w-2 h-2 rounded-full ${tensionDotCls}`} />
                        <span className={tensionTxtCls}>TENSION RÉSEAU : {tensionLabel}</span>
                        <span className="text-on-surface-variant">({reserveLabel})</span>
                    </div>
                    <div className="hidden md:flex items-center gap-space-xs text-on-surface-variant">
                        <Icon name="hub" size={14} className="text-secondary" />
                        <span>SCADA: 99,8%</span>
                        <span className="text-secondary">(0 RETARD TRAME)</span>
                    </div>
                </div>

            </div>
        </footer>
    )
}
