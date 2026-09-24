import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuthStore }    from '../../stores/authStore'
import { useUrgenceStore } from '../../stores/urgenceStore'
import { useCRCDashboard } from '../../hooks/useCRCDashboard'
import { useLiveStore }    from '../../stores/liveStore'
import { useTimeseries }   from '../../hooks/useTimeseries'
import api                 from '../../lib/api'

// ── Icon helper ───────────────────────────────────────────────────────────────
function Icon({ name, size = 18, className = '' })
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

// ── Static data ───────────────────────────────────────────────────────────────
const BCC_STATUS =
[
    {
        id:       1
        ,label:   'BCC 1 — Tunis N.'
        ,full:    'BCC 1 — Tunis Ville & Nord'
        ,sub:     'Postes 90kV: El Menzah, Charguia'
        ,consigne: 110
        ,realise:  110
        ,pct:      100
        ,dot:      'bg-[#4ade80]'
        ,dotAnim:  ''
        ,barCls:   'bg-secondary'
        ,note:     '8 postes 90kV'
        ,noteCls:  'text-[#4ade80]'
    }
    ,{
        id:       2
        ,label:   'BCC 2 — Tunis S.'
        ,full:    'BCC 2 — Tunis Sud & Ben Arous'
        ,sub:     'Postes 90kV: Naassen, Mghira'
        ,consigne: 90
        ,realise:  90
        ,pct:      100
        ,dot:      'bg-[#4ade80]'
        ,dotAnim:  ''
        ,barCls:   'bg-secondary'
        ,note:     '6 postes 90kV'
        ,noteCls:  'text-[#4ade80]'
    }
    ,{
        id:       3
        ,label:   'BCC 3 — Béja'
        ,full:    'BCC 3 — Nord-Ouest (Béja / Jendouba)'
        ,sub:     'Postes 90kV: Béja, Jendouba'
        ,consigne: 58
        ,realise:  40
        ,pct:      68.9
        ,dot:      'bg-error'
        ,dotAnim:  'animate-ping'
        ,barCls:   'bg-error'
        ,note:     'D22 HS Béja'
        ,noteCls:  'text-error font-bold'
    }
    ,{
        id:       4
        ,label:   'BCC 4 — Bizerte'
        ,full:    'BCC 4 — Bizerte / Mateur'
        ,sub:     'Postes 90kV: Bizerte, Mateur'
        ,consigne: 42
        ,realise:  42
        ,pct:      100
        ,dot:      'bg-[#4ade80]'
        ,dotAnim:  ''
        ,barCls:   'bg-secondary'
        ,note:     '5 postes 90kV'
        ,noteCls:  'text-[#4ade80]'
    }
]

// Accordion tree data — live shedding per BCC
const LIVE_TREE =
[
    {
        id:       'bcc1'
        ,label:   'BCC 1 — Grand Tunis Nord'
        ,count:   14
        ,mw:      '110,0 MW'
        ,hasAlert: false
        ,departs:
        [
            { ref: 'D30-F03', nom: 'Charguia Tertiaire',      mw: '8,4 MW',  dur: 28, statut: 'ok'      }
            ,{ ref: 'D30-F12', nom: 'Ariana Riadh',           mw: '6,2 MW',  dur: 19, statut: 'ok'      }
            ,{ ref: 'D30-F17', nom: 'El Menzah Résidentiel',  mw: '5,8 MW',  dur: 22, statut: 'ok'      }
        ]
    }
    ,{
        id:       'bcc2'
        ,label:   'BCC 2 — Tunis Sud & Ben Arous'
        ,count:   12
        ,mw:      '90,0 MW'
        ,hasAlert: false
        ,departs:
        [
            { ref: 'D30-F08', nom: 'Ben Arous Industriel',    mw: '9,1 MW',  dur: 34, statut: 'ok'      }
            ,{ ref: 'D30-F15', nom: 'Mégrine Sud',            mw: '5,5 MW',  dur: 22, statut: 'ok'      }
        ]
    }
    ,{
        id:       'bcc3'
        ,label:   'BCC 3 — Nord-Ouest (Béja)'
        ,count:   8
        ,mw:      '40,0 / 58 MW'
        ,hasAlert: true
        ,alertLabel: '1 OVERDUE'
        ,departs:
        [
            { ref: 'D30-F18', nom: 'Nefza Rural (Béja 90kV)', mw: '4,8 MW',  dur: 52, statut: 'overdue' }
            ,{ ref: 'D30-F04', nom: 'Medjez El Bab Centre',   mw: '7,2 MW',  dur: 31, statut: 'ok'      }
            ,{ ref: 'D30-F09', nom: 'Tabarka Urbain',         mw: '6,0 MW',  dur: 18, statut: 'ok'      }
        ]
    }
    ,{
        id:       'bcc4'
        ,label:   'BCC 4 — Bizerte / Mateur'
        ,count:   8
        ,mw:      '42,0 MW'
        ,hasAlert: false
        ,departs:
        [
            { ref: 'D30-F02', nom: 'Menzel Bourguiba Z.I.',   mw: '11,0 MW', dur: 39, statut: 'ok'      }
            ,{ ref: 'D30-F07', nom: 'Ras Jebel Nord',         mw: '5,2 MW',  dur: 14, statut: 'ok'      }
        ]
    }
]

// Full cuts table data
const CUTS_DATA =
[
    { id:1, bcc:'BCC 3', bccShort:'BCC 3 (Nord-Ouest)', ref:'D30-F18', poste:'BÉJA 90kV / Nefza Rural',              debut:'13:55:10', dur:52, mw:4.8,  statut:'overdue'  }
    ,{ id:2, bcc:'BCC 4', bccShort:'BCC 4 (Bizerte)',    ref:'D30-F02', poste:'MATEUR 90kV / Menzel Bourguiba Z.I.',  debut:'14:08:44', dur:39, mw:11.0, statut:'ok'       }
    ,{ id:3, bcc:'BCC 2', bccShort:'BCC 2 (Tunis Sud)',  ref:'D30-F08', poste:'NAASSEN 90kV / Ben Arous Industriel',  debut:'14:13:20', dur:34, mw:9.1,  statut:'ok'       }
    ,{ id:4, bcc:'BCC 3', bccShort:'BCC 3 (Nord-Ouest)', ref:'D30-F04', poste:'BÉJA 90kV / Medjez El Bab Centre',    debut:'14:16:02', dur:31, mw:7.2,  statut:'ok'       }
    ,{ id:5, bcc:'BCC 1', bccShort:'BCC 1 (Tunis Nord)', ref:'D30-F03', poste:'EL MENZAH 90kV / Charguia Tertiaire', debut:'14:19:15', dur:28, mw:8.4,  statut:'ok'       }
    ,{ id:6, bcc:'BCC 2', bccShort:'BCC 2 (Tunis Sud)',  ref:'D30-F15', poste:'MGHIRA 90kV / Mégrine Sud F2',        debut:'14:25:00', dur:22, mw:5.5,  statut:'ok'       }
    ,{ id:7, bcc:'BCC 1', bccShort:'BCC 1 (Tunis Nord)', ref:'D30-F12', poste:'CHARGUIA 90kV / Ariana Riadh',        debut:'14:28:41', dur:19, mw:6.2,  statut:'ok'       }
    ,{ id:8, bcc:'BCC 4', bccShort:'BCC 4 (Bizerte)',    ref:'D30-F07', poste:'BIZERTE 90kV / Ras Jebel Nord',       debut:'14:33:10', dur:14, mw:5.2,  statut:'ok'       }
]

// ── CRC chart helpers ─────────────────────────────────────────────────────────
// SVG space: viewBox 720×240, x 40–680 (640 units), y 30–200 (170 units = 400 MW)
const CRC_SVG_X_START = 40
const CRC_SVG_X_RANGE = 640    // 40→680
const CRC_MW_MAX      = 400

function crcMwToY(mw)  { return 200 - (Math.min(mw, CRC_MW_MAX) / CRC_MW_MAX) * 170 }
function crcYToMW(y)   { return Math.round((200 - y) / 170 * CRC_MW_MAX) }

function slotsToChartPtsCRC(slots) {
    if (!slots || slots.length === 0) return []
    const total = slots.length
    return slots.map((s, idx) => {
        const x = Math.round(CRC_SVG_X_START + (idx / (total - 1)) * CRC_SVG_X_RANGE)
        return {
            time:   s.slot,
            x,
            yPlan:  Math.round(crcMwToY(s.mw_plan ?? 0)),
            yReal:  s.mw_real != null ? Math.round(crcMwToY(s.mw_real)) : null,
            isNow:  s.is_now ?? false,
            mwPlan: s.mw_plan ?? 0,
            mwReal: s.mw_real ?? null,
        }
    })
}

// Static fallback shown while API loads
const CRC_CHART_FALLBACK = [
    { time:'00:00', x:40,  yPlan:185, yReal:185, mwPlan:35,  mwReal:35  },
    { time:'08:00', x:268, yPlan:138, yReal:138, mwPlan:130, mwReal:130 },
    { time:'14:00', x:453, yPlan:82,  yReal:100, mwPlan:282, mwReal:240, isNow:true },
    { time:'20:00', x:610, yPlan:140, yReal:null, mwPlan:130, mwReal:null },
    { time:'23:59', x:680, yPlan:168, yReal:null, mwPlan:72,  mwReal:null },
]

// ── Regional SVG chart ────────────────────────────────────────────────────────
function RegionalChart({ chartPts = CRC_CHART_FALLBACK })
{
    const [tooltip, setTooltip] = useState(null)
    const svgRef                = useRef(null)

    const nowPoint = chartPts.find((p) => p.isNow) ?? null
    const nowX     = nowPoint?.x ?? 453
    const nowLabel = nowPoint ? nowPoint.time : '14:30'

    const handleMouseMove = useCallback(
        (e) => {
            const svg = svgRef.current
            if (!svg) return
            const rect   = svg.getBoundingClientRect()
            const scaleX = 720 / rect.width
            const mouseX = (e.clientX - rect.left) * scaleX
            let closest = null, minDist = Infinity
            chartPts.forEach((pt) => {
                const dist = Math.abs(pt.x - mouseX)
                if (dist < minDist) { minDist = dist; closest = pt }
            })
            if (closest && minDist < 25) setTooltip(closest)
            else setTooltip(null)
        },
        [chartPts]
    )

    const planPath = chartPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.yPlan}`).join(' ')
    const realPts  = chartPts.filter((p) => p.yReal !== null)
    const realPath = realPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.yReal}`).join(' ')

    const ttX = tooltip ? (tooltip.x > 500 ? tooltip.x - 195 : tooltip.x + 12) : 0
    const ttY = tooltip ? Math.min(tooltip.yPlan, tooltip.yReal ?? tooltip.yPlan) - 8 : 0

    return (
        <div
            className="w-full bg-surface-container-lowest relative select-none"
            style={{ height: '220px' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setTooltip(null)}
        >
            <svg ref={svgRef} className="w-full h-full cursor-crosshair" preserveAspectRatio="none" viewBox="0 0 720 240">
                <defs>
                    <linearGradient id="defCRCGrad" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%"   stopColor="#93000a" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#93000a" stopOpacity="0.05" />
                    </linearGradient>
                </defs>

                {/* Grid */}
                <line stroke="#1b2b3f" strokeWidth="1"                      x1="35" x2="685" y1="200" y2="200" />
                <line stroke="#1b2b3f" strokeDasharray="2,2" strokeWidth="1" x1="35" x2="685" y1="157" y2="157" />
                <line stroke="#1b2b3f" strokeDasharray="2,2" strokeWidth="1" x1="35" x2="685" y1="115" y2="115" />
                <line stroke="#1b2b3f" strokeDasharray="2,2" strokeWidth="1" x1="35" x2="685" y1="72"  y2="72"  />
                <line stroke="#1b2b3f" strokeDasharray="2,2" strokeWidth="1" x1="35" x2="685" y1="30"  y2="30"  />

                {/* Y labels */}
                <text fill="#8f9097" fontSize="9" textAnchor="end" x="30" y="203">0</text>
                <text fill="#8f9097" fontSize="9" textAnchor="end" x="30" y="160">100</text>
                <text fill="#8f9097" fontSize="9" textAnchor="end" x="30" y="118">200</text>
                <text fill="#8f9097" fontSize="9" textAnchor="end" x="30" y="75">300</text>
                <text fill="#8f9097" fontSize="9" textAnchor="end" x="30" y="33">400</text>
                <text fill="#8f9097" fontSize="8" textAnchor="start" x="5" y="30">MW</text>

                {/* X grid lines */}
                <line stroke="#1b2b3f" strokeWidth="1"                        x1="40"   x2="40"   y1="28" y2="200" />
                <line stroke="#1b2b3f" strokeDasharray="2,2" strokeWidth="1"  x1="268"  x2="268"  y1="28" y2="200" />
                <line stroke="#1b2b3f" strokeDasharray="2,2" strokeWidth="1"  x1="382"  x2="382"  y1="28" y2="200" />
                <line stroke="#ffb95f" strokeDasharray="3,3" strokeWidth="1.5" x1={nowX} x2={nowX} y1="28" y2="200" />
                <line stroke="#1b2b3f" strokeDasharray="2,2" strokeWidth="1"  x1="553"  x2="553"  y1="28" y2="200" />
                <line stroke="#1b2b3f" strokeWidth="1"                        x1="680"  x2="680"  y1="28" y2="200" />

                {/* X labels */}
                <text fill="#8f9097" fontSize="9" textAnchor="middle" x="40"   y="215">00:00</text>
                <text fill="#8f9097" fontSize="9" textAnchor="middle" x="268"  y="215">08:00</text>
                <text fill="#8f9097" fontSize="9" textAnchor="middle" x="382"  y="215">12:00</text>
                <text fill="#ffb95f" fontSize="9" fontWeight="bold" textAnchor="middle" x={nowX} y="215">{nowLabel}</text>
                <text fill="#8f9097" fontSize="9" textAnchor="middle" x="553"  y="215">18:00</text>
                <text fill="#8f9097" fontSize="9" textAnchor="middle" x="680"  y="215">23:59</text>

                {/* Plan line */}
                <path d={planPath} fill="none" stroke="#acc7ff" strokeDasharray="4,4" strokeWidth="1.5" />
                {/* Actual line */}
                <path d={realPath} fill="none" stroke="#d3e4fe" strokeWidth="2" />

                {/* NOW dot */}
                {nowPoint && <circle cx={nowX} cy={nowPoint.yPlan} fill="#acc7ff" r="3" />}
                {nowPoint?.yReal != null && <circle cx={nowX} cy={nowPoint.yReal} fill="#ffb95f" r="4" />}

                {/* Hover */}
                {tooltip && <line stroke="#acc7ff" strokeDasharray="3,3" strokeOpacity="0.5" strokeWidth="1" x1={tooltip.x} x2={tooltip.x} y1="28" y2="200" />}
                {tooltip && <circle cx={tooltip.x} cy={tooltip.yPlan} fill="#acc7ff" r="3.5" stroke="#031427" strokeWidth="1" />}
                {tooltip && tooltip.yReal != null && <circle cx={tooltip.x} cy={tooltip.yReal} fill="#d3e4fe" r="3.5" stroke="#031427" strokeWidth="1" />}

                {/* Tooltip box */}
                {tooltip && (
                    <g transform={`translate(${ttX},${Math.max(32, ttY)})`}>
                        <rect fill="#0b1c30" height="58" rx="2" stroke="#acc7ff" strokeOpacity="0.4" strokeWidth="0.8" width="185" />
                        <text fill="#8f9097" fontSize="9" x="8" y="14">{tooltip.time} TU+1</text>
                        <text fill="#acc7ff" fontSize="10" fontWeight="600" x="8" y="28">
                            Consigne : {(tooltip.mwPlan ?? crcYToMW(tooltip.yPlan)).toFixed(0)} MW
                        </text>
                        {tooltip.yReal != null && (
                            <>
                                <text fill="#d3e4fe" fontSize="10" fontWeight="600" x="8" y="42">
                                    Réalisé  : {(tooltip.mwReal ?? crcYToMW(tooltip.yReal)).toFixed(0)} MW
                                </text>
                                <text
                                    fill={(tooltip.mwReal ?? crcYToMW(tooltip.yReal)) < (tooltip.mwPlan ?? crcYToMW(tooltip.yPlan)) ? '#ffb4ab' : '#4ade80'}
                                    fontSize="10" fontWeight="700" x="8" y="54"
                                >
                                    Écart : {((tooltip.mwReal ?? crcYToMW(tooltip.yReal)) - (tooltip.mwPlan ?? crcYToMW(tooltip.yPlan)) >= 0 ? '+' : '')}{((tooltip.mwReal ?? crcYToMW(tooltip.yReal)) - (tooltip.mwPlan ?? crcYToMW(tooltip.yPlan))).toFixed(0)} MW
                                </text>
                            </>
                        )}
                        {tooltip.yReal == null && (
                            <text fill="#8f9097" fontSize="9" fontStyle="italic" x="8" y="42">Données futures — plan J-1</text>
                        )}
                    </g>
                )}
            </svg>
        </div>
    )
}

// ── CRC Réalimentation modal ──────────────────────────────────────────────────
// Triggered by the CRC operator manually (radio order from DN, or CRC-initiated)
// Distributes a restore MW order down to the 4 BCCs
function CRCRealimModal({ isOpen, onClose, onEmit })
{
    const [type,       setType]       = useState('partielle')   // 'partielle' | 'totale'
    const [mwTotal,    setMwTotal]    = useState('')
    const [bccMW,      setBccMW]      = useState({ 1: 0, 2: 0, 3: 0, 4: 0 })
    const [confirmTxt, setConfirmTxt] = useState('')
    const [emitted,    setEmitted]    = useState(false)

    const CURRENT_SHEDDING = 282   // MW currently being shed by CRC Nord

    const effectiveMW = type === 'totale' ? CURRENT_SHEDDING : (Number(mwTotal) || 0)

    const autoDistribute = (mw) =>
    {
        if (!mw || mw <= 0) { setBccMW({ 1: 0, 2: 0, 3: 0, 4: 0 }); return }
        const b1 = Math.round(mw * 0.37)
        const b2 = Math.round(mw * 0.30)
        const b3 = Math.round(mw * 0.19)
        const b4 = Math.max(0, mw - b1 - b2 - b3)
        setBccMW({ 1: b1, 2: b2, 3: b3, 4: b4 })
    }

    const manualTotal = Object.values(bccMW).reduce((s, v) => s + Number(v), 0)
    const gap         = manualTotal - effectiveMW
    const balanced    = effectiveMW > 0 && Math.abs(gap) < 0.5
    const canEmit     = balanced && confirmTxt.toUpperCase() === 'CONFIRMER'

    const handleTypeChange = (t) =>
    {
        setType(t)
        setConfirmTxt('')
        setEmitted(false)
        if (t === 'totale') autoDistribute(CURRENT_SHEDDING)
        else { setMwTotal(''); setBccMW({ 1: 0, 2: 0, 3: 0, 4: 0 }) }
    }

    const handleEmit = () =>
    {
        if (!canEmit) return
        setEmitted(true)
        if (onEmit) onEmit({ type, mwTotal: effectiveMW, bccMW })
        setTimeout(() => { onClose(); setEmitted(false); setConfirmTxt(''); setMwTotal(''); setType('partielle'); setBccMW({ 1: 0, 2: 0, 3: 0, 4: 0 }) }, 1800)
    }

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-space-md"
            onClick={onClose}
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
                                Ordre de Réalimentation — CRC Nord
                            </h2>
                            <p className="font-mono text-[10px] text-on-surface-variant mt-0.5">
                                Distribution directe aux 4 BCCs — Rétablissement réseau
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-space-xs bg-secondary-container/40 hover:bg-secondary-container text-on-surface-variant transition-colors"
                        type="button"
                    >
                        <Icon name="close" size={17} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto flex flex-col gap-0">

                    {/* Section 1 — Situation réseau */}
                    <div className="px-space-lg py-space-md bg-surface-container-lowest border-b border-surface-container-high">
                        <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider mb-space-sm font-semibold">
                            Situation réseau actuelle — CRC Nord
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-sm font-mono text-xs">
                            {[
                                { label: 'Cible DN',           value: '300,0 MW',          cls: 'text-secondary'       }
                                ,{ label: 'En délestage',      value: `${CURRENT_SHEDDING},0 MW`,  cls: 'text-tertiary font-bold' }
                                ,{ label: 'BCCs en coupure',   value: '42 feeders',        cls: 'text-error'           }
                                ,{ label: 'Tendance réseau',   value: '↑ Stabilisé',       cls: 'text-[#4ade80] font-bold' }
                            ].map(({ label, value, cls }) => (
                                <div key={label} className="bg-surface-container border border-surface-container-high p-space-sm">
                                    <p className="text-[9px] text-on-surface-variant uppercase mb-0.5">{label}</p>
                                    <p className={`text-sm font-bold ${cls}`}>{value}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Section 2 — Type + MW */}
                    <div className="px-space-lg py-space-md border-b border-surface-container-high">
                        <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider mb-space-md font-semibold">
                            Type de réalimentation
                        </p>
                        <div className="grid grid-cols-2 gap-space-sm mb-space-md">
                            {[
                                { key: 'partielle', icon: 'trending_down', title: 'Partielle',           desc: 'Restaurer une partie du réseau, maintenir un délestage résiduel' }
                                ,{ key: 'totale',   icon: 'power',         title: 'Totale — Fin délest.', desc: `Rétablir l'intégralité des ${CURRENT_SHEDDING} MW délestés`       }
                            ].map(({ key, icon, title, desc }) => (
                                <button
                                    key={key}
                                    onClick={() => handleTypeChange(key)}
                                    className={`flex flex-col gap-space-xs p-space-md text-left border transition-all ${type === key ? 'bg-secondary-container/20 border-secondary text-on-surface' : 'bg-surface-container border-surface-container-high text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}`}
                                    type="button"
                                >
                                    <div className="flex items-center gap-space-sm">
                                        <Icon name={icon} size={15} className={type === key ? 'text-secondary' : 'text-on-surface-variant'} />
                                        <span className="font-mono text-xs font-bold uppercase">{title}</span>
                                    </div>
                                    <span className="font-mono text-[10px]">{desc}</span>
                                </button>
                            ))}
                        </div>

                        {/* MW input — partielle only */}
                        {type === 'partielle' && (
                            <div className="flex items-center gap-space-md">
                                <div className="relative flex-1">
                                    <input
                                        type="number"
                                        min={1}
                                        max={CURRENT_SHEDDING}
                                        step={1}
                                        placeholder="Ex: 50"
                                        value={mwTotal}
                                        onChange={(e) =>
                                        {
                                            setMwTotal(e.target.value)
                                            autoDistribute(Number(e.target.value))
                                            setConfirmTxt('')
                                            setEmitted(false)
                                        }}
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
                                            onClick={() => { setMwTotal(v); autoDistribute(v); setConfirmTxt(''); setEmitted(false) }}
                                            className="px-space-md py-space-xs bg-surface-container hover:bg-secondary-container/20 border border-surface-container-high hover:border-secondary/40 text-on-surface-variant hover:text-secondary font-mono text-xs transition-all"
                                            type="button"
                                        >
                                            -{v} MW
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Totale summary */}
                        {type === 'totale' && (
                            <div className="p-space-md bg-[#4ade80]/10 border border-[#4ade80]/30 font-mono text-sm text-[#4ade80] font-bold flex items-center gap-space-md">
                                <Icon name="power" size={20} />
                                <span>FIN DE DÉLESTAGE — Rétablir {CURRENT_SHEDDING} MW sur l'ensemble de CRC Nord</span>
                            </div>
                        )}

                        {/* BCC distribution */}
                        {effectiveMW > 0 && (
                            <div className="mt-space-md flex flex-col gap-space-sm">
                                <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">
                                    <span>Ventilation par BCC</span>
                                    <button
                                        onClick={() => autoDistribute(effectiveMW)}
                                        className="flex items-center gap-space-xs px-space-sm py-space-xs bg-secondary-container hover:bg-secondary text-on-secondary-container font-mono text-[10px] font-bold transition-all"
                                        type="button"
                                    >
                                        <Icon name="auto_fix_high" size={12} />
                                        <span>Suggestion IA (équité)</span>
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-space-sm">
                                    {[
                                        { id: 1, label: 'BCC 1 — Tunis Ville & Nord'    }
                                        ,{ id: 2, label: 'BCC 2 — Tunis Sud & Ben Arous' }
                                        ,{ id: 3, label: 'BCC 3 — Béja / Nord-Ouest'     }
                                        ,{ id: 4, label: 'BCC 4 — Bizerte / Mateur'      }
                                    ].map((b) =>
                                    {
                                        const val = bccMW[b.id] ?? 0
                                        const pct = effectiveMW > 0 ? Math.min(100, (val / effectiveMW) * 100) : 0
                                        return (
                                            <div key={b.id} className="bg-surface-container border border-surface-container-high p-space-sm flex flex-col gap-space-xs">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-sans font-bold text-xs text-on-surface">{b.label}</span>
                                                    <span className="font-mono text-[10px] text-secondary">{val} MW</span>
                                                </div>
                                                <div className="flex items-center gap-space-sm">
                                                    <span className="font-mono text-xs text-on-surface-variant">-</span>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={effectiveMW}
                                                        step={0.5}
                                                        value={val}
                                                        onChange={(e) =>
                                                        {
                                                            setBccMW((prev) => ({ ...prev, [b.id]: Number(e.target.value) }))
                                                            setConfirmTxt('')
                                                            setEmitted(false)
                                                        }}
                                                        className="w-full bg-surface-container-lowest border border-secondary/40 focus:border-secondary text-secondary font-mono text-sm font-bold px-space-sm py-space-xs focus:outline-none"
                                                    />
                                                    <span className="font-mono text-xs text-on-surface-variant">MW</span>
                                                </div>
                                                <div className="w-full bg-surface-container-lowest h-1 overflow-hidden">
                                                    <div className="bg-secondary h-full transition-all" style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                                {/* Balance */}
                                <div className={`p-space-sm flex items-center justify-between font-mono text-xs border ${balanced ? 'bg-[#4ade80]/10 border-[#4ade80]/30 text-[#4ade80]' : 'bg-error-container/20 border-error/40 text-error'}`}>
                                    <div className="flex items-center gap-space-md">
                                        <span className="text-on-surface-variant">Total :</span>
                                        <strong className={`text-sm ${balanced ? 'text-[#4ade80]' : 'text-error'}`}>{manualTotal.toFixed(1)} MW</strong>
                                        <span className="text-on-surface-variant">/ -{effectiveMW} MW requis</span>
                                    </div>
                                    <span className="font-bold text-[10px] uppercase px-space-sm py-0.5">
                                        {balanced ? 'CONFORME' : `ÉCART ${gap > 0 ? '+' : ''}${gap.toFixed(1)} MW`}
                                    </span>
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
                            Action horodatée dans l'audit CRC.
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
                        <span>Ordre horodaté et enregistré dans l'audit CRC à l'émission</span>
                    </div>
                    <div className="flex items-center gap-space-sm">
                        <button
                            onClick={onClose}
                            className="px-space-md py-space-xs bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono text-xs border border-surface-container-high transition-colors"
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
const AI_J1_SUGGESTION = `Analyse historique BCCs CRC Nord (30 derniers jours) :

BCC 1 (Grand Tunis Nord) — Indice équité : 88/100
  → Quote-part proposée : 37% (110 MW sur 300)
  → Motif : Faible sollicitation récente, capacité disponible.

BCC 2 (Tunis Sud) — Indice équité : 91/100
  → Quote-part proposée : 30% (90 MW sur 300)
  → Motif : Charge bien distribuée, aucun départ sur-sollicité.

BCC 3 (Nord-Ouest) — Indice équité : 68/100
  → Quote-part proposée : 19% (58 MW sur 300)
  → Attention : BCC 3 sur-sollicité sur 30j. Réduire si possible.

BCC 4 (Bizerte) — Indice équité : 94/100
  → Quote-part proposée : 14% (42 MW sur 300)
  → Motif : Très peu sollicité récemment, marge disponible.

Total proposé : 300 MW. Équité nationale estimée : 85/100.`

function ProgrammeJ1Modal({ isOpen, onClose })
{
    const fileRef                         = useRef(null)
    const [tab,      setTab]              = useState('manual')
    const [fileName, setFileName]         = useState(null)
    const [error,    setError]            = useState(null)
    const [showAI,   setShowAI]           = useState(false)
    const [sent,     setSent]             = useState(false)
    const [bccMW,    setBccMW]            = useState({ 1: 110, 2: 90, 3: 58, 4: 42 })

    const total  = Object.values(bccMW).reduce((s, v) => s + Number(v), 0)
    const gap    = total - 300
    const ok     = Math.abs(gap) < 0.5

    const tomorrow    = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toLocaleDateString
    (
        'fr-FR'
        ,{ weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }
    )

    const handleFile = (e) =>
    {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.name.match(/\.(csv|xlsx|xls)$/i))
        {
            setError('Format non supporté. Utilisez CSV ou Excel.')
            return
        }
        setFileName(file.name)
        setError(null)
        setSent(false)
    }

    const handleApplyAI = () =>
    {
        setBccMW({ 1: 110, 2: 90, 3: 58, 4: 42 })
        setShowAI(false)
        setSent(false)
    }

    const handleSend = () =>
    {
        setSent(true)
        setTimeout(() => onClose(), 1800)
    }

    if (!isOpen) return null

    const BCC_ROWS_J1 = BCC_STATUS.map((b) => b)

    return (
        <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-space-md"
            onClick={onClose}
        >
            <div
                className="bg-surface-container-low border border-surface-container-high w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-space-lg py-space-md bg-surface-container-lowest border-b border-surface-container-high flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-space-md">
                        <div className="w-8 h-8 bg-surface-container border border-surface-container-high flex items-center justify-center text-secondary">
                            <Icon name="calendar_month" size={20} />
                        </div>
                        <div>
                            <h3 className="font-sans font-bold text-sm text-on-surface uppercase tracking-wide">
                                Programme J+1 — CRC Nord
                            </h3>
                            <span className="font-mono text-[10px] text-on-surface-variant">
                                {tomorrowStr} · Granularité 30 min · 4 BCCs
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-space-xs hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors"
                        type="button"
                    >
                        <Icon name="close" size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex items-center bg-surface-container px-space-md pt-space-xs border-b border-surface-container-high shrink-0">
                    {[
                        { key: 'manual', label: 'Saisie manuelle par BCC'     }
                        ,{ key: 'upload', label: 'Importer fichier (CSV/Excel)' }
                    ].map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setTab(key)}
                            className={`px-space-md py-2 font-mono text-xs border-b-2 transition-colors ${tab === key ? 'text-secondary border-secondary font-bold' : 'text-on-surface-variant border-transparent hover:text-on-surface'}`}
                            type="button"
                        >
                            {label}
                        </button>
                    ))}
                    <div className="ml-auto pb-space-xs font-mono text-[10px] text-on-surface-variant">
                        Total :&nbsp;
                        <strong className={ok ? 'text-secondary' : 'text-error'}>{total} MW</strong>
                        &nbsp;/ 300 MW
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">

                    {tab === 'manual' && (
                        <div className="p-space-md flex flex-col gap-space-md">
                            {/* AI panel */}
                            <div className="bg-surface-container-lowest border border-secondary/30 p-space-sm flex flex-col gap-space-sm">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-space-sm">
                                        <Icon name="smart_toy" size={14} className="text-secondary" />
                                        <span className="font-mono text-[10px] text-secondary uppercase font-semibold">
                                            IA — Répartition équitable J+1
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => setShowAI((v) => !v)}
                                        className="font-mono text-[10px] text-secondary hover:underline"
                                        type="button"
                                    >
                                        {showAI ? 'Masquer analyse' : 'Voir analyse'}
                                    </button>
                                </div>
                                {showAI && (
                                    <pre className="font-mono text-[10px] text-on-surface-variant whitespace-pre-wrap leading-relaxed">
                                        {AI_J1_SUGGESTION}
                                    </pre>
                                )}
                                <button
                                    onClick={handleApplyAI}
                                    className="self-start flex items-center gap-space-xs px-space-md py-space-xs bg-secondary-container hover:bg-secondary text-on-secondary-container font-mono text-xs font-bold transition-all"
                                    type="button"
                                >
                                    <Icon name="auto_fix_high" size={13} />
                                    <span>Appliquer la suggestion IA</span>
                                </button>
                                <p className="font-mono text-[9px] text-on-surface-variant/60 italic">
                                    Suggestion indicative. Modifiez les valeurs si nécessaire.
                                </p>
                            </div>

                            {/* BCC inputs */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                                {BCC_ROWS_J1.map((b) =>
                                {
                                    const val = bccMW[b.id] ?? 0
                                    const pct = ((val / 300) * 100).toFixed(1)
                                    return (
                                        <div key={b.id} className="bg-surface-container border border-surface-container-high p-space-sm flex flex-col gap-space-xs">
                                            <div className="flex items-center justify-between">
                                                <span className="font-sans font-semibold text-xs text-on-surface">{b.full}</span>
                                                <span className="font-mono text-[10px] text-secondary">{pct} %</span>
                                            </div>
                                            <p className="font-mono text-[10px] text-on-surface-variant">{b.sub}</p>
                                            <div className="flex items-center gap-space-sm">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={300}
                                                    step={0.5}
                                                    value={val}
                                                    onChange={(e) =>
                                                    {
                                                        setBccMW((prev) => ({ ...prev, [b.id]: Number(e.target.value) }))
                                                        setSent(false)
                                                    }}
                                                    className="w-24 bg-surface-container-lowest border border-surface-container-high focus:border-secondary text-on-surface font-mono text-sm text-center px-space-sm py-space-xs focus:outline-none transition-all"
                                                />
                                                <span className="font-mono text-xs text-on-surface-variant">MW</span>
                                            </div>
                                            <div className="w-full bg-surface-container-lowest h-1 overflow-hidden">
                                                <div
                                                    className="bg-secondary h-full transition-all"
                                                    style={{ width: `${Math.min(Number(val) / 300 * 100, 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Balance check */}
                            <div className={`flex items-center justify-between px-space-md py-space-sm border font-mono text-xs ${ok ? 'bg-[#4ade80]/10 border-[#4ade80]/30 text-[#4ade80]' : 'bg-error-container/20 border-error/40 text-error'}`}>
                                <span>Total réparti : <strong>{total} MW</strong></span>
                                <span>Cible DN : <strong>300 MW</strong></span>
                                <span>{ok ? 'CONFORME' : `Écart : ${gap.toFixed(1)} MW`}</span>
                            </div>
                        </div>
                    )}

                    {tab === 'upload' && (
                        <div className="p-space-lg flex flex-col gap-space-md">
                            <div
                                className="border-2 border-dashed border-surface-container-high hover:border-secondary/50 p-8 flex flex-col items-center gap-space-md text-center cursor-pointer hover:bg-surface-container/20 transition-all"
                                onClick={() => fileRef.current?.click()}
                            >
                                <Icon name="cloud_upload" size={40} className="text-on-surface-variant" />
                                <div>
                                    <p className="font-sans font-semibold text-sm text-on-surface">Glissez-déposez ou cliquez pour parcourir</p>
                                    <p className="font-mono text-[10px] text-on-surface-variant mt-1">Formats : CSV, Excel (.xlsx, .xls)</p>
                                </div>
                                {fileName && (
                                    <div className="flex items-center gap-space-sm px-space-md py-space-sm bg-surface-container border border-secondary/40">
                                        <Icon name="description" size={14} className="text-secondary" />
                                        <span className="font-mono text-xs text-secondary font-semibold">{fileName}</span>
                                        <Icon name="check_circle" size={13} className="text-[#4ade80]" />
                                    </div>
                                )}
                                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
                            </div>
                            {error && (
                                <div className="flex items-center gap-space-sm px-space-md py-space-sm bg-error-container/30 border border-error/50 font-mono text-xs text-error">
                                    <Icon name="error" size={13} />
                                    <span>{error}</span>
                                </div>
                            )}
                            <div className="bg-surface-container-lowest border border-surface-container-high p-space-md font-mono text-xs text-on-surface-variant">
                                <p className="text-on-surface font-semibold mb-space-xs">Format CSV attendu :</p>
                                <p className="text-secondary">bcc_id,heure,mw_planifie</p>
                                <p>bcc1,00:00,110</p>
                                <p>bcc2,00:00,90</p>
                                <p>bcc3,00:00,58</p>
                                <p>bcc4,00:00,42</p>
                                <p className="text-on-surface-variant mt-space-xs">... (48 créneaux × 4 BCCs)</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-space-lg py-space-md bg-surface-container border-t border-surface-container-high flex items-center justify-between shrink-0">
                    <div className="font-mono text-[10px] text-on-surface-variant flex items-center gap-space-xs">
                        <Icon name="info" size={12} className="text-secondary" />
                        <span>Après validation, le programme sera transmis aux 4 BCCs rattachés.</span>
                    </div>
                    <div className="flex items-center gap-space-sm">
                        <button
                            onClick={onClose}
                            className="px-space-md py-space-xs bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono text-xs border border-surface-container-high transition-colors"
                            type="button"
                        >
                            Annuler
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={(tab === 'upload' && !fileName) || (tab === 'manual' && !ok)}
                            className="flex items-center gap-space-xs px-space-md py-space-xs bg-secondary-container text-on-secondary-container font-mono text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            type="button"
                        >
                            {sent
                                ? <><Icon name="check_circle" size={13} className="text-[#4ade80]" /><span>Programme validé !</span></>
                                : <><Icon name="send" size={13} /><span>Valider et envoyer aux BCCs</span></>
                            }
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── AI slide panel ────────────────────────────────────────────────────────────
function AiPanel({ isOpen, onClose })
{
    const [input, setInput] = useState('')
    const [msgs,  setMsgs]  = useState
    (
        [
            {
                role: 'system'
                ,text: `Analyse CRC Nord — Déficit -18,0 MW (14h32)\n\nBCC 3 sous-réalisé suite avarie D22 Béja.\nCompensations disponibles BCC 2 (+4 MW) et BCC 4 (+8 MW).\nGain estimé : +12 MW en 8 minutes.`
            }
        ]
    )

    const send = () =>
    {
        if (!input.trim()) return
        setMsgs
        (
            (m) =>
            [
                ...m
                ,{ role: 'user',   text: input }
                ,{ role: 'system', text: 'Analyse en cours sur réseau Nord… Transit HTB admissible sur Radès–Mornaguia. Aucun goulot détecté.' }
            ]
        )
        setInput('')
    }

    return (
        <div
            className={`fixed top-14 bottom-8 right-0 w-96 max-w-[90vw] bg-surface-container-low shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out border-l border-surface-container-high ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        >
            <div className="p-space-md bg-surface-container flex items-center justify-between border-b border-surface-container-high shrink-0">
                <div className="flex items-center gap-space-sm">
                    <div className="w-7 h-7 bg-secondary-container/30 border border-secondary/40 flex items-center justify-center text-secondary">
                        <Icon name="smart_toy" size={18} />
                    </div>
                    <div>
                        <span className="font-sans font-bold text-xs text-on-surface uppercase">Analyse IA — CRC Nord</span>
                        <p className="font-mono text-[9px] text-secondary">MODÈLE ÉNERGÉTIQUE OP-LLM 2.5</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-space-xs hover:bg-surface-container-high text-on-surface-variant transition-colors"
                    type="button"
                >
                    <Icon name="close" size={18} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-space-md flex flex-col gap-space-sm">
                {msgs.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[90%] p-space-sm font-mono text-[10px] leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-secondary-container/20 border border-secondary/30 text-on-surface' : 'bg-surface-container-lowest border border-surface-container-high text-on-surface-variant'}`}>
                            {m.role === 'system' && (
                                <span className="text-secondary font-bold text-[9px] block mb-0.5 uppercase">Rapport téléconduite</span>
                            )}
                            {m.text}
                        </div>
                    </div>
                ))}
            </div>
            <div className="p-space-sm bg-surface-container border-t border-surface-container-high flex flex-col gap-space-xs shrink-0">
                <div className="flex items-center gap-space-xs">
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') send() }}
                        placeholder="Poser une question opérationnelle..."
                        className="flex-1 bg-surface-container-lowest border border-surface-container-high px-space-sm py-space-xs font-mono text-xs text-on-surface focus:border-secondary focus:outline-none"
                    />
                    <button
                        onClick={send}
                        className="p-space-xs bg-secondary-container hover:bg-secondary text-on-secondary-container border border-secondary transition-colors"
                        type="button"
                    >
                        <Icon name="send" size={16} />
                    </button>
                </div>
                <p className="font-mono text-[9px] text-on-surface-variant text-center">
                    Suggestions IA indicatives. Décisions à l'opérateur CRC.
                </p>
            </div>
        </div>
    )
}

// ── CRC Urgence modal ─────────────────────────────────────────────────────────
// Two behaviours:
//   • Has active urgences  → shows the dispatch tool for the first pending/acknowledged order
//   • No urgences          → manual urgence entry (CRC-initiated, distributes direct to BCCs)

const BCC_URGENCE_CONFIG =
[
    { id: 1, label: 'BCC 1 — Tunis Ville & Nord',    cap: null, color: 'secondary' }
    ,{ id: 2, label: 'BCC 2 — Tunis Sud & Ben Arous', cap: null, color: 'secondary' }
    ,{ id: 3, label: 'BCC 3 — Béja (Plafond 8 MW)',   cap: 8,    color: 'tertiary'  }
    ,{ id: 4, label: 'BCC 4 — Bizerte / Mateur',      cap: null, color: 'secondary' }
]

function CRCUrgenceModal({ isOpen, onClose, myUrgences, onReceipt, onDispatch })
{
    // ── Order navigation ──────────────────────────────────────────────────────
    // activeOrders = all non-dispatched urgences (pending or acknowledged)
    // The user navigates between them with prev/next arrows
    const [orderIdx, setOrderIdx] = useState(0)

    // Keep idx in bounds when orders change (e.g. one gets dispatched)
    const safeIdx    = Math.min(orderIdx, Math.max(0, myUrgences.length - 1))
    const activeOrder = myUrgences[safeIdx] ?? null
    const total      = myUrgences.length

    // Per-order dispatch state — keyed by order id so each order remembers its own inputs
    const [dispStateMap, setDispStateMap] = useState({})
    const [sentId,       setSentId]       = useState(null)

    // Get or lazily-init dispatch state for a given order
    const getDispState = (order) =>
    {
        if (!order) return null
        if (dispStateMap[order.id]) return dispStateMap[order.id]
        const mw = order.mwNord
        const b1 = Math.round(mw * 0.33)
        const b2 = Math.round(mw * 0.26)
        const b3 = Math.min(8, Math.round(mw * 0.15))
        const b4 = Math.max(0, mw - b1 - b2 - b3)
        return { 1: b1, 2: b2, 3: b3, 4: b4 }
    }

    const dispBccMW  = activeOrder ? (dispStateMap[activeOrder.id] ?? getDispState(activeOrder)) : null

    const setDispBccMW = (id, updater) =>
    {
        setDispStateMap
        (
            (prev) =>
            {
                const current = prev[id] ?? getDispState(myUrgences.find((o) => o.id === id))
                const next    = typeof updater === 'function' ? updater(current) : updater
                return { ...prev, [id]: next }
            }
        )
    }

    const applyAiSuggestion = (order) =>
    {
        if (!order) return
        setDispStateMap((prev) => ({ ...prev, [order.id]: getDispState(order) }))
    }

    const dispTotal  = dispBccMW ? Object.values(dispBccMW).reduce((s, v) => s + Number(v), 0) : 0
    const dispTarget = activeOrder?.mwNord ?? 0
    const dispGap    = dispTotal - dispTarget
    const dispOk     = Math.abs(dispGap) < 0.5

    const handleDispatch = () =>
    {
        if (!activeOrder) return
        setSentId(activeOrder.id)
        if (activeOrder.status === 'pending') onReceipt(activeOrder.id)
        setTimeout
        (
            () =>
            {
                onDispatch(activeOrder.id)
                setSentId(null)
                // After dispatching, move to next order if exists, else close
                const remaining = myUrgences.filter((o) => o.id !== activeOrder.id)
                if (remaining.length === 0)
                {
                    onClose()
                }
                else
                {
                    setOrderIdx(Math.min(safeIdx, remaining.length - 1))
                }
            }
            ,1500
        )
    }

    // ── Manual mode (no active urgences) ─────────────────────────────────────
    const [mwTotal,    setMwTotal]    = useState('')
    const [bccMW,      setBccMW]      = useState({ 1: 0, 2: 0, 3: 0, 4: 0 })
    const [confirmTxt, setConfirmTxt] = useState('')
    const [emitted,    setEmitted]    = useState(false)

    const autoDistribute = (tot) =>
    {
        const mw = Number(tot)
        if (!mw || mw <= 0) { setBccMW({ 1: 0, 2: 0, 3: 0, 4: 0 }); return }
        const b1 = Math.round(mw * 0.33)
        const b2 = Math.round(mw * 0.26)
        const b3 = Math.min(8, Math.round(mw * 0.15))
        const b4 = Math.max(0, mw - b1 - b2 - b3)
        setBccMW({ 1: b1, 2: b2, 3: b3, 4: b4 })
    }

    const manualTotal = Object.values(bccMW).reduce((s, v) => s + Number(v), 0)
    const manualGap   = mwTotal ? manualTotal - Number(mwTotal) : null
    const manualOk    = mwTotal && Number(mwTotal) > 0 && manualGap !== null && Math.abs(manualGap) < 0.5 && confirmTxt.toUpperCase() === 'CONFIRMER'

    const handleManualEmit = () =>
    {
        setEmitted(true)
        setTimeout(() => { setEmitted(false); setConfirmTxt(''); setMwTotal(''); onClose() }, 1800)
    }

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-space-md"
            onClick={onClose}
        >
            <div
                className="bg-surface-container-low w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden ring-2 ring-error"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-space-lg py-space-md bg-error-container shrink-0">
                    <div className="flex items-center gap-space-md min-w-0">
                        <div className="w-8 h-8 bg-surface-container-lowest flex items-center justify-center text-error animate-bounce shrink-0">
                            <Icon name="bolt" size={20} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-space-sm flex-wrap">
                                <span className="font-sans font-bold text-sm text-on-error-container uppercase tracking-wider">
                                    {activeOrder ? 'Ordre d\'urgence DN — Distribution BCCs' : 'Délestage d\'urgence CRC'}
                                </span>
                                {activeOrder && (
                                    <span className="px-space-xs py-0.5 bg-surface-container-lowest text-error font-mono text-[10px] font-bold">
                                        {activeOrder.orderRef}
                                    </span>
                                )}
                            </div>
                            <span className="font-mono text-[10px] text-on-error-container/80">
                                {activeOrder
                                    ? `Reçu à ${activeOrder.time} · +${activeOrder.mwNord} MW requis`
                                    : 'Distribution directe aux BCCs — CRC Nord'
                                }
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-space-md shrink-0">
                        {/* Order counter + navigation — only shown when multiple orders */}
                        {total > 1 && (
                            <div className="flex items-center gap-space-xs bg-surface-container-lowest/60 px-space-sm py-space-xs">
                                <button
                                    onClick={() => setOrderIdx((i) => Math.max(0, i - 1))}
                                    disabled={safeIdx === 0}
                                    className="p-space-xs text-on-error-container/80 hover:text-on-error-container disabled:opacity-30 transition-colors"
                                    type="button"
                                    title="Ordre précédent"
                                >
                                    <Icon name="chevron_left" size={16} />
                                </button>
                                <span className="font-mono text-[11px] font-bold text-on-error-container">
                                    Ordre {safeIdx + 1} / {total}
                                </span>
                                <button
                                    onClick={() => setOrderIdx((i) => Math.min(total - 1, i + 1))}
                                    disabled={safeIdx === total - 1}
                                    className="p-space-xs text-on-error-container/80 hover:text-on-error-container disabled:opacity-30 transition-colors"
                                    type="button"
                                    title="Ordre suivant"
                                >
                                    <Icon name="chevron_right" size={16} />
                                </button>
                            </div>
                        )}
                        <button
                            onClick={onClose}
                            className="p-space-xs bg-error-container/60 hover:bg-error-container text-on-error-container transition-colors"
                            type="button"
                        >
                            <Icon name="close" size={17} />
                        </button>
                    </div>
                </div>

                {/* Pending orders summary strip — shown when multiple orders exist */}
                {total > 1 && (
                    <div className="flex items-center gap-space-xs px-space-lg py-space-xs bg-error-container/20 border-b border-error-container/40 overflow-x-auto shrink-0">
                        <span className="font-mono text-[10px] text-on-surface-variant uppercase shrink-0">
                            {total} ordres en attente :
                        </span>
                        {myUrgences.map((o, idx) => (
                            <button
                                key={o.id}
                                onClick={() => setOrderIdx(idx)}
                                className={`flex items-center gap-space-xs px-space-sm py-space-xs font-mono text-[10px] font-bold shrink-0 transition-colors ${idx === safeIdx ? 'bg-error text-background' : 'bg-surface-container text-on-surface-variant hover:text-on-surface border border-surface-container-high'}`}
                                type="button"
                            >
                                <span>{o.orderRef}</span>
                                <span className="font-normal opacity-70">+{o.mwNord} MW</span>
                                <span className={`w-1.5 h-1.5 rounded-full ${o.status === 'pending' ? 'bg-error animate-ping' : 'bg-tertiary'}`} />
                            </button>
                        ))}
                    </div>
                )}

                {/* Body */}
                <div className="flex-1 overflow-y-auto bg-surface-container-lowest p-space-lg flex flex-col gap-space-md">

                    {/* ── MODE A: Active urgence from DN ── */}
                    {activeOrder && (
                        <>
                            {/* MW summary */}
                            <div className="bg-surface-container p-space-md flex flex-wrap items-center justify-between gap-space-md">
                                <div className="flex flex-col">
                                    <span className="font-mono text-[10px] text-on-surface-variant uppercase">Consigne additionnelle</span>
                                    <div className="flex items-baseline gap-space-xs mt-space-xs">
                                        <span className="font-mono text-3xl font-bold text-error">+{activeOrder.mwNord}</span>
                                        <span className="font-mono text-sm text-on-surface-variant">MW</span>
                                    </div>
                                </div>
                                <div className="flex flex-col text-right">
                                    <span className="font-mono text-[10px] text-on-surface-variant uppercase">Nouvelle consigne CRC</span>
                                    <div className="flex items-baseline gap-space-xs justify-end mt-space-xs">
                                        <span className="font-mono text-3xl font-bold text-secondary">{300 + activeOrder.mwNord}</span>
                                        <span className="font-mono text-sm text-on-surface-variant">MW</span>
                                    </div>
                                </div>
                            </div>

                            {/* BCC inputs */}
                            {dispBccMW && (
                                <div className="flex flex-col gap-space-sm">
                                    <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">
                                        <span>Ventilation par BCC</span>
                                        <div className="flex items-center gap-space-sm">
                                            <button
                                                onClick={() => applyAiSuggestion(activeOrder)}
                                                className="flex items-center gap-space-xs px-space-sm py-space-xs bg-secondary-container hover:bg-secondary text-on-secondary-container font-mono text-[10px] font-bold transition-all"
                                                type="button"
                                            >
                                                <Icon name="auto_fix_high" size={12} />
                                                <span>Suggestion IA</span>
                                            </button>
                                            <span>Objectif : +{activeOrder.mwNord} MW</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                                        {BCC_URGENCE_CONFIG.map((b) =>
                                        {
                                            const val     = dispBccMW[b.id] ?? 0
                                            const pct     = Math.min(100, (val / activeOrder.mwNord) * 100)
                                            const capWarn = b.cap !== null && val > b.cap
                                            return (
                                                <div key={b.id} className={`bg-surface-container p-space-sm flex flex-col gap-space-xs ${capWarn ? 'ring-1 ring-error' : ''}`}>
                                                    <div className="flex items-center justify-between">
                                                        <span className={`font-sans font-bold text-xs ${capWarn ? 'text-error' : 'text-on-surface'}`}>{b.label}</span>
                                                        <span className={`font-mono text-[10px] ${capWarn ? 'text-error font-bold' : 'text-on-surface-variant'}`}>
                                                            {capWarn ? `MAX ${b.cap} MW` : `${val} MW`}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-space-sm">
                                                        <span className="font-mono text-xs text-on-surface-variant">+</span>
                                                        <input
                                                            type="number" min={0} max={b.cap ?? activeOrder.mwNord} step={0.5}
                                                            value={val}
                                                            onChange={(e) => setDispBccMW(activeOrder.id, (prev) => ({ ...prev, [b.id]: Number(e.target.value) }))}
                                                            className={`w-full bg-surface-container-lowest border focus:outline-none px-space-sm py-space-xs font-mono text-sm font-bold transition-all ${capWarn ? 'border-error text-error' : `border-surface-container-high focus:border-secondary ${b.color === 'tertiary' ? 'text-tertiary' : 'text-secondary'}`}`}
                                                        />
                                                        <span className="font-mono text-xs text-on-surface-variant">MW</span>
                                                    </div>
                                                    <div className="w-full bg-surface-container-lowest h-1 overflow-hidden">
                                                        <div className={`h-full transition-all ${capWarn ? 'bg-error' : b.color === 'tertiary' ? 'bg-tertiary' : 'bg-secondary'}`} style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div className={`p-space-sm flex items-center justify-between font-mono text-xs border ${dispOk ? 'bg-[#4ade80]/10 border-[#4ade80]/30 text-[#4ade80]' : 'bg-error-container/30 border-error/40 text-error'}`}>
                                        <div className="flex items-center gap-space-md">
                                            <span className="text-on-surface-variant">Total :</span>
                                            <strong className={`text-sm ${dispOk ? 'text-[#4ade80]' : 'text-error'}`}>{dispTotal.toFixed(1)} MW</strong>
                                            <span className="text-on-surface-variant">/ +{dispTarget} MW requis</span>
                                        </div>
                                        <span className="font-bold text-[10px] uppercase px-space-sm py-0.5">
                                            {dispOk ? 'CONFORME' : `ÉCART ${dispGap > 0 ? '+' : ''}${dispGap.toFixed(1)} MW`}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* ── MODE B: No active urgence — manual CRC entry ── */}
                    {!activeOrder && (
                        <>
                            <div className="bg-surface-container p-space-md flex flex-col gap-space-sm">
                                <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">
                                    Puissance supplémentaire à délester (CRC Nord)
                                </span>
                                <div className="flex items-center gap-space-md">
                                    <div className="relative flex-1">
                                        <input
                                            type="number" min={1} max={200} step={1}
                                            placeholder="Ex: 30"
                                            value={mwTotal}
                                            onChange={(e) => { setMwTotal(e.target.value); autoDistribute(e.target.value); setEmitted(false) }}
                                            className="w-full bg-surface-container-lowest border-2 border-error-container/60 focus:border-error-container text-on-surface font-mono text-2xl font-bold px-space-md py-space-md focus:outline-none transition-all text-center"
                                        />
                                        <span className="absolute right-space-md top-1/2 -translate-y-1/2 font-mono text-sm text-on-surface-variant font-semibold">MW</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        {[10, 20, 30, 50].map((v) => (
                                            <button key={v} onClick={() => { setMwTotal(v); autoDistribute(v) }}
                                                className="px-space-md py-space-xs bg-surface-container hover:bg-error-container/30 border border-surface-container-high hover:border-error-container/50 text-on-surface-variant hover:text-on-error-container font-mono text-xs transition-all"
                                                type="button"
                                            >+{v} MW</button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {mwTotal && Number(mwTotal) > 0 && (
                                <div className="flex flex-col gap-space-sm">
                                    <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">
                                        <span>Ventilation par BCC</span>
                                        <button onClick={() => autoDistribute(mwTotal)}
                                            className="flex items-center gap-space-xs px-space-sm py-space-xs bg-secondary-container hover:bg-secondary text-on-secondary-container font-mono text-[10px] font-bold transition-all"
                                            type="button"
                                        >
                                            <Icon name="auto_fix_high" size={12} />
                                            <span>Suggestion IA</span>
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                                        {BCC_URGENCE_CONFIG.map((b) =>
                                        {
                                            const val     = bccMW[b.id] ?? 0
                                            const tot     = Number(mwTotal)
                                            const pct     = tot > 0 ? Math.min(100, (val / tot) * 100) : 0
                                            const capWarn = b.cap !== null && val > b.cap
                                            return (
                                                <div key={b.id} className={`bg-surface-container p-space-sm flex flex-col gap-space-xs ${capWarn ? 'ring-1 ring-error' : ''}`}>
                                                    <div className="flex items-center justify-between">
                                                        <span className={`font-sans font-bold text-xs ${capWarn ? 'text-error' : 'text-on-surface'}`}>{b.label}</span>
                                                        <span className={`font-mono text-[10px] ${capWarn ? 'text-error font-bold' : 'text-on-surface-variant'}`}>
                                                            {capWarn ? `MAX ${b.cap} MW` : `${val} MW`}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-space-sm">
                                                        <span className="font-mono text-xs text-on-surface-variant">+</span>
                                                        <input
                                                            type="number" min={0} max={b.cap ?? Number(mwTotal)} step={0.5}
                                                            value={val}
                                                            onChange={(e) => setBccMW((prev) => ({ ...prev, [b.id]: Number(e.target.value) }))}
                                                            className={`w-full bg-surface-container-lowest border focus:outline-none px-space-sm py-space-xs font-mono text-sm font-bold transition-all ${capWarn ? 'border-error text-error' : `border-surface-container-high focus:border-secondary ${b.color === 'tertiary' ? 'text-tertiary' : 'text-secondary'}`}`}
                                                        />
                                                        <span className="font-mono text-xs text-on-surface-variant">MW</span>
                                                    </div>
                                                    <div className="w-full bg-surface-container-lowest h-1 overflow-hidden">
                                                        <div className={`h-full transition-all ${capWarn ? 'bg-error' : b.color === 'tertiary' ? 'bg-tertiary' : 'bg-secondary'}`} style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div className={`p-space-sm flex items-center justify-between font-mono text-xs border ${Math.abs(manualGap ?? 999) < 0.5 ? 'bg-[#4ade80]/10 border-[#4ade80]/30 text-[#4ade80]' : 'bg-error-container/30 border-error/40 text-error'}`}>
                                        <div className="flex items-center gap-space-md">
                                            <span className="text-on-surface-variant">Total :</span>
                                            <strong className={`text-sm ${Math.abs(manualGap ?? 999) < 0.5 ? 'text-[#4ade80]' : 'text-error'}`}>{manualTotal.toFixed(1)} MW</strong>
                                            <span className="text-on-surface-variant">/ +{mwTotal} MW requis</span>
                                        </div>
                                        <span className="font-bold text-[10px] uppercase px-space-sm py-0.5">
                                            {Math.abs(manualGap ?? 999) < 0.5 ? 'CONFORME' : `ÉCART ${(manualGap ?? 0) > 0 ? '+' : ''}${(manualGap ?? 0).toFixed(1)} MW`}
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-space-xs">
                                        <p className="font-sans text-xs text-on-surface-variant">
                                            Tapez <strong className="text-error font-mono">CONFIRMER</strong> pour autoriser l'émission de l'ordre.
                                        </p>
                                        <input
                                            type="text" placeholder="Tapez CONFIRMER"
                                            value={confirmTxt}
                                            onChange={(e) => setConfirmTxt(e.target.value)}
                                            className="w-full bg-surface-container-lowest border border-surface-container-high focus:border-error-container text-on-surface font-mono text-sm px-space-md py-space-sm focus:outline-none transition-all tracking-widest"
                                        />
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-space-lg py-space-md bg-surface-container border-t border-surface-container-high flex items-center justify-between shrink-0 flex-wrap gap-space-md">
                    <div className="flex items-center gap-space-xs font-mono text-[10px] text-on-surface-variant">
                        <Icon name="lock" size={13} className="text-tertiary" />
                        <span>Ordre horodaté dans l'audit CRC · Action irréversible</span>
                    </div>
                    <div className="flex items-center gap-space-sm">
                        <button
                            onClick={onClose}
                            className="px-space-md py-space-xs bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono text-xs border border-surface-container-high transition-colors"
                            type="button"
                        >
                            {activeOrder ? 'Fermer' : 'Annuler'}
                        </button>
                        {activeOrder
                            ? (
                                <button
                                    onClick={handleDispatch}
                                    disabled={!dispOk || sentId === activeOrder?.id}
                                    className="flex items-center gap-space-sm px-space-lg py-space-xs bg-error text-background hover:bg-error-container hover:text-on-error-container font-mono text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                                    type="button"
                                >
                                    {sentId === activeOrder?.id
                                        ? <><Icon name="check_circle" size={14} className="text-[#4ade80]" /><span>Transmis aux BCCs !</span></>
                                        : <><Icon name="broadcast_on_personal" size={14} /><span>Envoyer aux 4 BCCs</span>{total > 1 && safeIdx < total - 1 && <span className="opacity-70 font-normal">→ Ordre suivant</span>}</>
                                    }
                                </button>
                            )
                            : (
                                <button
                                    onClick={handleManualEmit}
                                    disabled={!manualOk || emitted}
                                    className="flex items-center gap-space-sm px-space-lg py-space-xs bg-error text-background hover:bg-error-container hover:text-on-error-container font-mono text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                                    type="button"
                                >
                                    {emitted
                                        ? <><Icon name="check_circle" size={14} className="text-[#4ade80]" /><span>Ordre émis !</span></>
                                        : <><Icon name="bolt" size={14} /><span>Émettre l'ordre d'urgence</span></>
                                    }
                                </button>
                            )
                        }
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CRCDashboard()
{
    const { user }                          = useAuthStore()
    const { urgences, acknowledgeReceipt, dispatchComplete, setModalOpen } = useUrgenceStore()
    const userCRC    = user?.zone ?? 'CRC Nord'
    const { data: dbData, loading: dbLoading, lastUpdated } = useCRCDashboard(userCRC)

    // Live orders from DB/WebSocket — filtered to orders targeting this CRC
    const { orders, updateOrderStatus } = useLiveStore()
    const crcId = dbData?.crcSummary?.crc_id ?? null

    // Live timeseries for regional chart — filtered to this CRC's BCCs
    const { slots: tsSlots } = useTimeseries(crcId)
    const crcChartPts = tsSlots.length > 0 ? slotsToChartPtsCRC(tsSlots) : CRC_CHART_FALLBACK
    const liveOrders = orders.filter(
        (o) => ['pending','acknowledged','executing'].includes(o.status)
              && (o.target_crc_id === null || o.target_crc_id === crcId)
    )

    // Acknowledge an order (step 1 — presses "Reçu")
    const handleAckOrder = async (orderId) => {
        // Update legacy urgenceStore for popup compatibility
        acknowledgeReceipt(orderId)
        // Update liveStore immediately for instant UI feedback
        updateOrderStatus(orderId, 'acknowledged')
        try {
            await api.patch(`/api/v1/orders/${orderId}/ack`, {
                mw_assigned: 0,   // CRC assigns MW to BCCs separately
            })
        } catch (err) {
            console.error('[CRC] Failed to ack order:', err?.response?.data ?? err.message)
        }
    }

    // Dispatch complete (step 2 — CRC has split MW to BCCs and confirmed)
    const handleDispatchOrder = async (orderId) => {
        dispatchComplete(orderId)
        updateOrderStatus(orderId, 'executing')
        try {
            await api.patch(`/api/v1/orders/${orderId}/execute`, {
                mw_executed: 0,   // actual MW confirmed once BCCs report back
            })
        } catch (err) {
            console.error('[CRC] Failed to mark order executing:', err?.response?.data ?? err.message)
        }
    }

    // ── Derived from API or static fallback ───────────────────────────────────
    const crcReal    = dbData?.crcSummary?.realise  ?? 282.0
    const crcCons    = dbData?.crcSummary?.consigne ?? 300.0
    const crcEcart   = dbData?.crcSummary?.ecart    ?? -18.0
    const crcPct     = crcCons > 0 ? ((crcReal / crcCons) * 100).toFixed(1) : '0'
    const liveCuts   = dbData?.liveCuts  ?? []
    const bccRowsApi = dbData?.bccRows   ?? []
    const totalCuts  = liveCuts.length
    const overdueCuts= liveCuts.filter((c) => c.overdue)

    // Build BCC_STATUS from API — empty array when API has no data (no fake fallback)
    const bccStatusDynamic = bccRowsApi.length > 0
        ? bccRowsApi.map((b, i) => ({
            id:       i + 1
            ,label:   b.name.replace('BCC ', 'BCC ') + ' — ' + (b.zone?.split('/')[0]?.trim() ?? '')
            ,full:    `${b.name} — ${b.zone}`
            ,sub:     `Consigne: ${b.consigne} MW`
            ,consigne: b.consigne
            ,realise:  b.realise
            ,pct:      b.consigne > 0 ? (b.realise / b.consigne * 100) : 0
            ,dot:      b.statut === 'CRITIQUE' || b.statut === 'SOUS-CONSIGNE' ? 'bg-error' : b.statut === 'ATTENTION' ? 'bg-tertiary' : 'bg-[#4ade80]'
            ,dotAnim:  b.statut === 'CRITIQUE' ? 'animate-ping' : b.statut === 'SOUS-CONSIGNE' ? 'animate-pulse' : ''
            ,barCls:   b.statut === 'CRITIQUE' || b.statut === 'SOUS-CONSIGNE' ? 'bg-error' : 'bg-secondary'
            ,note:     b.statut === 'CRITIQUE' ? `${b.ecart.toFixed(1)} MW` : b.statut === 'ATTENTION' ? `${b.ecart.toFixed(1)} MW` : `${(b.realise / b.consigne * 100).toFixed(0)}%`
            ,noteCls:  b.statut === 'CRITIQUE' || b.statut === 'SOUS-CONSIGNE' ? 'text-error font-bold' : b.statut === 'ATTENTION' ? 'text-tertiary' : 'text-[#4ade80]'
        }))
        : []   // loading state — empty, shows spinner below

    // Build live cuts table from API — empty array when no data (no fake fallback)
    const cutsTableDynamic = liveCuts.length > 0
        ? liveCuts.map((c, i) => ({
            id:        i + 1
            ,bcc:      c.bcc_name
            ,bccShort: `${c.bcc_name} (${c.bcc_name.replace('BCC ', '').split(' ')[0]})`
            ,ref:      c.feeder_ref
            ,poste:    `${c.bcc_name.toUpperCase()} / ${c.feeder_nom}`
            ,debut:    c.started_at
            ,dur:      Math.round(c.elapsed_min)
            ,mw:       c.mw_shed
            ,statut:   c.overdue ? 'overdue' : 'ok'
        }))
        : []   // loading state — empty, no fake data shown

    const [time,         setTime]           = useState(new Date())
    const [j1Open,       setJ1Open]         = useState(false)
    const [aiOpen,       setAiOpen]         = useState(false)
    const [urgenceOpen,  setUrgenceOpen]    = useState(false)
    const [realimOpen,   setRealimOpen]     = useState(false)
    const [expanded,   setExpanded]         = useState({ bcc3: true })
    const [filterBCC,  setFilterBCC]        = useState('all')
    const [sortDesc,   setSortDesc]         = useState(true)
    const [page,       setPage]             = useState(1)
    const ROWS_PER_PAGE = 5

    // Active urgences for this CRC — merge legacy urgenceStore + live DB orders
    const myUrgences = [
        // DB-persisted orders from liveStore (WebSocket / REST)
        ...liveOrders
            .filter((o) => o.order_type === 'urgence')
            .map((o) => ({
                id:        o.id,
                orderRef:  o.order_ref,
                mwTotal:   o.mw_total,
                mwNord:    o.mw_nord,
                mwSud:     o.mw_sud,
                status:    o.status,
                targetCRC: o.target_crc_id === null ? 'both' : userCRC,
                isDbOrder: true,   // flag so handlers use DB path
            })),
        // Legacy localStorage orders (fallback for orders not yet in DB)
        ...urgences
            .filter((o) => o.targetCRC === 'both' || o.targetCRC === userCRC)
            .filter((o) => !liveOrders.find((lo) => lo.order_ref === o.orderRef)),
    ]
    const hasUrgence = myUrgences.length > 0

    // Live clock
    useEffect
    (
        () =>
        {
            const t = setInterval(() => setTime(new Date()), 1000)
            return () => clearInterval(t)
        }
        ,[]
    )

    const pad     = (n) => String(n).padStart(2, '0')
    const timeStr = `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())} UTC+1`

    const toggleBCC = (id) =>
        setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))

    // Cuts table logic — wired to live API data, fallback to static CUTS_DATA
    const filtered = cutsTableDynamic
        .filter((c) => filterBCC === 'all' || c.bcc === filterBCC)
        .sort((a, b) => sortDesc ? b.dur - a.dur : a.dur - b.dur)

    const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE))
    const paged      = filtered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)
    const uniqueBCCs = [...new Set(cutsTableDynamic.map((c) => c.bcc))].sort()

    return (
        <div className="flex flex-col w-full text-on-surface">

            {/* ── SECTION 1 — Top context bar ─────────────────────────────── */}
            <div className="flex flex-col gap-space-xs">
                <div className="bg-surface-container-low p-space-md flex flex-wrap items-center justify-between gap-space-md shadow-md">
                    {/* Left: CRC ident */}
                    <div className="flex items-center gap-space-lg flex-wrap">
                        <div className="flex items-center gap-space-sm bg-surface-container-lowest px-space-md py-space-xs">
                            <span className="w-2.5 h-2.5 rounded-full bg-tertiary animate-ping" />
                            <span className="font-mono font-bold text-sm text-secondary tracking-wide uppercase">CRC NORD</span>
                            <span className="text-on-surface-variant font-mono text-xs">/ GRAND TUNIS &amp; NORD</span>
                        </div>
                        <div className="flex items-center gap-space-xs font-mono text-xs text-primary">
                            <Icon name="schedule" size={15} className="text-secondary" />
                            <span>{timeStr}</span>
                            <span className="text-on-surface-variant text-[10px]">· POSTE SOURCE RADÈS II</span>
                        </div>
                        <div className="flex items-center gap-space-xs px-space-sm py-0.5 bg-surface-container font-mono text-[10px] text-on-surface">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
                            <span>SCADA IEC-60870-5-104 OPÉRATIONNEL</span>
                        </div>
                    </div>

                    {/* Right: action buttons */}
                    <div className="flex items-center gap-space-md flex-wrap">
                        <button
                            onClick={() => setJ1Open(true)}
                            className="flex items-center gap-space-xs px-space-md py-space-xs bg-surface-container-high hover:bg-surface-container-highest text-secondary font-mono text-xs transition-colors whitespace-nowrap"
                            type="button"
                        >
                            <Icon name="calendar_month" size={15} />
                            <span>Programme J+1</span>
                        </button>
                        <button
                            onClick={() => setAiOpen(true)}
                            className="flex items-center gap-space-xs px-space-md py-space-xs bg-secondary-container/30 hover:bg-secondary-container/60 text-secondary border border-secondary/40 font-mono text-xs transition-colors whitespace-nowrap"
                            type="button"
                        >
                            <Icon name="smart_toy" size={15} />
                            <span>Assistant IA</span>
                        </button>
                        <button
                            onClick={() => { setUrgenceOpen(true); setModalOpen(true) }}
                            className={`flex items-center gap-space-xs px-space-md py-space-xs font-mono text-xs font-bold transition-colors whitespace-nowrap ${hasUrgence ? 'bg-error-container text-on-error-container hover:bg-error hover:text-background animate-pulse border border-error' : 'bg-error-container/40 hover:bg-error-container text-on-error-container border border-error-container'}`}
                            type="button"
                        >
                            <Icon name="bolt" size={15} />
                            <span>Délestage d'urgence</span>
                            {hasUrgence && (
                                <span className="w-2 h-2 rounded-full bg-error animate-ping ml-space-xs" />
                            )}
                        </button>
                        <button
                            onClick={() => setRealimOpen(true)}
                            className="flex items-center gap-space-xs px-space-md py-space-xs bg-secondary-container/40 hover:bg-secondary-container text-secondary border border-secondary/40 font-mono text-xs font-bold transition-colors whitespace-nowrap"
                            type="button"
                        >
                            <Icon name="refresh" size={15} />
                            <span>Réalimentation</span>
                        </button>
                    </div>
                </div>

                {/* Comms strip */}
                <div className="bg-surface-container-lowest px-space-md py-space-xs flex flex-wrap items-center justify-between font-mono text-[10px] text-on-surface-variant gap-space-md">
                    <div className="flex items-center gap-space-lg flex-wrap">
                        <div className="flex items-center gap-1">
                            <span className="text-on-surface-variant uppercase">Chef de quart :</span>
                            <span className="text-on-surface font-semibold">Ing. M. Trabelsi (Matr. 48821)</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Icon name="radio" size={12} className="text-secondary" />
                            <span className="text-on-surface-variant uppercase">VHF :</span>
                            <span className="text-secondary font-semibold">Canal 04-Nord (168.450 MHz)</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Icon name="call" size={12} className="text-tertiary" />
                            <span className="text-on-surface-variant uppercase">Ligne DN :</span>
                            <span className="text-tertiary font-semibold">+216 71 340 102</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-space-xs">
                        <span className="text-on-surface-variant">SCADA synchro :</span>
                        <span className="text-[#4ade80] font-bold">18 ms</span>
                        <span className="text-on-surface-variant">(BCCs 100% connectés)</span>
                    </div>
                </div>
            </div>

            {/* ── SECTION 2 — KPI cards ───────────────────────────────────── */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md p-space-md">
                {/* KPI 1 — Cible DN */}
                <div className="bg-surface-container-low p-space-md flex flex-col justify-between shadow-md">
                    <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">Cible Reçue du DN</span>
                        <span className="px-space-xs py-0.5 bg-surface-container-highest text-secondary font-mono text-[9px]">DISP. NAT.</span>
                    </div>
                    <div className="flex items-baseline gap-space-xs my-space-xs">
                        <span className="font-mono text-3xl font-bold text-secondary">{crcCons.toFixed(1)}</span>
                        <span className="font-mono text-sm text-on-surface-variant">MW</span>
                    </div>
                    <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant bg-surface-container-lowest/50 px-space-sm py-space-xs mt-space-xs">
                        <span>Quota fixe {userCRC}</span>
                        <span className="text-secondary font-semibold">100,0 % Cible</span>
                    </div>
                </div>

                {/* KPI 2 — Réalisé régional */}
                {(() => {
                    const isDeficit = crcEcart < -5
                    return (
                        <div className="bg-surface-container-low p-space-md flex flex-col justify-between shadow-md">
                            <div className="flex items-center justify-between">
                                <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">Réalisé Régional</span>
                                <span className={`px-space-xs py-0.5 font-mono text-[9px] font-bold ${isDeficit ? 'bg-tertiary-container text-tertiary' : 'bg-surface-container-highest text-secondary'}`}>
                                    {crcEcart >= 0 ? '+' : ''}{crcEcart.toFixed(1)} MW
                                </span>
                            </div>
                            <div className="flex items-baseline gap-space-xs my-space-xs">
                                <span className={`font-mono text-3xl font-bold ${isDeficit ? 'text-tertiary' : 'text-secondary'}`}>{crcReal.toFixed(1)}</span>
                                <span className="font-mono text-sm text-on-surface-variant">MW</span>
                            </div>
                            <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant bg-surface-container-lowest/50 px-space-sm py-space-xs mt-space-xs">
                                <span>Taux d'exécution</span>
                                <span className={`font-bold ${isDeficit ? 'text-tertiary' : 'text-[#4ade80]'}`}>{crcPct} %</span>
                            </div>
                        </div>
                    )
                })()}

                {/* KPI 3 — Départs en coupure */}
                {(() => {
                    const hasOverdue = overdueCuts.length > 0
                    return (
                        <div className="bg-surface-container-low p-space-md flex flex-col justify-between shadow-md">
                            <div className="flex items-center justify-between">
                                <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">Départs HTA en Coupure</span>
                                {hasOverdue && (
                                    <span className="px-space-xs py-0.5 bg-error-container text-on-error-container font-mono text-[9px] font-bold animate-pulse">
                                        {overdueCuts.length} &gt; 45 MIN
                                    </span>
                                )}
                            </div>
                            <div className="flex items-baseline gap-space-xs my-space-xs">
                                <span className={`font-mono text-3xl font-bold ${hasOverdue ? 'text-error' : 'text-secondary'}`}>{totalCuts}</span>
                                <span className="font-mono text-sm text-on-surface-variant">Feeders</span>
                            </div>
                            <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant bg-surface-container-lowest/50 px-space-sm py-space-xs mt-space-xs">
                                <span>Charge délestée</span>
                                <span className={`font-semibold ${hasOverdue ? 'text-error' : 'text-secondary'}`}>
                                    {liveCuts.reduce((s, c) => s + c.mw_shed, 0).toFixed(1)} MW actif
                                </span>
                            </div>
                        </div>
                    )
                })()}

                {/* KPI 4 — Last updated */}
                <div className="bg-surface-container-low p-space-md flex flex-col justify-between shadow-md">
                    <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">Synchronisation</span>
                        <span className={`px-space-xs py-0.5 font-mono text-[9px] font-bold ${dbLoading ? 'bg-tertiary-container text-tertiary' : 'bg-surface-container-highest text-[#4ade80]'}`}>
                            {dbLoading ? 'CHARGEMENT' : 'CONNECTÉ'}
                        </span>
                    </div>
                    <div className="flex items-baseline gap-space-xs my-space-xs">
                        <span className="font-mono text-3xl font-bold text-[#4ade80]">30</span>
                        <span className="font-mono text-sm text-on-surface-variant">sec</span>
                    </div>
                    <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant bg-surface-container-lowest/50 px-space-sm py-space-xs mt-space-xs">
                        <span>Dernière mise à jour</span>
                        <span className="text-[#4ade80] font-semibold">
                            {lastUpdated ? lastUpdated.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }) : '—'}
                        </span>
                    </div>
                </div>
            </section>

            {/* ── SECTION 3 — 60/40 split ─────────────────────────────────── */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-space-md px-space-md pb-space-md">

                {/* Left 7/12 — chart + BCC cards */}
                <div className="lg:col-span-7 flex flex-col gap-space-md">
                    <div className="bg-surface-container-low p-space-md shadow-md flex flex-col gap-space-md">

                        {/* Chart header */}
                        <div className="flex flex-wrap items-center justify-between gap-space-sm">
                            <div className="flex items-center gap-space-sm">
                                <Icon name="show_chart" size={20} className="text-secondary" />
                                <span className="font-sans font-semibold text-sm text-on-surface uppercase tracking-wide">
                                    Suivi d'Exécution Régional — CRC Nord
                                </span>
                            </div>
                            <div className="flex items-center gap-space-md font-mono text-[10px]">
                                <div className="flex items-center gap-1">
                                    <span className="w-3 h-0.5 inline-block" style={{ borderTop: '2px dashed #acc7ff', background: 'transparent' }} />
                                    <span className="text-on-surface-variant">Consigne DN (300 MW)</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="w-3 h-0.5 bg-tertiary inline-block" />
                                    <span className="text-on-surface">Réalisé Région</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="w-2.5 h-2.5 bg-error/30 inline-block" />
                                    <span className="text-error">Déficit</span>
                                </div>
                            </div>
                        </div>

                        <RegionalChart chartPts={crcChartPts} />

                        {/* 4 BCC mini-cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-sm">
                            {bccStatusDynamic.length === 0
                                ? (
                                    <div className="col-span-4 flex items-center justify-center gap-space-sm py-4 font-mono text-[10px] text-on-surface-variant">
                                        <Icon name="hourglass_empty" size={14} className="text-secondary animate-spin" />
                                        <span>Chargement des données BCC...</span>
                                    </div>
                                )
                                : bccStatusDynamic.map((b, idx) => (
                                <div
                                    key={idx}
                                    className={`p-space-sm flex flex-col justify-between ${b.dotAnim.includes('ping') ? 'bg-tertiary-container/20' : 'bg-surface-container'}`}
                                >
                                    <div className="flex items-center justify-between font-mono text-[10px]">
                                        <span className={b.dotAnim ? 'text-tertiary font-bold' : 'text-on-surface font-semibold'}>
                                            {b.name ?? b.label}
                                        </span>
                                        <span className={`w-1.5 h-1.5 rounded-full ${b.dot} ${b.dotAnim}`} />
                                    </div>
                                    <div className="flex items-baseline justify-between my-space-xs">
                                        <span className={`font-mono text-sm font-bold ${b.dotAnim.includes('ping') ? 'text-error' : 'text-secondary'}`}>
                                            {b.realise.toFixed(1)} / {b.consigne}
                                        </span>
                                        <span className="font-mono text-[10px] text-on-surface-variant">MW</span>
                                    </div>
                                    <div className="w-full bg-surface-container-lowest h-1 overflow-hidden">
                                        <div className={`${b.barCls} h-full transition-all`} style={{ width: `${Math.min(b.pct, 100)}%` }} />
                                    </div>
                                    <div className="flex items-center justify-between font-mono text-[10px] mt-space-xs">
                                        <span className="text-on-surface-variant">{b.sub?.split(':')[1]?.trim() ?? ''}</span>
                                        <span className={b.noteCls}>{b.note}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right 5/12 — live shedding accordion */}
                <div className="lg:col-span-5 flex flex-col bg-surface-container-low p-space-md shadow-md gap-space-sm">
                    <div className="flex items-center justify-between bg-surface-container-lowest p-space-sm">
                        <div className="flex items-center gap-space-sm">
                            <Icon name="account_tree" size={18} className="text-tertiary" />
                            <span className="font-sans font-semibold text-xs text-on-surface uppercase tracking-wide">
                                Délestages en Cours
                            </span>
                        </div>
                        <span className="px-space-xs py-0.5 bg-error-container text-on-error-container font-mono text-[9px] font-bold">
                            {totalCuts} DÉPARTS
                        </span>
                    </div>

                    <div className="flex-1 flex flex-col gap-space-xs overflow-y-auto max-h-96">
                        {liveCuts.length === 0
                            ? (
                                <div className="flex flex-col items-center justify-center py-8 gap-space-md text-on-surface-variant">
                                    <Icon name="check_circle" size={32} className="text-[#4ade80] opacity-60" />
                                    <p className="font-mono text-xs">Aucune coupure active en ce moment</p>
                                </div>
                            )
                            : Object.entries(
                                liveCuts.reduce((acc, c) =>
                                {
                                    const key = c.bcc_name
                                    if (!acc[key]) acc[key] = []
                                    acc[key].push(c)
                                    return acc
                                }, {})
                            ).map(([bccName, cuts]) =>
                            {
                                const hasOverdueInBcc = cuts.some((c) => c.overdue)
                                const totalMW = cuts.reduce((s, c) => s + c.mw_shed, 0)
                                return (
                                    <div key={bccName} className={`overflow-hidden ${hasOverdueInBcc ? 'ring-1 ring-error' : ''}`}>
                                        <button
                                            type="button"
                                            onClick={() => toggleBCC(bccName)}
                                            className={`w-full p-space-sm flex items-center justify-between text-left transition-colors ${hasOverdueInBcc ? 'bg-tertiary-container/30 hover:bg-tertiary-container/50' : 'bg-surface-container hover:bg-surface-container-high'}`}
                                        >
                                            <div className="flex items-center gap-space-sm font-mono text-xs font-bold">
                                                <Icon name={expanded[bccName] ? 'expand_less' : 'expand_more'} size={15} className={hasOverdueInBcc ? 'text-error' : 'text-secondary'} />
                                                <span className={hasOverdueInBcc ? 'text-tertiary' : 'text-on-surface'}>{bccName}</span>
                                            </div>
                                            <div className="flex items-center gap-space-md font-mono text-[10px]">
                                                {hasOverdueInBcc && <span className="text-error font-bold">{cuts.filter((c) => c.overdue).length} OVERDUE</span>}
                                                <span className="text-on-surface-variant">{cuts.length} départs</span>
                                                <span className={`font-bold ${hasOverdueInBcc ? 'text-error' : 'text-secondary'}`}>{totalMW.toFixed(1)} MW</span>
                                            </div>
                                        </button>
                                        {expanded[bccName] && (
                                            <div className="bg-surface-container-lowest flex flex-col gap-space-xs p-space-xs">
                                                {cuts.map((c) => (
                                                    <div key={c.execution_id}
                                                        className={`flex items-center justify-between px-space-sm py-space-xs font-mono text-[10px] ${c.overdue ? 'bg-error-container/40 text-on-error-container animate-pulse' : 'bg-surface-container-low text-on-surface-variant'}`}
                                                    >
                                                        <div className="flex items-center gap-space-sm min-w-0">
                                                            {c.overdue && <Icon name="timer_off" size={12} className="text-error shrink-0" />}
                                                            <span className={`font-bold shrink-0 ${c.overdue ? 'text-error' : 'text-secondary'}`}>{c.feeder_ref}</span>
                                                            <span className="truncate">{c.feeder_nom}</span>
                                                        </div>
                                                        <div className="flex items-center gap-space-md shrink-0">
                                                            <span className="font-semibold">{c.mw_shed} MW</span>
                                                            <span className={c.overdue ? 'text-error font-bold' : 'text-on-surface-variant'}>{Math.round(c.elapsed_min)} min</span>
                                                            {c.overdue
                                                                ? <span className="px-space-xs py-0.5 bg-error text-background font-bold text-[9px] uppercase">ROTATION REQUISE</span>
                                                                : <span className="text-[#4ade80]">EN COURS</span>
                                                            }
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )
                            })
                        }
                    </div>
                </div>
            </section>

            {/* ── SECTION 4 — Full-width cuts table ───────────────────────── */}
            <section className="px-space-md pb-space-md">
                <div className="bg-surface-container-low shadow-md flex flex-col overflow-hidden">
                    {/* Table header + filters */}
                    <div className="bg-surface-container-lowest p-space-sm flex flex-wrap items-center justify-between gap-space-sm border-b border-surface-container-high">
                        <div className="flex items-center gap-space-sm">
                            <Icon name="table_rows" size={18} className="text-secondary" />
                            <span className="font-sans font-semibold text-xs text-on-surface uppercase tracking-wide">
                                Journal Opérationnel des Coupures HTA en Cours
                            </span>
                            <span className="px-space-xs py-0.5 bg-error-container text-on-error-container font-mono text-[9px] font-bold">
                                {cutsTableDynamic.filter((c) => c.statut === 'overdue').length} OVERDUE
                            </span>
                        </div>
                        <div className="flex items-center gap-space-sm font-mono text-[10px]">
                            <div className="flex items-center gap-space-xs bg-surface-container px-space-sm py-space-xs border border-surface-container-high">
                                <span className="text-on-surface-variant uppercase">BCC :</span>
                                <select
                                    value={filterBCC}
                                    onChange={(e) => { setFilterBCC(e.target.value); setPage(1) }}
                                    className="bg-transparent text-on-surface focus:outline-none"
                                >
                                    <option value="all">Tous (4)</option>
                                    {uniqueBCCs.map((b) => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                            <button
                                onClick={() => { setSortDesc((d) => !d); setPage(1) }}
                                className="flex items-center gap-space-xs px-space-sm py-space-xs bg-surface-container border border-surface-container-high text-secondary hover:bg-surface-container-high transition-colors"
                                type="button"
                            >
                                <Icon name="swap_vert" size={13} />
                                <span>{sortDesc ? 'Plus long en premier' : 'Plus récent en premier'}</span>
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left font-mono text-[10px]">
                            <thead className="bg-surface-container font-mono text-[9px] text-on-surface-variant uppercase tracking-wider">
                                <tr>
                                    <th className="py-space-sm px-space-md">BCC Responsable</th>
                                    <th className="py-space-sm px-space-md">Réf Départ</th>
                                    <th className="py-space-sm px-space-md">Poste Source / Nom Feeder</th>
                                    <th className="py-space-sm px-space-md text-center">Début Coupure</th>
                                    <th className="py-space-sm px-space-md text-right">Durée Écoulée</th>
                                    <th className="py-space-sm px-space-md text-right">Puissance</th>
                                    <th className="py-space-sm px-space-md text-center">Statut Rotation</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-container-high">
                                {paged.length === 0
                                    ? (
                                        <tr>
                                            <td colSpan={7} className="py-8 text-center font-mono text-[10px] text-on-surface-variant">
                                                <div className="flex flex-col items-center gap-space-sm">
                                                    <span className="material-symbols-outlined text-[#4ade80]" style={{ fontSize: 24 }}>check_circle</span>
                                                    <span className="text-[#4ade80] font-semibold uppercase tracking-wider">Aucune coupure active</span>
                                                    <span>Le réseau est équilibré — aucun délestage en cours sur cette région</span>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                    : paged.map((c) => (
                                    <tr
                                        key={c.id}
                                        className={`transition-colors ${c.statut === 'overdue' ? 'bg-error-container/20 hover:bg-error-container/30 border-l-2 border-error' : 'bg-surface-container-low hover:bg-surface-container'}`}
                                    >
                                        <td className={`py-space-sm px-space-md font-bold ${c.statut === 'overdue' ? 'text-error' : 'text-secondary'}`}>
                                            {c.bccShort}
                                        </td>
                                        <td className="py-space-sm px-space-md font-bold text-on-surface">{c.ref}</td>
                                        <td className="py-space-sm px-space-md text-on-surface-variant">{c.poste}</td>
                                        <td className="py-space-sm px-space-md text-center text-on-surface-variant">{c.debut}</td>
                                        <td className={`py-space-sm px-space-md text-right font-bold ${c.dur >= 45 ? 'text-error' : 'text-on-surface'}`}>
                                            <div className="flex items-center justify-end gap-space-xs">
                                                {c.dur >= 45 && <span className="w-1.5 h-1.5 rounded-full bg-error animate-ping" />}
                                                <span>{c.dur} min</span>
                                            </div>
                                        </td>
                                        <td className="py-space-sm px-space-md text-right font-bold text-secondary">{c.mw.toFixed(1)} MW</td>
                                        <td className="py-space-sm px-space-md text-center">
                                            {c.statut === 'overdue'
                                                ? <span className="px-space-sm py-0.5 bg-error text-background font-bold text-[9px] uppercase">DÉPASSEMENT (&gt;45M)</span>
                                                : <span className="px-space-sm py-0.5 bg-[#4ade80]/10 text-[#4ade80] font-bold text-[9px]">CONFORME</span>
                                            }
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="px-space-md py-space-sm bg-surface-container-lowest border-t border-surface-container-high flex items-center justify-between font-mono text-[10px] text-on-surface-variant">
                        <button
                            disabled={page <= 1}
                            onClick={() => setPage((p) => p - 1)}
                            className="flex items-center gap-space-xs px-space-sm py-space-xs bg-surface-container hover:bg-surface-container-high disabled:opacity-40 disabled:pointer-events-none border border-surface-container-high transition-colors"
                            type="button"
                        >
                            <Icon name="chevron_left" size={13} />
                            <span>Précédent</span>
                        </button>
                        <span>
                            {filtered.length === 0
                                ? 'Aucun départ'
                                : `${(page-1)*ROWS_PER_PAGE+1}–${Math.min(page*ROWS_PER_PAGE, filtered.length)} sur ${filtered.length} départs actifs`
                            }
                        </span>
                        <button
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => p + 1)}
                            className="flex items-center gap-space-xs px-space-sm py-space-xs bg-surface-container hover:bg-surface-container-high disabled:opacity-40 disabled:pointer-events-none border border-surface-container-high transition-colors"
                            type="button"
                        >
                            <span>Suivant</span>
                            <Icon name="chevron_right" size={13} />
                        </button>
                    </div>
                </div>
            </section>

            {/* Modals & panels */}
            <ProgrammeJ1Modal isOpen={j1Open} onClose={() => setJ1Open(false)} />
            <AiPanel         isOpen={aiOpen} onClose={() => setAiOpen(false)} />
            <CRCRealimModal
                isOpen={realimOpen}
                onClose={() => setRealimOpen(false)}
                onEmit={async ({ type, mwTotal, bccMW }) => {
                    try {
                        const now  = new Date()
                        const hhmm = `${String(now.getHours()).padStart(2,'0')}h${String(now.getMinutes()).padStart(2,'0')}`
                        const { data: order } = await api.post('/api/v1/orders', {
                            order_type: 'realim',
                            sub_type:   type,
                            mw_total:   mwTotal,
                            mw_nord:    userCRC === 'CRC Nord' ? mwTotal : 0,
                            mw_sud:     userCRC === 'CRC Sud'  ? mwTotal : 0,
                            notes:      `Realimentation ${type} emise par ${userCRC} a ${hhmm}`,
                        })
                        updateOrderStatus(order.id, 'pending')
                    } catch (err) {
                        console.error('[CRC] Failed to persist realim order:', err?.response?.data ?? err.message)
                    }
                }}
            />
            <CRCUrgenceModal
                isOpen={urgenceOpen}
                onClose={() => { setUrgenceOpen(false); setModalOpen(false) }}
                myUrgences={myUrgences}
                onReceipt={(orderId) => {
                    // Always update legacy store for popup compatibility
                    acknowledgeReceipt(orderId)
                    // Wire to DB for DB-sourced orders
                    handleAckOrder(orderId)
                }}
                onDispatch={(orderId) => {
                    dispatchComplete(orderId)
                    handleDispatchOrder(orderId)
                }}
            />
        </div>
    )
}
