import { useState, useRef, useCallback, useEffect } from 'react'
import DNMap from './DNMap'
import { useAuthStore }    from '../../stores/authStore'
import { useUrgenceStore } from '../../stores/urgenceStore'
import { useGridStore }    from '../../stores/gridStore'
import { useDNDashboard }  from '../../hooks/useDNDashboard'
import { useLiveStore }    from '../../stores/liveStore'
import { useAlertSync }    from '../../hooks/useAlertSync'
import { useTimeseries }   from '../../hooks/useTimeseries'
import api                 from '../../lib/api'

// ── Réalimentation modal ──────────────────────────────────────────────────────
// Same structure as UrgenceModal but blue/green theme
// type: 'partielle' (restore partial MW) | 'totale' (end all shedding)
function RealiModal({ isOpen, onClose, currentlyShedding = 0, onOrderEmis, livePlanifie = 0, liveFrequency = 50.0 })
{
    const SPLIT_NORD                       = 67
    const SPLIT_SUD                        = 33

    const [type,       setType]            = useState('partielle')
    const [mwTotal,    setMwTotal]         = useState('')
    const [splitNord,  setSplitNord]       = useState(SPLIT_NORD)
    const [confirmTxt, setConfirmTxt]      = useState('')
    const [emitted,    setEmitted]         = useState(false)

    const splitSud = 100 - splitNord

    // For totale, restore everything currently shedding
    const effectiveMW  = type === 'totale' ? currentlyShedding : (Number(mwTotal) || 0)
    const mwNord       = effectiveMW ? Math.round(effectiveMW * splitNord / 100) : 0
    const mwSud        = effectiveMW ? Math.round(effectiveMW * splitSud  / 100) : 0

    const canEmit = effectiveMW > 0 && confirmTxt.toUpperCase() === 'CONFIRMER'

    const handleEmit = () =>
    {
        if (!canEmit) return
        setEmitted(true)
        if (onOrderEmis) onOrderEmis({ type, mwTotal: effectiveMW, mwNord, mwSud })
        setTimeout(() => onClose(), 2000)
    }

    const reset = () =>
    {
        setType('partielle')
        setMwTotal('')
        setSplitNord(SPLIT_NORD)
        setConfirmTxt('')
        setEmitted(false)
    }

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-space-md"
            onClick={() => { onClose(); reset() }}
        >
            <div
                className="bg-surface-container-low border border-secondary/30 w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-space-lg py-space-md bg-secondary-container/30 border-b border-secondary/30 shrink-0">
                    <div className="flex items-center gap-space-md">
                        <div className="w-8 h-8 bg-secondary-container flex items-center justify-center shrink-0">
                            <Icon name="refresh" size={20} className="text-on-secondary-container" />
                        </div>
                        <div>
                            <h2 className="font-sans font-bold text-sm text-on-surface uppercase tracking-wider">
                                Ordre de Réalimentation — Rétablissement Réseau
                            </h2>
                            <p className="font-mono text-[10px] text-on-surface-variant mt-0.5">
                                Diffusion immédiate vers CRC Nord et CRC Sud
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => { onClose(); reset() }}
                        className="p-space-xs bg-secondary-container/40 hover:bg-secondary-container text-on-surface-variant transition-colors"
                        type="button"
                    >
                        <Icon name="close" size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto flex flex-col gap-0">

                    {/* Section 1 — Contexte réseau */}
                    <div className="px-space-lg py-space-md bg-surface-container-lowest border-b border-surface-container-high">
                        <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider mb-space-sm font-semibold">
                            Situation actuelle du réseau
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-sm font-mono text-xs">
                            {[
                                { label: 'Planifié',          value: `${livePlanifie.toFixed(1)} MW`,         cls: 'text-secondary'       }
                                ,{ label: 'En délestage',     value: `${currentlyShedding.toFixed(1)} MW`,    cls: 'text-tertiary font-bold' }
                                ,{ label: 'Fréquence',        value: `${liveFrequency.toFixed(2)} Hz`,        cls: liveFrequency < 49.95 ? 'text-error font-bold' : 'text-secondary' }
                                ,{ label: 'Tendance',         value: '↑ Stabilisé', cls: 'text-[#4ade80] font-bold' }
                            ].map(({ label, value, cls }) => (
                                <div key={label} className="bg-surface-container border border-surface-container-high p-space-sm">
                                    <p className="text-[9px] text-on-surface-variant uppercase mb-0.5">{label}</p>
                                    <p className={`text-sm font-bold ${cls}`}>{value}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Section 2 — Type d'ordre */}
                    <div className="px-space-lg py-space-md border-b border-surface-container-high">
                        <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider mb-space-md font-semibold">
                            Type de réalimentation
                        </p>
                        <div className="grid grid-cols-2 gap-space-sm mb-space-md">
                            {[
                                {
                                    key:   'partielle'
                                    ,icon: 'trending_down'
                                    ,title:'Partielle'
                                    ,desc: 'Restaurer une partie du réseau, maintenir un délestage résiduel'
                                }
                                ,{
                                    key:   'totale'
                                    ,icon: 'power'
                                    ,title:'Totale — Fin de délestage'
                                    ,desc: `Rétablir l'intégralité des ${currentlyShedding.toFixed(1)} MW délestés`
                                }
                            ].map(({ key, icon, title, desc }) => (
                                <button
                                    key={key}
                                    onClick={() => { setType(key); setConfirmTxt(''); setEmitted(false) }}
                                    className={`flex flex-col gap-space-xs p-space-md text-left border transition-all ${type === key ? 'bg-secondary-container/20 border-secondary text-on-surface' : 'bg-surface-container border-surface-container-high text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}`}
                                    type="button"
                                >
                                    <div className="flex items-center gap-space-sm">
                                        <Icon name={icon} size={16} className={type === key ? 'text-secondary' : 'text-on-surface-variant'} />
                                        <span className="font-mono text-xs font-bold uppercase">{title}</span>
                                    </div>
                                    <span className="font-mono text-[10px]">{desc}</span>
                                </button>
                            ))}
                        </div>

                        {/* MW input — only for partielle */}
                        {type === 'partielle' && (
                            <div className="flex items-center gap-space-md">
                                <div className="relative flex-1">
                                    <input
                                        type="number"
                                        min={1}
                                        max={currentlyShedding}
                                        step={1}
                                        placeholder="Ex: 50"
                                        value={mwTotal}
                                        onChange={(e) => { setMwTotal(e.target.value); setConfirmTxt(''); setEmitted(false) }}
                                        className="w-full bg-surface-container-lowest border-2 border-secondary/40 focus:border-secondary text-on-surface font-mono text-2xl font-bold px-space-md py-space-md focus:outline-none transition-all text-center"
                                    />
                                    <span className="absolute right-space-md top-1/2 -translate-y-1/2 font-mono text-sm text-on-surface-variant font-semibold">
                                        MW
                                    </span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    {[20, 40, 60, 80].map((v) => (
                                        <button
                                            key={v}
                                            onClick={() => setMwTotal(v)}
                                            className="px-space-md py-space-xs bg-surface-container hover:bg-secondary-container/20 border border-surface-container-high hover:border-secondary/40 text-on-surface-variant hover:text-secondary font-mono text-xs transition-all"
                                            type="button"
                                        >
                                            -{v} MW
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Totale — show full restore summary */}
                        {type === 'totale' && (
                            <div className="p-space-md bg-[#4ade80]/10 border border-[#4ade80]/30 font-mono text-sm text-[#4ade80] font-bold flex items-center gap-space-md">
                                <Icon name="power" size={20} />
                                <span>FIN DE DÉLESTAGE — Rétablir {currentlyShedding.toFixed(1)} MW sur l'ensemble du réseau</span>
                            </div>
                        )}

                        {/* Split preview */}
                        {effectiveMW > 0 && (
                            <div className="mt-space-md flex flex-col gap-space-sm">
                                <div className="grid grid-cols-2 gap-space-sm">
                                    <div className="bg-surface-container-lowest border border-surface-container-high p-space-sm">
                                        <div className="flex items-center justify-between mb-space-xs">
                                            <div className="flex items-center gap-space-xs">
                                                <span className="w-2 h-2 rounded-full bg-secondary" />
                                                <span className="font-mono text-[10px] text-on-surface-variant uppercase font-semibold">CRC Nord</span>
                                            </div>
                                            <span className="font-mono text-[10px] text-secondary">{splitNord}%</span>
                                        </div>
                                        <p className="font-mono text-xl font-bold text-secondary">-{mwNord} MW</p>
                                        <p className="font-mono text-[10px] text-on-surface-variant mt-space-xs">Délestage résiduel : {Math.max(0, (effectiveMW - mwNord)).toFixed(0)} MW</p>
                                    </div>
                                    <div className="bg-surface-container-lowest border border-surface-container-high p-space-sm">
                                        <div className="flex items-center justify-between mb-space-xs">
                                            <div className="flex items-center gap-space-xs">
                                                <span className="w-2 h-2 rounded-full bg-tertiary" />
                                                <span className="font-mono text-[10px] text-on-surface-variant uppercase font-semibold">CRC Sud</span>
                                            </div>
                                            <span className="font-mono text-[10px] text-tertiary">{splitSud}%</span>
                                        </div>
                                        <p className="font-mono text-xl font-bold text-tertiary">-{mwSud} MW</p>
                                        <p className="font-mono text-[10px] text-on-surface-variant mt-space-xs">Délestage résiduel : {Math.max(0, (effectiveMW - mwSud)).toFixed(0)} MW</p>
                                    </div>
                                </div>
                                <div className="w-full h-3 bg-surface-container-lowest overflow-hidden flex border border-surface-container-high">
                                    <div className="bg-secondary h-full transition-all duration-150" style={{ width: `${splitNord}%` }} />
                                    <div className="bg-tertiary  h-full transition-all duration-150" style={{ width: `${splitSud}%`  }} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Section 3 — Confirmation */}
                    <div className="px-space-lg py-space-md">
                        <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider mb-space-sm font-semibold">
                            Confirmation de l'ordre
                        </p>
                        <p className="font-sans text-xs text-on-surface-variant mb-space-md">
                            Tapez <strong className="text-secondary font-mono">CONFIRMER</strong> pour autoriser l'émission.
                            Action horodatée dans l'audit DN.
                        </p>
                        <input
                            type="text"
                            placeholder="Tapez CONFIRMER"
                            value={confirmTxt}
                            onChange={(e) => setConfirmTxt(e.target.value)}
                            className="w-full bg-surface-container-lowest border border-secondary/30 focus:border-secondary text-on-surface font-mono text-sm px-space-md py-space-sm focus:outline-none transition-all tracking-widest"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-space-lg py-space-md bg-surface-container border-t border-surface-container-high flex items-center justify-between shrink-0">
                    <div className="font-mono text-[10px] text-on-surface-variant flex items-center gap-space-xs">
                        <Icon name="schedule" size={13} className="text-secondary" />
                        <span>Ordre horodaté et enregistré dans l'audit DN à l'émission</span>
                    </div>
                    <div className="flex items-center gap-space-sm">
                        <button
                            onClick={() => { onClose(); reset() }}
                            className="px-space-md py-space-xs bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono text-xs transition-colors border border-surface-container-high"
                            type="button"
                        >
                            Annuler
                        </button>
                        <button
                            onClick={handleEmit}
                            disabled={!canEmit || emitted}
                            className="px-space-md py-space-xs bg-secondary-container hover:bg-secondary text-on-secondary-container font-mono text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-space-xs shadow-sm"
                            type="button"
                        >
                            {emitted
                                ? <><Icon name="check_circle" size={14} className="text-[#4ade80]" /><span>Ordre émis !</span></>
                                : <><Icon name="refresh" size={14} /><span>Émettre l'ordre de réalimentation</span></>
                            }
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Inline Material Symbol helper ────────────────────────────────────────────
function Icon({ name, size = 20, className = '' })
{
    return (
        <span
            className={`material-symbols-outlined text-[${size}px] ${className}`}
            style={{ fontSize: size }}
        >
            {name}
        </span>
    )
}

// ── Chart data points — [time, consigne, realise | null if future] ───────────
// SVG coordinate space: x 50–980, y 15–210 (0 MW = y210, 600 MW = y15)
// MW = (210 - y) / (210 - 15) * 600
const CHART_POINTS =
[
    { time: '00:00', x: 50,  yPlan: 195, yReal: 195 }
    ,{ time: '01:00', x: 89,  yPlan: 192, yReal: 193 }
    ,{ time: '02:00', x: 127, yPlan: 190, yReal: 191 }
    ,{ time: '03:00', x: 166, yPlan: 188, yReal: 188 }
    ,{ time: '04:00', x: 205, yPlan: 180, yReal: 181 }
    ,{ time: '05:00', x: 244, yPlan: 165, yReal: 166 }
    ,{ time: '06:00', x: 282, yPlan: 140, yReal: 139 }
    ,{ time: '07:00', x: 321, yPlan: 120, yReal: 121 }
    ,{ time: '08:00', x: 360, yPlan: 110, yReal: 110 }
    ,{ time: '09:00', x: 399, yPlan: 100, yReal: 101 }
    ,{ time: '10:00', x: 437, yPlan: 90,  yReal: 92  }
    ,{ time: '11:00', x: 476, yPlan: 80,  yReal: 80  }
    ,{ time: '12:00', x: 515, yPlan: 70,  yReal: 69  }
    ,{ time: '13:00', x: 554, yPlan: 60,  yReal: 60  }
    ,{ time: '13:30', x: 573, yPlan: 60,  yReal: 63  }
    ,{ time: '14:00', x: 593, yPlan: 60,  yReal: 68  }
    ,{ time: '14:30', x: 612, yPlan: 60,  yReal: 73, isNow: true }
    // Future — planned only
    ,{ time: '15:00', x: 631, yPlan: 60,  yReal: null }
    ,{ time: '16:00', x: 670, yPlan: 60,  yReal: null }
    ,{ time: '17:00', x: 709, yPlan: 70,  yReal: null }
    ,{ time: '18:00', x: 748, yPlan: 82,  yReal: null }
    ,{ time: '19:00', x: 786, yPlan: 95,  yReal: null }
    ,{ time: '20:00', x: 825, yPlan: 150, yReal: null }
    ,{ time: '21:00', x: 864, yPlan: 165, yReal: null }
    ,{ time: '22:00', x: 903, yPlan: 175, yReal: null }
    ,{ time: '23:00', x: 941, yPlan: 185, yReal: null }
    ,{ time: '23:59', x: 980, yPlan: 190, yReal: null }
]

// ── SVG coordinate helpers ────────────────────────────────────────────────────
// X: slot 0 (00:00) = 50, slot 47 (23:30) = 980 → 930 units / 48 slots
const SVG_X_START = 50
const SVG_X_END   = 980
const SVG_X_RANGE = SVG_X_END - SVG_X_START   // 930

// Y: 0 MW = 210, 600 MW = 15 → 195 units / 600 MW
function yToMW(y)  { return Math.round((210 - y) / (210 - 15) * 600) }
function mwToY(mw) { return 210 - (mw / 600) * (210 - 15) }

// Convert timeseries slot index to SVG x coordinate
function slotToX(slotIdx, totalSlots = 48) {
    return SVG_X_START + (slotIdx / (totalSlots - 1)) * SVG_X_RANGE
}

// Convert timeseries API slots → CHART_POINTS shape expected by the chart
function slotsToChartPoints(slots) {
    if (!slots || slots.length === 0) return []
    const total = slots.length
    return slots.map((s) => ({
        time:   s.slot,
        x:      Math.round(slotToX(s.slot_idx ?? slots.indexOf(s), total)),
        yPlan:  Math.round(mwToY(Math.min(s.mw_plan ?? 0, 600))),
        yReal:  s.mw_real != null ? Math.round(mwToY(Math.min(s.mw_real, 600))) : null,
        isNow:  s.is_now  ?? false,
        mwPlan: s.mw_plan ?? 0,
        mwReal: s.mw_real ?? null,
    }))
}

// Static fallback (used only when API is unreachable — keeps chart visible)
const CHART_POINTS_FALLBACK = [
    { time: '00:00', x: 50,  yPlan: 204, yReal: 204, mwPlan: 60,  mwReal: 60  },
    { time: '06:00', x: 282, yPlan: 173, yReal: 173, mwPlan: 143, mwReal: 143 },
    { time: '12:00', x: 515, yPlan: 68,  yReal: 68,  mwPlan: 373, mwReal: 373 },
    { time: '14:30', x: 612, yPlan: 60,  yReal: 75,  mwPlan: 450, mwReal: 411, isNow: true },
    { time: '20:00', x: 825, yPlan: 68,  yReal: null, mwPlan: 373, mwReal: null },
    { time: '23:59', x: 980, yPlan: 191, yReal: null, mwPlan: 75,  mwReal: null },
]

// ── Interactive SVG Chart ─────────────────────────────────────────────────────
// urgenceOrders: array of { id, time, mwTotal, mwNord, mwSud, x (SVG x coord) }
// chartPoints:   live data from useTimeseries, converted via slotsToChartPoints()
function LoadSheddingChart({ urgenceOrders = [], chartPoints = CHART_POINTS_FALLBACK })
{
    const [tooltip, setTooltip]   = useState(null)
    const svgRef                  = useRef(null)

    const handleMouseMove = useCallback(
        (e) => {
            const svg = svgRef.current
            if (!svg) return
            const rect   = svg.getBoundingClientRect()
            const scaleX = 1000 / rect.width
            const mouseX = (e.clientX - rect.left) * scaleX

            let closest = null
            let minDist = Infinity
            chartPoints.forEach((pt) => {
                const dist = Math.abs(pt.x - mouseX)
                if (dist < minDist) { minDist = dist; closest = pt }
            })
            if (closest && minDist < 30) setTooltip(closest)
            else setTooltip(null)
        },
        [chartPoints]
    )

    const handleMouseLeave = () => setTooltip(null)

    // Build SVG path strings from live chartPoints
    const planPath = chartPoints
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.yPlan}`)
        .join(' ')

    const realPoints = chartPoints.filter((p) => p.yReal !== null)
    const realPath   = realPoints
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.yReal}`)
        .join(' ')

    // Current slot (NOW marker)
    const nowPoint = chartPoints.find((p) => p.isNow) ?? null
    const nowX     = nowPoint?.x ?? 612
    const nowLabel = nowPoint ? `${nowPoint.time} (ACTUEL)` : 'ACTUEL'

    // ── Urgence bumps: each order = a short raised segment (one 30-min slot) ──
    // The slot width in SVG units: 24h spans x 50→980 = 930 units = 1440 min
    // → 30 min = 930/48 ≈ 19.375 units. We use 19 for clean values.
    const SVG_SLOT = 19   // ~30 min in SVG x-units

    // For each urgence order, compute the y-shift and build a bump path:
    //   planifié(x)  →  up to planifié(x) - dy  →  hold for SVG_SLOT  →  back down
    // We also need yPlan at the urgence x — interpolate between CHART_POINTS.
    const getYPlanAt = (svgX) => {
        for (let i = 0; i < chartPoints.length - 1; i++) {
            if (svgX >= chartPoints[i].x && svgX <= chartPoints[i + 1].x) {
                const t = (svgX - chartPoints[i].x) / (chartPoints[i + 1].x - chartPoints[i].x)
                return chartPoints[i].yPlan + t * (chartPoints[i + 1].yPlan - chartPoints[i].yPlan)
            }
        }
        return chartPoints[chartPoints.length - 1]?.yPlan ?? 120
    }

    // Build one SVG path per urgence order (bump shape)
    const urgenceBumps = urgenceOrders.map((o) =>
    {
        const dy      = (o.mwTotal / 600) * (210 - 15)   // MW → SVG y-offset (upward = negative y)
        const x0      = o.x                               // bump start x
        const x1      = o.x + SVG_SLOT                   // bump end x
        const yBase0  = getYPlanAt(x0)                    // planifié y at start
        const yBase1  = getYPlanAt(x1)                    // planifié y at end
        const yTop0   = Math.max(15, yBase0 - dy)         // raised y at start
        const yTop1   = Math.max(15, yBase1 - dy)         // raised y at end (follows plan curve)

        // Path: start at planifié, vertical up, hold across slot, vertical back down
        const d = `M ${x0},${yBase0} L ${x0},${yTop0} L ${x1},${yTop1} L ${x1},${yBase1}`

        return { ...o, d, x0, x1, yTop0, yTop1, yBase0, yBase1, dy }
    })

    // For tooltip awareness — is the hovered point inside any bump?
    const urgenceBumpAt = (svgX) =>
        urgenceBumps.find((b) => svgX >= b.x0 && svgX <= b.x1) ?? null

    // Tooltip position — flip to left side if near right edge
    const tooltipX   = tooltip ? (tooltip.x > 700 ? tooltip.x - 210 : tooltip.x + 15) : 0
    const tooltipY   = tooltip ? Math.min(tooltip.yPlan, tooltip.yReal ?? tooltip.yPlan) - 10 : 0

    // Height of default tooltip depends on urgence orders
    const defaultTooltipHeight = urgenceOrders.length > 0 ? 90 : 74

    return (
        <div
            className="relative w-full h-64 bg-surface-container-lowest rounded p-space-md overflow-hidden select-none"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            <svg
                ref={svgRef}
                className="w-full h-full cursor-crosshair"
                preserveAspectRatio="none"
                viewBox="0 0 1000 240"
            >
                <defs>
                    <linearGradient id="deficitGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%"   stopColor="#93000a" stopOpacity="0.55" />
                        <stop offset="100%" stopColor="#93000a" stopOpacity="0.05" />
                    </linearGradient>
                    <pattern id="hatchDeficit" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse" width="10">
                        <line stroke="#ffb4ab" strokeOpacity="0.4" strokeWidth="1" x1="0" x2="0" y1="0" y2="10" />
                    </pattern>
                    <linearGradient id="urgenceGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%"   stopColor="#93000a" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#93000a" stopOpacity="0.05" />
                    </linearGradient>
                </defs>

                {/* Grid lines */}
                <line stroke="#1b2b3f" strokeWidth="1"                     x1="45" x2="980" y1="210" y2="210" />
                <line stroke="#1b2b3f" strokeDasharray="2,2" strokeWidth="1" x1="45" x2="980" y1="160" y2="160" />
                <line stroke="#1b2b3f" strokeDasharray="2,2" strokeWidth="1" x1="45" x2="980" y1="110" y2="110" />
                <line stroke="#1b2b3f" strokeDasharray="2,2" strokeWidth="1" x1="45" x2="980" y1="60"  y2="60"  />
                <line stroke="#1b2b3f" strokeDasharray="2,2" strokeWidth="1" x1="45" x2="980" y1="15"  y2="15"  />

                {/* Y axis labels */}
                <text fill="#8f9097" fontSize="10" textAnchor="end" x="35" y="213">0</text>
                <text fill="#8f9097" fontSize="10" textAnchor="end" x="35" y="163">150</text>
                <text fill="#8f9097" fontSize="10" textAnchor="end" x="35" y="113">300</text>
                <text fill="#8f9097" fontSize="10" textAnchor="end" x="35" y="63">450</text>
                <text fill="#8f9097" fontSize="10" textAnchor="end" x="35" y="18">600</text>
                <text fill="#8f9097" fontSize="9"  textAnchor="start" x="10" y="15">MW</text>

                {/* Vertical time lines */}
                <line stroke="#1b2b3f" strokeWidth="1"                      x1="50"  x2="50"  y1="15" y2="210" />
                <line stroke="#1b2b3f" strokeDasharray="2,2" strokeWidth="1" x1="205" x2="205" y1="15" y2="210" />
                <line stroke="#1b2b3f" strokeDasharray="2,2" strokeWidth="1" x1="360" x2="360" y1="15" y2="210" />
                <line stroke="#1b2b3f" strokeDasharray="2,2" strokeWidth="1" x1="515" x2="515" y1="15" y2="210" />
                <line stroke="#ffb4ab" strokeDasharray="3,3" strokeWidth="1.5" x1={nowX} x2={nowX} y1="15" y2="210" />
                <line stroke="#1b2b3f" strokeDasharray="2,2" strokeWidth="1" x1="670" x2="670" y1="15" y2="210" />
                <line stroke="#1b2b3f" strokeDasharray="2,2" strokeWidth="1" x1="825" x2="825" y1="15" y2="210" />
                <line stroke="#1b2b3f" strokeWidth="1"                       x1="980" x2="980" y1="15" y2="210" />

                {/* Urgence vertical marker(s) */}
                {urgenceOrders.map((o) => (
                    <line
                        key={o.id}
                        stroke="#93000a"
                        strokeDasharray="4,3"
                        strokeWidth="1.5"
                        x1={o.x} x2={o.x}
                        y1="15"  y2="210"
                    />
                ))}

                {/* X axis labels */}
                <text fill="#8f9097" fontSize="10" textAnchor="middle" x="50"  y="225">00:00</text>
                <text fill="#8f9097" fontSize="10" textAnchor="middle" x="205" y="225">04:00</text>
                <text fill="#8f9097" fontSize="10" textAnchor="middle" x="360" y="225">08:00</text>
                <text fill="#8f9097" fontSize="10" textAnchor="middle" x="515" y="225">12:00</text>
                <text fill="#ffb4ab" fontSize="10" fontWeight="bold" textAnchor="middle" x={nowX} y="225">{nowLabel}</text>
                <text fill="#8f9097" fontSize="10" textAnchor="middle" x="670" y="225">16:00</text>
                <text fill="#8f9097" fontSize="10" textAnchor="middle" x="825" y="225">20:00</text>
                <text fill="#8f9097" fontSize="10" textAnchor="middle" x="980" y="225">23:59</text>

                {/* Urgence label(s) on x-axis */}
                {urgenceOrders.map((o) => (
                    <text
                        key={o.id}
                        fill="#ffb4ab"
                        fontSize="9"
                        fontWeight="bold"
                        textAnchor="middle"
                        x={o.x}
                        y="236"
                    >
                        URG {o.time}
                    </text>
                ))}

                {/* Deficit hatch zone */}
                <polygon fill="url(#deficitGradient)" points="554,60 580,60 612,60 612,73 580,69 554,60" />
                <polygon fill="url(#hatchDeficit)"    points="554,60 580,60 612,60 612,73 580,69 554,60" />

                {/* Planned line — full 24h dashed */}
                <path d={planPath} fill="none" stroke="#acc7ff" strokeDasharray="4,4" strokeWidth="2" />

                {/* Actual line — up to now, solid */}
                <path d={realPath} fill="none" stroke="#d3e4fe" strokeWidth="2.5" />

                {/* Urgence bumps — one per order, short raised segment then back to plan */}
                {urgenceBumps.map((b) => (
                    <g key={b.id}>
                        {/* Amber fill under the bump */}
                        <polygon
                            points={`${b.x0},${b.yBase0} ${b.x0},${b.yTop0} ${b.x1},${b.yTop1} ${b.x1},${b.yBase1}`}
                            fill="#ffb95f"
                            fillOpacity="0.12"
                        />
                        {/* Bump outline — same dash style as planifié */}
                        <path
                            d={b.d}
                            fill="none"
                            stroke="#ffb95f"
                            strokeDasharray="4,4"
                            strokeWidth="2"
                        />
                        {/* Dot at peak */}
                        <circle
                            cx={b.x0}
                            cy={b.yTop0}
                            fill="#ffb95f"
                            r="3.5"
                            stroke="#031427"
                            strokeWidth="1.5"
                        />
                        {/* +N MW label above peak */}
                        <text
                            fill="#ffb95f"
                            fontSize="9"
                            fontWeight="700"
                            textAnchor="middle"
                            x={b.x0 + SVG_SLOT / 2}
                            y={Math.min(b.yTop0, b.yTop1) - 5}
                        >
                            +{b.mwTotal} MW
                        </text>
                    </g>
                ))}

                {/* NOW dot on planned and actual lines */}
                {nowPoint && (
                    <circle cx={nowX} cy={nowPoint.yPlan} fill="#acc7ff" r="3.5" />
                )}
                {nowPoint?.yReal != null && (
                    <circle cx={nowX} cy={nowPoint.yReal} fill="#ffb4ab" r="4.5" />
                )}

                {/* Hover vertical line */}
                {tooltip && (
                    <line
                        stroke="#acc7ff"
                        strokeDasharray="3,3"
                        strokeOpacity="0.5"
                        strokeWidth="1"
                        x1={tooltip.x}
                        x2={tooltip.x}
                        y1="15"
                        y2="210"
                    />
                )}

                {/* Hover dot on planned line */}
                {tooltip && (
                    <circle
                        cx={tooltip.x}
                        cy={tooltip.yPlan}
                        fill="#acc7ff"
                        r="4"
                        stroke="#031427"
                        strokeWidth="1.5"
                    />
                )}

                {/* Hover dot on actual line */}
                {tooltip && tooltip.yReal !== null && (
                    <circle
                        cx={tooltip.x}
                        cy={tooltip.yReal}
                        fill="#d3e4fe"
                        r="4"
                        stroke="#031427"
                        strokeWidth="1.5"
                    />
                )}

                {/* Hover dot on urgence bump line (if hovered x is inside a bump) */}
                {tooltip && (() =>
                {
                    const bump = urgenceBumpAt(tooltip.x)
                    if (!bump) return null
                    const t      = (tooltip.x - bump.x0) / SVG_SLOT
                    const yTop   = bump.yTop0 + t * (bump.yTop1 - bump.yTop0)
                    return (
                        <circle
                            cx={tooltip.x}
                            cy={yTop}
                            fill="#ffb95f"
                            r="4"
                            stroke="#031427"
                            strokeWidth="1.5"
                        />
                    )
                })()}

                {/* Tooltip box */}
                {tooltip && (() =>
                {
                    const bump       = urgenceBumpAt(tooltip.x)
                    const hasReal    = tooltip.yReal !== null
                    const extraRow   = bump !== null
                    const boxHeight  = hasReal ? (extraRow ? 90 : 74) : (extraRow ? 72 : 56)
                    return (
                        <g transform={`translate(${tooltipX}, ${Math.max(tooltipY, 15)})`}>
                            <rect
                                fill="#0b1c30"
                                height={boxHeight}
                                rx="4"
                                stroke="#26364a"
                                strokeWidth="1"
                                width="200"
                            />
                            <text fill="#8f9097" fontSize="10" x="10" y="16">
                                HORODATAGE : {tooltip.time} TU+1
                            </text>
                            <text fill="#acc7ff" fontSize="11" fontWeight="600" x="10" y="32">
                                CONSIGNE : {(tooltip.mwPlan ?? yToMW(tooltip.yPlan)).toLocaleString('fr-FR')} MW
                            </text>
                            {hasReal && (
                                <>
                                    <text fill="#d3e4fe" fontSize="11" fontWeight="600" x="10" y="48">
                                        RÉALISÉ  : {(tooltip.mwReal ?? yToMW(tooltip.yReal)).toLocaleString('fr-FR')} MW
                                    </text>
                                    <text
                                        fill={(tooltip.mwReal ?? yToMW(tooltip.yReal)) < (tooltip.mwPlan ?? yToMW(tooltip.yPlan)) ? '#ffb4ab' : '#acc7ff'}
                                        fontSize="11"
                                        fontWeight="700"
                                        x="10"
                                        y="64"
                                    >
                                        ÉCART    : {((tooltip.mwReal ?? yToMW(tooltip.yReal)) - (tooltip.mwPlan ?? yToMW(tooltip.yPlan)) >= 0 ? '+' : '')}{((tooltip.mwReal ?? yToMW(tooltip.yReal)) - (tooltip.mwPlan ?? yToMW(tooltip.yPlan))).toFixed(0)} MW
                                    </text>
                                    {extraRow && (
                                        <text fill="#ffb95f" fontSize="11" fontWeight="700" x="10" y="80">
                                            + URGENCE : +{bump.mwTotal} MW
                                        </text>
                                    )}
                                </>
                            )}
                            {!hasReal && (
                                <>
                                    <text fill="#8f9097" fontSize="10" fontStyle="italic" x="10" y="48">
                                        Prévisionnel uniquement
                                    </text>
                                    {extraRow && (
                                        <text fill="#ffb95f" fontSize="11" fontWeight="700" x="10" y="64">
                                            + URGENCE : +{bump.mwTotal} MW
                                        </text>
                                    )}
                                </>
                            )}
                        </g>
                    )
                })()}

                {/* Default tooltip at 14:30 when not hovering */}
                {!tooltip && (
                    <g transform="translate(618, 20)">
                        <rect fill="#0b1c30" height="74" rx="4" stroke="#26364a" strokeWidth="1" width="195" />
                        <text fill="#8f9097"  fontSize="10" x="10" y="16">HORODATAGE : 14:30:00 TU+1</text>
                        <text fill="#acc7ff"  fontSize="11" fontWeight="600" x="10" y="32">CONSIGNE : 450,0 MW</text>
                        <text fill="#d3e4fe"  fontSize="11" fontWeight="600" x="10" y="48">RÉALISÉ  : 411,5 MW</text>
                        <text fill="#ffb4ab"  fontSize="11" fontWeight="700" x="10" y="64">DÉFICIT  : -38,5 MW (8,6%)</text>
                    </g>
                )}
            </svg>
        </div>
    )
}
const BCC_ROWS =
[
    {
        id: 1
        ,zone:      'BCC 1 (Tunis Ville & Nord)'
        ,crc:       'CRC Nord'
        ,consigne:  110.0
        ,realise:   110.2
        ,ecart:     '+0,2'
        ,pct:       '100,2 %'
        ,statut:    'CONFORME'
        ,statusCls: 'bg-surface-container-highest text-secondary'
        ,zoneCls:   'text-on-surface'
        ,realiseCls:'text-on-surface'
        ,ecartCls:  'text-secondary'
        ,pctCls:    'text-secondary'
        ,dot:       'bg-secondary'
        ,dotAnim:   ''
        ,validation:'14:25:10'
        ,operateur: 'Ing. M. Trabelsi'
        ,actionCls: 'bg-surface-container-lowest text-on-surface hover:text-secondary'
        ,actionIcon:'tune'
    }
    ,{
        id: 2
        ,zone:      'BCC 2 (Tunis Sud & Ben Arous)'
        ,crc:       'CRC Nord'
        ,consigne:  90.0
        ,realise:   89.8
        ,ecart:     '-0,2'
        ,pct:       '99,8 %'
        ,statut:    'CONFORME'
        ,statusCls: 'bg-surface-container-highest text-secondary'
        ,zoneCls:   'text-on-surface'
        ,realiseCls:'text-on-surface'
        ,ecartCls:  'text-on-surface-variant'
        ,pctCls:    'text-secondary'
        ,dot:       'bg-secondary'
        ,dotAnim:   ''
        ,validation:'14:28:44'
        ,operateur: 'Ing. A. Chahed'
        ,actionCls: 'bg-surface-container-lowest text-on-surface hover:text-secondary'
        ,actionIcon:'tune'
    }
    ,{
        id: 3
        ,zone:      'BCC 3 (Nord-Ouest / Béja - Jendouba)'
        ,crc:       'CRC Nord'
        ,consigne:  50.0
        ,realise:   38.0
        ,ecart:     '-12,0'
        ,pct:       '76,0 %'
        ,statut:    'SOUS-CONSIGNE'
        ,statusCls: 'bg-tertiary-container text-tertiary'
        ,zoneCls:   'text-tertiary'
        ,realiseCls:'text-tertiary'
        ,ecartCls:  'text-error font-bold'
        ,pctCls:    'text-error'
        ,dot:       'bg-tertiary'
        ,dotAnim:   'animate-pulse'
        ,validation:'14:10:02'
        ,operateur: 'Tech. S. Dridi'
        ,actionCls: 'bg-error-container text-on-error-container hover:bg-error'
        ,actionIcon:'flash_on'
    }
    ,{
        id: 4
        ,zone:      'BCC 4 (Bizerte - Mateur)'
        ,crc:       'CRC Nord'
        ,consigne:  50.0
        ,realise:   44.0
        ,ecart:     '-6,0'
        ,pct:       '88,0 %'
        ,statut:    'ATTENTION'
        ,statusCls: 'bg-tertiary-container text-tertiary'
        ,zoneCls:   'text-on-surface'
        ,realiseCls:'text-on-surface'
        ,ecartCls:  'text-tertiary'
        ,pctCls:    'text-tertiary'
        ,dot:       'bg-secondary'
        ,dotAnim:   ''
        ,validation:'14:22:15'
        ,operateur: 'Ing. R. Gharbi'
        ,actionCls: 'bg-surface-container-lowest text-on-surface hover:text-secondary'
        ,actionIcon:'tune'
    }
    ,{
        id: 5
        ,zone:      'BCC 5 (Centre / Kairouan - Sidi Bouzid)'
        ,crc:       'CRC Sud'
        ,consigne:  50.0
        ,realise:   33.5
        ,ecart:     '-16,5'
        ,pct:       '67,0 %'
        ,statut:    'CRITIQUE'
        ,statusCls: 'bg-error-container text-on-error-container animate-pulse'
        ,zoneCls:   'text-error'
        ,realiseCls:'text-error'
        ,ecartCls:  'text-error font-extrabold'
        ,pctCls:    'text-error font-extrabold'
        ,dot:       'bg-error'
        ,dotAnim:   'animate-ping'
        ,validation:'14:05:30'
        ,operateur: 'Ing. H. Jaziri'
        ,actionCls: 'bg-error text-on-error hover:bg-error-container'
        ,actionIcon:'priority_high'
    }
    ,{
        id: 6
        ,zone:      'BCC 6 (Sahel / Sousse - Monastir)'
        ,crc:       'CRC Sud'
        ,consigne:  60.0
        ,realise:   61.0
        ,ecart:     '+1,0'
        ,pct:       '101,6 %'
        ,statut:    'CONFORME'
        ,statusCls: 'bg-surface-container-highest text-secondary'
        ,zoneCls:   'text-on-surface'
        ,realiseCls:'text-on-surface'
        ,ecartCls:  'text-secondary'
        ,pctCls:    'text-secondary'
        ,dot:       'bg-secondary'
        ,dotAnim:   ''
        ,validation:'14:30:12'
        ,operateur: 'Ing. F. Mansour'
        ,actionCls: 'bg-surface-container-lowest text-on-surface hover:text-secondary'
        ,actionIcon:'tune'
    }
    ,{
        id: 7
        ,zone:      'BCC 7 (Sud / Sfax - Gabès - Médenine)'
        ,crc:       'CRC Sud'
        ,consigne:  40.0
        ,realise:   35.0
        ,ecart:     '-5,0'
        ,pct:       '87,5 %'
        ,statut:    'ATTENTION'
        ,statusCls: 'bg-tertiary-container text-tertiary'
        ,zoneCls:   'text-on-surface'
        ,realiseCls:'text-on-surface'
        ,ecartCls:  'text-tertiary'
        ,pctCls:    'text-tertiary'
        ,dot:       'bg-tertiary'
        ,dotAnim:   ''
        ,validation:'14:18:22'
        ,operateur: 'Tech. Y. Ayari'
        ,actionCls: 'bg-surface-container-lowest text-on-surface hover:text-secondary'
        ,actionIcon:'tune'
    }
]

const ALERTS =
[
    {
        id: 1
        ,severity:    'CRITIQUE'
        ,severityCls: 'bg-error-container text-on-error-container'
        ,zone:        'BCC 5 — Kairouan'
        ,zoneCls:     'text-error'
        ,time:        '14:28:04'
        ,msg:         "Écart de 16,5 MW sous la consigne depuis 28 min. Départ P2 non déclenché suite à saturation secours auxiliaires."
        ,footer:      'ACQUIT : NON-ACQUIT'
        ,action:      'Acquitter'
        ,contact:     { name: 'Ing. H. Jaziri', role: 'Opérateur BCC 5 — Centre', phone: '+216 77 231 445', radio: 'VHF 07-Sud' }
    }
    ,{
        id: 2
        ,severity:    'AVERTISSEMENT'
        ,severityCls: 'bg-tertiary-container text-tertiary'
        ,zone:        'BCC 3 — Béja / Jendouba'
        ,zoneCls:     'text-tertiary'
        ,time:        '14:15:12'
        ,msg:         "Décrochage de 12,0 MW suite à refus d'ouverture disjoncteur HTB D22. Télécommande réitérée sans succès."
        ,footer:      "EN COURS D'INVESTIGATION"
        ,action:      'Détail Relais'
        ,contact:     { name: 'Tech. S. Dridi', role: 'Opérateur BCC 3 — Nord-Ouest', phone: '+216 78 452 110', radio: 'VHF 04-Nord' }
    }
    ,{
        id: 3
        ,severity:    'INFO'
        ,severityCls: 'bg-surface-container-highest text-on-surface-variant'
        ,zone:        'CRC Nord'
        ,zoneCls:     'text-on-surface-variant'
        ,time:        '13:58:40'
        ,msg:         "Validation palier de rotation n°3 transmise aux postes sources 225/30 kV. Ordre appliqué sur feeders prioritaires P1."
        ,footer:      null
        ,action:      null
        ,contact:     { name: 'Ing. M. Trabelsi', role: 'Ingénieur de Quart CRC Nord', phone: '+216 71 340 102', radio: 'VHF 04-Nord' }
    }
    ,{
        id: 4
        ,severity:    'CRITIQUE'
        ,severityCls: 'bg-error-container text-on-error-container'
        ,zone:        'Ligne 225 kV Mornaguia'
        ,zoneCls:     'text-error'
        ,time:        '13:42:19'
        ,msg:         "Liaison Mornaguia-Mhamdia : Déclenchement automatique par protection de surcharge de transit (480 A mesuré)."
        ,footer:      null
        ,action:      null
        ,contact:     { name: 'Ing. R. Gharbi', role: 'Responsable Ligne HTB Mornaguia', phone: '+216 71 558 900', radio: 'VHF 01-HTB' }
    }
    ,{
        id: 5
        ,severity:    'AVERTISSEMENT'
        ,severityCls: 'bg-tertiary-container text-tertiary'
        ,zone:        'Fréquence Interconnectée'
        ,zoneCls:     'text-tertiary'
        ,time:        '13:30:00'
        ,msg:         "Creux transitoire à 49,84 Hz enregistré. Mobilisation réserve primaire rapide (stabilisé à 50,02 Hz)."
        ,footer:      null
        ,action:      null
        ,contact:     { name: 'Ing. K. Ben Salem', role: 'Ingénieur de Quart DN', phone: '+216 71 341 800', radio: 'VHF 00-DN' }
    }
]

// ── Urgence modal ─────────────────────────────────────────────────────────────

// AI suggestion text — built from live values at render time
function buildUrgenceAiSuggestion(realise, consigne, frequency) {
    const deficit = realise - consigne
    const defPct  = consigne > 0 ? ((Math.abs(deficit) / consigne) * 100).toFixed(1) : '?'
    const now     = new Date()
    const hhmm    = `${String(now.getHours()).padStart(2,'0')}h${String(now.getMinutes()).padStart(2,'0')}`
    return (
`Analyse de la situation (${hhmm} TU+1) :

Deficit actuel : ${deficit.toFixed(1)} MW (${defPct}% sous consigne)
Frequence reseau : ${frequency.toFixed(2)} Hz — surveillance active

Disponibilites identifiees :

→ BCC 3 Nord-Ouest : Departs F25 (Bou Salem, P2, 5,5 MW) et F03
  (Beja Centre, P2, 9,0 MW) non encore mobilises. Capacite residuelle :
  ~14,5 MW sans toucher aux P0.

→ BCC 5 Centre : Departs F06 (Haffouz Centre, P3, 8,5 MW) et F23
  (Bouhajla Rural, P4, 5,0 MW) disponibles. Capacite : ~13,5 MW.

→ BCC 6 Sahel : Dispose d'une marge de +1 MW — peut absorber
  +8 MW supplementaires sur F09 Akouda (P4) sans risque P0.

→ BCC 7 Sud : F15 Mahres (P5, 11 MW) et F22 Agareb (P5, 12 MW)
  non coupes actuellement. Capacite : ~23 MW.

Suggestion : Un ordre de 50–60 MW supplementaires est realisable
immediatement sans violer les contraintes P0 et sans repeter un
depart coupe dans les 24 dernieres heures.`
    )
}

function UrgenceModal({ isOpen, onClose, prefillMW = 0, onOrderEmis, cancelledRealims = null, livePlanifie = 0, liveRealise = 0, liveFrequency = 50.0 })
{
    const SPLIT_NORD                     = 67   // from ParametresSeuils default
    const SPLIT_SUD                      = 33

    const [mwTotal,    setMwTotal]       = useState(prefillMW || '')
    const [splitNord,  setSplitNord]     = useState(SPLIT_NORD)
    const [confirmed,  setConfirmed]     = useState(false)
    const [confirmTxt, setConfirmTxt]    = useState('')
    const [emitted,    setEmitted]       = useState(false)

    const splitSud = 100 - splitNord

    const mwNord = mwTotal ? Math.round(Number(mwTotal) * splitNord / 100) : 0
    const mwSud  = mwTotal ? Math.round(Number(mwTotal) * splitSud  / 100) : 0

    const handleSplitChange = (val) =>
    {
        const clamped = Math.max(10, Math.min(90, Number(val)))
        setSplitNord(clamped)
    }

    const handleEmit = () =>
    {
        if (!mwTotal || Number(mwTotal) <= 0) return
        setEmitted(true)
        if (onOrderEmis) onOrderEmis({ mwTotal: Number(mwTotal), mwNord, mwSud })
        setTimeout(() => onClose(), 2000)
    }

    const canEmit = mwTotal && Number(mwTotal) > 0 && confirmTxt.toUpperCase() === 'CONFIRMER'

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-space-md"
            onClick={onClose}
        >
            <div
                className="bg-surface-container-low border border-error-container rounded w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-space-lg py-space-md bg-error-container/40 border-b border-error-container shrink-0">
                    <div className="flex items-center gap-space-md">
                        <div className="w-8 h-8 rounded bg-error-container flex items-center justify-center shrink-0">
                            <Icon name="warning" size={20} className="text-on-error-container animate-bounce" />
                        </div>
                        <div>
                            <h2 className="font-sans font-bold text-sm text-on-error-container uppercase tracking-wider">
                                Ordre de Delestage d'Urgence
                            </h2>
                            <p className="font-mono text-[10px] text-on-error-container/70 mt-0.5">
                                Action irreversible · Diffusion immediate vers CRC Nord et CRC Sud
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-space-xs rounded bg-error-container/60 hover:bg-error-container text-on-error-container transition-colors"
                        type="button"
                    >
                        <Icon name="close" size={18} />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto flex flex-col gap-0">

                    {/* Section 1 — Contexte */}
                    <div className="px-space-lg py-space-md bg-surface-container-lowest border-b border-surface-container-high">
                        <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider mb-space-sm font-semibold">
                            Situation actuelle du reseau
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-sm font-mono text-xs">
                            {[
                                { label: 'Planifie',   value: `${livePlanifie.toFixed(1)} MW`,                                       cls: 'text-secondary'        }
                                ,{ label: 'Realise',   value: `${liveRealise.toFixed(1)} MW`,                                         cls: 'text-on-surface'       }
                                ,{ label: 'Deficit',   value: `${(liveRealise - livePlanifie).toFixed(1)} MW`,                        cls: 'text-error font-bold'  }
                                ,{ label: 'Frequence', value: `${liveFrequency.toFixed(2)} Hz`,                                       cls: liveFrequency < 49.95 ? 'text-error font-bold' : 'text-secondary' }
                            ].map(({ label, value, cls }) => (
                                <div key={label} className="bg-surface-container rounded p-space-sm border border-surface-container-high">
                                    <p className="text-[9px] text-on-surface-variant uppercase mb-0.5">{label}</p>
                                    <p className={`text-sm font-bold ${cls}`}>{value}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Contra-order notice — shown when a realim was cancelled by this urgence */}
                    {cancelledRealims && cancelledRealims.length > 0 && (
                        <div className="px-space-lg py-space-md bg-tertiary-container/20 border-b border-tertiary/30">
                            <div className="flex items-center gap-space-sm mb-space-sm">
                                <Icon name="cancel" size={15} className="text-tertiary" />
                                <span className="font-mono text-[10px] text-tertiary uppercase tracking-wider font-bold">
                                    CONTRE-ORDRE — Réalimentation(s) annulée(s) automatiquement
                                </span>
                            </div>
                            <div className="flex flex-col gap-space-xs">
                                {cancelledRealims.map((r) =>
                                {
                                    const executedTotal = (r.executedNord ?? 0) + (r.executedSud ?? 0)
                                    const wasPartial    = executedTotal > 0 && executedTotal < r.mwTotal
                                    return (
                                        <div key={r.id ?? r.orderRef} className="bg-surface-container border border-tertiary/20 p-space-sm font-mono text-[10px]">
                                            <div className="flex items-center justify-between flex-wrap gap-space-xs">
                                                <span className="font-bold text-tertiary">{r.orderRef ?? 'REA-???'}</span>
                                                <span className="text-on-surface-variant">{r.time}</span>
                                                <span className={`px-space-xs py-0.5 font-bold ${wasPartial ? 'bg-tertiary-container text-tertiary' : 'bg-surface-container-highest text-on-surface-variant'}`}>
                                                    {wasPartial ? 'PARTIELLEMENT EXÉCUTÉ' : 'NON EXÉCUTÉ'}
                                                </span>
                                            </div>
                                            <div className="mt-space-xs flex flex-wrap gap-space-md text-on-surface-variant">
                                                <span>Cible : <strong className="text-on-surface">-{r.mwTotal} MW</strong></span>
                                                <span>Nord : <strong className="text-secondary">-{r.mwNord} MW</strong></span>
                                                <span>Sud : <strong className="text-tertiary">-{r.mwSud} MW</strong></span>
                                                {wasPartial && (
                                                    <span className="text-tertiary font-bold">
                                                        Déjà rétabli : {executedTotal.toFixed(1)} MW — Tenez compte de cette charge sur le réseau.
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Section 2 — Saisie */}
                    <div className="px-space-lg py-space-md border-b border-surface-container-high">
                        <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider mb-space-md font-semibold">
                            Puissance supplementaire a delester
                        </p>

                        {/* MW input */}
                        <div className="flex items-center gap-space-md mb-space-md">
                            <div className="relative flex-1">
                                <input
                                    type="number"
                                    min={1}
                                    max={500}
                                    step={1}
                                    placeholder="Ex: 80"
                                    value={mwTotal}
                                    onChange={(e) => { setMwTotal(e.target.value); setConfirmed(false); setEmitted(false) }}
                                    className="w-full bg-surface-container-lowest border-2 border-error-container/60 focus:border-error-container text-on-surface font-mono text-2xl font-bold px-space-md py-space-md rounded focus:outline-none transition-all text-center"
                                />
                                <span className="absolute right-space-md top-1/2 -translate-y-1/2 font-mono text-sm text-on-surface-variant font-semibold">
                                    MW
                                </span>
                            </div>
                            <div className="flex flex-col gap-1">
                                {[25, 50, 80, 100].map((v) => (
                                    <button
                                        key={v}
                                        onClick={() => setMwTotal(v)}
                                        className="px-space-md py-space-xs rounded bg-surface-container hover:bg-error-container/30 border border-surface-container-high hover:border-error-container/50 text-on-surface-variant hover:text-on-error-container font-mono text-xs transition-all"
                                        type="button"
                                    >
                                        +{v} MW
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Split preview */}
                        {mwTotal && Number(mwTotal) > 0 && (
                            <div className="flex flex-col gap-space-sm">
                                <div className="grid grid-cols-2 gap-space-sm">
                                    {/* CRC Nord */}
                                    <div className="bg-surface-container-lowest border border-surface-container-high rounded p-space-sm">
                                        <div className="flex items-center justify-between mb-space-xs">
                                            <div className="flex items-center gap-space-xs">
                                                <span className="w-2 h-2 rounded-full bg-secondary" />
                                                <span className="font-mono text-[10px] text-on-surface-variant uppercase font-semibold">CRC Nord</span>
                                            </div>
                                            <div className="flex items-center gap-space-xs">
                                                <input
                                                    type="number"
                                                    min={10}
                                                    max={90}
                                                    value={splitNord}
                                                    onChange={(e) => handleSplitChange(e.target.value)}
                                                    className="w-10 bg-transparent border-b border-secondary text-secondary font-mono text-xs text-center focus:outline-none"
                                                />
                                                <span className="font-mono text-[10px] text-secondary">%</span>
                                            </div>
                                        </div>
                                        <p className="font-mono text-xl font-bold text-secondary">{mwNord} MW</p>
                                    </div>
                                    {/* CRC Sud */}
                                    <div className="bg-surface-container-lowest border border-surface-container-high rounded p-space-sm">
                                        <div className="flex items-center justify-between mb-space-xs">
                                            <div className="flex items-center gap-space-xs">
                                                <span className="w-2 h-2 rounded-full bg-tertiary" />
                                                <span className="font-mono text-[10px] text-on-surface-variant uppercase font-semibold">CRC Sud</span>
                                            </div>
                                            <span className="font-mono text-[10px] text-tertiary">{splitSud}%</span>
                                        </div>
                                        <p className="font-mono text-xl font-bold text-tertiary">{mwSud} MW</p>
                                    </div>
                                </div>
                                {/* Split bar */}
                                <div className="w-full h-3 bg-surface-container-lowest rounded overflow-hidden flex border border-surface-container-high">
                                    <div
                                        className="bg-secondary h-full transition-all duration-150 flex items-center justify-center font-mono text-[9px] text-background font-bold"
                                        style={{ width: `${splitNord}%` }}
                                    >
                                        {splitNord}%
                                    </div>
                                    <div
                                        className="bg-tertiary h-full transition-all duration-150 flex items-center justify-center font-mono text-[9px] text-background font-bold"
                                        style={{ width: `${splitSud}%` }}
                                    >
                                        {splitSud}%
                                    </div>
                                </div>
                                <p className="font-mono text-[10px] text-on-surface-variant">
                                    Cle de repartition issue des Parametres & Seuils — modifiable ci-dessus
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Section 3 — AI suggestion (read-only) */}
                    <div className="px-space-lg py-space-md border-b border-surface-container-high">
                        <div className="flex items-center justify-between mb-space-sm">
                            <div className="flex items-center gap-space-sm">
                                <Icon name="smart_toy" size={16} className="text-secondary" />
                                <p className="font-mono text-[10px] text-secondary uppercase tracking-wider font-semibold">
                                    Suggestion IA — Lecture seule
                                </p>
                            </div>
                            <span className="font-mono text-[9px] text-on-surface-variant px-space-sm py-0.5 rounded bg-surface-container border border-surface-container-high">
                                14:32:15 · Analyse automatique
                            </span>
                        </div>
                        <div className="bg-surface-container-lowest border border-surface-container-high rounded p-space-md font-mono text-xs text-on-surface-variant whitespace-pre-line leading-relaxed">
                            {buildUrgenceAiSuggestion(liveRealise, livePlanifie, liveFrequency)}
                        </div>
                        <p className="font-mono text-[9px] text-on-surface-variant/60 mt-space-xs italic">
                            Les preconisations IA sont strictement indicatives. La decision d'emission de l'ordre incombe exclusivement a l'Ingenieur de Quart DN.
                        </p>
                    </div>

                    {/* Section 4 — Confirmation */}
                    <div className="px-space-lg py-space-md">
                        <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider mb-space-sm font-semibold">
                            Confirmation de l'ordre d'urgence
                        </p>
                        <p className="font-sans text-xs text-on-surface-variant mb-space-md">
                            Tapez <strong className="text-error font-mono">CONFIRMER</strong> pour autoriser l'emission de l'ordre.
                            Cette action sera horodatee et enregistree dans l'audit DN.
                        </p>
                        <input
                            type="text"
                            placeholder="Tapez CONFIRMER"
                            value={confirmTxt}
                            onChange={(e) => setConfirmTxt(e.target.value)}
                            className="w-full bg-surface-container-lowest border border-surface-container-high focus:border-error-container text-on-surface font-mono text-sm px-space-md py-space-sm rounded focus:outline-none transition-all tracking-widest"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-space-lg py-space-md bg-surface-container border-t border-surface-container-high flex items-center justify-between shrink-0">
                    <div className="font-mono text-[10px] text-on-surface-variant flex items-center gap-space-xs">
                        <Icon name="schedule" size={13} className="text-secondary" />
                        <span>Ordre horodate et enregistre dans l'audit DN a l'emission</span>
                    </div>
                    <div className="flex items-center gap-space-sm">
                        <button
                            onClick={onClose}
                            className="px-space-md py-space-xs rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono text-xs transition-colors border border-surface-container-high"
                            type="button"
                        >
                            Annuler
                        </button>
                        <button
                            onClick={handleEmit}
                            disabled={!canEmit || emitted}
                            className="px-space-md py-space-xs rounded bg-error-container hover:bg-error-container/80 text-on-error-container font-mono text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-space-xs shadow-sm"
                            type="button"
                        >
                            {emitted
                                ? <><Icon name="check_circle" size={14} className="text-[#4ade80]" /><span>Ordre emis !</span></>
                                : <><Icon name="bolt" size={14} /><span>Emettre l'ordre d'urgence</span></>
                            }
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Programme J+1 modal ───────────────────────────────────────────────────────

// Default time slots (48 × 30-min slots for one day)
function buildDefaultSlots()
{
    const slots = []
    for (let h = 0; h < 24; h++)
    {
        for (let m = 0; m < 60; m += 30)
        {
            const label = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
            // Realistic demand curve: low at night, peaks morning/evening
            const peak =
                (h >= 7  && h <= 9)  ? 380 + Math.round(Math.random() * 40) :
                (h >= 11 && h <= 14) ? 350 + Math.round(Math.random() * 50) :
                (h >= 18 && h <= 22) ? 420 + Math.round(Math.random() * 60) :
                150 + Math.round(Math.random() * 80)
            slots.push({ time: label, mw: peak })
        }
    }
    return slots
}

function ProgrammeJ1Modal({ isOpen, onClose })
{
    const fileRef                        = useRef(null)
    const [tab,      setTab]             = useState('upload')   // 'upload' | 'manual'
    const [slots,    setSlots]           = useState(buildDefaultSlots)
    const [fileName, setFileName]        = useState(null)
    const [saved,    setSaved]           = useState(false)
    const [error,    setError]           = useState(null)

    // Tomorrow's date
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toLocaleDateString
    (
        'fr-FR'
        ,{ weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }
    )

    const handleFileChange = (e) =>
    {
        const file = e.target.files?.[0]
        if (!file) return
        setFileName(file.name)
        setError(null)
        // In demo: parse CSV if it ends with .csv, otherwise show error
        if (!file.name.match(/\.(csv|xlsx|xls)$/i))
        {
            setError('Format non supporté. Utilisez un fichier CSV ou Excel (.csv, .xlsx, .xls).')
            setFileName(null)
            return
        }
        // Mock parsing — in real app would use PapaParse or SheetJS
        const reader = new FileReader()
        reader.onload = () =>
        {
            // Keep default slots — just confirm file received
            setSaved(false)
        }
        reader.readAsText(file)
    }

    const updateSlot = (index, value) =>
    {
        setSlots
        (
            (prev) => prev.map
            (
                (s, i) => i === index ? { ...s, mw: Number(value) } : s
            )
        )
        setSaved(false)
    }

    const handleValidate = () =>
    {
        setSaved(true)
        setTimeout(() => onClose(), 1800)
    }

    const totalENS = slots.reduce((sum, s) => sum + s.mw * 0.5, 0)   // 30-min steps → MWh

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-space-md"
            onClick={onClose}
        >
            <div
                className="bg-surface-container-low border border-surface-container-high rounded w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-space-lg py-space-md bg-surface-container border-b border-surface-container-high shrink-0">
                    <div className="flex items-center gap-space-md">
                        <Icon name="event_note" size={20} className="text-secondary" />
                        <div>
                            <h2 className="font-sans font-bold text-sm text-on-surface">
                                Programme J+1 — Délestage prévisionnel
                            </h2>
                            <p className="font-mono text-[10px] text-on-surface-variant mt-0.5">
                                {tomorrowStr} · Pas de temps : 30 min · 48 créneaux
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-space-xs rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-colors"
                        type="button"
                    >
                        <Icon name="close" size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-space-xs p-space-sm bg-surface-container-lowest border-b border-surface-container-high shrink-0">
                    <div className="flex items-center bg-surface-container-low p-space-xs rounded border border-surface-container-high">
                        {[
                            { key: 'upload', icon: 'upload_file', label: 'Importer fichier (CSV/Excel)' }
                            ,{ key: 'manual', icon: 'edit_note',   label: 'Saisie manuelle'              }
                        ].map
                        (
                            ({ key, icon, label }) => (
                                <button
                                    key={key}
                                    onClick={() => setTab(key)}
                                    className={`flex items-center gap-space-xs px-space-md py-space-xs rounded font-mono text-xs transition-all ${
                                        tab === key
                                            ? 'bg-surface-container-high text-secondary font-semibold'
                                            : 'text-on-surface-variant hover:text-on-surface'
                                    }`}
                                    type="button"
                                >
                                    <Icon name={icon} size={14} />
                                    <span>{label}</span>
                                </button>
                            )
                        )}
                    </div>

                    {/* Summary strip */}
                    <div className="ml-auto flex items-center gap-space-md font-mono text-[10px] text-on-surface-variant">
                        <span>
                            Total planifié :{' '}
                            <strong className="text-secondary">
                                {totalENS.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} MWh
                            </strong>
                        </span>
                        <span>
                            Pic :{' '}
                            <strong className="text-tertiary">
                                {Math.max(...slots.map((s) => s.mw))} MW
                            </strong>
                        </span>
                    </div>
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto">

                    {/* Upload tab */}
                    {tab === 'upload' && (
                        <div className="p-space-lg flex flex-col gap-space-md">
                            {/* Drop zone */}
                            <div
                                className="border-2 border-dashed border-surface-container-high rounded p-8 flex flex-col items-center gap-space-md text-center cursor-pointer hover:border-secondary/50 hover:bg-surface-container/30 transition-all"
                                onClick={() => fileRef.current?.click()}
                            >
                                <Icon name="cloud_upload" size={40} className="text-on-surface-variant" />
                                <div>
                                    <p className="font-sans font-semibold text-sm text-on-surface">
                                        Glissez-déposez le fichier ou cliquez pour parcourir
                                    </p>
                                    <p className="font-mono text-[10px] text-on-surface-variant mt-1">
                                        Formats acceptés : CSV, Excel (.xlsx, .xls) · Taille max : 5 Mo
                                    </p>
                                </div>
                                {fileName && (
                                    <div className="flex items-center gap-space-sm px-space-md py-space-sm bg-surface-container rounded border border-secondary/40">
                                        <Icon name="description" size={16} className="text-secondary" />
                                        <span className="font-mono text-xs text-secondary font-semibold">{fileName}</span>
                                        <Icon name="check_circle" size={14} className="text-[#4ade80]" />
                                    </div>
                                )}
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept=".csv,.xlsx,.xls"
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                            </div>

                            {error && (
                                <div className="flex items-center gap-space-sm px-space-md py-space-sm bg-error-container/30 border border-accent-red/50 rounded font-mono text-xs text-accent-red">
                                    <Icon name="error" size={14} />
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Expected format */}
                            <div className="bg-surface-container-lowest border border-surface-container-high rounded p-space-md">
                                <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider mb-space-sm font-semibold">
                                    Format attendu du fichier CSV
                                </p>
                                <div className="font-mono text-xs text-on-surface-variant space-y-0.5">
                                    <p className="text-on-surface">heure,mw_planifie</p>
                                    <p>00:00,180</p>
                                    <p>00:30,165</p>
                                    <p>01:00,155</p>
                                    <p className="text-on-surface-variant">... (48 lignes pour 24h à pas 30 min)</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Manual tab */}
                    {tab === 'manual' && (
                        <div className="p-space-md">
                            <p className="font-mono text-[10px] text-on-surface-variant mb-space-md uppercase tracking-wider">
                                Saisie des MW à délester par créneau de 30 minutes
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-space-sm">
                                {slots.map
                                (
                                    (slot, i) => (
                                        <div
                                            key={slot.time}
                                            className="bg-surface-container-lowest border border-surface-container-high rounded p-space-sm flex items-center gap-space-sm"
                                        >
                                            <span className="font-mono text-[10px] text-on-surface-variant w-10 shrink-0">
                                                {slot.time}
                                            </span>
                                            <input
                                                type="number"
                                                min={0}
                                                max={1000}
                                                value={slot.mw}
                                                onChange={(e) => updateSlot(i, e.target.value)}
                                                className="w-full bg-transparent border-b border-surface-container-high focus:border-secondary text-secondary font-mono text-xs text-right focus:outline-none py-0.5 transition-colors"
                                            />
                                            <span className="font-mono text-[9px] text-on-surface-variant shrink-0">MW</span>
                                        </div>
                                    )
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-space-lg py-space-md bg-surface-container border-t border-surface-container-high flex items-center justify-between shrink-0">
                    <div className="font-mono text-[10px] text-on-surface-variant flex items-center gap-space-xs">
                        <Icon name="info" size={13} className="text-secondary" />
                        <span>
                            Après validation, le programme sera transmis à CRC Nord et CRC Sud pour répartition.
                        </span>
                    </div>
                    <div className="flex items-center gap-space-sm">
                        <button
                            onClick={onClose}
                            className="px-space-md py-space-xs rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono text-xs transition-colors border border-surface-container-high"
                            type="button"
                        >
                            Annuler
                        </button>
                        <button
                            onClick={handleValidate}
                            disabled={tab === 'upload' && !fileName}
                            className="px-space-md py-space-xs rounded bg-secondary-container text-on-secondary-container font-mono text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-space-xs"
                            type="button"
                        >
                            {saved
                                ? <><Icon name="check_circle" size={14} className="text-[#4ade80]" /><span>Programme validé !</span></>
                                : <><Icon name="send" size={14} /><span>Valider et envoyer aux CRCs</span></>
                            }
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Live shedding tree data ───────────────────────────────────────────────────
const LIVE_TREE =
[
    {
        id:     'crc-nord'
        ,label: 'CRC Nord'
        ,mw:    '282,0 MW'
        ,dot:   'bg-tertiary animate-pulse'
        ,badge: { text: 'DÉFICIT MODÉRÉ', cls: 'bg-tertiary-container text-tertiary' }
        ,bccs:
        [
            {
                id:      'bcc1'
                ,label:  'BCC 1 — Tunis Ville & Nord'
                ,mw:     '110,2 MW'
                ,statut: 'CONFORME'
                ,sCls:   'bg-surface-container-highest text-secondary'
                ,departs:
                [
                    { ref: 'F01', name: 'Tunis Centre P1',     mw: '18,5 MW', dur: '32 min' }
                    ,{ ref: 'F07', name: 'Bab Bhar P2',        mw: '12,0 MW', dur: '28 min' }
                    ,{ ref: 'F14', name: 'Ariana Ville P2',    mw: '22,4 MW', dur: '41 min' }
                ]
            }
            ,{
                id:      'bcc2'
                ,label:  'BCC 2 — Tunis Sud & Ben Arous'
                ,mw:     '89,8 MW'
                ,statut: 'CONFORME'
                ,sCls:   'bg-surface-container-highest text-secondary'
                ,departs:
                [
                    { ref: 'F03', name: 'Ben Arous Centre P2', mw: '15,0 MW', dur: '19 min' }
                    ,{ ref: 'F11', name: 'Mourouj P3',         mw: '9,5 MW',  dur: '35 min' }
                ]
            }
            ,{
                id:      'bcc3'
                ,label:  'BCC 3 — Nord-Ouest / Béja - Jendouba'
                ,mw:     '38,0 MW'
                ,statut: 'SOUS-CONSIGNE'
                ,sCls:   'bg-tertiary-container text-tertiary'
                ,departs:
                [
                    { ref: 'F04', name: 'Béja Ville P2',       mw: '9,0 MW',  dur: '47 min' }
                    ,{ ref: 'F09', name: 'Jendouba Nord P3',   mw: '7,5 MW',  dur: '52 min' }
                ]
            }
            ,{
                id:      'bcc4'
                ,label:  'BCC 4 — Bizerte - Mateur'
                ,mw:     '44,0 MW'
                ,statut: 'ATTENTION'
                ,sCls:   'bg-tertiary-container text-tertiary'
                ,departs:
                [
                    { ref: 'F02', name: 'Bizerte Ville P2',    mw: '11,0 MW', dur: '22 min' }
                    ,{ ref: 'F08', name: 'Mateur Rural P4',    mw: '8,0 MW',  dur: '18 min' }
                    ,{ ref: 'F16', name: 'Menzel Bourguiba P3',mw: '6,5 MW',  dur: '31 min' }
                ]
            }
        ]
    }
    ,{
        id:     'crc-sud'
        ,label: 'CRC Sud'
        ,mw:    '129,5 MW'
        ,dot:   'bg-error animate-ping'
        ,badge: { text: 'DÉFICIT CRITIQUE', cls: 'bg-error-container text-on-error-container' }
        ,bccs:
        [
            {
                id:      'bcc5'
                ,label:  'BCC 5 — Centre / Kairouan - Sidi Bouzid'
                ,mw:     '33,5 MW'
                ,statut: 'CRITIQUE'
                ,sCls:   'bg-error-container text-on-error-container animate-pulse'
                ,departs:
                [
                    { ref: 'F06', name: 'Kairouan Ouest P3',   mw: '8,5 MW',  dur: '43 min' }
                    ,{ ref: 'F12', name: 'Sidi Bouzid Est P4', mw: '6,0 MW',  dur: '38 min' }
                    ,{ ref: 'F20', name: 'Haffouz Rte P3',     mw: '7,0 MW',  dur: '29 min' }
                ]
            }
            ,{
                id:      'bcc6'
                ,label:  'BCC 6 — Sahel / Sousse - Monastir'
                ,mw:     '61,0 MW'
                ,statut: 'CONFORME'
                ,sCls:   'bg-surface-container-highest text-secondary'
                ,departs:
                [
                    { ref: 'F05', name: 'Sousse Nord P2',      mw: '14,0 MW', dur: '25 min' }
                    ,{ ref: 'F13', name: 'Monastir Ville P2',  mw: '11,5 MW', dur: '33 min' }
                    ,{ ref: 'F19', name: 'Akouda P4',          mw: '9,0 MW',  dur: '17 min' }
                ]
            }
            ,{
                id:      'bcc7'
                ,label:  'BCC 7 — Sud / Sfax - Gabès - Médenine'
                ,mw:     '35,0 MW'
                ,statut: 'ATTENTION'
                ,sCls:   'bg-tertiary-container text-tertiary'
                ,departs:
                [
                    { ref: 'F10', name: 'Sfax Centre P2',      mw: '12,0 MW', dur: '44 min' }
                    ,{ ref: 'F17', name: 'Gabès Ville P3',     mw: '8,5 MW',  dur: '20 min' }
                ]
            }
        ]
    }
]

// ── Live shedding tree component ──────────────────────────────────────────────
function LiveSheddingTree({ urgenceOrders, realimOrders = [], liveCuts = [] })
{
    // Which CRCs are expanded
    const [expandedCRCs, setExpandedCRCs] = useState({ 'crc-nord': true, 'crc-sud': true })
    // Which BCCs have "voir plus" open
    const [expandedBCCs, setExpandedBCCs] = useState({})

    const toggleCRC = (id) =>
        setExpandedCRCs((prev) => ({ ...prev, [id]: !prev[id] }))

    const toggleBCC = (id) =>
        setExpandedBCCs((prev) => ({ ...prev, [id]: !prev[id] }))

    return (
        <div className="flex flex-col gap-space-xs">

            {/* ── Live DB cuts — grouped by CRC from API ──────────────────── */}
            {liveCuts.length > 0 && (
                <div className="flex flex-col gap-space-xs mb-space-xs">
                    <div className="flex items-center gap-space-xs font-mono text-[10px] text-on-surface-variant px-space-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
                        <span className="uppercase tracking-wider font-semibold">Coupures actives — données temps réel</span>
                        <span className="ml-auto text-tertiary font-bold">{liveCuts.length} départs</span>
                    </div>
                    {Object.entries(
                        liveCuts.reduce((acc, c) =>
                        {
                            const key = c.crc_name ?? 'National'
                            if (!acc[key]) acc[key] = []
                            acc[key].push(c)
                            return acc
                        }, {})
                    ).map(([crcName, cuts]) => (
                        <div key={crcName} className="flex flex-col gap-space-xs">
                            <div className="flex items-center gap-space-xs px-space-xs font-mono text-[10px] text-secondary font-bold uppercase">
                                <span className="w-2 h-2 rounded-full bg-secondary shrink-0" />
                                {crcName}
                            </div>
                            {cuts.map((c) => (
                                <div
                                    key={c.execution_id}
                                    className={`flex items-center justify-between px-space-md py-space-xs rounded border-l-2 font-mono text-[10px] ${c.overdue ? 'bg-error-container/20 border-error' : 'bg-surface-container border-tertiary/40'}`}
                                >
                                    <div className="flex items-center gap-space-sm min-w-0">
                                        <span className={`font-bold shrink-0 ${c.overdue ? 'text-error animate-pulse' : 'text-tertiary'}`}>
                                            {c.feeder_ref}
                                        </span>
                                        <span className="text-on-surface-variant truncate">{c.feeder_nom}</span>
                                        <span className="text-on-surface-variant shrink-0">· {c.mw_shed} MW</span>
                                        {c.overdue && <span className="px-space-xs py-0.5 bg-error text-background font-bold text-[9px] shrink-0">DÉPASSEMENT</span>}
                                    </div>
                                    <div className="flex items-center gap-space-sm shrink-0">
                                        <span className="text-on-surface-variant">{c.bcc_name}</span>
                                        <span className={`font-bold ${c.overdue ? 'text-error' : 'text-tertiary'}`}>{c.elapsed_min}m</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                    <div className="border-t border-surface-container-high" />
                </div>
            )}

            {/* Réalimentation orders — pinned at top, green rows */}
            {realimOrders.filter((r) => r.status !== 'cancelled').length > 0 && (
                <div className="flex flex-col gap-space-xs mb-space-xs">
                    {realimOrders.filter((r) => r.status !== 'cancelled').map((o) => (
                        <div
                            key={o.id}
                            className="flex items-center justify-between px-space-md py-space-sm bg-[#4ade80]/10 border-l-2 border-[#4ade80]/60 font-mono text-[10px]"
                        >
                            <div className="flex items-center gap-space-xs">
                                <span className="px-space-xs py-0.5 bg-[#4ade80]/20 text-[#4ade80] font-bold flex items-center gap-1 border border-[#4ade80]/40">
                                    <Icon name="refresh" size={11} />
                                    {o.type === 'totale' ? 'RÉALIM. TOTALE' : 'RÉALIM. PARTIELLE'}
                                </span>
                                <span className="text-[#4ade80] font-semibold">-{o.mwTotal} MW</span>
                                <span className="text-on-surface-variant">
                                    — Nord&nbsp;<strong className="text-secondary">-{o.mwNord} MW</strong>
                                    &nbsp;· Sud&nbsp;<strong className="text-tertiary">-{o.mwSud} MW</strong>
                                </span>
                            </div>
                            <span className="text-on-surface-variant">{o.time}</span>
                        </div>
                    ))}
                    <div className="border-t border-surface-container-high" />
                </div>
            )}

            {/* Urgence orders — pinned at top */}
            {urgenceOrders.length > 0 && (
                <div className="flex flex-col gap-space-xs mb-space-xs">
                    {urgenceOrders.map((o) => (
                        <div
                            key={o.id}
                            className="flex items-center justify-between px-space-md py-space-sm rounded bg-error-container/20 border-l-2 border-error-container font-mono text-[10px]"
                        >
                            <div className="flex items-center gap-space-xs">
                                <span className="px-space-xs py-0.5 rounded bg-error-container text-on-error-container font-bold flex items-center gap-1">
                                    <Icon name="bolt" size={11} />
                                    URGENCE
                                </span>
                                <span className="text-error font-semibold">+{o.mwTotal} MW</span>
                                <span className="text-on-surface-variant">
                                    — Nord&nbsp;<strong className="text-secondary">{o.mwNord} MW</strong>
                                    &nbsp;· Sud&nbsp;<strong className="text-tertiary">{o.mwSud} MW</strong>
                                </span>
                            </div>
                            <span className="text-on-surface-variant">{o.time}</span>
                        </div>
                    ))}
                    <div className="border-t border-surface-container-high" />
                </div>
            )}

            {/* CRC rows — only shown when DB has no live cuts (empty state) */}
            {liveCuts.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 gap-space-md text-on-surface-variant font-mono text-[10px]">
                    <Icon name="check_circle" size={28} className="text-[#4ade80]" />
                    <span className="text-[#4ade80] font-semibold uppercase tracking-wider">Aucune coupure active</span>
                    <span className="text-on-surface-variant">Le réseau est équilibré — aucun délestage en cours</span>
                </div>
            )}
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DNDashboard()
{
    const { setLastDNView, setDNSubView, lastDNSubView } = useAuthStore()
    const { addUrgence, addRealim }                      = useUrgenceStore()
    const { production, consumption, frequency, getBalance, getStatus } = useGridStore()
    const { data: dbData, loading: dbLoading, lastUpdated } = useDNDashboard()
    const { addOrUpdateOrder, cancelRealimOrders: cancelRealimInStore } = useLiveStore()

    // Live timeseries for the 24h chart — refreshes every 5 min
    const { slots: tsSlots, totalEns: tsEns } = useTimeseries(null)
    const chartPoints = tsSlots.length > 0 ? slotsToChartPoints(tsSlots) : CHART_POINTS_FALLBACK

    // Sync live DB data → alertStore (replaces hardcoded alerts)
    useAlertSync(dbData)

    // ── Helper: derive styling classes from BCC status string ─────────────────
    const bccStatusStyle = (statut) =>
    {
        switch (statut)
        {
            case 'CONFORME':
                return { statusCls: 'bg-surface-container-highest text-secondary', zoneCls: 'text-on-surface', realiseCls: 'text-on-surface', ecartCls: 'text-secondary', dot: 'bg-secondary', dotAnim: '' }
            case 'ATTENTION':
                return { statusCls: 'bg-tertiary-container text-tertiary', zoneCls: 'text-on-surface', realiseCls: 'text-on-surface', ecartCls: 'text-tertiary', dot: 'bg-tertiary', dotAnim: '' }
            case 'SOUS-CONSIGNE':
                return { statusCls: 'bg-tertiary-container text-tertiary', zoneCls: 'text-tertiary', realiseCls: 'text-tertiary', ecartCls: 'text-error font-bold', dot: 'bg-tertiary', dotAnim: 'animate-pulse' }
            case 'CRITIQUE':
                return { statusCls: 'bg-error-container text-on-error-container animate-pulse', zoneCls: 'text-error', realiseCls: 'text-error', ecartCls: 'text-error font-extrabold', dot: 'bg-error', dotAnim: 'animate-ping' }
            case 'INACTIF':
                return { statusCls: 'bg-surface-container text-on-surface-variant', zoneCls: 'text-on-surface-variant', realiseCls: 'text-on-surface-variant', ecartCls: 'text-on-surface-variant', dot: 'bg-on-surface-variant/30', dotAnim: '' }
            default:
                return { statusCls: 'bg-surface-container-highest text-secondary', zoneCls: 'text-on-surface', realiseCls: 'text-on-surface', ecartCls: 'text-on-surface-variant', dot: 'bg-secondary', dotAnim: '' }
        }
    }

    // ── Merge API BCC rows with static fallback ───────────────────────────────
    const bccRows = dbData?.bcc_rows ?? BCC_ROWS
    const [aiOpen,        setAiOpen]        = useState(false)
    const [modalOpen,     setModalOpen]     = useState(false)
    const [j1Open,        setJ1Open]        = useState(false)
    const [urgenceOpen,   setUrgenceOpen]   = useState(false)
    const [urgencePrefill,setUrgencePrefill]= useState(0)
    const [realimOpen,    setRealimOpen]    = useState(false)
    const [urgenceOrders, setUrgenceOrders] = useState([])   // chart bumps
    const [realimOrders,  setRealimOrders]  = useState([])   // green rows in tree
    const [lastCancelledRealims, setLastCancelledRealims] = useState(null)

    const handleUrgenceEmis = async ({ mwTotal, mwNord, mwSud }) =>
    {
        const now  = new Date()
        const hhmm = `${String(now.getHours()).padStart(2,'0')}h${String(now.getMinutes()).padStart(2,'0')}`

        const totalMinutesInDay = 24 * 60
        const nowMinutes        = now.getHours() * 60 + now.getMinutes()
        const svgX              = Math.round(50 + (nowMinutes / totalMinutesInDay) * (980 - 50))

        // Snapshot pending realims before cancelling them — for counter-order notice
        const cancelledRealims = realimOrders.filter((r) => r.status !== 'cancelled')

        // Cancel any active realim orders locally (chart + tree)
        if (cancelledRealims.length > 0)
        {
            setRealimOrders((prev) => prev.map((r) => ({ ...r, status: 'cancelled' })))
            setLastCancelledRealims(cancelledRealims)
        }

        // Cancel realims in liveStore (WebSocket-sourced orders)
        cancelRealimInStore()

        setUrgenceOrders((prev) => [
            { id: Date.now(), time: hhmm, mwTotal, mwNord, mwSud, x: svgX, cancelledRealims: cancelledRealims.length > 0 ? cancelledRealims : null }
            ,...prev
        ])

        // Keep urgenceStore (legacy popup system) in sync
        addUrgence({ mwTotal, mwNord, mwSud })

        // ── POST to DB ────────────────────────────────────────────────────────
        try {
            const { data: order } = await api.post('/api/v1/orders', {
                order_type: 'urgence',
                mw_total:   mwTotal,
                mw_nord:    mwNord,
                mw_sud:     mwSud,
                notes:      `Émis manuellement par DN à ${hhmm}`,
            })
            // Add to liveStore immediately (WebSocket will also broadcast it)
            addOrUpdateOrder(order)
        } catch (err) {
            console.error('[DN] Failed to persist urgence order:', err?.response?.data ?? err.message)
        }
    }

    const handleRealimEmis = async ({ type, mwTotal, mwNord, mwSud }) =>
    {
        const now  = new Date()
        const hhmm = `${String(now.getHours()).padStart(2,'0')}h${String(now.getMinutes()).padStart(2,'0')}`
        const ref  = `REA-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(realimOrders.length + 1).padStart(3,'0')}`

        setRealimOrders((prev) => [
            { id: Date.now(), orderRef: ref, time: hhmm, type, mwTotal, mwNord, mwSud, status: 'pending' }
            ,...prev
        ])

        // Keep urgenceStore (legacy popup system) in sync
        addRealim({ type, mwTotal, mwNord, mwSud })

        // ── POST to DB ────────────────────────────────────────────────────────
        try {
            const { data: order } = await api.post('/api/v1/orders', {
                order_type: 'realim',
                sub_type:   type,        // 'partielle' | 'totale'
                mw_total:   mwTotal,
                mw_nord:    mwNord,
                mw_sud:     mwSud,
                notes:      `Réalimentation ${type} émise à ${hhmm}`,
            })
            addOrUpdateOrder(order)
        } catch (err) {
            console.error('[DN] Failed to persist realim order:', err?.response?.data ?? err.message)
        }
    }

    // Initialize view from persisted store so navigating away and back restores the tab
    const [view, setViewState] = useState(lastDNSubView ?? 'dashboard')

    const setView = (v) =>
    {
        setViewState(v)
        setDNSubView(v)
    }

    // Keep Sidebar aware of which sub-view is active
    useEffect
    (
        () => { setLastDNView(view === 'map' ? '/dn/map' : '/dn/dashboard') }
        ,[view]
    )

    // If map view is active, render DNMap full-height and skip the rest
    if (view === 'map')
    {
        return (
            <div className="flex flex-col w-full h-full">
                <DNMap onSwitchToDashboard={() => setView('dashboard')} />
            </div>
        )
    }

    return (
        <div className="flex flex-col w-full text-on-surface">

            {/* ── 1. TOP BAR: view selector + alert banner ────────────────── */}
            <section className="flex flex-col gap-space-sm p-space-md bg-surface-container-lowest">

                {/* View selector + metadata */}
                <div className="flex flex-wrap items-center justify-between gap-space-md">
                    <div className="flex items-center gap-space-xs bg-surface-container-low p-space-xs rounded">
                        <button
                            className="flex items-center gap-space-sm px-space-md py-space-xs rounded bg-surface-container-high text-secondary font-headline-sm text-body-sm shadow-sm transition-all"
                            type="button"
                        >
                            <Icon name="dashboard" size={18} />
                            <span>Tableau de bord (Actif)</span>
                        </button>
                        <button
                            onClick={() => setView('map')}
                            className="flex items-center gap-space-sm px-space-md py-space-xs rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all font-body-sm text-body-sm"
                            type="button"
                        >
                            <Icon name="map" size={18} />
                            <span>Cartographie SIG</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-space-md">
                        <div className="flex items-center gap-space-sm bg-surface-container-low px-space-md py-space-xs rounded font-label-telemetry-sm text-label-telemetry-sm">
                            <span className="text-on-surface-variant">STATUT RÉSEAU :</span>
                            {(() => {
                                const cuts   = dbData?.national?.active_cuts ?? 0
                                const ecart  = dbData?.national?.ecart       ?? 0
                                const isActif = cuts > 0
                                const isCrit  = ecart < -50
                                return isActif ? (
                                    <span className={`px-space-sm py-0.5 rounded font-semibold animate-pulse ${isCrit ? 'bg-error text-background' : 'bg-error-container text-on-error-container'}`}>
                                        {isCrit ? 'DEFICIT CRITIQUE' : 'SOUS-DÉLESTAGE ACTIF'}
                                    </span>
                                ) : (
                                    <span className="px-space-sm py-0.5 rounded bg-surface-container text-[#4ade80] font-semibold">
                                        RÉSEAU ÉQUILIBRÉ
                                    </span>
                                )
                            })()}
                            <span className="text-outline">|</span>
                            <span className="text-on-surface-variant">
                                CYCLAGE : <strong className="text-secondary font-semibold">20 ms</strong>
                            </span>
                        </div>
                        <button
                            className="flex items-center gap-space-xs px-space-md py-space-xs rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm transition-colors"
                            type="button"
                        >
                            <Icon name="file_download" size={16} />
                            <span>Rapport DN</span>
                        </button>
                        <button
                            onClick={() => setJ1Open(true)}
                            className="flex items-center gap-space-xs px-space-md py-space-xs rounded bg-secondary-container hover:bg-secondary-container/80 text-on-secondary-container font-body-sm text-body-sm font-semibold transition-colors shadow-sm whitespace-nowrap"
                            type="button"
                        >
                            <Icon name="upload_file" size={16} />
                            <span>Programme J+1</span>
                        </button>
                        <button
                            onClick={() => { setUrgencePrefill(0); setUrgenceOpen(true) }}
                            className="flex items-center gap-space-xs px-space-md py-space-xs rounded bg-error-container hover:bg-error-container/80 text-on-error-container font-body-sm text-body-sm font-bold uppercase tracking-wide transition-colors shadow-sm whitespace-nowrap"
                            type="button"
                        >
                            <Icon name="bolt" size={16} />
                            <span>Délestage d'urgence</span>
                        </button>
                        <button
                            onClick={() => setRealimOpen(true)}
                            className="flex items-center gap-space-xs px-space-md py-space-xs rounded bg-secondary-container/40 hover:bg-secondary-container text-secondary border border-secondary/40 font-body-sm text-body-sm font-bold uppercase tracking-wide transition-colors shadow-sm whitespace-nowrap"
                            type="button"
                        >
                            <Icon name="refresh" size={16} />
                            <span>Réalimentation</span>
                        </button>
                    </div>
                </div>

            </section>

            {/* ── 2. KPI CARDS ────────────────────────────────────────────── */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-space-md p-space-md bg-surface">

                {/* KPI 1 — Production nationale */}
                {(() =>
                {
                    const balance = getBalance()
                    const status  = getStatus()
                    const isDeficit = balance < -10
                    const valueCls = isDeficit ? 'text-error' : 'text-[#4ade80]'
                    return (
                        <div className={`flex flex-col justify-between p-space-md rounded bg-surface-container-low hover:bg-surface-container transition-all ${isDeficit ? 'ring-1 ring-error/30' : ''}`}>
                            <div className="flex items-center justify-between text-on-surface-variant">
                                <span className="font-label-caps text-label-caps uppercase tracking-wider">Production Nationale</span>
                                <Icon name="electric_bolt" size={18} className={valueCls} />
                            </div>
                            <div className="my-space-xs flex items-baseline gap-space-xs">
                                <span className={`font-label-telemetry-lg text-headline-lg font-bold ${valueCls}`}>
                                    {production.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                </span>
                                <span className="font-label-telemetry-sm text-label-telemetry-sm text-on-surface-variant">MW</span>
                            </div>
                            <div className="flex flex-col gap-space-xs">
                                <div className="w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
                                    <div className={`h-full ${isDeficit ? 'bg-error' : 'bg-[#4ade80]'}`} style={{ width: `${Math.min(100, (production / Math.max(production, consumption)) * 100).toFixed(1)}%` }} />
                                </div>
                                <span className="font-body-sm text-label-telemetry-sm text-on-surface-variant">
                                    Cadence télémesure : 2 sec
                                </span>
                            </div>
                        </div>
                    )
                })()}

                {/* KPI 2 — Consommation nationale */}
                {(() =>
                {
                    const balance   = getBalance()
                    const isExcess  = balance < -10
                    const valueCls  = isExcess ? 'text-error' : 'text-on-surface'
                    const badgeCls  = isExcess ? 'bg-error-container text-on-error-container animate-pulse' : 'bg-surface-container-highest text-on-surface-variant'
                    const pct       = consumption > 0 ? Math.min(100, (consumption / Math.max(production, consumption)) * 100) : 0
                    return (
                        <div className={`flex flex-col justify-between p-space-md rounded bg-surface-container-low hover:bg-surface-container transition-all ${isExcess ? 'ring-1 ring-error/30' : ''}`}>
                            <div className="flex items-center justify-between text-on-surface-variant">
                                <span className="font-label-caps text-label-caps uppercase tracking-wider">Consommation Nationale</span>
                                <span className={`px-space-xs py-0.5 rounded font-label-telemetry-sm text-label-telemetry-sm font-semibold ${badgeCls}`}>
                                    {isExcess ? `DÉFICIT ${Math.abs(balance).toFixed(1)} MW` : 'ÉQUILIBRÉ'}
                                </span>
                            </div>
                            <div className="my-space-xs flex items-baseline gap-space-xs">
                                <span className={`font-label-telemetry-lg text-headline-lg font-bold ${valueCls}`}>
                                    {consumption.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                </span>
                                <span className="font-label-telemetry-sm text-label-telemetry-sm text-on-surface-variant">MW</span>
                                {isExcess && (
                                    <span className="ml-auto font-label-telemetry-sm text-label-telemetry-sm text-error font-semibold">
                                        {getBalance().toFixed(1)} MW
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-col gap-space-xs">
                                <div className="w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
                                    <div className={`h-full ${isExcess ? 'bg-error' : 'bg-primary'}`} style={{ width: `${pct.toFixed(1)}%` }} />
                                </div>
                                <span className="font-body-sm text-label-telemetry-sm text-on-surface-variant">
                                    Fréquence réseau : <strong className={frequency < 49.8 ? 'text-error' : frequency < 49.95 ? 'text-tertiary' : 'text-[#4ade80]'}>{frequency.toFixed(2)} Hz</strong>
                                </span>
                            </div>
                        </div>
                    )
                })()}

                {/* KPI 3 — Réalisé instantané */}
                {(() => {
                    const realise = dbData?.national?.realise ?? 411.5
                    const consigne = dbData?.national?.consigne ?? 450.0
                    const pct = consigne > 0 ? ((realise / consigne) * 100).toFixed(1) : '—'
                    const ecart = (realise - consigne).toFixed(1)
                    const isDeficit = realise < consigne
                    return (
                        <div className="flex flex-col justify-between p-space-md rounded bg-surface-container-low hover:bg-surface-container transition-all">
                            <div className="flex items-center justify-between text-on-surface-variant">
                                <span className="font-label-caps text-label-caps uppercase tracking-wider">Réalisé Instantané</span>
                                <span className={`px-space-xs py-0.5 rounded font-label-telemetry-sm text-label-telemetry-sm font-semibold ${isDeficit ? 'bg-tertiary-container text-tertiary' : 'bg-surface-container-highest text-secondary'}`}>
                                    {pct} %
                                </span>
                            </div>
                            <div className="my-space-xs flex items-baseline gap-space-xs">
                                <span className={`font-label-telemetry-lg text-headline-lg font-bold ${isDeficit ? 'text-tertiary' : 'text-secondary'}`}>
                                    {realise.toFixed(1).replace('.', ',')}
                                </span>
                                <span className="font-label-telemetry-sm text-label-telemetry-sm text-on-surface-variant">MW</span>
                                {isDeficit && (
                                    <span className="ml-auto font-label-telemetry-sm text-label-telemetry-sm text-error font-semibold">
                                        {ecart.replace('.', ',')} MW
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-col gap-space-xs">
                                <div className="w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
                                    <div className={`h-full ${isDeficit ? 'bg-tertiary' : 'bg-secondary'}`} style={{ width: `${Math.min(100, (realise / consigne) * 100).toFixed(1)}%` }} />
                                </div>
                                <span className="font-body-sm text-label-telemetry-sm text-on-surface-variant">
                                    {dbLoading ? 'Chargement...' : lastUpdated ? `Mis à jour ${lastUpdated.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}` : 'Cadence télémesure : 30 sec'}
                                </span>
                            </div>
                        </div>
                    )
                })()}

                {/* KPI 4 — Zones actives */}
                {(() => {
                    const zones = dbData?.national?.zones_actives ?? ['GT','CENTRE','SUD-EST','SAHEL']
                    const nZones = zones.length
                    return (
                        <div className="flex flex-col justify-between p-space-md rounded bg-surface-container-low hover:bg-surface-container transition-all">
                            <div className="flex items-center justify-between text-on-surface-variant">
                                <span className="font-label-caps text-label-caps uppercase tracking-wider">Zones Actives</span>
                                <Icon name="share" size={18} className="text-secondary" />
                            </div>
                            <div className="my-space-xs flex items-baseline gap-space-xs">
                                <span className="font-label-telemetry-lg text-headline-lg text-secondary font-bold">{nZones}</span>
                                <span className="font-label-telemetry-sm text-label-telemetry-sm text-on-surface-variant">Régions</span>
                            </div>
                            <div className="flex flex-col gap-space-xs">
                                <div className="flex items-center gap-space-xs text-on-surface-variant font-label-telemetry-sm text-[10px] flex-wrap">
                                    {zones.map((z) => (
                                        <span key={z} className="flex items-center gap-0.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                                            {z}
                                        </span>
                                    ))}
                                </div>
                                <span className="font-body-sm text-label-telemetry-sm text-on-surface-variant">
                                    {dbData?.national?.active_cuts ?? 0} coupures actives
                                </span>
                            </div>
                        </div>
                    )
                })()}

                {/* KPI 5 — BCCs en anomalie */}
                {(() => {
                    const anomalies = dbData?.anomaly_bccs ?? [{ name:'BCC 3', ecart:-12.0 }, { name:'BCC 5', ecart:-16.5 }]
                    const count     = anomalies.length
                    const severity  = count === 0 ? 'ok' : anomalies.some((a) => a.ecart < -15) ? 'critique' : 'warn'
                    return (
                        <div className="flex flex-col justify-between p-space-md rounded bg-surface-container-low hover:bg-surface-container transition-all">
                            <div className="flex items-center justify-between text-on-surface-variant">
                                <span className="font-label-caps text-label-caps uppercase tracking-wider">BCCs en Anomalie</span>
                                {severity === 'ok'
                                    ? <span className="flex items-center gap-1 px-space-xs py-0.5 rounded bg-surface-container-highest text-secondary font-label-telemetry-sm text-label-telemetry-sm">NORMAL</span>
                                    : <span className="flex items-center gap-1 px-space-xs py-0.5 rounded bg-error-container text-on-error-container font-label-telemetry-sm text-label-telemetry-sm">
                                        <span className="w-1.5 h-1.5 rounded-full bg-error animate-ping" />
                                        {severity === 'critique' ? 'CRITIQUE' : 'ATTENTION'}
                                      </span>
                                }
                            </div>
                            <div className="my-space-xs flex items-baseline gap-space-xs">
                                <span className={`font-label-telemetry-lg text-headline-lg font-bold ${count === 0 ? 'text-secondary' : 'text-error'}`}>
                                    {count} <span className="text-body-lg text-on-surface-variant font-normal">/ 7</span>
                                </span>
                                <span className="font-label-telemetry-sm text-label-telemetry-sm text-on-surface-variant">Postes</span>
                            </div>
                            <div className="flex items-center justify-between font-label-telemetry-sm text-label-telemetry-sm">
                                {count === 0
                                    ? <span className="text-secondary">Tous les BCCs conformes</span>
                                    : anomalies.slice(0, 2).map((a) => (
                                        <span key={a.name} className="text-error">
                                            {a.name} ({a.ecart > 0 ? '+' : ''}{a.ecart.toFixed(1)} MW)
                                        </span>
                                    ))
                                }
                            </div>
                        </div>
                    )
                })()}
            </section>

            {/* ── 3. CHART ─────────────────────────────────────────────────── */}
            <section className="p-space-md bg-surface">
                <div className="bg-surface-container-low p-space-lg rounded flex flex-col gap-space-md">

                    {/* Chart header */}
                    <div className="flex flex-wrap items-center justify-between gap-space-md">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-space-sm">
                                <Icon name="ssid_chart" size={20} className="text-secondary" />
                                <h2 className="font-headline-sm text-headline-sm text-on-surface">
                                    Suivi d'Exécution du Délestage National — 24 Heures
                                </h2>
                                <span className="px-space-xs py-0.5 rounded bg-surface-container text-on-surface-variant font-label-caps text-label-caps uppercase">
                                    Profil Quotidien HTB
                                </span>
                            </div>
                            <span className="font-body-sm text-body-sm text-on-surface-variant">
                                Comparatif télémesuré instantané entre la consigne ordonnancée DN et le repli effectif du réseau
                            </span>
                        </div>
                        <div className="flex items-center gap-space-md">
                            <div className="hidden sm:flex items-center gap-space-md bg-surface-container-lowest px-space-md py-space-xs rounded font-label-telemetry-sm text-label-telemetry-sm">
                                <div className="flex items-center gap-space-xs">
                                    <span className="w-3 h-0.5 bg-secondary inline-block" style={{ borderTop: '2px dashed #acc7ff', background: 'transparent' }} />
                                    <span className="text-on-surface-variant">Consigne Planifiée (MW)</span>
                                </div>
                                <div className="flex items-center gap-space-xs">
                                    <span className="w-3 h-0.5 bg-primary inline-block" />
                                    <span className="text-on-surface">Puissance Délestée Réelle (MW)</span>
                                </div>
                                {urgenceOrders.length > 0 && (
                                    <div className="flex items-center gap-space-xs">
                                        <span className="w-3 h-0.5 inline-block" style={{ borderTop: '2px dashed #ffb95f', background: 'transparent' }} />
                                        <span className="text-tertiary font-semibold">Urgence (+{urgenceOrders.reduce((s, o) => s + o.mwTotal, 0)} MW — temporaire)</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-space-xs">
                                    <span className="w-3 h-2 bg-error-container/60 rounded-xs inline-block" />
                                    <span className="text-error font-semibold">Déficit (-38,5 MW)</span>
                                </div>
                            </div>
                            <button
                                onClick={() => setAiOpen(true)}
                                className="flex items-center gap-space-xs px-space-md py-space-xs rounded bg-surface-container-high hover:bg-secondary-container hover:text-on-secondary-container text-secondary font-body-sm text-body-sm transition-all shadow-sm"
                                type="button"
                            >
                                <Icon name="smart_toy" size={18} />
                                <span>Analyser le décrochage avec l'IA</span>
                            </button>
                        </div>
                    </div>

                    {/* Interactive SVG chart with hover tooltip */}
                    <LoadSheddingChart urgenceOrders={urgenceOrders} chartPoints={chartPoints} />
                </div>
            </section>

            {/* ── 4. CRC CARDS (left 60%) + ALERTS (right 40%) ────────────── */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-space-md p-space-md bg-surface">

                {/* CRC Column */}
                <div className="lg:col-span-7 flex flex-col gap-space-md">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-space-sm">
                            <Icon name="alt_route" size={20} className="text-primary" />
                            <h3 className="font-headline-sm text-headline-sm text-on-surface">
                                Centres Régionaux de Conduite (CRC)
                            </h3>
                        </div>
                        <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                            Régie Nationale HTB/HTA
                        </span>
                    </div>

                    {/* CRC Nord */}
                    {(() => {
                        const nord   = dbData?.crc_summary?.['CRC Nord']
                        const real   = nord?.realise ?? 282.0
                        const cons   = nord?.consigne ?? 300.0
                        const ecart  = nord?.ecart ?? -18.0
                        const pct    = cons > 0 ? ((real / cons) * 100).toFixed(0) : 0
                        const isOk   = ecart >= -5
                        const nordBCCs = dbData?.bcc_rows?.filter((b) => b.crc === 'CRC Nord') ?? []
                        return (
                            <div className="p-space-lg rounded bg-surface-container-low flex flex-col gap-space-md">
                                <div className="flex flex-wrap items-start justify-between gap-space-sm">
                                    <div>
                                        <div className="flex items-center gap-space-sm">
                                            <span className={`w-2.5 h-2.5 rounded-full ${isOk ? 'bg-secondary' : 'bg-tertiary animate-pulse'}`} />
                                            <h4 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                                                CRC NORD — Région Grand Tunis & Nord
                                            </h4>
                                            <span className={`px-space-xs py-0.5 rounded font-label-telemetry-sm text-label-telemetry-sm font-semibold ${isOk ? 'bg-surface-container-highest text-secondary' : 'bg-tertiary-container text-tertiary'}`}>
                                                {isOk ? 'CONFORME' : ecart < -20 ? 'DÉFICIT CRITIQUE' : 'DÉFICIT MODÉRÉ'}
                                            </span>
                                        </div>
                                        <span className="font-body-sm text-body-sm text-on-surface-variant">Poste de commandement La Goulette / Tunis</span>
                                    </div>
                                    <div className="flex items-baseline gap-space-xs font-label-telemetry-md text-label-telemetry-md">
                                        <span className="text-on-surface-variant">Réalisé:</span>
                                        <strong className="text-on-surface">{real.toFixed(1)} MW</strong>
                                        <span className="text-on-surface-variant">/ {cons.toFixed(1)} MW</span>
                                        <span className={`ml-space-sm font-bold ${ecart < 0 ? 'text-tertiary' : 'text-secondary'}`}>
                                            ({ecart >= 0 ? '+' : ''}{ecart.toFixed(1)} MW)
                                        </span>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-space-xs">
                                    <div className="flex justify-between font-label-telemetry-sm text-label-telemetry-sm text-on-surface-variant">
                                        <span>Taux de réalisation : <strong className="text-on-surface">{pct} %</strong></span>
                                        <span>Mis à jour : {lastUpdated ? lastUpdated.toLocaleTimeString('fr-FR') : '—'}</span>
                                    </div>
                                    <div className="w-full h-2 rounded bg-surface-container-highest overflow-hidden flex">
                                        <div className={`h-full ${pct >= 95 ? 'bg-secondary' : 'bg-tertiary'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-sm">
                                    {nordBCCs.map((b) => {
                                        const sty = bccStatusStyle(b.statut)
                                        return (
                                            <div key={b.name} className="p-space-sm rounded bg-surface-container flex flex-col">
                                                <div className="flex items-center justify-between">
                                                    <span className={`font-label-caps text-label-caps ${sty.zoneCls}`}>{b.name}</span>
                                                    <span className={`w-2 h-2 rounded-full ${sty.dot} ${sty.dotAnim}`} />
                                                </div>
                                                <span className="font-body-sm text-body-sm text-on-surface font-semibold truncate">{b.zone?.split('/')[0]?.trim() ?? b.name}</span>
                                                <span className={`font-label-telemetry-sm text-label-telemetry-sm ${sty.realiseCls}`}>
                                                    {b.realise.toFixed(1)} MW {b.ecart < 0 ? `(${b.ecart.toFixed(0)})` : ''}
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-xs font-label-telemetry-sm text-label-telemetry-sm text-on-surface-variant">
                                    <div className="flex items-center gap-space-md">
                                        <span className="flex items-center gap-1"><Icon name="call" size={14} /> +216 71 340 102</span>
                                        <span className="flex items-center gap-1 text-secondary"><Icon name="radio" size={14} /> VHF-04 Canal Conduite</span>
                                    </div>
                                    <span>crc.nord@steg.com.tn</span>
                                </div>
                            </div>
                        )
                    })()}

                    {/* CRC Sud */}
                    {(() => {
                        const sud    = dbData?.crc_summary?.['CRC Sud']
                        const real   = sud?.realise ?? 129.5
                        const cons   = sud?.consigne ?? 150.0
                        const ecart  = sud?.ecart ?? -20.5
                        const pct    = cons > 0 ? ((real / cons) * 100).toFixed(0) : 0
                        const isCrit = ecart < -20
                        const sudBCCs = dbData?.bcc_rows?.filter((b) => b.crc === 'CRC Sud') ?? []
                        return (
                            <div className="p-space-lg rounded bg-surface-container-low flex flex-col gap-space-md">
                                <div className="flex flex-wrap items-start justify-between gap-space-sm">
                                    <div>
                                        <div className="flex items-center gap-space-sm">
                                            <span className={`w-2.5 h-2.5 rounded-full ${isCrit ? 'bg-error animate-ping' : 'bg-tertiary animate-pulse'}`} />
                                            <h4 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                                                CRC SUD — Région Centre & Sud
                                            </h4>
                                            <span className={`px-space-xs py-0.5 rounded font-label-telemetry-sm text-label-telemetry-sm font-semibold ${isCrit ? 'bg-error-container text-on-error-container' : 'bg-tertiary-container text-tertiary'}`}>
                                                {isCrit ? 'DÉFICIT CRITIQUE' : 'DÉFICIT MODÉRÉ'}
                                            </span>
                                        </div>
                                        <span className="font-body-sm text-body-sm text-on-surface-variant">Poste de commandement Thyna / Sfax</span>
                                    </div>
                                    <div className="flex items-baseline gap-space-xs font-label-telemetry-md text-label-telemetry-md">
                                        <span className="text-on-surface-variant">Réalisé:</span>
                                        <strong className="text-on-surface">{real.toFixed(1)} MW</strong>
                                        <span className="text-on-surface-variant">/ {cons.toFixed(1)} MW</span>
                                        <span className={`ml-space-sm font-bold ${isCrit ? 'text-error' : 'text-tertiary'}`}>
                                            ({ecart >= 0 ? '+' : ''}{ecart.toFixed(1)} MW)
                                        </span>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-space-xs">
                                    <div className="flex justify-between font-label-telemetry-sm text-label-telemetry-sm text-on-surface-variant">
                                        <span>Taux de réalisation : <strong className={isCrit ? 'text-error font-semibold' : 'text-on-surface'}>{pct} %</strong></span>
                                        <span>Mis à jour : {lastUpdated ? lastUpdated.toLocaleTimeString('fr-FR') : '—'}</span>
                                    </div>
                                    <div className="w-full h-2 rounded bg-surface-container-highest overflow-hidden flex">
                                        <div className={`h-full ${isCrit ? 'bg-error' : 'bg-secondary'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                                        {ecart < 0 && <div className="bg-tertiary h-full" style={{ width: `${Math.min(100 - pct, 10)}%` }} />}
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-sm">
                                    {sudBCCs.map((b) => {
                                        const sty = bccStatusStyle(b.statut)
                                        return (
                                            <div key={b.name} className="p-space-sm rounded bg-surface-container flex flex-col">
                                                <div className="flex items-center justify-between">
                                                    <span className={`font-label-caps text-label-caps ${sty.zoneCls}`}>{b.name}</span>
                                                    <span className={`w-2 h-2 rounded-full ${sty.dot} ${sty.dotAnim}`} />
                                                </div>
                                                <span className="font-body-sm text-body-sm text-on-surface font-semibold truncate">{b.zone?.split('/')[0]?.trim() ?? b.name}</span>
                                                <span className={`font-label-telemetry-sm text-label-telemetry-sm ${sty.realiseCls}`}>
                                                    {b.realise.toFixed(1)} MW {b.ecart < 0 ? `(${b.ecart.toFixed(0)})` : ''}
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-xs font-label-telemetry-sm text-label-telemetry-sm text-on-surface-variant">
                                    <div className="flex items-center gap-space-md">
                                        <span className="flex items-center gap-1"><Icon name="call" size={14} /> +216 73 221 800</span>
                                        <span className="flex items-center gap-1 text-secondary"><Icon name="radio" size={14} /> VHF-09 Canal Exploitation</span>
                                    </div>
                                    <span>crc.sud@steg.com.tn</span>
                                </div>
                            </div>
                        )
                    })()}
                </div>

                {/* Live shedding tree column */}
                <div className="lg:col-span-5 flex flex-col gap-space-md">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-space-sm">
                            <Icon name="account_tree" size={20} className="text-secondary" />
                            <h3 className="font-headline-sm text-headline-sm text-on-surface">
                                Délestages en Cours
                            </h3>
                        </div>
                        <div className="flex items-center gap-space-sm">
                            <span className="flex items-center gap-space-xs px-space-xs py-0.5 rounded bg-surface-container font-label-telemetry-sm text-label-telemetry-sm text-on-surface-variant">
                                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                                Temps réel
                            </span>
                            <span className="px-space-xs py-0.5 rounded bg-surface-container text-on-surface-variant font-label-telemetry-sm text-label-telemetry-sm">
                                7 BCC actifs
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-space-xs p-space-sm rounded bg-surface-container-low overflow-y-auto max-h-[480px]">
                        <LiveSheddingTree urgenceOrders={urgenceOrders} realimOrders={realimOrders} liveCuts={dbData?.live_cuts ?? []} />
                    </div>
                </div>
            </section>

            {/* ── 5. BCC TABLE ─────────────────────────────────────────────── */}
            <section className="p-space-md bg-surface">
                <div className="bg-surface-container-low p-space-lg rounded flex flex-col gap-space-md">
                    <div className="flex flex-wrap items-center justify-between gap-space-md">
                        <div className="flex items-center gap-space-sm">
                            <Icon name="table_rows" size={20} className="text-primary" />
                            <h3 className="font-headline-sm text-headline-sm text-on-surface">
                                État Télémétrique Détaillé des 7 Postes de Conduite Locaux (BCC)
                            </h3>
                        </div>
                        <div className="flex items-center gap-space-sm font-label-telemetry-sm text-label-telemetry-sm text-on-surface-variant">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-secondary" /> 4 Conformes</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-tertiary" /> 2 Attention</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-error" />    1 Critique</span>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left font-body-sm text-body-sm">
                            <thead className="bg-surface-container-lowest font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
                                <tr>
                                    <th className="py-space-sm px-space-md">Zone Opérationnelle</th>
                                    <th className="py-space-sm px-space-md">CRC Tutelle</th>
                                    <th className="py-space-sm px-space-md text-right">Consigne (MW)</th>
                                    <th className="py-space-sm px-space-md text-right">Réalisé (MW)</th>
                                    <th className="py-space-sm px-space-md text-right">Écart (MW)</th>
                                    <th className="py-space-sm px-space-md text-center">Statut Télémesure</th>
                                    <th className="py-space-sm px-space-md">Validation</th>
                                    <th className="py-space-sm px-space-md">Opérateur Responsable</th>
                                </tr>
                            </thead>
                            <tbody className="font-label-telemetry-sm text-label-telemetry-sm">
                                {bccRows.map((r, i) =>
                                {
                                    const sty = bccStatusStyle(r.statut ?? r.statut)
                                    // Support both API shape and static BCC_ROWS shape
                                    const zone      = r.zone ?? r.zone
                                    const crc       = r.crc
                                    const consigne  = typeof r.consigne === 'number' ? r.consigne : 0
                                    const realise   = typeof r.realise  === 'number' ? r.realise  : 0
                                    const ecartNum  = typeof r.ecart === 'number' ? r.ecart : parseFloat(r.ecart) || 0
                                    const ecartStr  = typeof r.ecart === 'number'
                                        ? `${ecartNum >= 0 ? '+' : ''}${ecartNum.toFixed(1)}`
                                        : r.ecart
                                    const statut    = r.statut
                                    const statusCls = r.statusCls ?? sty.statusCls
                                    const zoneCls   = r.zoneCls   ?? sty.zoneCls
                                    const realiseCls= r.realiseCls?? sty.realiseCls
                                    const ecartCls  = r.ecartCls  ?? sty.ecartCls
                                    const validation= r.validation
                                    const operateur = r.operateur

                                    return (
                                        <tr
                                            key={r.id ?? r.name}
                                            className={`hover:bg-surface-container-high transition-colors ${i % 2 === 0 ? 'bg-surface-container' : 'bg-surface-container-lowest'}`}
                                        >
                                            <td className={`py-space-sm px-space-md font-bold ${zoneCls}`}>{r.name ?? zone}</td>
                                            <td className="py-space-sm px-space-md text-on-surface-variant">{crc}</td>
                                            <td className="py-space-sm px-space-md text-right text-primary">{consigne.toFixed(1)}</td>
                                            <td className={`py-space-sm px-space-md text-right font-bold ${realiseCls}`}>{realise.toFixed(1)}</td>
                                            <td className={`py-space-sm px-space-md text-right ${ecartCls}`}>{ecartStr}</td>
                                            <td className="py-space-sm px-space-md text-center">
                                                <span className={`px-space-sm py-0.5 rounded font-label-caps text-[10px] font-bold ${statusCls}`}>
                                                    {statut}
                                                </span>
                                            </td>
                                            <td className="py-space-sm px-space-md font-mono text-[11px] text-on-surface-variant">{validation}</td>
                                            <td className="py-space-sm px-space-md font-body-sm text-body-sm text-on-surface">{operateur}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                            <tfoot className="bg-surface-container-lowest font-label-telemetry-md text-label-telemetry-md font-bold">
                                <tr>
                                    <td className="py-space-md px-space-md text-on-surface uppercase tracking-wider font-headline-sm" colSpan={2}>
                                        Total Réseau Interconnecté (DN)
                                    </td>
                                    <td className="py-space-md px-space-md text-right text-primary">
                                        {(dbData?.national?.consigne ?? 450).toFixed(1)} MW
                                    </td>
                                    <td className={`py-space-md px-space-md text-right ${(dbData?.national?.realise ?? 411.5) < (dbData?.national?.consigne ?? 450) ? 'text-tertiary' : 'text-secondary'}`}>
                                        {(dbData?.national?.realise ?? 411.5).toFixed(1)} MW
                                    </td>
                                    <td className={`py-space-md px-space-md text-right ${(dbData?.national?.ecart ?? -38.5) < 0 ? 'text-error' : 'text-secondary'}`}>
                                        {((dbData?.national?.ecart ?? -38.5) >= 0 ? '+' : '')}
                                        {(dbData?.national?.ecart ?? -38.5).toFixed(1)} MW
                                    </td>
                                    <td className="py-space-md px-space-md text-center">
                                        <span className={`px-space-sm py-0.5 rounded font-label-caps text-[10px] ${(dbData?.national?.ecart ?? -38.5) < 0 ? 'bg-error-container text-on-error-container' : 'bg-surface-container-highest text-secondary'}`}>
                                            {(dbData?.national?.ecart ?? -38.5) < 0 ? 'DÉFICIT ACTIF' : 'ÉQUILIBRÉ'}
                                        </span>
                                    </td>
                                    <td className="py-space-md px-space-md text-right text-on-surface-variant font-label-telemetry-sm" colSpan={3}>
                                        7 BCCs synchronisés · {dbData?.national?.active_cuts ?? 0} coupes actives
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </section>

            {/* ── 6. AI SLIDE PANEL ────────────────────────────────────────── */}
            <div className={`fixed top-14 bottom-8 right-0 w-96 max-w-[90vw] bg-surface-container-low shadow-2xl z-50 flex flex-col justify-between transition-transform duration-300 ease-in-out ${aiOpen ? 'translate-x-0' : 'translate-x-full'}`}>

                {/* Header */}
                <div className="p-space-md bg-surface-container flex items-center justify-between shadow-sm shrink-0">
                    <div className="flex items-center gap-space-sm">
                        <div className="w-7 h-7 rounded bg-secondary-container text-on-secondary flex items-center justify-center">
                            <Icon name="smart_toy" size={18} />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-headline-sm text-body-md font-semibold text-on-surface">
                                Analyse IA — Décision DN
                            </span>
                            <span className="font-label-telemetry-sm text-[10px] text-on-surface-variant">
                                Déficit National 03/09 • 14h30
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={() => setAiOpen(false)}
                        className="p-space-xs rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface"
                        type="button"
                    >
                        <Icon name="close" size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-space-md flex-1 overflow-y-auto flex flex-col gap-space-md font-body-sm text-body-sm">
                    <div className="p-space-md rounded bg-surface-container-lowest flex flex-col gap-space-sm">
                        <div className="flex items-center justify-between text-secondary">
                            <span className="font-label-caps text-label-caps font-bold flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                                DIAGNOSTIC AUTOMATISÉ STEG-AI
                            </span>
                            <span className="font-label-telemetry-sm text-[10px] text-on-surface-variant">14:30:15</span>
                        </div>
                        <p className="text-on-surface leading-relaxed">
                            Le déficit global atteint{' '}
                            <strong className="text-error font-semibold font-label-telemetry-sm">-38,5 MW</strong>
                            {' '}(exécution 91,4%). Les goulets d'étranglement critiques sont identifiés sur{' '}
                            <strong className="text-on-surface">BCC 5</strong> (Kairouan : -16,5 MW) et{' '}
                            <strong className="text-on-surface">BCC 3</strong> (Béja : -12,0 MW).
                        </p>
                        <div className="p-space-sm rounded bg-surface-container-high flex flex-col gap-space-xs font-label-telemetry-sm text-label-telemetry-sm">
                            <span className="font-label-caps text-label-caps text-tertiary uppercase">
                                Recommandations d'Arbitrage Immédiat :
                            </span>
                            <ol className="list-decimal list-inside space-y-1 text-on-surface">
                                <li>
                                    <strong>BCC 5</strong> : Ordre de délestage complémentaire sur le départ P2 «Zone Industrielle Kairouan Sud» (
                                    <span className="text-secondary font-semibold">+15 MW</span>).
                                </li>
                                <li>
                                    <strong>BCC 6</strong> : Transfert de consigne de compensation (
                                    <span className="text-secondary font-semibold">+10 MW</span> sur départ P3) ; dispose d'une marge sans risque pour les postes P0.
                                </li>
                            </ol>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-on-surface-variant pt-space-xs font-label-telemetry-sm">
                            <span>Gain estimé : <strong className="text-secondary">+25 MW</strong></span>
                            <span>Impact fréquence : <strong className="text-on-surface">+0,04 Hz</strong></span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-space-xs">
                        <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
                            Prompts Rapides Régulateur
                        </span>
                        <div className="flex flex-col gap-space-xs font-body-sm text-body-sm">
                            {[
                                'Simuler impact fréquence si report sur BCC 6'
                                ,'Vérifier feeders hôpitaux P0 dans BCC 5'
                                ,'Générer message télex pour le chef de quart CRC Sud'
                            ].map((prompt) => (
                                <button
                                    key={prompt}
                                    className="text-left p-space-sm rounded bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors flex items-center justify-between group"
                                    type="button"
                                >
                                    <span className="truncate">{prompt}</span>
                                    <Icon name="arrow_forward" size={16} className="text-secondary group-hover:translate-x-0.5 transition-transform" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Input */}
                <div className="p-space-md bg-surface-container flex flex-col gap-space-sm shadow-inner shrink-0">
                    <div className="flex items-center gap-space-xs bg-surface-container-lowest p-space-xs rounded">
                        <input
                            className="w-full bg-transparent px-space-sm py-space-xs font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none"
                            placeholder="Poser une consigne à l'assistant SCADA..."
                            type="text"
                        />
                        <button
                            className="p-space-xs rounded bg-secondary-container text-on-secondary hover:bg-secondary transition-colors"
                            type="button"
                        >
                            <Icon name="send" size={18} />
                        </button>
                    </div>
                    <p className="font-body-sm text-[10px] text-on-surface-variant leading-tight text-center">
                        Avertissement : Les préconisations de l'IA sont strictement informatives. La décision d'ouverture disjoncteur incombe exclusivement à l'Ingénieur de Quart STEG.
                    </p>
                </div>
            </div>

            {/* ── 7. DETAIL MODAL ──────────────────────────────────────────── */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-space-md">
                    <div className="bg-surface-container-low max-w-2xl w-full rounded p-space-lg shadow-2xl flex flex-col gap-space-md">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-space-sm">
                                <Icon name="analytics" size={24} className="text-error" />
                                <h3 className="font-headline-md text-headline-md text-on-surface">
                                    Synthèse Technique du Déficit de Repli
                                </h3>
                            </div>
                            <button
                                onClick={() => setModalOpen(false)}
                                className="p-space-xs rounded bg-surface-container text-on-surface hover:bg-surface-container-high"
                                type="button"
                            >
                                <Icon name="close" size={20} />
                            </button>
                        </div>
                        <div className="flex flex-col gap-space-sm font-body-sm text-body-sm text-on-surface">
                            <div className="p-space-md rounded bg-surface-container-lowest flex justify-between items-center font-label-telemetry-sm">
                                <div>
                                    <span className="text-on-surface-variant">ÉCART ACTUEL NATIONAL :</span>
                                    <strong className="text-error ml-space-xs text-headline-sm">-38,5 MW</strong>
                                </div>
                                <span className="px-space-sm py-0.5 rounded bg-error-container text-on-error-container">
                                    SEUIL D'ALARME 25 MW FRANCHI
                                </span>
                            </div>
                            <p>
                                Le protocole d'effacement d'urgence n°4 (délestage par rotation des départs HTA) présente un retard critique d'application sur les postes sources de Kairouan et Béja.
                            </p>
                            <div className="grid grid-cols-2 gap-space-sm font-label-telemetry-sm">
                                <div className="p-space-sm rounded bg-surface-container">
                                    <span className="text-on-surface-variant">Fréquence Réseau :</span>
                                    <div className="font-bold text-secondary text-label-telemetry-lg">50,02 Hz</div>
                                    <span className="text-[10px] text-on-surface-variant">Stabilité sous réserve tournante</span>
                                </div>
                                <div className="p-space-sm rounded bg-surface-container">
                                    <span className="text-on-surface-variant">Réserve Primaire Mobilisée :</span>
                                    <div className="font-bold text-tertiary text-label-telemetry-lg">185 MW</div>
                                    <span className="text-[10px] text-on-surface-variant">Marge résiduelle : 42 MW</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-space-md pt-space-xs">
                            <button
                                onClick={() => setModalOpen(false)}
                                className="px-space-md py-space-xs rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm"
                                type="button"
                            >
                                Fermer
                            </button>
                            <button
                                onClick={() => { setModalOpen(false); setAiOpen(true) }}
                                className="flex items-center gap-space-xs px-space-md py-space-xs rounded bg-secondary-container text-on-secondary hover:bg-secondary font-body-sm text-body-sm"
                                type="button"
                            >
                                <Icon name="smart_toy" size={16} />
                                <span>Lancer Ordre Assisté</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 8. PROGRAMME J+1 MODAL ───────────────────────────────────── */}
            <ProgrammeJ1Modal isOpen={j1Open} onClose={() => setJ1Open(false)} />

            {/* ── 9. URGENCE MODAL ─────────────────────────────────────────── */}
            <UrgenceModal
                isOpen={urgenceOpen}
                onClose={() => { setUrgenceOpen(false); setLastCancelledRealims(null) }}
                prefillMW={urgencePrefill}
                onOrderEmis={handleUrgenceEmis}
                cancelledRealims={lastCancelledRealims}
                livePlanifie={dbData?.national?.consigne ?? 0}
                liveRealise={dbData?.national?.realise   ?? 0}
                liveFrequency={frequency}
            />

            {/* ── 10. RÉALIMENTATION MODAL ─────────────────────────────────── */}
            <RealiModal
                isOpen={realimOpen}
                onClose={() => setRealimOpen(false)}
                currentlyShedding={dbData?.national?.realise ?? 0}
                livePlanifie={dbData?.national?.consigne     ?? 0}
                liveFrequency={frequency}
                onOrderEmis={handleRealimEmis}
            />

        </div>
    )
}
