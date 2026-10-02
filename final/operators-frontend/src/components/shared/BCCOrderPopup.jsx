import { useState, useEffect, useRef, useCallback } from 'react'
import { useBccOrderStore } from '../../stores/bccOrderStore'
import { useAuthStore }     from '../../stores/authStore'
import { useLiveStore }     from '../../stores/liveStore'
import api                  from '../../lib/api'

function Icon({ name, size = 18, className = '' })
{
    return (
        <span className={`material-symbols-outlined ${className}`} style={{ fontSize: size }}>
            {name}
        </span>
    )
}

// ── Theme by order type ───────────────────────────────────────────────────────
const THEME =
{
    urgence:
    {
        ring:        'ring-error'
        ,headerBg:   'bg-error-container'
        ,headerText: 'text-on-error-container'
        ,icon:       'crisis_alert'
        ,iconAnim:   'animate-bounce'
        ,badgeBg:    'bg-error-container'
        ,badgeText:  'text-on-error-container'
        ,badgeBorder:'border-error'
        ,btnBg:      'bg-error text-background hover:bg-error-container hover:text-on-error-container'
        ,title:      "ORDRE D'URGENCE CRC — EFFACEMENT IMMÉDIAT"
        ,subtitle:   'MW supplémentaires à délester'
        ,badgeIcon:  'bolt'
        ,panelBorder:'border-error'
    }
    ,realim:
    {
        ring:        'ring-secondary'
        ,headerBg:   'bg-secondary-container'
        ,headerText: 'text-on-secondary-container'
        ,icon:       'sync'
        ,iconAnim:   ''
        ,badgeBg:    'bg-secondary-container/80'
        ,badgeText:  'text-on-secondary-container'
        ,badgeBorder:'border-secondary'
        ,btnBg:      'bg-secondary text-background hover:bg-secondary-container hover:text-on-secondary-container'
        ,title:      'ORDRE DE RÉALIMENTATION CRC'
        ,subtitle:   'MW à rétablir'
        ,badgeIcon:  'refresh'
        ,panelBorder:'border-secondary'
    }
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
                            <span className={`font-sans font-bold text-sm ${t.headerText} uppercase tracking-wider`}>
                                {t.title}
                            </span>
                            <p className={`font-mono text-[10px] ${t.headerText} opacity-80 mt-0.5`}>
                                Réf : {order.orderRef} · Reçu à {issuedStr}
                            </p>
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
                        Accusez réception de cet ordre. Ensuite, sélectionnez et exécutez les départs
                        depuis la grille principale — la progression sera suivie en temps réel.
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

// ── Netted badge — shows ONE panel for all acknowledged orders combined ────────
//
// Sign convention (matches BCCDashboard inline banner):
//   délestage (urgence) = negative  → BCC must shed more
//   réalimentation      = positive  → BCC must restore
//
// net = Σ(realim MWs) − Σ(urgence MWs)
//   net < 0  → shedding banner   (|net| MW to cut)
//   net > 0  → realim banner     (|net| MW to restore)
//   net = 0  → balanced / mission accomplie
//
// Auto-dismisses all orders once the net obligation is satisfied.
function NettedBadge({ orders, onExecuteAll })
{
    // Compute activeMW directly from the executions array — more reliable than
    // bccActiveMW (which depends on a BCCDashboard useEffect firing after render).
    const executions   = useLiveStore((s) => s.executions)
    const bccActiveMW  = useLiveStore((s) => s.bccActiveMW)
    const ackBaselines = useLiveStore((s) => s.ackBaselines)

    // activeMW = sum of mw_shed for all currently-executing executions from store.
    // Falls back to bccActiveMW written by BCCDashboard when executions is empty.
    const activeMWFromExecs = executions
        .filter((e) => e.status === 'executing')
        .reduce((sum, e) => sum + (e.mw_shed ?? 0), 0)
    const activeMW = activeMWFromExecs > 0 ? activeMWFromExecs : bccActiveMW

    const [expanded,  setExpanded]  = useState(true)
    const [pos,       setPos]       = useState(null)
    const [dragging,  setDragging]  = useState(false)
    const dragOffset                = useRef({ x: 0, y: 0 })
    const containerRef              = useRef(null)

    // ── Net MW computation ────────────────────────────────────────────────────
    const urgenceOrders = orders.filter((o) => o.type === 'urgence')
    const realimOrders  = orders.filter((o) => o.type === 'realim')
    const urgenceMW = urgenceOrders.reduce((s, o) => s + o.mwTarget, 0)
    const realimMW  = realimOrders.reduce ((s, o) => s + o.mwTarget, 0)
    // net > 0 → must restore;  net < 0 → must shed;  net = 0 → balanced
    const netMW     = realimMW - urgenceMW
    const absMW     = Math.abs(netMW)
    const isShed    = netMW < 0     // net obligation is to shed
    const isRealim  = netMW > 0     // net obligation is to restore
    const isBalanced = netMW === 0

    // Sub-label shown when both types coexist
    const subLabel = urgenceMW > 0 && realimMW > 0
        ? `(${realimMW} REA − ${urgenceMW} URG = ${netMW > 0 ? '+' : ''}${netMW.toFixed(1)} MW net)`
        : null

    const TOLERANCE = 1.5

    // ── Baselines — earliest ack baseline per type ────────────────────────────
    const earliestUrgenceBaseline = urgenceOrders.length > 0
        ? Math.min(...urgenceOrders.map((o) => {
            const k = String(o.id)
            const b = ackBaselines[k] ?? ackBaselines[o.id]
            return b != null ? b : Infinity
          }))
        : null
    const earliestRealimBaseline = realimOrders.length > 0
        ? Math.min(...realimOrders.map((o) => {
            const k = String(o.id)
            const b = ackBaselines[k] ?? ackBaselines[o.id]
            return b != null ? b : Infinity
          }))
        : null

    // ── isMet ─────────────────────────────────────────────────────────────────
    // Balanced: urgences and realims cancel out exactly → always met immediately.
    // Net shed: BCC must cut |netMW| more MW since the first urgence was acked.
    // Net realim: BCC must restore |netMW| since the first realim was acked.
    const netBaseline = isShed
        ? (earliestUrgenceBaseline !== Infinity ? earliestUrgenceBaseline : null)
        : (earliestRealimBaseline  !== Infinity ? earliestRealimBaseline  : null)

    const isMet = isBalanced || (() => {
        if (netBaseline === null) return false
        if (isShed) {
            const delta = Math.max(0, activeMW - netBaseline)
            return delta >= absMW - TOLERANCE
        }
        const restored = Math.max(0, netBaseline - activeMW)
        return restored >= absMW - TOLERANCE
    })()

    // Progress display: delta since earliest baseline of the dominant type
    const urgenceDeltaDisplay = (earliestUrgenceBaseline != null && earliestUrgenceBaseline !== Infinity)
        ? Math.max(0, activeMW - earliestUrgenceBaseline)
        : 0
    const realimDelta = (earliestRealimBaseline != null && earliestRealimBaseline !== Infinity)
        ? Math.max(0, earliestRealimBaseline - activeMW)
        : 0
    const progress = isShed
        ? Math.min(urgenceDeltaDisplay / Math.max(absMW, 0.1), 1)
        : isRealim
        ? Math.min(realimDelta / Math.max(absMW, 0.1), 1)
        : 0

    // Auto-dismiss all orders once met — show green banner for 3 s then clear
    useEffect(() => {
        if (isMet) {
            const t = setTimeout(() => onExecuteAll(orders.map((o) => o.id)), 3000)
            return () => clearTimeout(t)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMet])

    // ── Drag ──────────────────────────────────────────────────────────────────
    const handleMouseDown = useCallback((e) => {
        if (e.target.closest('button')) return
        e.preventDefault()
        const el = containerRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        dragOffset.current = {
            x:  e.clientX - rect.left,
            y:  window.innerHeight - e.clientY - (window.innerHeight - rect.bottom),
        }
        setDragging(true)
    }, [])

    useEffect(() => {
        if (!dragging) return
        const onMove = (e) => {
            const el = containerRef.current
            const w  = el ? el.offsetWidth  : 400
            const h  = el ? el.offsetHeight : 60
            setPos({
                left:   Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth  - w)),
                bottom: Math.max(0, Math.min(window.innerHeight - e.clientY - dragOffset.current.y, window.innerHeight - h)),
            })
        }
        const onUp = () => setDragging(false)
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup',   onUp)
        return () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup',   onUp)
        }
    }, [dragging])

    const posStyle = pos
        ? { position: 'fixed', left: pos.left, bottom: pos.bottom, top: 'auto', right: 'auto' }
        : { position: 'fixed', bottom: '2.75rem', right: '1rem' }

    // ── Theme based on net direction ──────────────────────────────────────────
    const color = isBalanced || isMet
        ? { border: 'border-[#4ade80]', bg: 'bg-[#052e16]', text: 'text-[#4ade80]', badge: 'bg-[#4ade80]/20 border-[#4ade80]/40 text-[#4ade80]', btn: 'bg-[#4ade80] text-background' }
        : isShed
        ? { border: 'border-error',     bg: 'bg-error-container/20', text: 'text-error',     badge: 'bg-error-container/20 border-error/40 text-error',     btn: 'bg-error text-background' }
        : { border: 'border-secondary', bg: 'bg-secondary-container/10', text: 'text-secondary', badge: 'bg-secondary-container/20 border-secondary/40 text-secondary', btn: 'bg-secondary text-background' }

    // ── Collapsed strip ───────────────────────────────────────────────────────
    if (!expanded) {
        return (
            <div
                ref={containerRef}
                style={{ ...posStyle, zIndex: 60, maxWidth: '36rem', width: '100%' }}
                className={`shadow-2xl ${dragging ? 'select-none' : ''}`}
            >
                <div
                    className={`flex items-center gap-space-sm px-space-md py-space-sm border ${color.border} ${color.bg} ${isMet ? '' : 'animate-pulse'}`}
                    style={{ cursor: dragging ? 'grabbing' : 'grab' }}
                    onMouseDown={handleMouseDown}
                >
                    <Icon name="drag_indicator" size={15} className="opacity-60 shrink-0" />
                    <Icon name={isShed ? 'bolt' : isRealim ? 'refresh' : 'check_circle'} size={16} className={`shrink-0 ${color.text}`} />
                    <div className="flex flex-col flex-1 min-w-0 leading-tight">
                        <span className={`font-mono text-[10px] font-bold uppercase tracking-wider truncate ${color.text}`}>
                            {orders.map((o) => o.orderRef).join(' · ')}
                        </span>
                        <span className={`font-mono text-[11px] font-bold truncate ${color.text}`}>
                            {isBalanced ? 'ÉQUILIBRÉ — AUCUNE ACTION REQUISE'
                                : isShed ? `−${absMW.toFixed(1)} MW NET À DÉLESTER`
                                : `+${absMW.toFixed(1)} MW NET À RÉTABLIR`}
                        </span>
                    </div>
                    <button
                        onClick={() => setExpanded(true)}
                        onMouseDown={(e) => e.stopPropagation()}
                        className={`flex items-center gap-space-xs px-space-sm py-space-xs font-mono text-[10px] font-bold transition-colors shrink-0 ${color.btn}`}
                        type="button"
                    >
                        <Icon name="expand_less" size={14} />
                        <span>Voir</span>
                    </button>
                </div>
            </div>
        )
    }

    // ── Expanded panel ────────────────────────────────────────────────────────
    return (
        <div
            ref={containerRef}
            style={{ ...posStyle, zIndex: 60, maxWidth: '36rem', width: '100%' }}
            className={`shadow-2xl ${dragging ? 'select-none' : ''}`}
        >
            <div className={`bg-surface-container-low border flex flex-col-reverse overflow-hidden ${color.border}`}>

                {/* Handle bar — physical bottom via flex-col-reverse */}
                <div
                    className={`flex items-center justify-between px-space-md py-space-xs border-t shrink-0 ${isShed ? 'bg-error-container/20 border-error/40' : isRealim ? 'bg-secondary-container/20 border-secondary/40' : 'bg-[#4ade80]/10 border-[#4ade80]/40'}`}
                    style={{ cursor: dragging ? 'grabbing' : 'grab' }}
                    onMouseDown={handleMouseDown}
                >
                    <div className="flex items-center gap-space-xs min-w-0 overflow-x-auto">
                        <Icon name="drag_indicator" size={13} className="text-on-surface-variant/60 shrink-0 mr-space-xs" />
                        {orders.map((o) => (
                            <span
                                key={o.id}
                                className={`font-mono text-[10px] font-bold px-space-sm py-space-xs shrink-0 ${o.type === 'urgence' ? 'bg-error/20 text-error' : 'bg-secondary/20 text-secondary'}`}
                            >
                                {o.orderRef} {o.type === 'urgence' ? `−${o.mwTarget}` : `+${o.mwTarget}`} MW
                            </span>
                        ))}
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

                {/* Panel body */}
                <div className="p-space-lg overflow-y-auto max-h-[70vh] flex flex-col gap-space-md">

                    {/* Net MW display */}
                    <div className="bg-surface-container p-space-md flex flex-col gap-space-sm">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="font-mono text-[10px] text-on-surface-variant uppercase">
                                    {isBalanced ? 'ORDRES ÉQUILIBRÉS' : isShed ? 'MW NETS À DÉLESTER' : 'MW NETS À RÉTABLIR'}
                                </span>
                                <div className="flex items-baseline gap-space-xs mt-space-xs">
                                    <span className={`font-mono text-3xl font-bold ${color.text}`}>
                                        {isBalanced ? '0' : isShed ? `−${absMW.toFixed(1)}` : `+${absMW.toFixed(1)}`}
                                    </span>
                                    <span className="font-mono text-sm text-on-surface-variant">MW</span>
                                </div>
                                {subLabel && (
                                    <span className={`font-mono text-[9px] mt-space-xs ${color.text} opacity-70`}>{subLabel}</span>
                                )}
                            </div>
                            {isMet ? (
                                <div className="flex items-center gap-space-xs px-space-md py-space-sm bg-[#4ade80]/20 border border-[#4ade80]/30 font-mono text-sm font-bold text-[#4ade80]">
                                    <Icon name="check_circle" size={18} />
                                    <span>ACCOMPLI</span>
                                </div>
                            ) : (
                                <span className={`font-mono text-[10px] font-bold px-space-md py-space-xs border ${color.badge}`}>
                                    {isBalanced ? 'ÉQUILIBRÉ' : isShed ? 'EFFACEMENT' : 'RÉALIMENTATION'}
                                </span>
                            )}
                        </div>

                        {/* Progress bar — only meaningful for shedding */}
                        {!isBalanced && (
                            <div className="flex flex-col gap-space-xs">
                                <div className="flex items-center justify-between font-mono text-[10px]">
                                    <span className="text-on-surface-variant">
                                        {isShed ? 'Déleste supplémentaire :' : 'Rétabli depuis ordre :'}&nbsp;
                                        <strong className={isMet ? 'text-[#4ade80]' : color.text}>
                                            {isShed ? urgenceDeltaDisplay.toFixed(1) : realimDelta.toFixed(1)} MW
                                        </strong>
                                    </span>
                                    <span className="text-on-surface-variant">
                                        Cible nette :&nbsp;<strong>{absMW.toFixed(1)} MW</strong>
                                    </span>
                                </div>
                                {(isShed || isRealim) && (
                                    <div className="w-full h-2.5 bg-surface-container-lowest overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-500 ${isMet ? 'bg-[#4ade80]' : isShed ? 'bg-error' : 'bg-secondary'}`}
                                            style={{ width: `${Math.min(progress * 100, 100)}%` }}
                                        />
                                    </div>
                                )}
                                <p className="font-mono text-[9px] text-on-surface-variant leading-relaxed">
                                    {isMet
                                        ? 'Obligation nette satisfaite — fermeture automatique dans un instant'
                                        : isShed
                                        ? `Sélectionnez et exécutez des départs. Restant : ${Math.max(0, absMW - urgenceDeltaDisplay).toFixed(1)} MW supplémentaires`
                                        : `Rétablissez des départs depuis la grille. Restant : ${Math.max(0, absMW - realimDelta).toFixed(1)} MW à rétablir`
                                    }
                                </p>
                            </div>
                        )}

                        {isBalanced && (
                            <p className="font-mono text-[9px] text-[#4ade80]">
                                Les ordres de délestage et de réalimentation se compensent — aucune action supplémentaire requise.
                            </p>
                        )}
                    </div>

                    <div className="flex items-center gap-space-xs font-mono text-[10px] text-on-surface-variant">
                        <Icon name="info" size={12} className="text-secondary shrink-0" />
                        <span>
                            {isShed
                                ? 'Coupez des départs depuis la grille — cet ordre se fermera automatiquement quand la cible nette sera atteinte.'
                                : isRealim
                                ? 'Rétablissez des départs — cet ordre se fermera automatiquement quand la cible nette sera atteinte.'
                                : 'Aucune action requise — les ordres s\'annulent mutuellement.'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Public component ──────────────────────────────────────────────────────────
export default function BCCOrderPopup()
{
    const { user }                                               = useAuthStore()
    const { orders: legacyOrders, acknowledgeReceipt, executeComplete, modalOpen } = useBccOrderStore()
    const liveOrders        = useLiveStore((s) => s.orders)
    const updateOrderStatus = useLiveStore((s) => s.updateOrderStatus)

    if (!user || user.role !== 'BCC') return null
    // Determine which CRC zone this BCC belongs to.
    // BCCs 1-4 → CRC Nord (mw_nord), BCCs 5-7 → CRC Sud (mw_sud).
    // Fall back to bcc_id numeric comparison; bcc_name "BCC 5" → id >= 5.
    const bccId         = user.bcc_id ?? 0
    const isNordBcc     = bccId >= 1 && bccId <= 4
    const getMwForBcc   = (o) => isNordBcc
        ? (o.mw_nord > 0 ? o.mw_nord : o.mw_total ?? 0)
        : (o.mw_sud  > 0 ? o.mw_sud  : o.mw_total ?? 0)

    const liveActive = liveOrders
        .filter((o) => {
            if (!['pending', 'acknowledged'].includes(o.status)) return false
            if (o.issued_by_role === 'DN') return false
            const mw = getMwForBcc(o)
            return mw > 0
        })
        .map((o) => ({
            id:             o.id,
            orderRef:       o.order_ref,
            issuedAt:       o.issued_at,
            type:           o.order_type,
            mwTarget:       getMwForBcc(o),
            targetBCC:      `BCC ${bccId}`,
            status:         o.status,
            acknowledgedAt: null,
            isLiveOrder:    true,
        }))

    const liveRefs   = new Set(liveActive.map((o) => o.orderRef))
    const legacyOnly = legacyOrders.filter((o) => o.status !== 'executed' && !liveRefs.has(o.orderRef))
    const orders     = [...liveActive, ...legacyOnly]

    const handleReceipt = async (id) =>
    {
        const liveOrder = liveActive.find((o) => o.id === id)
        if (liveOrder?.isLiveOrder)
        {
            // Snapshot current activeMW as baseline.
            // Compute from executions directly (more reliable than bccActiveMW
            // which depends on a BCCDashboard useEffect).
            const executions = useLiveStore.getState().executions
            const execActiveMW = executions
                .filter((e) => e.status === 'executing')
                .reduce((sum, e) => sum + (e.mw_shed ?? 0), 0)
            const currentActiveMW = execActiveMW > 0
                ? execActiveMW
                : useLiveStore.getState().bccActiveMW

            // ── Snapshot activeMW as baseline ─────────────────────────────────
            // The order is considered met once the BCC cuts AT LEAST mwTarget MW
            // *above* this baseline — i.e., above whatever was already running
            // from the J+1 plan. Pre-existing auto-executed feeders must never
            // count toward the urgence obligation.
            useLiveStore.getState().setAckBaseline(id, currentActiveMW)

            // Optimistic update
            updateOrderStatus(id, 'acknowledged')
            // Persist ACK to backend so the order status survives refresh
            try {
                await api.patch(`/api/v1/orders/${id}/ack`, {
                    mw_assigned: liveOrder.mwTarget,
                    bcc_id:      bccId,
                })
            } catch (err) {
                console.error('[BCCOrderPopup] Failed to ack order:', err)
            }
            // NOTE: do NOT push into bccOrderStore here — the acknowledged state
            // is already tracked in liveStore.  A second addOrder() would create
            // a legacy copy with a different generated ref, causing a duplicate
            // banner every time the operator acknowledges an order.
        }
        else { acknowledgeReceipt(id) }
    }

    const handleExecute = async (id) =>
    {
        useLiveStore.getState().clearAckBaseline(id)
        const liveOrder = liveActive.find((o) => o.id === id)
        if (liveOrder?.isLiveOrder) {
            // Realim completed — permanently reduce frozenUrgenceDelta so the
            // URG bar segment stays gone after the order is dismissed.
            if (liveOrder.type === 'realim' && liveOrder.mwTarget > 0) {
                useLiveStore.getState().applyRealimToFrozen(liveOrder.mwTarget)
            }
            // Mark completed (not just 'executing') so the order leaves liveActive
            // and the ConsolidatedBadge disappears.
            updateOrderStatus(id, 'completed')
            try {
                await api.patch(`/api/v1/orders/${id}/complete`)
            } catch (err) {
                console.error('[BCCOrderPopup] Failed to complete order:', err)
            }
        }
        else { executeComplete(id) }
    }

    const pending      = orders.filter((o) => o.status === 'pending')
    const acknowledged = orders.filter((o) => o.status === 'acknowledged')

    // Complete all orders in a batch (called by NettedBadge when net obligation met)
    const handleExecuteAll = async (ids) => {
        for (const id of ids) {
            await handleExecute(id)
        }
    }

    return (
        <>
            {pending.length > 0 && (
                <PendingModal key={pending[0].id} order={pending[0]} onReceipt={handleReceipt} />
            )}
            {!modalOpen && pending.length === 0 && acknowledged.length > 0 && (
                <NettedBadge orders={acknowledged} onExecuteAll={handleExecuteAll} />
            )}
        </>
    )
}
