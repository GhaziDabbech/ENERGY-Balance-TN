import { useState, useEffect, useRef, useCallback } from 'react'
import { useBccOrderStore } from '../../stores/bccOrderStore'
import { useAuthStore }     from '../../stores/authStore'

function Icon({ name, size = 18, className = '' })
{
    return (
        <span className={`material-symbols-outlined ${className}`} style={{ fontSize: size }}>
            {name}
        </span>
    )
}

// ── Available feeders for cut (urgence) ───────────────────────────────────────
const AVAILABLE_FOR_CUT =
[
    { ref:'F28', nom:'Goubellat Sud',    mw:3.5, priority:'P5' }
    ,{ ref:'F21', nom:'Amdoun Rural',   mw:4.8, priority:'P4' }
    ,{ ref:'F33', nom:'Oued Meliz',     mw:3.2, priority:'P5' }
    ,{ ref:'F31', nom:'Jendouba Ctr',   mw:4.1, priority:'P3' }
    ,{ ref:'F36', nom:'Ghardimaou V.',  mw:5.8, priority:'P3' }
]

// ── Available feeders for restore (réalimentation) ────────────────────────────
const AVAILABLE_FOR_RESTORE =
[
    { ref:'F18', nom:'Nefza Rural',     mw:2.6, priority:'P2', elapsed:52 }
    ,{ ref:'F09', nom:'Faubourg Est',   mw:3.8, priority:'P4', elapsed:28 }
    ,{ ref:'F07', nom:'Z.I. Béja Nord', mw:4.2, priority:'P3', elapsed:32 }
    ,{ ref:'F25', nom:'Bou Salem Ctr',  mw:5.5, priority:'P2', elapsed:15 }
]

// ── Theme by order type ───────────────────────────────────────────────────────
const THEME =
{
    urgence:
    {
        ring:       'ring-error'
        ,headerBg:  'bg-error-container'
        ,headerText:'text-on-error-container'
        ,icon:      'crisis_alert'
        ,iconAnim:  'animate-bounce'
        ,badgeBg:   'bg-error-container'
        ,badgeText: 'text-on-error-container'
        ,badgeBorder:'border-error'
        ,btnBg:     'bg-error text-background hover:bg-error-container hover:text-on-error-container'
        ,title:     "ORDRE D'URGENCE CRC — EFFACEMENT IMMÉDIAT"
        ,subtitle:  'MW supplémentaires à délester sur BCC 3'
        ,btnLabel:  'Valider & Exécuter les départs'
        ,badgeIcon: 'bolt'
        ,panelBorder:'border-error'
    }
    ,realim:
    {
        ring:       'ring-secondary'
        ,headerBg:  'bg-secondary-container'
        ,headerText:'text-on-secondary-container'
        ,icon:      'sync'
        ,iconAnim:  ''
        ,badgeBg:   'bg-secondary-container/80'
        ,badgeText: 'text-on-secondary-container'
        ,badgeBorder:'border-secondary'
        ,btnBg:     'bg-secondary text-background hover:bg-secondary-container hover:text-on-secondary-container'
        ,title:     'ORDRE DE RÉALIMENTATION CRC'
        ,subtitle:  'MW à rétablir sur BCC 3'
        ,btnLabel:  'Rétablir les départs sélectionnés'
        ,badgeIcon: 'refresh'
        ,panelBorder:'border-secondary'
    }
}

// ── Feeder selector used in both modals ───────────────────────────────────────
function FeederSelector({ feeders, selected, onToggle, target, type })
{
    const total   = feeders.filter((f) => selected.includes(f.ref)).reduce((s, f) => s + f.mw, 0)
    const gap     = total - target
    const ok      = Math.abs(gap) < 0.5
    const isRealim = type === 'realim'

    const aiSuggest = () =>
    {
        // Greedy: pick feeders until target reached
        let acc    = 0
        const pick = []
        const pool = [...feeders].sort((a, b) =>
            isRealim ? b.elapsed - a.elapsed : b.mw - a.mw
        )
        for (const f of pool)
        {
            if (acc >= target) break
            pick.push(f.ref)
            acc += f.mw
        }
        onToggle(pick, true)   // true = replace selection
    }

    return (
        <div className="flex flex-col gap-space-sm">
            <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">
                <span>{isRealim ? 'Départs à rétablir' : 'Départs supplémentaires à couper'}</span>
                <button
                    onClick={aiSuggest}
                    className="flex items-center gap-space-xs px-space-sm py-space-xs bg-secondary-container hover:bg-secondary text-on-secondary-container font-bold transition-all"
                    type="button"
                >
                    <Icon name="auto_fix_high" size={12} />
                    <span>Suggestion IA</span>
                </button>
            </div>

            <div className="flex flex-col gap-space-xs">
                {feeders.map((f) =>
                {
                    const isSel = selected.includes(f.ref)
                    return (
                        <button
                            key={f.ref}
                            onClick={() => onToggle([f.ref])}
                            className={`flex items-center justify-between p-space-sm text-left transition-colors border font-mono text-[10px] ${isSel ? 'bg-secondary-container/30 border-secondary text-on-surface' : 'bg-surface-container border-surface-container-high text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}`}
                            type="button"
                        >
                            <div className="flex items-center gap-space-sm">
                                <div className={`w-3.5 h-3.5 border-2 flex items-center justify-center shrink-0 transition-colors ${isSel ? 'bg-secondary border-secondary' : 'border-surface-container-highest'}`}>
                                    {isSel && <Icon name="check" size={10} className="text-background font-bold" />}
                                </div>
                                <span className={`font-bold ${isSel ? 'text-secondary' : 'text-on-surface-variant'}`}>{f.ref}</span>
                                <span>{f.nom}</span>
                                <span className="text-on-surface-variant">({f.priority})</span>
                                {isRealim && f.elapsed != null && (
                                    <span className={`px-space-xs py-0.5 font-bold ${f.elapsed >= 45 ? 'bg-error text-background' : 'bg-surface-container text-tertiary'}`}>
                                        {f.elapsed} min
                                    </span>
                                )}
                            </div>
                            <span className={`font-bold shrink-0 ${isSel ? 'text-secondary' : 'text-on-surface'}`}>{f.mw} MW</span>
                        </button>
                    )
                })}
            </div>

            {/* Balance */}
            <div className={`p-space-sm flex items-center justify-between font-mono text-xs border ${ok ? 'bg-[#4ade80]/10 border-[#4ade80]/30 text-[#4ade80]' : 'bg-error-container/30 border-error/40 text-error'}`}>
                <div className="flex items-center gap-space-md">
                    <span className="text-on-surface-variant">Total sélectionné :</span>
                    <strong className={`text-sm ${ok ? 'text-[#4ade80]' : 'text-error'}`}>{total.toFixed(1)} MW</strong>
                    <span className="text-on-surface-variant">/ {type === 'realim' ? 'Rétablir' : 'Couper'} {target} MW</span>
                </div>
                <span className="font-bold text-[10px] uppercase px-space-sm py-0.5">
                    {ok ? 'CONFORME' : `ÉCART ${gap > 0 ? '+' : ''}${gap.toFixed(1)} MW`}
                </span>
            </div>
        </div>
    )
}

// ── Step 1 — Blocking modal (status: 'pending') ───────────────────────────────
function PendingModal({ order, onReceipt })
{
    const t          = THEME[order.type] ?? THEME.urgence
    const issuedDate = new Date(order.issuedAt)
    const issuedStr  = `${String(issuedDate.getHours()).padStart(2,'0')}:${String(issuedDate.getMinutes()).padStart(2,'0')}`

    return (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[60] flex items-center justify-center p-space-md">
            <div className={`bg-surface-container-low w-full max-w-xl flex flex-col shadow-2xl overflow-hidden ring-2 ${t.ring}`}>

                {/* Header */}
                <div className={`p-space-md ${t.headerBg} flex items-center justify-between shrink-0`}>
                    <div className="flex items-center gap-space-md">
                        <div className={`w-9 h-9 bg-surface-container-lowest flex items-center justify-center shrink-0 ${t.headerText} ${t.iconAnim}`}>
                            <Icon name={t.icon} size={22} />
                        </div>
                        <div>
                            <div className="flex items-center gap-space-sm flex-wrap">
                                <span className={`font-sans font-bold text-sm ${t.headerText} uppercase tracking-wider`}>
                                    {t.title}
                                </span>
                            </div>
                            <span className={`font-mono text-[10px] ${t.headerText} opacity-80`}>
                                Réf : {order.orderRef} · Reçu à {issuedStr} · CRC Nord
                            </span>
                        </div>
                    </div>
                    <div className="text-right shrink-0">
                        <span className={`font-mono text-[10px] ${t.headerText} opacity-70 block uppercase`}>Délai exécution</span>
                        <span className={`font-mono font-bold ${t.headerText} text-lg`}>&lt; 03:00 MIN</span>
                    </div>
                </div>

                {/* Body */}
                <div className="p-space-lg bg-surface-container-lowest flex flex-col gap-space-md">
                    <div className="bg-surface-container p-space-md flex flex-wrap items-center justify-between gap-space-md">
                        <div className="flex flex-col">
                            <span className="font-mono text-[10px] text-on-surface-variant uppercase">{t.subtitle}</span>
                            <div className="flex items-baseline gap-space-xs mt-space-xs">
                                <span className={`font-mono text-4xl font-bold ${order.type === 'urgence' ? 'text-error' : 'text-secondary'}`}>
                                    {order.type === 'urgence' ? '+' : '-'}{order.mwTarget}
                                </span>
                                <span className="font-mono text-sm text-on-surface-variant">MW</span>
                            </div>
                        </div>
                        <div className={`px-space-md py-space-sm font-mono text-[10px] font-bold uppercase border ${order.type === 'urgence' ? 'bg-error-container/20 border-error/40 text-error' : 'bg-secondary-container/20 border-secondary/40 text-secondary'}`}>
                            {order.type === 'urgence' ? 'EFFACEMENT IMMÉDIAT' : 'RÉALIMENTATION'}
                        </div>
                    </div>
                    <p className="font-mono text-xs text-on-surface-variant leading-relaxed">
                        Accusez réception de cet ordre immédiatement. Vous pourrez ensuite sélectionner les départs
                        via le badge flottant en bas à droite de l'écran.
                    </p>
                </div>

                {/* Footer */}
                <div className="px-space-lg py-space-md bg-surface-container border-t border-surface-container-high flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-space-xs font-mono text-[10px] text-on-surface-variant">
                        <Icon name="schedule" size={13} className="text-tertiary" />
                        <span>Accusé de réception horodaté dans l'audit BCC</span>
                    </div>
                    <button
                        onClick={() => onReceipt(order.id)}
                        className={`flex items-center gap-space-sm px-space-xl py-space-md font-mono text-sm font-bold uppercase tracking-wider transition-all shadow-lg ${t.btnBg}`}
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

// ── Draggable floating badge + expanded dispatch panel ────────────────────────
function AcknowledgedBadge({ order, onExecute })
{
    const t          = THEME[order.type] ?? THEME.urgence
    const feeders    = order.type === 'urgence' ? AVAILABLE_FOR_CUT : AVAILABLE_FOR_RESTORE
    const [expanded, setExpanded]   = useState(false)
    const [selected, setSelected]   = useState([])
    const [sent,     setSent]       = useState(false)

    const [pos,      setPos]        = useState(null)
    const [dragging, setDragging]   = useState(false)
    const dragOffset                = useRef({ x: 0, y: 0 })
    const containerRef              = useRef(null)

    const ackDate = order.acknowledgedAt ? new Date(order.acknowledgedAt) : null
    const ackStr  = ackDate
        ? `${String(ackDate.getHours()).padStart(2,'0')}:${String(ackDate.getMinutes()).padStart(2,'0')}`
        : '--:--'

    const handleMouseDown = useCallback
    (
        (e) =>
        {
            if (e.target.closest('button')) return
            e.preventDefault()
            const el   = containerRef.current
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
                const el      = containerRef.current
                const w       = el ? el.offsetWidth  : 400
                const h       = el ? el.offsetHeight : 60
                const newLeft = e.clientX - dragOffset.current.x
                const newBot  = window.innerHeight - e.clientY - dragOffset.current.y
                setPos
                (
                    {
                        left:    Math.max(0, Math.min(newLeft, window.innerWidth  - w))
                        ,bottom: Math.max(0, Math.min(newBot,  window.innerHeight - h))
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

    const handleToggle = (refs, replace = false) =>
    {
        if (replace)
        {
            setSelected(refs)
            return
        }
        setSelected
        (
            (prev) => refs.reduce
            (
                (acc, ref) => acc.includes(ref) ? acc.filter((r) => r !== ref) : [...acc, ref]
                ,prev
            )
        )
    }

    const handleSend = () =>
    {
        setSent(true)
        setTimeout(() => onExecute(order.id), 1500)
    }

    const selectedTotal = feeders
        .filter((f) => selected.includes(f.ref))
        .reduce((s, f) => s + f.mw, 0)
    const ok = Math.abs(selectedTotal - order.mwTarget) < 0.5

    return (
        <div
            ref={containerRef}
            style={{ ...posStyle, zIndex: 60, maxWidth: '38rem', width: '100%' }}
            className={`shadow-2xl ${dragging ? 'select-none' : ''}`}
        >
            {/* ── Collapsed badge ── */}
            {!expanded && (
                <div
                    className={`flex items-center gap-space-sm px-space-md py-space-sm border animate-pulse ${t.badgeBg} ${t.badgeText} ${t.badgeBorder}`}
                    style={{ cursor: dragging ? 'grabbing' : 'grab' }}
                    onMouseDown={handleMouseDown}
                >
                    <Icon name="drag_indicator" size={15} className="opacity-60 shrink-0" />
                    <div className="relative flex shrink-0">
                        <Icon name={t.badgeIcon} size={16} />
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-error animate-ping" />
                    </div>
                    <div className="flex flex-col items-start leading-tight flex-1 min-w-0">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider truncate">
                            {order.orderRef}
                        </span>
                        <span className="font-mono text-[11px] font-bold truncate">
                            {order.type === 'urgence' ? '+' : '-'}{order.mwTarget} MW — {order.type === 'urgence' ? 'Couper départs' : 'Rétablir départs'}
                        </span>
                    </div>
                    <button
                        onClick={() => setExpanded(true)}
                        onMouseDown={(e) => e.stopPropagation()}
                        className={`flex items-center gap-space-xs px-space-sm py-space-xs font-mono text-[10px] font-bold transition-colors shrink-0 ${order.type === 'urgence' ? 'bg-error text-background hover:bg-error-container hover:text-on-error-container' : 'bg-secondary text-background hover:bg-secondary-container hover:text-on-secondary-container'}`}
                        type="button"
                    >
                        <Icon name="expand_less" size={14} />
                        <span>Exécuter</span>
                    </button>
                </div>
            )}

            {/* ── Expanded dispatch panel ── */}
            {expanded && (
                <div className={`bg-surface-container-low border flex flex-col-reverse max-h-[80vh] overflow-hidden ${t.panelBorder}`}>

                    {/* Handle bar — bottom */}
                    <div
                        className={`flex items-center justify-between px-space-md py-space-xs border-t shrink-0 ${order.type === 'urgence' ? 'bg-error-container/20 border-error/40' : 'bg-secondary-container/20 border-secondary/40'}`}
                        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
                        onMouseDown={handleMouseDown}
                    >
                        <div className="flex items-center gap-space-sm min-w-0 overflow-x-auto">
                            <Icon name="drag_indicator" size={13} className="text-on-surface-variant/60 shrink-0" />
                            <Icon name={t.badgeIcon} size={13} className={order.type === 'urgence' ? 'text-error shrink-0' : 'text-secondary shrink-0'} />
                            <span className="font-mono text-xs font-bold text-on-surface uppercase truncate">
                                {order.orderRef} · {order.type === 'urgence' ? '+' : '-'}{order.mwTarget} MW · {ackStr}
                            </span>
                        </div>
                        <button
                            onClick={() => setExpanded(false)}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="flex items-center gap-space-xs px-space-sm py-space-xs bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-mono text-[10px] transition-colors shrink-0"
                            type="button"
                        >
                            <Icon name="expand_more" size={13} />
                            <span>Réduire</span>
                        </button>
                    </div>

                    {/* Dispatch content */}
                    <div className="flex-1 overflow-y-auto p-space-lg flex flex-col gap-space-md">
                        {/* MW summary */}
                        <div className="bg-surface-container p-space-md flex items-center justify-between gap-space-md">
                            <div className="flex flex-col">
                                <span className="font-mono text-[10px] text-on-surface-variant uppercase">
                                    {t.subtitle}
                                </span>
                                <div className="flex items-baseline gap-space-xs mt-space-xs">
                                    <span className={`font-mono text-3xl font-bold ${order.type === 'urgence' ? 'text-error' : 'text-secondary'}`}>
                                        {order.type === 'urgence' ? '+' : '-'}{order.mwTarget}
                                    </span>
                                    <span className="font-mono text-sm text-on-surface-variant">MW</span>
                                </div>
                            </div>
                            <span className={`font-mono text-[10px] font-bold px-space-md py-space-xs border ${order.type === 'urgence' ? 'bg-error-container/20 border-error/40 text-error' : 'bg-secondary-container/20 border-secondary/40 text-secondary'}`}>
                                {order.orderRef}
                            </span>
                        </div>

                        {/* Feeder selector */}
                        <FeederSelector
                            feeders={feeders}
                            selected={selected}
                            onToggle={handleToggle}
                            target={order.mwTarget}
                            type={order.type}
                        />

                        {/* Footer */}
                        <div className="flex items-center justify-between gap-space-md pt-space-sm border-t border-surface-container-high flex-wrap">
                            <div className="flex items-center gap-space-xs font-mono text-[10px] text-on-surface-variant">
                                <Icon name="lock" size={12} className="text-tertiary" />
                                <span>Ordre horodaté dans l'audit BCC · Action irréversible</span>
                            </div>
                            <button
                                onClick={handleSend}
                                disabled={!ok || sent}
                                className={`flex items-center gap-space-sm px-space-lg py-space-xs font-mono text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md ${t.btnBg}`}
                                type="button"
                            >
                                {sent
                                    ? <><Icon name="check_circle" size={14} className="text-[#4ade80]" /><span>Exécuté !</span></>
                                    : <><Icon name={order.type === 'urgence' ? 'bolt' : 'refresh'} size={14} /><span>{t.btnLabel}</span></>
                                }
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Public component ──────────────────────────────────────────────────────────
export default function BCCOrderPopup()
{
    const { user }                                               = useAuthStore()
    const { orders, acknowledgeReceipt, executeComplete, seedDemo, modalOpen } = useBccOrderStore()

    // Seed demo orders on every BCC login
    useEffect
    (
        () => { if (user?.role === 'BCC') seedDemo() }
        // eslint-disable-next-line react-hooks/exhaustive-deps
        ,[]
    )

    if (!user || user.role !== 'BCC') return null

    const pending      = orders.filter((o) => o.status === 'pending')
    const acknowledged = orders.filter((o) => o.status === 'acknowledged')

    return (
        <>
            {/* Blocking modal for the oldest pending order (FIFO) */}
            {pending.length > 0 && (
                <PendingModal
                    key={pending[0].id}
                    order={pending[0]}
                    onReceipt={acknowledgeReceipt}
                />
            )}

            {/* Draggable badges for acknowledged orders — hidden while a blocking modal covers them */}
            {!modalOpen && acknowledged.map((o, idx) => (
                <div
                    key={o.id}
                    style={idx > 0 ? { bottom: `${2.75 + idx * 5}rem`, right: '1rem', position: 'fixed', zIndex: 60, maxWidth: '38rem', width: '100%' } : {}}
                >
                    <AcknowledgedBadge
                        order={o}
                        onExecute={executeComplete}
                    />
                </div>
            ))}
        </>
    )
}
