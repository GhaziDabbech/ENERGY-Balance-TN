import { useState, useEffect, useRef, useCallback } from 'react'
import { useUrgenceStore } from '../../stores/urgenceStore'
import { useAuthStore }    from '../../stores/authStore'

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

// ── AI suggestion text ────────────────────────────────────────────────────────
const buildAiSuggestion = (mwNord) =>
`Analyse réseau CRC Nord (temps réel) :

Contrainte d'évacuation détectée sur Béja suite au déclenchement
du D22 (capacité résiduelle plafonnée à 8 MW max sur BCC 3).

Répartition optimale suggérée pour +${mwNord} MW :

→ BCC 1 (Tunis Ville & Nord)
  Marge disponible : ~22 MW (départs P2/P3 non mobilisés)
  Suggestion : +${Math.round(mwNord * 0.33)} MW

→ BCC 2 (Tunis Sud & Ben Arous)
  Zone industrielle Ben Arous — transit HTB admissible
  Suggestion : +${Math.round(mwNord * 0.26)} MW

→ BCC 3 (Béja / Nord-Ouest)
  Plafond thermique 8 MW — ne pas dépasser
  Suggestion : +${Math.min(8, Math.round(mwNord * 0.15))} MW

→ BCC 4 (Bizerte / Mateur)
  Feeder Z.I. Menzel Bourguiba disponible
  Suggestion : +${mwNord - Math.round(mwNord * 0.33) - Math.round(mwNord * 0.26) - Math.min(8, Math.round(mwNord * 0.15))} MW

Aucun risque de surcharge HTB détecté sur ce scénario.
Délai d'exécution estimé : < 3 minutes.`

const BCC_CONFIG =
[
    { id: 1, label: 'BCC 1 — Tunis Ville & Nord',    splitPct: 0.33, cap: null, color: 'secondary' }
    ,{ id: 2, label: 'BCC 2 — Tunis Sud & Ben Arous', splitPct: 0.26, cap: null, color: 'secondary' }
    ,{ id: 3, label: 'BCC 3 — Béja (Plafond 8 MW)',   splitPct: 0.15, cap: 8,    color: 'tertiary'  }
    ,{ id: 4, label: 'BCC 4 — Bizerte / Mateur',      splitPct: 0.26, cap: null, color: 'secondary' }
]

const buildSuggested = (mw) =>
{
    const b1 = Math.round(mw * 0.33)
    const b2 = Math.round(mw * 0.26)
    const b3 = Math.min(8, Math.round(mw * 0.15))
    const b4 = mw - b1 - b2 - b3
    return { 1: b1, 2: b2, 3: b3, 4: Math.max(0, b4) }
}

// ── Shared BCC dispatch form ──────────────────────────────────────────────────
function DispatchForm({ order, onDispatch, compact = false })
{
    const mwNord   = order.mwNord
    const suggested = buildSuggested(mwNord)

    const [bccMW,   setBccMW]  = useState(suggested)
    const [showAI,  setShowAI] = useState(false)
    const [aiOpen,  setAiOpen] = useState(false)
    const [aiMsgs,  setAiMsgs] = useState([])
    const [aiInput, setAiInput] = useState('')
    const [sent,    setSent]   = useState(false)

    const total    = Object.values(bccMW).reduce((s, v) => s + Number(v), 0)
    const gap      = total - mwNord
    const balanced = Math.abs(gap) < 0.5

    const handleApplyAI = () => { setBccMW(suggested); setShowAI(false) }
    const handleBccChange = (id, val) => setBccMW((prev) => ({ ...prev, [id]: Number(val) }))

    const handleSend = () =>
    {
        setSent(true)
        setTimeout(() => onDispatch(order.id), 1500)
    }

    const sendAiMsg = () =>
    {
        if (!aiInput.trim()) return
        setAiMsgs((m) => [
            ...m
            ,{ role: 'user',   text: aiInput }
            ,{ role: 'system', text: 'Analyse en cours sur le réseau Nord… Aucun goulot HTB détecté. Transit admissible sur Radès–Mornaguia.' }
        ])
        setAiInput('')
    }

    return (
        <>
            <div className="flex flex-col gap-space-md">
                {/* Urgence specs */}
                {!compact && (
                    <div className="bg-surface-container p-space-md flex flex-wrap items-center justify-between gap-space-md">
                        <div className="flex flex-col">
                            <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">
                                Consigne additionnelle requise (CRC Nord)
                            </span>
                            <div className="flex items-baseline gap-space-xs mt-space-xs">
                                <span className="font-mono text-3xl font-bold text-error">+{mwNord}</span>
                                <span className="font-mono text-sm text-on-surface-variant">MW d'effacement immédiat</span>
                            </div>
                        </div>
                        <div className="flex flex-col text-right">
                            <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">
                                Nouvelle consigne globale CRC
                            </span>
                            <div className="flex items-baseline gap-space-xs justify-end mt-space-xs">
                                <span className="font-mono text-3xl font-bold text-secondary">{300 + mwNord}</span>
                                <span className="font-mono text-sm text-on-surface-variant">MW (300 + {mwNord})</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* AI suggestion */}
                <div className="bg-surface-container-low p-space-md border border-surface-container-high flex flex-col gap-space-sm">
                    <div className="flex items-center justify-between flex-wrap gap-space-sm">
                        <div className="flex items-center gap-space-sm">
                            <span className="px-space-xs py-0.5 bg-secondary-container/40 text-secondary font-mono text-[9px] font-bold uppercase">
                                OP-LLM 2.5
                            </span>
                            <span className="font-sans font-semibold text-xs text-on-surface">
                                Répartition optimisée par BCC
                            </span>
                        </div>
                        <button
                            onClick={() => setShowAI((v) => !v)}
                            className="font-mono text-[10px] text-secondary hover:underline"
                            type="button"
                        >
                            {showAI ? 'Masquer analyse' : 'Voir analyse IA'}
                        </button>
                    </div>
                    {showAI && (
                        <pre className="font-mono text-[10px] text-on-surface-variant whitespace-pre-wrap leading-relaxed bg-surface-container-lowest border border-surface-container-high p-space-sm max-h-40 overflow-y-auto">
                            {buildAiSuggestion(mwNord)}
                        </pre>
                    )}
                    <button
                        onClick={handleApplyAI}
                        className="self-start flex items-center gap-space-xs px-space-md py-space-xs bg-secondary-container hover:bg-secondary text-on-secondary-container font-mono text-xs font-bold transition-all"
                        type="button"
                    >
                        <Icon name="auto_fix_high" size={13} />
                        <span>Appliquer suggestion IA (+{mwNord} MW)</span>
                    </button>
                </div>

                {/* BCC inputs */}
                <div className="flex flex-col gap-space-sm">
                    <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">
                        <span>Ventilation par BCC</span>
                        <span>Objectif : somme = +{mwNord} MW</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                        {BCC_CONFIG.map((b) =>
                        {
                            const val     = bccMW[b.id] ?? 0
                            const pct     = Math.min(100, Math.max(0, (val / mwNord) * 100))
                            const capWarn = b.cap !== null && val > b.cap
                            const barCls  = capWarn ? 'bg-error' : b.color === 'tertiary' ? 'bg-tertiary' : 'bg-secondary'
                            const txtCls  = b.color === 'tertiary' ? 'text-tertiary' : 'text-secondary'
                            return (
                                <div
                                    key={b.id}
                                    className={`bg-surface-container p-space-sm flex flex-col gap-space-xs ${capWarn ? 'ring-1 ring-error' : ''}`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className={`font-sans font-bold text-xs ${capWarn ? 'text-error' : 'text-on-surface'}`}>
                                            {b.label}
                                        </span>
                                        <span className={`font-mono text-[10px] ${capWarn ? 'text-error font-bold' : 'text-on-surface-variant'}`}>
                                            {capWarn ? `MAX ${b.cap} MW` : `Suggéré : +${suggested[b.id]} MW`}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-space-sm">
                                        <span className="font-mono text-xs text-on-surface-variant">+</span>
                                        <input
                                            type="number"
                                            min={0}
                                            max={b.cap ?? mwNord}
                                            step={0.5}
                                            value={val}
                                            onChange={(e) => handleBccChange(b.id, e.target.value)}
                                            className={`w-full bg-surface-container-lowest border focus:outline-none px-space-sm py-space-xs font-mono text-sm font-bold transition-all ${capWarn ? 'border-error text-error' : `border-surface-container-high focus:border-secondary ${txtCls}`}`}
                                        />
                                        <span className="font-mono text-xs text-on-surface-variant">MW</span>
                                    </div>
                                    <div className="w-full bg-surface-container-lowest h-1 overflow-hidden">
                                        <div className={`h-full transition-all ${barCls}`} style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Balance bar */}
                    <div className={`p-space-sm flex items-center justify-between font-mono text-xs border ${balanced ? 'bg-[#4ade80]/10 border-[#4ade80]/30 text-[#4ade80]' : 'bg-error-container/30 border-error/40 text-error'}`}>
                        <div className="flex items-center gap-space-md">
                            <span className="text-on-surface-variant">Total :</span>
                            <strong className={`text-sm ${balanced ? 'text-[#4ade80]' : 'text-error'}`}>{total.toFixed(1)} MW</strong>
                            <span className="text-on-surface-variant">/ +{mwNord} MW requis</span>
                        </div>
                        <span className="font-bold text-[10px] uppercase px-space-sm py-0.5">
                            {balanced ? `CONFORME` : `ÉCART ${gap > 0 ? '+' : ''}${gap.toFixed(1)} MW`}
                        </span>
                    </div>
                </div>
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between gap-space-md pt-space-md border-t border-surface-container-high mt-space-md flex-wrap">
                <div className="flex items-center gap-space-xs font-mono text-[10px] text-on-surface-variant">
                    <Icon name="lock" size={13} className="text-tertiary" />
                    <span>Ordre horodaté dans l'audit CRC · Action irréversible</span>
                </div>
                <div className="flex items-center gap-space-sm">
                    <button
                        onClick={() => setAiOpen(true)}
                        className="flex items-center gap-space-xs px-space-md py-space-xs bg-surface-container-highest hover:bg-surface-container-high text-secondary font-mono text-xs transition-colors"
                        type="button"
                    >
                        <Icon name="smart_toy" size={15} />
                        <span>Analyser avec l'IA</span>
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={!balanced || sent}
                        className="flex items-center gap-space-sm px-space-lg py-space-xs bg-error text-background hover:bg-error-container hover:text-on-error-container font-mono text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                        type="button"
                    >
                        {sent
                            ? <><Icon name="check_circle" size={14} className="text-[#4ade80]" /><span>Transmis aux BCCs !</span></>
                            : <><Icon name="broadcast_on_personal" size={14} /><span>Envoyer aux 4 BCCs</span></>
                        }
                    </button>
                </div>
            </div>

            {/* AI panel */}
            {aiOpen && (
                <div className="fixed top-0 right-0 bottom-0 w-96 max-w-[90vw] bg-surface-container-low border-l border-surface-container-high shadow-2xl z-[70] flex flex-col">
                    <div className="p-space-md bg-surface-container flex items-center justify-between border-b border-surface-container-high shrink-0">
                        <div className="flex items-center gap-space-sm">
                            <div className="w-7 h-7 bg-secondary-container/30 border border-secondary/40 flex items-center justify-center text-secondary">
                                <Icon name="smart_toy" size={17} />
                            </div>
                            <div>
                                <span className="font-sans font-bold text-xs text-on-surface uppercase">Analyse IA — CRC Nord</span>
                                <p className="font-mono text-[9px] text-secondary">OP-LLM 2.5</p>
                            </div>
                        </div>
                        <button onClick={() => setAiOpen(false)} className="p-space-xs hover:bg-surface-container-high text-on-surface-variant transition-colors" type="button">
                            <Icon name="close" size={17} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-space-md flex flex-col gap-space-sm">
                        <div className="bg-surface-container-lowest p-space-sm border border-surface-container-high font-mono text-[10px] text-on-surface-variant leading-relaxed">
                            <p className="text-secondary font-bold text-[9px] uppercase mb-space-xs">Rapport {order.orderRef}</p>
                            <p>Consigne additionnelle +{mwNord} MW. BCC 3 plafonné à 8 MW. Redistribuer sur BCC 1 et BCC 4.</p>
                        </div>
                        {aiMsgs.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[90%] p-space-sm font-mono text-[10px] leading-relaxed ${m.role === 'user' ? 'bg-secondary-container/20 border border-secondary/30 text-on-surface' : 'bg-surface-container-lowest border border-surface-container-high text-on-surface-variant'}`}>
                                    {m.role === 'system' && <span className="text-secondary font-bold text-[9px] block mb-0.5 uppercase">Analyse SCADA</span>}
                                    {m.text}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="p-space-sm bg-surface-container border-t border-surface-container-high flex flex-col gap-space-xs shrink-0">
                        <div className="flex items-center gap-space-xs">
                            <input
                                value={aiInput}
                                onChange={(e) => setAiInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') sendAiMsg() }}
                                placeholder="Poser une question opérationnelle..."
                                className="flex-1 bg-surface-container-lowest border border-surface-container-high px-space-sm py-space-xs font-mono text-xs text-on-surface focus:border-secondary focus:outline-none"
                            />
                            <button onClick={sendAiMsg} className="p-space-xs bg-secondary-container hover:bg-secondary text-on-secondary-container border border-secondary transition-colors" type="button">
                                <Icon name="send" size={15} />
                            </button>
                        </div>
                        <p className="font-mono text-[9px] text-on-surface-variant text-center">
                            Suggestions IA indicatives. Décisions à l'opérateur CRC.
                        </p>
                    </div>
                </div>
            )}
        </>
    )
}

// ── Step 1 — Blocking modal (status: 'pending') ───────────────────────────────
function PendingModal({ order, onReceipt })
{
    const issuedDate = new Date(order.issuedAt)
    const issuedStr  = `${String(issuedDate.getHours()).padStart(2,'0')}:${String(issuedDate.getMinutes()).padStart(2,'0')}`

    return (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[60] flex items-center justify-center p-space-md">
            <div className="bg-surface-container-low w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden ring-2 ring-error">

                {/* Header */}
                <div className="p-space-md bg-error-container flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-space-md">
                        <div className="w-9 h-9 bg-surface-container-lowest flex items-center justify-center text-error animate-bounce shrink-0">
                            <Icon name="crisis_alert" size={24} />
                        </div>
                        <div>
                            <div className="flex items-center gap-space-sm flex-wrap">
                                <span className="font-sans font-bold text-sm text-on-error-container uppercase tracking-wider">
                                    ORDRE D'URGENCE DN REÇU
                                </span>
                                <span className="px-space-xs py-0.5 bg-surface-container-lowest text-error font-mono text-[10px] font-bold">
                                    NIVEAU 2 CRITIQUE
                                </span>
                            </div>
                            <span className="font-mono text-[10px] text-on-error-container/80">
                                Réf : {order.orderRef} · Reçu à {issuedStr} · Dispatching National Radès
                            </span>
                        </div>
                    </div>
                    <div className="text-right shrink-0">
                        <span className="font-mono text-[10px] text-on-error-container/70 block uppercase">Délai exécution</span>
                        <span className="font-mono font-bold text-on-error-container text-lg">&lt; 03:00 MIN</span>
                    </div>
                </div>

                {/* Body */}
                <div className="p-space-lg bg-surface-container-lowest flex flex-col gap-space-md">

                    {/* MW summary */}
                    <div className="bg-surface-container p-space-md flex flex-wrap items-center justify-between gap-space-md">
                        <div className="flex flex-col">
                            <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">
                                Consigne additionnelle (CRC Nord)
                            </span>
                            <div className="flex items-baseline gap-space-xs mt-space-xs">
                                <span className="font-mono text-4xl font-bold text-error">+{order.mwNord}</span>
                                <span className="font-mono text-sm text-on-surface-variant">MW d'effacement immédiat</span>
                            </div>
                        </div>
                        <div className="flex flex-col text-right">
                            <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">
                                Nouvelle consigne globale CRC
                            </span>
                            <div className="flex items-baseline gap-space-xs justify-end mt-space-xs">
                                <span className="font-mono text-4xl font-bold text-secondary">{300 + order.mwNord}</span>
                                <span className="font-mono text-sm text-on-surface-variant">MW</span>
                            </div>
                        </div>
                    </div>

                    {/* Explanation */}
                    <p className="font-mono text-xs text-on-surface-variant leading-relaxed">
                        Accusez réception de cet ordre immédiatement. Vous pourrez ensuite distribuer la consigne aux BCCs
                        depuis n'importe quelle page via le badge flottant en bas à droite de l'écran.
                    </p>
                </div>

                {/* Footer — only the receipt button */}
                <div className="px-space-lg py-space-md bg-surface-container border-t border-surface-container-high flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-space-xs font-mono text-[10px] text-on-surface-variant">
                        <Icon name="schedule" size={13} className="text-tertiary" />
                        <span>Accusé de réception horodaté dans l'audit CRC</span>
                    </div>
                    <button
                        onClick={() => onReceipt(order.id)}
                        className="flex items-center gap-space-sm px-space-xl py-space-md bg-error text-background hover:bg-error-container hover:text-on-error-container font-mono text-sm font-bold uppercase tracking-wider transition-all shadow-lg"
                        type="button"
                    >
                        <Icon name="check" size={18} />
                        <span>Reçu — Pris en charge</span>
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Consolidated floating badge — wraps one or many acknowledged orders ───────
// Single order  → behaves exactly like the old AcknowledgedBadge
// Multiple orders → collapsed badge shows count + combined MW, expanded shows tabs
function ConsolidatedBadge({ orders, onDispatch })
{
    const [expanded,    setExpanded]    = useState(false)
    const [activeIdx,   setActiveIdx]   = useState(0)

    // Clamp idx when orders shrink (one gets dispatched)
    const safeIdx    = Math.min(activeIdx, Math.max(0, orders.length - 1))
    const activeOrder = orders[safeIdx]

    // Drag state — shared for both collapsed and expanded
    const [pos,      setPos]      = useState(null)
    const [dragging, setDragging] = useState(false)
    const dragOffset              = useRef({ x: 0, y: 0 })
    const containerRef            = useRef(null)

    const totalMW = orders.reduce((s, o) => s + o.mwNord, 0)

    const ackDate = activeOrder?.acknowledgedAt ? new Date(activeOrder.acknowledgedAt) : null
    const ackStr  = ackDate
        ? `${String(ackDate.getHours()).padStart(2,'0')}:${String(ackDate.getMinutes()).padStart(2,'0')}`
        : '--:--'

    const handleMouseDown = useCallback
    (
        (e) =>
        {
            if (e.target.closest('button')) return
            e.preventDefault()
            const el = containerRef.current
            if (!el) return
            const rect = el.getBoundingClientRect()
            dragOffset.current =
            {
                x: e.clientX - rect.left
                ,y: window.innerHeight - e.clientY - (window.innerHeight - rect.bottom)
            }
            setDragging(true)
        }
        ,[]
    )

    useEffect
    (
        () =>
        {
            if (!dragging) return
            const onMove = (e) =>
            {
                const el          = containerRef.current
                const w           = el ? el.offsetWidth  : 400
                const h           = el ? el.offsetHeight : 60
                const newLeft     = e.clientX - dragOffset.current.x
                const newBottom   = window.innerHeight - e.clientY - dragOffset.current.y
                setPos
                (
                    {
                        left:   Math.max(0, Math.min(newLeft,   window.innerWidth  - w))
                        ,bottom: Math.max(0, Math.min(newBottom, window.innerHeight - h))
                    }
                )
            }
            const onUp = () => setDragging(false)
            document.addEventListener('mousemove', onMove)
            document.addEventListener('mouseup',   onUp)
            return () =>
            {
                document.removeEventListener('mousemove', onMove)
                document.removeEventListener('mouseup',   onUp)
            }
        }
        ,[dragging]
    )

    const posStyle = pos
        ? { position: 'fixed', left: pos.left, bottom: pos.bottom, top: 'auto', right: 'auto' }
        : { position: 'fixed', bottom: '2.75rem', right: '1rem' }

    return (
        <div
            ref={containerRef}
            style={{ ...posStyle, zIndex: 60, maxWidth: '42rem', width: '100%' }}
            className={`shadow-2xl ${dragging ? 'select-none' : ''}`}
        >
            {/* ── Collapsed badge ── */}
            {!expanded && (
                <div
                    className="flex items-center gap-space-sm px-space-md py-space-sm bg-error-container text-on-error-container border border-error animate-pulse"
                    style={{ cursor: dragging ? 'grabbing' : 'grab' }}
                    onMouseDown={handleMouseDown}
                >
                    <Icon name="drag_indicator" size={16} className="text-on-error-container/60 shrink-0" />
                    <div className="relative flex shrink-0">
                        <Icon name="warning" size={17} />
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-error animate-ping" />
                    </div>
                    <div className="flex flex-col items-start leading-tight flex-1 min-w-0">
                        {orders.length === 1
                            ? (
                                <>
                                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider truncate">{activeOrder.orderRef}</span>
                                    <span className="font-mono text-[11px] font-bold truncate">+{activeOrder.mwNord} MW — En attente distribution BCCs</span>
                                </>
                            )
                            : (
                                <>
                                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider">
                                        {orders.length} ORDRES EN ATTENTE
                                    </span>
                                    <span className="font-mono text-[11px] font-bold">
                                        Total : +{totalMW} MW — {orders.map((o) => o.orderRef).join(' · ')}
                                    </span>
                                </>
                            )
                        }
                    </div>
                    <button
                        onClick={() => setExpanded(true)}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="flex items-center gap-space-xs px-space-sm py-space-xs bg-error hover:bg-error-container/80 text-background font-mono text-[10px] font-bold transition-colors shrink-0"
                        type="button"
                    >
                        <Icon name="expand_less" size={15} />
                        <span>Distribuer</span>
                    </button>
                </div>
            )}

            {/* ── Expanded panel ── */}
            {expanded && (
                <div className="bg-surface-container-low border border-error flex flex-col-reverse max-h-[80vh] overflow-hidden">

                    {/* Handle bar — at bottom via flex-col-reverse */}
                    <div
                        className="flex items-center justify-between px-space-md py-space-xs bg-error-container/30 border-t border-error shrink-0"
                        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
                        onMouseDown={handleMouseDown}
                    >
                        <div className="flex items-center gap-space-sm min-w-0 overflow-x-auto">
                            <Icon name="drag_indicator" size={14} className="text-on-surface-variant/60 shrink-0" />
                            {/* Order tabs — shown when multiple */}
                            {orders.map((o, idx) => (
                                <button
                                    key={o.id}
                                    onClick={() => setActiveIdx(idx)}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className={`flex items-center gap-space-xs px-space-sm py-space-xs font-mono text-[10px] font-bold shrink-0 transition-colors ${idx === safeIdx ? 'bg-error text-background' : 'text-on-surface-variant hover:text-on-surface'}`}
                                    type="button"
                                >
                                    <span>{o.orderRef}</span>
                                    <span className="font-normal opacity-70">+{o.mwNord} MW</span>
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => setExpanded(false)}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="flex items-center gap-space-xs px-space-sm py-space-xs bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-mono text-[10px] transition-colors shrink-0"
                            type="button"
                        >
                            <Icon name="expand_more" size={14} />
                            <span>Réduire</span>
                        </button>
                    </div>

                    {/* Dispatch form for the active order */}
                    <div className="flex-1 overflow-y-auto p-space-lg">
                        {activeOrder && (
                            <DispatchForm
                                key={activeOrder.id}
                                order={activeOrder}
                                onDispatch={(id) =>
                                {
                                    onDispatch(id)
                                    const remaining = orders.filter((o) => o.id !== id)
                                    if (remaining.length === 0) setExpanded(false)
                                    else setActiveIdx(Math.min(safeIdx, remaining.length - 1))
                                }}
                                compact={true}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Step 2 — Floating badge (status: 'acknowledged') — DRAGGABLE ─────────────
function AcknowledgedBadge({ order, onDispatch })
{
    const [expanded,  setExpanded]  = useState(false)

    // Position state — stored as { left, bottom } from viewport edges
    // so the container is always anchored by its BOTTOM-LEFT corner.
    // null = use default CSS anchor (bottom-right).
    const [pos,       setPos]       = useState(null)
    const [dragging,  setDragging]  = useState(false)
    const dragOffset                = useRef({ x: 0, y: 0 })
    const containerRef              = useRef(null)

    const ackDate = order.acknowledgedAt ? new Date(order.acknowledgedAt) : null
    const ackStr  = ackDate
        ? `${String(ackDate.getHours()).padStart(2,'0')}:${String(ackDate.getMinutes()).padStart(2,'0')}`
        : '--:--'

    // Start drag — capture offset from pointer to bottom-left of container
    const handleMouseDown = useCallback
    (
        (e) =>
        {
            if (e.target.closest('button')) return
            e.preventDefault()

            const el = containerRef.current
            if (!el) return
            const rect = el.getBoundingClientRect()

            // Offset from pointer to the LEFT edge and BOTTOM edge of the element
            dragOffset.current =
            {
                x: e.clientX - rect.left
                ,y: window.innerHeight - e.clientY - (window.innerHeight - rect.bottom)
            }
            setDragging(true)
        }
        ,[]
    )

    // Move — update bottom+left so the container stays anchored by bottom edge
    useEffect
    (
        () =>
        {
            if (!dragging) return

            const onMove = (e) =>
            {
                const el   = containerRef.current
                const w    = el ? el.offsetWidth  : 400
                const h    = el ? el.offsetHeight : 60

                // New left edge
                const newLeft   = e.clientX - dragOffset.current.x
                // New bottom edge (distance from bottom of viewport)
                const newBottom = window.innerHeight - e.clientY - dragOffset.current.y

                // Clamp so the widget never leaves the viewport
                const clampedLeft   = Math.max(0, Math.min(newLeft,   window.innerWidth  - w))
                const clampedBottom = Math.max(0, Math.min(newBottom,  window.innerHeight - h))

                setPos({ left: clampedLeft, bottom: clampedBottom })
            }

            const onUp = () => setDragging(false)

            document.addEventListener('mousemove', onMove)
            document.addEventListener('mouseup',   onUp)
            return () =>
            {
                document.removeEventListener('mousemove', onMove)
                document.removeEventListener('mouseup',   onUp)
            }
        }
        ,[dragging]
    )

    // Compute inline style — always use bottom+left so expanding grows upward
    const posStyle = pos
        ? { position: 'fixed', left: pos.left, bottom: pos.bottom, top: 'auto', right: 'auto' }
        : { position: 'fixed', bottom: '2.75rem', right: '1rem' }

    return (
        <div
            ref={containerRef}
            style={{ ...posStyle, zIndex: 60, maxWidth: '42rem', width: '100%' }}
            className={`shadow-2xl ${dragging ? 'select-none' : ''}`}
        >
            {/* ── Collapsed badge ── */}
            {!expanded && (
                <div
                    className="flex items-center gap-space-sm px-space-md py-space-sm bg-error-container text-on-error-container border border-error animate-pulse"
                    style={{ cursor: dragging ? 'grabbing' : 'grab' }}
                    onMouseDown={handleMouseDown}
                >
                    {/* Drag handle icon */}
                    <Icon name="drag_indicator" size={16} className="text-on-error-container/60 shrink-0" />

                    <div className="relative flex shrink-0">
                        <Icon name="warning" size={17} />
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-error animate-ping" />
                    </div>

                    <div className="flex flex-col items-start leading-tight flex-1 min-w-0">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider truncate">
                            {order.orderRef}
                        </span>
                        <span className="font-mono text-[11px] font-bold truncate">
                            +{order.mwNord} MW — En attente distribution BCCs
                        </span>
                    </div>

                    <button
                        onClick={() => setExpanded(true)}
                        onMouseDown={(e) => e.stopPropagation()}   // don't start drag on button click
                        className="flex items-center gap-space-xs px-space-sm py-space-xs bg-error hover:bg-error-container/80 text-background font-mono text-[10px] font-bold transition-colors shrink-0"
                        type="button"
                        title="Distribuer aux BCCs"
                    >
                        <Icon name="expand_less" size={15} />
                        <span>Distribuer</span>
                    </button>
                </div>
            )}

            {/* ── Expanded dispatch panel ── */}
            {expanded && (
                <div className="bg-surface-container-low border border-error flex flex-col-reverse max-h-[80vh] overflow-hidden">

                    {/* Panel header — drag handle — rendered last in DOM but shows at bottom via flex-col-reverse */}
                    <div
                        className="flex items-center justify-between px-space-lg py-space-sm bg-error-container/30 border-t border-error shrink-0"
                        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
                        onMouseDown={handleMouseDown}
                    >
                        <div className="flex items-center gap-space-sm min-w-0">
                            <Icon name="drag_indicator" size={15} className="text-on-surface-variant/60 shrink-0" />
                            <Icon name="warning" size={15} className="text-error shrink-0" />
                            <span className="font-mono text-xs font-bold text-on-surface uppercase tracking-wider truncate">
                                {order.orderRef} — Distribution BCCs
                            </span>
                            <span className="font-mono text-[10px] text-on-surface-variant shrink-0">
                                +{order.mwNord} MW · {ackStr}
                            </span>
                        </div>
                        <button
                            onClick={() => setExpanded(false)}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="flex items-center gap-space-xs px-space-sm py-space-xs bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface font-mono text-[10px] transition-colors shrink-0"
                            type="button"
                        >
                            <Icon name="expand_more" size={14} />
                            <span>Réduire</span>
                        </button>
                    </div>

                    {/* Dispatch form — renders above the handle bar */}
                    <div className="flex-1 overflow-y-auto p-space-lg">
                        <DispatchForm
                            order={order}
                            onDispatch={onDispatch}
                            compact={true}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}

// ── BCC Acknowledgement tracker — shown after CRC dispatches a realim order ──
// Simulates BCC responses with realistic timers for demo purposes
// In production this would be driven by websocket events from each BCC

const ACK_THRESHOLD_S  = 180   // 3 min — no ack → alert
const EXEC_THRESHOLD_S = 300   // 5 min after ack — no execution → alert

const BCC_REALIM_META =
[
    { id: 1, short: 'BCC 1', full: 'BCC 1 — Tunis Ville & Nord',    radio: 'VHF 04-Nord', phone: '+216 71 340 102' }
    ,{ id: 2, short: 'BCC 2', full: 'BCC 2 — Tunis Sud & Ben Arous', radio: 'VHF 04-Nord', phone: '+216 71 340 110' }
    ,{ id: 3, short: 'BCC 3', full: 'BCC 3 — Béja / Nord-Ouest',     radio: 'VHF 04-Nord', phone: '+216 78 452 110' }
    ,{ id: 4, short: 'BCC 4', full: 'BCC 4 — Bizerte / Mateur',      radio: 'VHF 04-Nord', phone: '+216 72 431 800' }
]

// Demo: BCC 1 acks fast + executes, BCC 2 acks + executes, BCC 3 acks but delays execution, BCC 4 never acks
const DEMO_SCRIPT =
{
    1: { ackDelaySec: 18,  execDelaySec: 52  }   // fast, compliant
    ,2: { ackDelaySec: 35,  execDelaySec: 90  }  // normal
    ,3: { ackDelaySec: 72,  execDelaySec: 380 }  // acks, then slow to execute → overdue_no_exec
    ,4: { ackDelaySec: null, execDelaySec: null } // never acks → overdue_no_ack
}

function fmtSec(s)
{
    const m = Math.floor(s / 60)
    const r = s % 60
    if (m === 0) return `${r}s`
    return `${m}m ${String(r).padStart(2,'0')}s`
}

function BccAckTracker({ dispatchedAt, bccMW })
{
    const [tick, setTick] = useState(0)

    useEffect
    (
        () =>
        {
            const t = setInterval(() => setTick((n) => n + 1), 1000)
            return () => clearInterval(t)
        }
        ,[]
    )

    const now     = Date.now()
    const elapsed = Math.floor((now - dispatchedAt) / 1000)   // seconds since dispatch

    // Derive each BCC's simulated state from the demo script + elapsed time
    const rows = BCC_REALIM_META.map((b) =>
    {
        const script   = DEMO_SCRIPT[b.id]
        const mw       = bccMW[b.id] ?? 0
        const ackAt    = script.ackDelaySec    != null ? script.ackDelaySec    : null
        const execAt   = script.execDelaySec   != null ? script.execDelaySec   : null
        const hasAck   = ackAt  != null && elapsed >= ackAt
        const hasExec  = execAt != null && elapsed >= execAt
        const sinceAck = hasAck ? elapsed - ackAt : null

        let status
        if (hasExec)                                                                       status = 'executed'
        else if (hasAck && sinceAck != null && sinceAck >= EXEC_THRESHOLD_S)               status = 'overdue_no_exec'
        else if (hasAck)                                                                   status = 'acknowledged'
        else if (!hasAck && elapsed >= ACK_THRESHOLD_S)                                    status = 'overdue_no_ack'
        else                                                                               status = 'waiting'

        return { ...b, mw, status, elapsed, ackAt, execAt, sinceAck, hasAck, hasExec }
    })

    const hasAlert = rows.some((r) => r.status === 'overdue_no_ack' || r.status === 'overdue_no_exec')
    const allDone  = rows.every((r) => r.status === 'executed')

    return (
        <div className="flex flex-col gap-space-sm">

            {/* Section header */}
            <div className="flex items-center justify-between flex-wrap gap-space-xs">
                <div className="flex items-center gap-space-sm">
                    <Icon
                        name={allDone ? 'check_circle' : hasAlert ? 'warning' : 'pending'}
                        size={15}
                        className={allDone ? 'text-[#4ade80]' : hasAlert ? 'text-error animate-pulse' : 'text-secondary'}
                    />
                    <span className="font-mono text-[10px] text-on-surface uppercase font-bold tracking-wider">
                        Suivi d'accusé de réception — BCCs
                    </span>
                </div>
                <div className="flex items-center gap-space-xs font-mono text-[10px] text-on-surface-variant">
                    <Icon name="timer" size={12} />
                    <span>Ordre envoyé il y a <strong className="text-on-surface">{fmtSec(elapsed)}</strong></span>
                </div>
            </div>

            {/* Global alert banner */}
            {hasAlert && (
                <div className="flex items-start gap-space-sm px-space-md py-space-sm bg-error-container/30 border border-error/50 font-mono text-[10px] text-error">
                    <Icon name="crisis_alert" size={14} className="shrink-0 mt-0.5 animate-pulse" />
                    <span>
                        {rows.filter((r) => r.status === 'overdue_no_ack').length > 0 && (
                            <>{rows.filter((r) => r.status === 'overdue_no_ack').map((r) => r.short).join(', ')} — pas d'accusé de réception depuis plus de 3 min. Contacter par radio immédiatement.<br /></>
                        )}
                        {rows.filter((r) => r.status === 'overdue_no_exec').length > 0 && (
                            <>{rows.filter((r) => r.status === 'overdue_no_exec').map((r) => r.short).join(', ')} — accusé reçu mais aucune exécution depuis plus de 5 min. Escalader.</>
                        )}
                    </span>
                </div>
            )}

            {/* BCC rows */}
            <div className="flex flex-col gap-space-xs">
                {rows.map((r) =>
                {
                    const cfg = statusCfg(r.status)
                    return (
                        <div
                            key={r.id}
                            className={`flex flex-col gap-space-xs p-space-sm border font-mono text-[10px] transition-all ${cfg.rowCls}`}
                        >
                            {/* Top row: BCC name + status badge + MW */}
                            <div className="flex items-center justify-between flex-wrap gap-space-xs">
                                <div className="flex items-center gap-space-sm min-w-0">
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotCls}`} />
                                    <span className={`font-bold ${cfg.nameCls}`}>{r.full}</span>
                                </div>
                                <div className="flex items-center gap-space-sm shrink-0">
                                    <span className="text-on-surface-variant">-{r.mw} MW</span>
                                    <span className={`px-space-xs py-0.5 font-bold text-[9px] uppercase ${cfg.badgeCls}`}>
                                        {cfg.label}
                                    </span>
                                </div>
                            </div>

                            {/* Timeline detail row */}
                            <div className="flex items-center gap-space-lg flex-wrap pl-space-md font-mono text-[10px] text-on-surface-variant">
                                {/* Ack time */}
                                <div className="flex items-center gap-space-xs">
                                    <Icon name="mark_email_read" size={11} className={r.hasAck ? 'text-secondary' : 'text-on-surface-variant/40'} />
                                    <span>
                                        {r.hasAck
                                            ? <span className="text-secondary font-semibold">Reçu à +{fmtSec(r.ackAt)}</span>
                                            : r.status === 'overdue_no_ack'
                                                ? <span className="text-error font-bold">PAS D'ACCUSÉ ({fmtSec(elapsed)})</span>
                                                : <span className="text-on-surface-variant">En attente Reçu…</span>
                                        }
                                    </span>
                                </div>

                                {/* Exec time */}
                                <div className="flex items-center gap-space-xs">
                                    <Icon name="power" size={11} className={r.hasExec ? 'text-[#4ade80]' : 'text-on-surface-variant/40'} />
                                    <span>
                                        {r.hasExec
                                            ? <span className="text-[#4ade80] font-semibold">Exécuté à +{fmtSec(r.execAt)}</span>
                                            : r.status === 'overdue_no_exec'
                                                ? <span className="text-error font-bold">EXÉC. NON CONFIRMÉE ({fmtSec(r.sinceAck)} depuis Reçu)</span>
                                                : r.hasAck
                                                    ? <span className="text-on-surface-variant">Exéc. en cours… ({fmtSec(r.sinceAck)} depuis Reçu)</span>
                                                    : <span className="text-on-surface-variant/50">—</span>
                                        }
                                    </span>
                                </div>

                                {/* Contact info — shown only on alert states */}
                                {(r.status === 'overdue_no_ack' || r.status === 'overdue_no_exec') && (
                                    <div className="flex items-center gap-space-xs text-error">
                                        <Icon name="radio" size={11} />
                                        <span>{r.radio}</span>
                                        <Icon name="call" size={11} />
                                        <span>{r.phone}</span>
                                    </div>
                                )}
                            </div>

                            {/* Progress bar — from dispatch to execution */}
                            {!r.hasExec && r.mw > 0 && (
                                <div className="w-full bg-surface-container-lowest h-1 overflow-hidden mt-space-xs pl-space-md">
                                    <div
                                        className={`h-full transition-all ${cfg.barCls}`}
                                        style={{ width: `${Math.min(100, (elapsed / (r.execAt ?? ACK_THRESHOLD_S * 2)) * 100)}%` }}
                                    />
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {allDone && (
                <div className="flex items-center gap-space-sm px-space-md py-space-sm bg-[#4ade80]/10 border border-[#4ade80]/30 font-mono text-[10px] text-[#4ade80] font-bold">
                    <Icon name="check_circle" size={14} />
                    <span>Tous les BCCs ont exécuté l'ordre de réalimentation. Ordre clôturé.</span>
                </div>
            )}
        </div>
    )
}

// Status config for BccAckTracker rows
function statusCfg(status)
{
    switch (status)
    {
        case 'executed':
            return {
                label:    'EXÉCUTÉ'
                ,badgeCls: 'bg-[#4ade80]/20 text-[#4ade80] border border-[#4ade80]/30'
                ,rowCls:   'bg-surface-container border-[#4ade80]/20'
                ,dotCls:   'bg-[#4ade80]'
                ,nameCls:  'text-[#4ade80]'
                ,barCls:   'bg-[#4ade80]'
            }
        case 'acknowledged':
            return {
                label:    'REÇU — EN COURS'
                ,badgeCls: 'bg-secondary-container/40 text-secondary border border-secondary/20'
                ,rowCls:   'bg-surface-container border-surface-container-high'
                ,dotCls:   'bg-secondary animate-pulse'
                ,nameCls:  'text-secondary'
                ,barCls:   'bg-secondary'
            }
        case 'waiting':
            return {
                label:    'EN ATTENTE ACK'
                ,badgeCls: 'bg-surface-container-highest text-on-surface-variant border border-surface-container-high'
                ,rowCls:   'bg-surface-container-lowest border-surface-container-high'
                ,dotCls:   'bg-on-surface-variant/40'
                ,nameCls:  'text-on-surface-variant'
                ,barCls:   'bg-on-surface-variant/30'
            }
        case 'overdue_no_ack':
            return {
                label:    'PAS D\'ACK !'
                ,badgeCls: 'bg-error text-background font-bold'
                ,rowCls:   'bg-error-container/20 border-error animate-pulse'
                ,dotCls:   'bg-error animate-ping'
                ,nameCls:  'text-error'
                ,barCls:   'bg-error'
            }
        case 'overdue_no_exec':
            return {
                label:    'EXÉC. EN RETARD !'
                ,badgeCls: 'bg-tertiary-container text-tertiary border border-tertiary/40 font-bold'
                ,rowCls:   'bg-tertiary-container/20 border-tertiary/40 animate-pulse'
                ,dotCls:   'bg-tertiary animate-ping'
                ,nameCls:  'text-tertiary'
                ,barCls:   'bg-tertiary'
            }
        default:
            return {
                label:    '—'
                ,badgeCls: 'bg-surface-container text-on-surface-variant'
                ,rowCls:   'bg-surface-container border-surface-container-high'
                ,dotCls:   'bg-on-surface-variant/30'
                ,nameCls:  'text-on-surface-variant'
                ,barCls:   'bg-on-surface-variant/20'
            }
    }
}

// ── Réalimentation BCC distribution form ─────────────────────────────────────
function RealimDispatchForm({ order, onComplete })
{
    const totalMW    = order.mwNord ?? order.mwTotal ?? 0
    const suggested  = { 1: Math.round(totalMW * 0.37), 2: Math.round(totalMW * 0.30), 3: Math.round(totalMW * 0.19), 4: Math.max(0, totalMW - Math.round(totalMW * 0.37) - Math.round(totalMW * 0.30) - Math.round(totalMW * 0.19)) }

    const [bccMW,        setBccMW]        = useState(suggested)
    const [sent,         setSent]         = useState(false)
    const [dispatchedAt, setDispatchedAt] = useState(null)
    const [sentBccMW,    setSentBccMW]    = useState(null)

    const total    = Object.values(bccMW).reduce((s, v) => s + Number(v), 0)
    const gap      = total - totalMW
    const balanced = Math.abs(gap) < 0.5

    const handleSend = () =>
    {
        setSent(true)
        setDispatchedAt(Date.now())
        setSentBccMW({ ...bccMW })
    }

    return (
        <div className="flex flex-col gap-space-md">

            {/* ── After dispatch: tracker mode ── */}
            {sent && dispatchedAt && sentBccMW
                ? (
                    <>
                        {/* Sent strip */}
                        <div className="flex items-center justify-between px-space-md py-space-sm bg-secondary-container/20 border border-secondary/30 font-mono text-[10px]">
                            <div className="flex items-center gap-space-sm">
                                <Icon name="broadcast_on_personal" size={13} className="text-secondary" />
                                <span className="text-secondary font-bold uppercase">Ordre transmis aux 4 BCCs</span>
                                <span className="text-on-surface-variant">— {order.orderRef} · -{totalMW} MW</span>
                            </div>
                            <button
                                onClick={() => onComplete(order.id)}
                                className="flex items-center gap-space-xs px-space-sm py-space-xs bg-surface-container hover:bg-surface-container-high border border-surface-container-high text-on-surface-variant font-mono text-[10px] transition-colors"
                                type="button"
                            >
                                <Icon name="check_circle" size={12} />
                                <span>Clôturer</span>
                            </button>
                        </div>
                        <BccAckTracker dispatchedAt={dispatchedAt} bccMW={sentBccMW} />
                    </>
                )
                : (
                    <>
                        {/* MW summary */}
                        <div className="bg-surface-container p-space-md flex flex-wrap items-center justify-between gap-space-md">
                            <div className="flex flex-col">
                                <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">
                                    {order.type === 'totale' ? 'Réalimentation totale — Fin de délestage' : 'Réalimentation partielle à distribuer'}
                                </span>
                                <div className="flex items-baseline gap-space-xs mt-space-xs">
                                    <span className="font-mono text-3xl font-bold text-secondary">-{totalMW}</span>
                                    <span className="font-mono text-sm text-on-surface-variant">MW à rétablir</span>
                                </div>
                            </div>
                            <div className="flex flex-col text-right">
                                <span className="font-mono text-[10px] text-on-surface-variant uppercase">Nouvelle consigne CRC</span>
                                <div className="flex items-baseline gap-space-xs justify-end mt-space-xs">
                                    <span className="font-mono text-3xl font-bold text-[#4ade80]">{Math.max(0, 300 - totalMW)}</span>
                                    <span className="font-mono text-sm text-on-surface-variant">MW</span>
                                </div>
                            </div>
                        </div>

                        {/* AI button + BCC inputs */}
                        <div className="flex flex-col gap-space-sm">
                            <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">
                                <span>Ventilation par BCC</span>
                                <button
                                    onClick={() => setBccMW(suggested)}
                                    className="flex items-center gap-space-xs px-space-sm py-space-xs bg-secondary-container hover:bg-secondary text-on-secondary-container font-mono text-[10px] font-bold transition-all"
                                    type="button"
                                >
                                    <Icon name="auto_fix_high" size={12} />
                                    <span>Suggestion IA (équité)</span>
                                </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                                {[
                                    { id: 1, label: 'BCC 1 — Tunis Ville & Nord'    }
                                    ,{ id: 2, label: 'BCC 2 — Tunis Sud & Ben Arous' }
                                    ,{ id: 3, label: 'BCC 3 — Béja / Nord-Ouest'     }
                                    ,{ id: 4, label: 'BCC 4 — Bizerte / Mateur'      }
                                ].map((b) =>
                                {
                                    const val = bccMW[b.id] ?? 0
                                    const pct = totalMW > 0 ? Math.min(100, (val / totalMW) * 100) : 0
                                    return (
                                        <div key={b.id} className="bg-surface-container p-space-sm flex flex-col gap-space-xs">
                                            <div className="flex items-center justify-between">
                                                <span className="font-sans font-bold text-xs text-on-surface">{b.label}</span>
                                                <span className="font-mono text-[10px] text-secondary">{val} MW</span>
                                            </div>
                                            <div className="flex items-center gap-space-sm">
                                                <span className="font-mono text-xs text-on-surface-variant">-</span>
                                                <input
                                                    type="number" min={0} max={totalMW} step={0.5} value={val}
                                                    onChange={(e) => setBccMW((prev) => ({ ...prev, [b.id]: Number(e.target.value) }))}
                                                    className="w-full bg-surface-container-lowest border border-surface-container-high focus:border-secondary text-secondary font-mono text-sm font-bold px-space-sm py-space-xs focus:outline-none"
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
                            <div className={`p-space-sm flex items-center justify-between font-mono text-xs border ${balanced ? 'bg-[#4ade80]/10 border-[#4ade80]/30 text-[#4ade80]' : 'bg-error-container/30 border-error/40 text-error'}`}>
                                <div className="flex items-center gap-space-md">
                                    <span className="text-on-surface-variant">Total :</span>
                                    <strong className={`text-sm ${balanced ? 'text-[#4ade80]' : 'text-error'}`}>{total.toFixed(1)} MW</strong>
                                    <span className="text-on-surface-variant">/ -{totalMW} MW requis</span>
                                </div>
                                <span className="font-bold text-[10px] uppercase px-space-sm py-0.5">
                                    {balanced ? 'CONFORME' : `ÉCART ${gap > 0 ? '+' : ''}${gap.toFixed(1)} MW`}
                                </span>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between gap-space-md pt-space-md border-t border-surface-container-high flex-wrap">
                            <div className="flex items-center gap-space-xs font-mono text-[10px] text-on-surface-variant">
                                <Icon name="lock" size={13} className="text-secondary" />
                                <span>Ordre horodaté dans l'audit CRC · Action irréversible</span>
                            </div>
                            <button
                                onClick={handleSend}
                                disabled={!balanced}
                                className="flex items-center gap-space-sm px-space-lg py-space-xs bg-secondary-container hover:bg-secondary text-on-secondary-container font-mono text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                                type="button"
                            >
                                <Icon name="refresh" size={14} />
                                <span>Envoyer ordre réalimentation</span>
                            </button>
                        </div>
                    </>
                )
            }
        </div>
    )
}

// ── Réalimentation pending modal (green, blocking) ────────────────────────────
function RealimPendingModal({ order, onReceipt })
{
    const issuedDate = new Date(order.issuedAt)
    const issuedStr  = `${String(issuedDate.getHours()).padStart(2,'0')}:${String(issuedDate.getMinutes()).padStart(2,'0')}`
    const totalMW    = order.mwNord ?? order.mwTotal ?? 0

    return (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[60] flex items-center justify-center p-space-md">
            <div className="bg-surface-container-low w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden ring-2 ring-secondary">

                {/* Header */}
                <div className="p-space-md bg-secondary-container flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-space-md">
                        <div className="w-9 h-9 bg-surface-container-lowest flex items-center justify-center text-secondary shrink-0">
                            <Icon name="refresh" size={24} />
                        </div>
                        <div>
                            <div className="flex items-center gap-space-sm flex-wrap">
                                <span className="font-sans font-bold text-sm text-on-secondary-container uppercase tracking-wider">
                                    ORDRE DE RÉALIMENTATION DN REÇU
                                </span>
                                <span className="px-space-xs py-0.5 bg-surface-container-lowest text-secondary font-mono text-[10px] font-bold">
                                    {order.type === 'totale' ? 'FIN DE DÉLESTAGE' : 'PARTIELLE'}
                                </span>
                            </div>
                            <span className="font-mono text-[10px] text-on-secondary-container/80">
                                Réf : {order.orderRef} · Reçu à {issuedStr} · Dispatching National Radès
                            </span>
                        </div>
                    </div>
                    <div className="text-right shrink-0">
                        <span className="font-mono text-[10px] text-on-secondary-container/70 block uppercase">Type</span>
                        <span className="font-mono font-bold text-on-secondary-container text-lg">
                            -{totalMW} MW
                        </span>
                    </div>
                </div>

                {/* Body */}
                <div className="p-space-lg bg-surface-container-lowest flex flex-col gap-space-md">
                    <div className="bg-surface-container p-space-md flex flex-wrap items-center justify-between gap-space-md">
                        <div className="flex flex-col">
                            <span className="font-mono text-[10px] text-on-surface-variant uppercase">
                                {order.type === 'totale' ? 'Rétablissement intégral' : 'Réduction délestage (CRC Nord)'}
                            </span>
                            <div className="flex items-baseline gap-space-xs mt-space-xs">
                                <span className="font-mono text-4xl font-bold text-secondary">-{totalMW}</span>
                                <span className="font-mono text-sm text-on-surface-variant">MW à rétablir</span>
                            </div>
                        </div>
                        <div className="flex flex-col text-right">
                            <span className="font-mono text-[10px] text-on-surface-variant uppercase">Nouvelle consigne CRC</span>
                            <div className="flex items-baseline gap-space-xs justify-end mt-space-xs">
                                <span className="font-mono text-4xl font-bold text-[#4ade80]">{Math.max(0, 300 - totalMW)}</span>
                                <span className="font-mono text-sm text-on-surface-variant">MW</span>
                            </div>
                        </div>
                    </div>
                    <p className="font-mono text-xs text-on-surface-variant leading-relaxed">
                        Accusez réception de cet ordre immédiatement. Vous pourrez ensuite distribuer la réduction aux BCCs
                        depuis le badge flottant en bas à droite de l'écran.
                    </p>
                </div>

                {/* Footer */}
                <div className="px-space-lg py-space-md bg-surface-container border-t border-surface-container-high flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-space-xs font-mono text-[10px] text-on-surface-variant">
                        <Icon name="schedule" size={13} className="text-secondary" />
                        <span>Accusé de réception horodaté dans l'audit CRC</span>
                    </div>
                    <button
                        onClick={() => onReceipt(order.id)}
                        className="flex items-center gap-space-sm px-space-xl py-space-md bg-secondary-container hover:bg-secondary text-on-secondary-container font-mono text-sm font-bold uppercase tracking-wider transition-all shadow-lg"
                        type="button"
                    >
                        <Icon name="check" size={18} />
                        <span>Reçu — Pris en charge</span>
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Réalimentation floating badge + distribution panel ────────────────────────
function RealimBadge({ orders, onComplete, offsetUp = false })
{
    const [expanded,  setExpanded]  = useState(false)
    const [activeIdx, setActiveIdx] = useState(0)
    const [pos,       setPos]       = useState(null)
    const [dragging,  setDragging]  = useState(false)
    const dragOffset                = useRef({ x: 0, y: 0 })
    const containerRef              = useRef(null)

    const safeIdx     = Math.min(activeIdx, Math.max(0, orders.length - 1))
    const activeOrder = orders[safeIdx]
    const totalMW     = orders.reduce((s, o) => s + (o.mwNord ?? o.mwTotal ?? 0), 0)

    const ackDate = activeOrder?.acknowledgedAt ? new Date(activeOrder.acknowledgedAt) : null
    const ackStr  = ackDate
        ? `${String(ackDate.getHours()).padStart(2,'0')}:${String(ackDate.getMinutes()).padStart(2,'0')}`
        : '--:--'

    const handleMouseDown = useCallback
    (
        (e) =>
        {
            if (e.target.closest('button')) return
            e.preventDefault()
            const el = containerRef.current
            if (!el) return
            const rect = el.getBoundingClientRect()
            dragOffset.current =
            {
                x: e.clientX - rect.left
                ,y: window.innerHeight - e.clientY - (window.innerHeight - rect.bottom)
            }
            setDragging(true)
        }
        ,[]
    )

    useEffect
    (
        () =>
        {
            if (!dragging) return
            const onMove = (e) =>
            {
                const el          = containerRef.current
                const w           = el ? el.offsetWidth  : 400
                const h           = el ? el.offsetHeight : 60
                const newLeft     = e.clientX - dragOffset.current.x
                const newBottom   = window.innerHeight - e.clientY - dragOffset.current.y
                setPos
                (
                    {
                        left:    Math.max(0, Math.min(newLeft,   window.innerWidth  - w))
                        ,bottom: Math.max(0, Math.min(newBottom,  window.innerHeight - h))
                    }
                )
            }
            const onUp = () => setDragging(false)
            document.addEventListener('mousemove', onMove)
            document.addEventListener('mouseup',   onUp)
            return () =>
            {
                document.removeEventListener('mousemove', onMove)
                document.removeEventListener('mouseup',   onUp)
            }
        }
        ,[dragging]
    )

    // Default position: bottom-right, shifted up if urgence badge is also showing
    const defaultBottom = offsetUp ? '5.5rem' : '2.75rem'
    const posStyle = pos
        ? { position: 'fixed', left: pos.left, bottom: pos.bottom, top: 'auto', right: 'auto' }
        : { position: 'fixed', bottom: defaultBottom, right: '1rem' }

    return (
        <div
            ref={containerRef}
            style={{ ...posStyle, zIndex: 59, maxWidth: '42rem', width: '100%' }}
            className={`shadow-2xl ${dragging ? 'select-none' : ''}`}
        >
            {/* ── Collapsed badge ── */}
            {!expanded && (
                <div
                    className="flex items-center gap-space-sm px-space-md py-space-sm bg-secondary-container text-on-secondary-container border border-secondary animate-pulse"
                    style={{ cursor: dragging ? 'grabbing' : 'grab' }}
                    onMouseDown={handleMouseDown}
                >
                    <Icon name="drag_indicator" size={16} className="text-on-secondary-container/60 shrink-0" />
                    <div className="relative flex shrink-0">
                        <Icon name="refresh" size={17} />
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#4ade80] animate-ping" />
                    </div>
                    <div className="flex flex-col items-start leading-tight flex-1 min-w-0">
                        {orders.length === 1
                            ? (
                                <>
                                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider truncate">{activeOrder.orderRef}</span>
                                    <span className="font-mono text-[11px] font-bold truncate">
                                        -{(activeOrder.mwNord ?? activeOrder.mwTotal ?? 0)} MW — En attente distribution BCCs
                                    </span>
                                </>
                            )
                            : (
                                <>
                                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider">
                                        {orders.length} RÉALIM. EN ATTENTE
                                    </span>
                                    <span className="font-mono text-[11px] font-bold">
                                        Total : -{totalMW} MW — {orders.map((o) => o.orderRef).join(' · ')}
                                    </span>
                                </>
                            )
                        }
                    </div>
                    <button
                        onClick={() => setExpanded(true)}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="flex items-center gap-space-xs px-space-sm py-space-xs bg-secondary hover:bg-secondary-container/80 text-background font-mono text-[10px] font-bold transition-colors shrink-0"
                        type="button"
                    >
                        <Icon name="expand_less" size={15} />
                        <span>Distribuer</span>
                    </button>
                </div>
            )}

            {/* ── Expanded panel ── */}
            {expanded && (
                <div className="bg-surface-container-low border border-secondary flex flex-col-reverse max-h-[80vh] overflow-hidden">
                    {/* Handle bar — bottom */}
                    <div
                        className="flex items-center justify-between px-space-lg py-space-xs bg-secondary-container/30 border-t border-secondary shrink-0"
                        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
                        onMouseDown={handleMouseDown}
                    >
                        <div className="flex items-center gap-space-sm min-w-0 overflow-x-auto">
                            <Icon name="drag_indicator" size={14} className="text-on-surface-variant/60 shrink-0" />
                            {orders.map((o, idx) => (
                                <button
                                    key={o.id}
                                    onClick={() => setActiveIdx(idx)}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className={`flex items-center gap-space-xs px-space-sm py-space-xs font-mono text-[10px] font-bold shrink-0 transition-colors ${idx === safeIdx ? 'bg-secondary text-background' : 'text-on-surface-variant hover:text-on-surface'}`}
                                    type="button"
                                >
                                    <span>{o.orderRef}</span>
                                    <span className="font-normal opacity-70">-{o.mwNord ?? o.mwTotal ?? 0} MW</span>
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => setExpanded(false)}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="flex items-center gap-space-xs px-space-sm py-space-xs bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-mono text-[10px] transition-colors shrink-0"
                            type="button"
                        >
                            <Icon name="expand_more" size={14} />
                            <span>Réduire</span>
                        </button>
                    </div>

                    {/* Distribution form */}
                    <div className="flex-1 overflow-y-auto p-space-lg">
                        {activeOrder && (
                            <RealimDispatchForm
                                key={activeOrder.id}
                                order={activeOrder}
                                onComplete={(id) =>
                                {
                                    onComplete(id)
                                    const remaining = orders.filter((o) => o.id !== id)
                                    if (remaining.length === 0) setExpanded(false)
                                    else setActiveIdx(Math.min(safeIdx, remaining.length - 1))
                                }}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Public component ──────────────────────────────────────────────────────────
export default function CRCUrgencePopup()
{
    const { user }                                                          = useAuthStore()
    const { urgences, realims, acknowledgeReceipt, dispatchComplete, completeRealim, seedDemo, modalOpen } = useUrgenceStore()

    // Seed a demo order the first time a CRC user lands on any page
    useEffect
    (
        () =>
        {
            if (user?.role === 'CRC') seedDemo()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
        ,[]
    )

    if (!user || user.role !== 'CRC') return null

    const userCRC  = user.zone ?? 'CRC Nord'
    const myOrders = urgences.filter
    (
        (o) => o.targetCRC === 'both' || o.targetCRC === userCRC
    )

    // Réalimentation orders — all active (pending or acknowledged, not cancelled)
    const myRealims = (realims ?? []).filter
    (
        (r) => r.status !== 'cancelled'
    )

    // Pending urgence orders — show blocking modal (FIFO, one at a time)
    const pendingUrgences = myOrders.filter((o) => o.status === 'pending')

    // Pending realim orders — show blocking modal ONLY when no urgence modal is active
    const pendingRealims = myRealims.filter((r) => r.status === 'pending')

    // Acknowledged orders — floating badges
    const acknowledgedUrgences = myOrders.filter((o) => o.status === 'acknowledged')
    const acknowledgedRealims  = myRealims.filter((r) => r.status === 'acknowledged')

    return (
        <>
            {/* Urgence blocking modal — highest priority, shown first */}
            {pendingUrgences.length > 0 && (
                <PendingModal
                    key={pendingUrgences[0].id}
                    order={pendingUrgences[0]}
                    onReceipt={acknowledgeReceipt}
                />
            )}

            {/* Realim blocking modal — only shown when no urgence modal is active */}
            {pendingUrgences.length === 0 && pendingRealims.length > 0 && (
                <RealimPendingModal
                    key={pendingRealims[0].id}
                    order={pendingRealims[0]}
                    onReceipt={(id) =>
                    {
                        // Move realim from pending → acknowledged in store
                        useUrgenceStore.getState().realims &&
                        useUrgenceStore.setState
                        (
                            (s) => ({
                                realims: s.realims.map
                                (
                                    (r) => r.id === id
                                        ? { ...r, status: 'acknowledged', acknowledgedAt: new Date().toISOString() }
                                        : r
                                )
                            })
                        )
                    }}
                />
            )}

            {/* Urgence floating badges */}
            {!modalOpen && acknowledgedUrgences.length > 0 && (
                <ConsolidatedBadge
                    orders={acknowledgedUrgences}
                    onDispatch={dispatchComplete}
                />
            )}

            {/* Realim floating badge — offset upward when urgence badge is also showing */}
            {!modalOpen && acknowledgedRealims.length > 0 && (
                <RealimBadge
                    orders={acknowledgedRealims}
                    onComplete={completeRealim ?? (() => {})}
                    offsetUp={acknowledgedUrgences.length > 0}
                />
            )}
        </>
    )
}
