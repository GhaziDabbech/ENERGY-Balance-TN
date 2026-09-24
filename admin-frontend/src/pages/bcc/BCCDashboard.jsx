import { useState, useEffect, useCallback } from 'react'
import { useAuthStore }     from '../../stores/authStore'
import { useBccOrderStore } from '../../stores/bccOrderStore'
import { useLiveStore }     from '../../stores/liveStore'
import api                  from '../../lib/api'

function Icon({ name, size = 18, className = '' }) {
    return <span className={`material-symbols-outlined ${className}`} style={{ fontSize: size }}>{name}</span>
}

// ── Feeder ref → DB id map (BCC 3) ───────────────────────────────────────────
// These ids come from the feeders table seeded at startup.
// Used to POST /api/v1/executions with the correct feeder_id.
const FEEDER_DB_ID = {
    F02: 1,  F07: 2,  F08: 3,  F11: 4,  F14: 5,
    F18: 6,  F09: 7,  F21: 8,  F28: 9,  F25: 10,
    F15: 11, F31: 12, F33: 13, F42: 14, F36: 15,
    F38: 16, F40: 17, F44: 18, F45: 19, F46: 20,
}

// ── Feeder data ───────────────────────────────────────────────────────────────
const POSTES = [
    {
        id: 'beja-centre', label: 'BÉJA CENTRE', sub: 'TR1 · 31,4 MW',
        feeders: [
            { ref:'F07', nom:'Z.I. Béja Nord',  mw:4.2, priority:'P3', status:'executing', elapsed:32, locked:false, daysSince:0   },
            { ref:'F08', nom:'Medjez Ville',     mw:6.5, priority:'P3', status:'selected',  elapsed:0,  locked:false, daysSince:12  },
            { ref:'F11', nom:'Testour Bourg',    mw:7.0, priority:'P3', status:'available', elapsed:0,  locked:false, daysSince:5   },
            { ref:'F02', nom:'Hôpital Béja',    mw:4.5, priority:'P0', status:'locked',    elapsed:0,  locked:true,  daysSince:null },
        ]
    },
    {
        id: 'beja-est', label: 'BÉJA EST', sub: 'TR2 · 28,6 MW',
        feeders: [
            { ref:'F18', nom:'Nefza Rural',      mw:2.6, priority:'P2', status:'overdue',   elapsed:52, locked:false, daysSince:0   },
            { ref:'F09', nom:'Faubourg Est',     mw:3.8, priority:'P4', status:'executing', elapsed:28, locked:false, daysSince:0   },
            { ref:'F21', nom:'Amdoun Rural',     mw:4.8, priority:'P4', status:'available', elapsed:0,  locked:false, daysSince:19  },
            { ref:'F28', nom:'Goubellat Sud',    mw:3.5, priority:'P5', status:'available', elapsed:0,  locked:false, daysSince:24  },
            { ref:'F14', nom:'SONEDE Béja',      mw:3.2, priority:'P0', status:'locked',    elapsed:0,  locked:true,  daysSince:null },
        ]
    },
    {
        id: 'jendouba-nord', label: 'JENDOUBA N.', sub: 'TR1 · 22,8 MW',
        feeders: [
            { ref:'F25', nom:'Bou Salem Ctr',    mw:5.5, priority:'P2', status:'executing', elapsed:15, locked:false, daysSince:5   },
            { ref:'F15', nom:'Téboursouk Agr',   mw:5.2, priority:'P4', status:'selected',  elapsed:0,  locked:false, daysSince:16  },
            { ref:'F31', nom:'Jendouba Ctr',     mw:4.1, priority:'P3', status:'available', elapsed:0,  locked:false, daysSince:8   },
            { ref:'F33', nom:'Oued Meliz',       mw:3.2, priority:'P5', status:'available', elapsed:0,  locked:false, daysSince:11  },
        ]
    },
    {
        id: 'jendouba-sud', label: 'JENDOUBA S.', sub: 'TR2 · 19,2 MW',
        feeders: [
            { ref:'F36', nom:'Ghardimaou Ville', mw:5.8, priority:'P3', status:'available', elapsed:0,  locked:false, daysSince:3   },
            { ref:'F38', nom:'Aïn Draham',       mw:4.4, priority:'P4', status:'available', elapsed:0,  locked:false, daysSince:21  },
            { ref:'F40', nom:'Fernana Rural',    mw:3.6, priority:'P5', status:'available', elapsed:0,  locked:false, daysSince:7   },
            { ref:'F42', nom:'Hôp. Jendouba',   mw:2.8, priority:'P0', status:'locked',    elapsed:0,  locked:true,  daysSince:null },
        ]
    },
    {
        id: 'tabarka', label: 'TABARKA', sub: 'TR1 · 14,6 MW',
        feeders: [
            { ref:'F44', nom:'Tabarka Ville',    mw:4.0, priority:'P3', status:'available', elapsed:0,  locked:false, daysSince:6   },
            { ref:'F45', nom:'Nefza Bourg',      mw:3.1, priority:'P4', status:'available', elapsed:0,  locked:false, daysSince:14  },
            { ref:'F46', nom:'Aïn Snoussi',      mw:2.8, priority:'P5', status:'available', elapsed:0,  locked:false, daysSince:18  },
        ]
    },
]

const TARGET_MW = 40.0
const TOLERANCE = 1.5
const MAX_MIN   = 45

// ── Tile helpers ──────────────────────────────────────────────────────────────
function tileCls(f) {
    if (f.locked)                 return 'bg-error-container/15 border border-[#ffb4ab]/30 opacity-60 cursor-not-allowed'
    if (f.status === 'overdue')   return 'bg-error-container cursor-pointer animate-pulse hover:brightness-110'
    if (f.status === 'executing') return 'bg-[#ffb95f]/20 border border-[#ffb95f] cursor-pointer hover:brightness-110'
    if (f.status === 'selected')  return 'bg-secondary-container cursor-pointer hover:bg-secondary-container/80'
    if (f.status === 'restored')  return 'bg-surface-container/40 border border-surface-container-high opacity-50 cursor-default'
    return 'bg-surface-container-low border border-surface-container-high cursor-pointer hover:bg-surface-container-high'
}
function refCls(f) {
    if (f.locked)                 return 'text-error'
    if (f.status === 'overdue')   return 'text-on-error-container'
    if (f.status === 'executing') return 'text-tertiary'
    if (f.status === 'selected')  return 'text-on-secondary-container'
    return 'text-secondary'
}
function mwCls(f) {
    if (f.locked)                 return 'text-error'
    if (f.status === 'overdue')   return 'text-on-error-container'
    if (f.status === 'executing') return 'text-tertiary'
    if (f.status === 'selected')  return 'text-on-secondary-container'
    return 'text-on-surface'
}
function priorityCls(f) {
    if (f.locked || f.status === 'overdue') return 'bg-black/30 text-on-error-container/80'
    if (f.status === 'executing')           return 'bg-[#231200] text-tertiary'
    if (f.status === 'selected')            return 'bg-black/20 text-on-secondary-container/80'
    return 'bg-surface-container text-secondary'
}

// ── J+1 slots ─────────────────────────────────────────────────────────────────
const J1_SLOTS = [
    { time: '14h00-14h30', mw: 40, feeders: ['F11','F08','F25','F15','F21','F07','F09','F28'] },
    { time: '18h00-18h30', mw: 35, feeders: [] },
    { time: '20h00-20h30', mw: 45, feeders: [] },
]

// ── Programme J+1 modal ───────────────────────────────────────────────────────
function ProgrammeJ1Modal({ isOpen, onClose }) {
    const [activeSlot, setActiveSlot] = useState(0)
    const [sent, setSent]             = useState(false)
    if (!isOpen) return null

    const tomorrow    = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })
    const allFeeders  = POSTES.flatMap((p) => p.feeders.filter((f) => !f.locked))

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-space-md" onClick={onClose}>
            <div className="bg-surface-container-low w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-surface-container-high" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-space-lg py-space-md bg-surface-container-lowest border-b border-surface-container-high flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-space-md">
                        <Icon name="event_available" size={20} className="text-secondary" />
                        <div>
                            <h3 className="font-sans font-bold text-sm text-on-surface uppercase tracking-wide">Programme J+1 — BCC 3</h3>
                            <span className="font-mono text-[10px] text-on-surface-variant">{tomorrowStr} · Assignation CRC Nord</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-space-xs hover:bg-surface-container text-on-surface-variant transition-colors" type="button">
                        <Icon name="close" size={18} />
                    </button>
                </div>
                {/* Slot tabs */}
                <div className="grid grid-cols-3 gap-space-sm p-space-md bg-surface-container-lowest border-b border-surface-container-high shrink-0">
                    {J1_SLOTS.map((s, i) => (
                        <button key={i} onClick={() => setActiveSlot(i)}
                            className={`p-space-sm flex flex-col text-left border transition-colors ${activeSlot === i ? 'bg-surface-container-high border-secondary' : 'bg-surface-container border-surface-container-high hover:bg-surface-container-high'}`}
                            type="button">
                            <div className="flex items-center justify-between">
                                <span className="font-mono text-[10px] font-bold text-on-surface">Creneau {i + 1}</span>
                                <span className="font-mono text-[10px] text-on-surface">{s.time}</span>
                            </div>
                            <span className="font-mono text-[10px] text-on-surface-variant mt-space-xs">Cible CRC : {s.mw} MW</span>
                            <span className={`font-mono text-[10px] font-bold mt-0.5 ${s.feeders.length > 0 ? 'text-secondary' : 'text-tertiary'}`}>
                                {s.feeders.length > 0 ? `${s.feeders.length} departs pre-assignes` : 'A planifier'}
                            </span>
                        </button>
                    ))}
                </div>
                {/* Slot detail */}
                <div className="flex-1 overflow-y-auto p-space-lg flex flex-col gap-space-md">
                    <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant uppercase">
                        <span>Cible {J1_SLOTS[activeSlot].mw} MW — {J1_SLOTS[activeSlot].time}</span>
                        <button className="flex items-center gap-space-xs px-space-sm py-space-xs bg-secondary-container hover:bg-secondary text-on-secondary-container font-bold transition-all" type="button">
                            <Icon name="auto_fix_high" size={12} /><span>IA — Optimiser</span>
                        </button>
                    </div>
                    {J1_SLOTS[activeSlot].feeders.length > 0 ? (
                        <div className="grid grid-cols-2 gap-space-sm">
                            {J1_SLOTS[activeSlot].feeders.map((ref) => {
                                const f = allFeeders.find((x) => x.ref === ref)
                                if (!f) return null
                                return (
                                    <div key={ref} className="bg-surface-container border border-surface-container-high p-space-sm flex items-center justify-between font-mono text-xs">
                                        <div className="flex items-center gap-space-sm">
                                            <span className="font-bold text-secondary">{f.ref}</span>
                                            <span className="text-on-surface-variant truncate">{f.nom}</span>
                                            <span className="text-on-surface-variant">({f.priority})</span>
                                        </div>
                                        <span className="font-bold text-secondary shrink-0">{f.mw} MW</span>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-8 gap-space-md text-on-surface-variant font-mono text-xs">
                            <Icon name="event_busy" size={32} className="text-on-surface-variant/40" />
                            <span>Aucun depart pre-assigne pour ce creneau</span>
                        </div>
                    )}
                </div>
                {/* Footer */}
                <div className="px-space-lg py-space-md bg-surface-container border-t border-surface-container-high flex items-center justify-between shrink-0">
                    <span className="font-mono text-[10px] text-on-surface-variant">Validation obligatoire avant 17h00 UTC+1</span>
                    <div className="flex items-center gap-space-sm">
                        <button onClick={onClose} className="px-space-md py-space-xs bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono text-xs border border-surface-container-high transition-colors" type="button">Fermer</button>
                        <button onClick={() => { setSent(true); setTimeout(() => { setSent(false); onClose() }, 1800) }}
                            className="flex items-center gap-space-xs px-space-md py-space-xs bg-secondary-container text-on-secondary-container font-mono text-xs font-bold uppercase tracking-wider transition-all" type="button">
                            {sent ? <><Icon name="check_circle" size={13} className="text-[#4ade80]" /><span>Transmis !</span></> : <><Icon name="send" size={13} /><span>Valider J+1</span></>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── AI panel ──────────────────────────────────────────────────────────────────
function AiPanel({ isOpen, onClose, onApplySuggestion }) {
    const [input, setInput] = useState('')
    const [msgs,  setMsgs]  = useState([
        { role:'system', text: 'Suggestion ordonnancement optimal (Cible: 40,0 MW)\n\nSelection recommandee :\nF08 (6,5 MW P3) + F15 (5,2 MW P4) + F21 (4,8 MW P4)\n+ F11 (7,0 MW P3) + F25 (5,5 MW P2) + F09 (3,8 MW P4)\n+ F07 (4,2 MW P3) + F18 (2,6 MW P2) = 39,6 MW\n\nEcart : -0,4 MW (CONFORME)\nF21 et F15 non coupes depuis >15 jours. P0 sanctuarises.' }
    ])

    const send = () => {
        if (!input.trim()) return
        setMsgs((m) => [...m, { role:'user', text:input }, { role:'system', text:'Analyse en cours sur reseau Beja/Jendouba… Aucune contrainte thermique detectee.' }])
        setInput('')
    }

    return (
        <div className={`fixed top-14 bottom-8 right-0 w-96 max-w-[90vw] bg-surface-container-low shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out border-l border-surface-container-high ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="p-space-md bg-surface-container flex items-center justify-between border-b border-surface-container-high shrink-0">
                <div className="flex items-center gap-space-sm">
                    <div className="w-7 h-7 bg-secondary-container/30 border border-secondary/40 flex items-center justify-center text-secondary">
                        <Icon name="smart_toy" size={17} />
                    </div>
                    <div>
                        <span className="font-sans font-bold text-xs text-on-surface uppercase">Assistant IA — BCC 3</span>
                        <p className="font-mono text-[9px] text-secondary">OPTIMISATION EQUITE TERRITORIALE</p>
                    </div>
                </div>
                <button onClick={onClose} className="p-space-xs hover:bg-surface-container-high text-on-surface-variant transition-colors" type="button">
                    <Icon name="close" size={17} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-space-md flex flex-col gap-space-sm">
                {msgs.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[90%] p-space-sm font-mono text-[10px] leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-secondary-container/20 border border-secondary/30 text-on-surface' : 'bg-surface-container-lowest border border-surface-container-high text-on-surface-variant'}`}>
                            {m.role === 'system' && <span className="text-secondary font-bold text-[9px] block mb-0.5 uppercase">Suggestion IA</span>}
                            {m.text}
                        </div>
                    </div>
                ))}
            </div>
            <div className="p-space-sm bg-surface-container border-t border-surface-container-high flex flex-col gap-space-sm shrink-0">
                <button onClick={onApplySuggestion} className="w-full flex items-center justify-center gap-space-xs py-space-xs bg-secondary-container hover:bg-secondary text-on-secondary-container font-mono text-xs font-bold transition-all" type="button">
                    <Icon name="auto_fix_high" size={13} /><span>Appliquer la suggestion IA</span>
                </button>
                <div className="flex items-center gap-space-xs">
                    <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send() }}
                        placeholder="Question operationnelle..."
                        className="flex-1 bg-surface-container-lowest border border-surface-container-high px-space-sm py-space-xs font-mono text-xs text-on-surface focus:border-secondary focus:outline-none" />
                    <button onClick={send} className="p-space-xs bg-secondary-container hover:bg-secondary text-on-secondary-container border border-secondary transition-colors" type="button">
                        <Icon name="send" size={14} />
                    </button>
                </div>
                <p className="font-mono text-[9px] text-on-surface-variant text-center">Suggestions IA indicatives. Validation operateur BCC.</p>
            </div>
        </div>
    )
}

// ── Execution timer card ──────────────────────────────────────────────────────
function ExecutionCard({ feeder, onRestore }) {
    const [elapsed, setElapsed] = useState(feeder.elapsed ?? 0)

    useEffect(() => {
        const t = setInterval(() => setElapsed((e) => e + 1), 60_000)
        return () => clearInterval(t)
    }, [])

    const pct     = Math.min((elapsed / MAX_MIN) * 100, 100)
    const overdue = elapsed >= MAX_MIN

    return (
        <div className={`flex flex-col gap-space-xs p-space-sm border font-mono text-[10px] ${overdue ? 'border-error bg-error-container/10' : 'border-surface-container-high bg-surface-container'}`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs min-w-0">
                    <span className={`font-bold shrink-0 ${overdue ? 'text-error' : 'text-secondary'}`}>{feeder.ref}</span>
                    <span className="text-on-surface truncate">{feeder.nom}</span>
                    <span className="text-on-surface-variant shrink-0">· {feeder.mw} MW · {feeder.priority}</span>
                </div>
                <button onClick={() => onRestore(feeder.ref)}
                    className={`px-space-sm py-space-xs font-bold uppercase transition-colors shrink-0 ${overdue ? 'bg-error text-background hover:bg-error-container hover:text-on-error-container' : 'bg-surface-container-high hover:bg-surface-container-highest text-secondary'}`}
                    type="button">
                    Retablir
                </button>
            </div>
            <div className="w-full bg-surface-container-lowest h-1.5 overflow-hidden">
                <div className={`h-full transition-all ${overdue ? 'bg-error' : 'bg-tertiary'}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between">
                <span className={overdue ? 'text-error font-bold' : 'text-on-surface-variant'}>{elapsed} min {overdue ? '(DEPASSEMENT)' : ''}</span>
                <span className="text-on-surface-variant">{MAX_MIN} min max</span>
            </div>
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BCCDashboard() {
    const { user }   = useAuthStore()
    const { orders, acknowledgeReceipt, executeComplete, cancelRealimOrders } = useBccOrderStore()

    // liveStore: DB-sourced orders received via WebSocket
    const liveOrders    = useLiveStore((s) => s.orders)
    const addExecution  = useLiveStore((s) => s.addExecution)
    const updateExec    = useLiveStore((s) => s.updateExecution)

    // Map feeder ref → DB execution id (set when validate POSTs to DB)
    // Needed so handleRestore can PATCH the right execution row
    const [dbExecIds, setDbExecIds] = useState({})   // { 'F07': 42, 'F08': 43, ... }

    const [time,          setTime]         = useState(new Date())
    const [postes,        setPostes]       = useState(POSTES)
    const [restored,      setRestored]     = useState([])
    const [j1Open,        setJ1Open]       = useState(false)
    const [aiOpen,        setAiOpen]       = useState(false)
    const [everValidated, setEverValidated]= useState(false)
    const [auditLog,      setAuditLog]     = useState([
        { ref:'F18', nom:'Nefza Rural',     debut:'13:00', fin:'--:--', dur:'52 min', mw:2.6, statut:'overdue'   },
        { ref:'F07', nom:'Z.I. Beja Nord',  debut:'13:20', fin:'--:--', dur:'32 min', mw:4.2, statut:'executing' },
        { ref:'F09', nom:'Faubourg Est',    debut:'13:24', fin:'--:--', dur:'28 min', mw:3.8, statut:'executing' },
        { ref:'F25', nom:'Bou Salem Ctr',   debut:'13:37', fin:'--:--', dur:'15 min', mw:5.5, statut:'executing' },
        { ref:'F11', nom:'Testour Bourg',   debut:'13:00', fin:'13:45', dur:'45 min', mw:7.0, statut:'restored'  },
    ])

    // Live clock
    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 1000)
        return () => clearInterval(t)
    }, [])

    const pad     = (n) => String(n).padStart(2, '0')
    const timeStr = `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())} UTC+1`

    // ── Orders ────────────────────────────────────────────────────────────────
    // Merge DB orders (liveStore) with legacy bccOrderStore orders
    const dbActiveOrders = liveOrders
        .filter((o) => ['pending','acknowledged','executing'].includes(o.status))
        .map((o) => ({
            id:        o.id,
            orderRef:  o.order_ref,
            type:      o.order_type,          // 'urgence' | 'realim'
            mwTarget:  o.mw_total,
            time:      new Date(o.issued_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }),
            status:    o.status,
            isDbOrder: true,
        }))

    // Deduplicate: if same orderRef exists in both, prefer DB version
    const legacyOrders = orders.filter(
        (o) => o.status !== 'executed' && !dbActiveOrders.find((d) => d.orderRef === o.orderRef)
    )
    const activeOrders  = [...dbActiveOrders, ...legacyOrders]
    const urgenceOrders = activeOrders.filter((o) => o.type === 'urgence')
    const realimOrders  = activeOrders.filter((o) => o.type === 'realim')

    // Rule: urgence cancels all realim orders — shedding takes absolute priority
    useEffect(() => {
        if (urgenceOrders.length > 0 && realimOrders.length > 0) cancelRealimOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urgenceOrders.length, realimOrders.length])

    // Effective target = J+1 consigne + urgence extra MW - realim reduction MW
    const urgenceDelta    = urgenceOrders.reduce((s, o) => s + o.mwTarget, 0)
    const realimDelta     = realimOrders.reduce ((s, o) => s + o.mwTarget, 0)
    const effectiveTarget = Math.max(0, TARGET_MW + urgenceDelta - realimDelta)

    // ── Derived feeder values ─────────────────────────────────────────────────
    const allFeeders    = postes.flatMap((p) => p.feeders)
    const activeFeeders = allFeeders.filter((f) => f.status === 'executing' || f.status === 'overdue')
    const selectedMW    = allFeeders
        .filter((f) => ['selected','executing','overdue'].includes(f.status))
        .reduce((s, f) => s + f.mw, 0)
    const activeMW    = activeFeeders.reduce((s, f) => s + f.mw, 0)
    const gap         = selectedMW - effectiveTarget
    const wouldExceed = selectedMW > effectiveTarget + TOLERANCE
    const withinTol   = effectiveTarget > 0 ? Math.abs(gap) <= TOLERANCE : selectedMW <= TOLERANCE
    const hasOverdue  = activeFeeders.some((f) => f.status === 'overdue')

    // Order met detection
    const isOrderMet = (order) =>
        order.type === 'urgence'
            ? activeMW >= TARGET_MW + order.mwTarget - TOLERANCE
            : activeMW <= TARGET_MW - order.mwTarget + TOLERANCE

    // Auto-dismiss satisfied orders
    useEffect(() => {
        activeOrders.forEach((o) => { if (isOrderMet(o)) executeComplete(o.id) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeMW])

    // Partial validation: enabled as soon as any feeder is selected, as long as total does not exceed target+tolerance
    const hasAnySelected = allFeeders.some((f) => f.status === 'selected')
    const canValidate    = hasAnySelected && !wouldExceed

    const handleValidate = useCallback(async () => {
        if (!canValidate) return
        setEverValidated(true)

        // Get all currently-selected feeders before moving to 'executing'
        const selectedFeeders = postes
            .flatMap((p) => p.feeders)
            .filter((f) => f.status === 'selected')

        // Move selected → executing in UI immediately (optimistic)
        setPostes((prev) => prev.map((p) => ({
            ...p,
            feeders: p.feeders.map((f) =>
                f.status === 'selected' ? { ...f, status:'executing', elapsed:0 } : f
            )
        })))

        // Acknowledge any pending legacy orders
        activeOrders.filter((o) => o.status === 'pending' && !o.isDbOrder)
            .forEach((o) => acknowledgeReceipt(o.id))

        // ── POST each selected feeder to DB ───────────────────────────────────
        const newDbExecIds = { ...dbExecIds }
        const now = new Date()
        const pad2 = (n) => String(n).padStart(2,'0')
        const timeStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`

        for (const feeder of selectedFeeders) {
            const feederId = FEEDER_DB_ID[feeder.ref]
            if (!feederId) continue   // ref not in DB map — skip silently

            try {
                const { data: exec } = await api.post('/api/v1/executions', {
                    feeder_id: feederId,
                    mw_shed:   feeder.mw,
                    trigger:   urgenceOrders.length > 0 ? 'urgence' : 'j1',
                    order_id:  urgenceOrders[0]?.isDbOrder ? urgenceOrders[0].id : null,
                    notes:     `Valide par BCC 3 a ${timeStr}`,
                })
                // Store DB execution id mapped to feeder ref for later restore
                newDbExecIds[feeder.ref] = exec.id
                // Push into liveStore so DN/CRC dashboards update
                addExecution(exec)

                // Also add to audit log
                setAuditLog((log) => [{
                    ref:    feeder.ref,
                    nom:    feeder.nom,
                    debut:  timeStr,
                    fin:    '--:--',
                    dur:    '0 min',
                    mw:     feeder.mw,
                    statut: 'executing',
                }, ...log])
            } catch (err) {
                console.error(`[BCC] Failed to record execution for ${feeder.ref}:`, err?.response?.data ?? err.message)
            }
        }

        setDbExecIds(newDbExecIds)

        // Acknowledge DB orders
        for (const order of activeOrders.filter((o) => o.status === 'pending' && o.isDbOrder)) {
            try {
                await api.patch(`/api/v1/orders/${order.id}/ack`, { mw_assigned: activeMW })
            } catch (err) {
                console.error('[BCC] Failed to ack order:', err?.response?.data ?? err.message)
            }
        }
    }, [canValidate, activeOrders, acknowledgeReceipt, postes, urgenceOrders, activeMW, dbExecIds, addExecution])

    const toggleFeeder = useCallback((posteId, ref) => {
        setPostes((prev) => prev.map((p) => p.id !== posteId ? p : {
            ...p,
            feeders: p.feeders.map((f) => {
                if (f.ref !== ref || f.locked) return f
                if (['executing','overdue','restored'].includes(f.status)) return f
                return { ...f, status: f.status === 'selected' ? 'available' : 'selected' }
            })
        }))
    }, [])

    const handleRestore = async (ref) => {
        const now    = new Date()
        const endStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`

        // Update UI immediately (optimistic)
        setPostes((prev) => prev.map((p) => ({
            ...p,
            feeders: p.feeders.map((f) => f.ref === ref ? { ...f, status:'restored', elapsed:0 } : f)
        })))
        setRestored((r) => [...r, ref])
        setAuditLog((log) => log.map((l) => l.ref === ref ? { ...l, fin:endStr, statut:'restored' } : l))

        // ── PATCH execution in DB ─────────────────────────────────────────────
        const execId = dbExecIds[ref]
        if (execId) {
            try {
                const { data: exec } = await api.patch(`/api/v1/executions/${execId}/restore`, {
                    notes: `Retabli par BCC 3 a ${endStr}`,
                })
                // Update liveStore so DN/CRC see the restoration
                updateExec(execId, { status:'restored', ended_at: exec.ended_at })
            } catch (err) {
                console.error(`[BCC] Failed to restore execution ${execId}:`, err?.response?.data ?? err.message)
            }
        }
    }

    const applyAiSuggestion = () => {
        const aiRefs = ['F08','F15','F21','F11','F25','F09','F07','F18']
        setPostes((prev) => prev.map((p) => ({
            ...p,
            feeders: p.feeders.map((f) => {
                if (f.locked || ['executing','overdue'].includes(f.status)) return f
                return { ...f, status: aiRefs.includes(f.ref) ? 'selected' : 'available' }
            })
        })))
        setAiOpen(false)
    }

    const statutBadge = (s) => {
        if (s === 'overdue')   return <span className="px-space-xs py-0.5 bg-error text-background font-mono text-[9px] font-bold uppercase">DEPASSEMENT</span>
        if (s === 'executing') return <span className="px-space-xs py-0.5 bg-tertiary-container text-tertiary font-mono text-[9px] font-bold">EN COURS</span>
        if (s === 'restored')  return <span className="px-space-xs py-0.5 bg-surface-container text-secondary font-mono text-[9px] font-bold">RETABLI</span>
        return null
    }

    // Progress bar segments
    const executedPct = effectiveTarget > 0 ? Math.min((activeMW / effectiveTarget) * 100, 100) : 0
    const pendingPct  = effectiveTarget > 0 ? Math.min(((selectedMW - activeMW) / effectiveTarget) * 100, Math.max(0, 100 - executedPct)) : 0

    return (
        <div className="flex flex-col w-full text-on-surface">

            {/* SECTION 1 — Top bar */}
            <section className="flex flex-col gap-space-xs">
                <div className="bg-surface-container-low p-space-md flex flex-wrap items-center justify-between gap-space-md shadow-md">
                    <div className="flex flex-wrap items-center gap-space-md">
                        <div className="flex items-center gap-space-sm bg-surface-container-highest px-space-md py-space-xs">
                            <span className="w-2.5 h-2.5 rounded-full bg-tertiary animate-ping" />
                            <span className="font-mono font-bold text-sm text-secondary tracking-wide uppercase">BCC 3</span>
                            <span className="text-on-surface-variant font-mono text-xs">NORD-OUEST</span>
                        </div>
                        <div className="flex items-center gap-space-xs font-mono text-xs">
                            <Icon name="schedule" size={14} className="text-secondary" />
                            <span>{timeStr}</span>
                        </div>
                        <div className="flex items-center gap-space-xs font-mono text-[10px] text-on-surface-variant">
                            <span>Tutelle :</span>
                            <span className="text-secondary font-semibold">CRC NORD (Rades) · VHF 04-Nord</span>
                        </div>
                        <div className="flex items-center gap-space-xs px-space-sm py-0.5 bg-surface-container font-mono text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
                            <span>SCADA IEC 104 · 20ms</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-space-md">
                        <button onClick={() => setJ1Open(true)} className="flex items-center gap-space-xs px-space-md py-space-xs bg-surface-container-high hover:bg-surface-container-highest text-secondary font-mono text-xs transition-colors" type="button">
                            <Icon name="event_note" size={14} /><span>Programme J+1</span>
                        </button>
                        <button onClick={() => setAiOpen(true)} className="flex items-center gap-space-xs px-space-md py-space-xs bg-secondary-container/30 hover:bg-secondary-container/60 text-secondary border border-secondary/40 font-mono text-xs transition-colors" type="button">
                            <Icon name="smart_toy" size={14} /><span>Assistant IA</span>
                        </button>
                    </div>
                </div>
                {/* Comms strip */}
                <div className="bg-surface-container-lowest px-space-md py-space-xs flex flex-wrap items-center justify-between font-mono text-[10px] text-on-surface-variant gap-space-md">
                    <div className="flex items-center gap-space-lg flex-wrap">
                        <div className="flex items-center gap-1"><span>Chef de quart :</span><span className="text-on-surface font-semibold ml-1">Tech. S. Dridi</span></div>
                        <div className="flex items-center gap-1"><span>Poste source :</span><span className="text-on-surface font-semibold ml-1">BEJA 90/30 kV (2 TR)</span></div>
                        <div className="flex items-center gap-space-xs">
                            <span>Consigne effective :</span>
                            <span className={`font-bold ml-1 ${urgenceDelta > 0 ? 'text-error' : realimDelta > 0 ? 'text-[#4ade80]' : 'text-secondary'}`}>
                                {effectiveTarget.toFixed(1)} MW
                            </span>
                            {urgenceDelta > 0 && <span className="text-error ml-1">(+{urgenceDelta} MW urgence)</span>}
                            {realimDelta  > 0 && <span className="text-[#4ade80] ml-1">(-{realimDelta} MW retabl.)</span>}
                        </div>
                    </div>
                    <div className={`flex items-center gap-space-xs px-space-sm py-0.5 font-semibold ${everValidated ? 'bg-secondary-container/20 text-secondary' : 'bg-tertiary-container/30 text-tertiary'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${everValidated ? 'bg-secondary' : 'bg-tertiary animate-pulse'}`} />
                        <span>{everValidated ? `EXECUTION EN COURS — ${activeMW.toFixed(1)} MW` : 'EN ATTENTE DE VALIDATION'}</span>
                    </div>
                </div>
            </section>

            {/* ALERT BANNERS — orders from CRC */}
            {activeOrders.length > 0 && (
                <section className="flex flex-col gap-space-xs px-space-md pt-space-md">
                    {activeOrders.map((order) => {
                        const isUrg = order.type === 'urgence'
                        const isMet = isOrderMet(order)
                        return (
                            <div key={order.id}
                                className={`flex flex-wrap items-center justify-between gap-space-md px-space-md py-space-sm border-l-4 font-mono text-xs transition-opacity
                                    ${isUrg ? 'bg-error-container/20 border-error' : 'bg-[#4ade80]/10 border-[#4ade80]'}
                                    ${isMet ? 'opacity-50' : ''}`}>
                                <div className="flex items-center gap-space-md flex-wrap">
                                    <Icon name={isUrg ? 'bolt' : 'refresh'} size={16} className={isUrg ? 'text-error animate-pulse' : 'text-[#4ade80]'} />
                                    <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center gap-space-sm flex-wrap">
                                            <span className={`font-bold uppercase text-[10px] px-space-xs py-0.5 ${isUrg ? 'bg-error text-background' : 'bg-[#4ade80]/20 text-[#4ade80]'}`}>
                                                {isUrg ? 'DELESTAGE URGENCE' : 'REALIMENTATION'}
                                            </span>
                                            <span className="text-on-surface-variant text-[10px]">{order.orderRef} · {order.time}</span>
                                        </div>
                                        <span className="text-on-surface text-[11px]">
                                            {isUrg
                                                ? `Couper ${order.mwTarget} MW supplementaires — Cible totale : ${effectiveTarget.toFixed(1)} MW`
                                                : `Retablir ${order.mwTarget} MW — Utiliser le bouton Retablir sur les departs en cours`
                                            }
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-space-sm shrink-0">
                                    {isMet ? (
                                        <span className="flex items-center gap-space-xs px-space-md py-space-xs bg-[#4ade80]/20 text-[#4ade80] font-bold text-[10px] uppercase">
                                            <Icon name="check_circle" size={13} />MISSION ACCOMPLIE
                                        </span>
                                    ) : order.status === 'pending' ? (
                                        <button onClick={() => acknowledgeReceipt(order.id)}
                                            className={`px-space-md py-space-xs font-bold text-[10px] uppercase transition-colors ${isUrg ? 'bg-error-container hover:bg-error text-on-error-container' : 'bg-[#4ade80]/20 hover:bg-[#4ade80]/40 text-[#4ade80]'}`}
                                            type="button">
                                            Recu — Pris en charge
                                        </button>
                                    ) : (
                                        <span className={`px-space-xs py-0.5 font-bold text-[10px] uppercase ${isUrg ? 'bg-error-container/40 text-error' : 'bg-[#4ade80]/10 text-[#4ade80]'}`}>
                                            EN COURS D'EXECUTION
                                        </span>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </section>
            )}

            {/* SECTION 2 — KPI row */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-space-md p-space-md">
                {[
                    { label:'Consigne Effective', value:effectiveTarget.toFixed(1), unit:'MW',  cls:urgenceDelta>0?'text-error':realimDelta>0?'text-[#4ade80]':'text-secondary', icon:urgenceDelta>0?'warning':'assignment', sub:urgenceDelta>0?`J+1 ${TARGET_MW}+URG ${urgenceDelta}`:realimDelta>0?`J+1 ${TARGET_MW}-REA ${realimDelta}`:'Transmise a 14h00' },
                    { label:'Selection Prete',    value:selectedMW.toFixed(1),      unit:'MW',  cls:wouldExceed?'text-error':withinTol?'text-secondary':'text-tertiary',          icon:'verified',   sub:`${allFeeders.filter((f)=>['selected','executing','overdue'].includes(f.status)).length} departs` },
                    { label:'Actuel Deleste',     value:activeMW.toFixed(1),        unit:'MW',  cls:'text-tertiary',                                                               icon:'power_off',  sub:`${activeFeeders.length} departs coupes` },
                    { label:'Rotation Moy.',      value:'32',                       unit:'min', cls:hasOverdue?'text-error':'text-on-surface',                                      icon:'timer',      sub:'Plafond : 45 min' },
                ].map(({ label, value, unit, cls, icon, sub }) => (
                    <div key={label} className="bg-surface-container-low p-space-md flex flex-col justify-between shadow-sm">
                        <div className="flex items-center justify-between">
                            <span className="font-mono text-[10px] text-on-surface-variant uppercase">{label}</span>
                            <Icon name={icon} size={16} className={cls} />
                        </div>
                        <div className="my-space-xs flex items-baseline gap-space-xs">
                            <span className={`font-mono text-3xl font-bold ${cls}`}>{value}</span>
                            <span className="font-mono text-sm text-on-surface-variant">{unit}</span>
                        </div>
                        <span className="font-mono text-[10px] text-on-surface-variant">{sub}</span>
                    </div>
                ))}
            </section>

            {/* SECTION 3 — Tile grid + side panel */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-space-md px-space-md pb-space-md">

                {/* Left 8/12 — tile grid */}
                <div className="lg:col-span-8 flex flex-col gap-space-md">
                    <div className="bg-surface-container-low p-space-md shadow-md flex flex-col gap-space-md">
                        <div className="flex flex-wrap items-center justify-between gap-space-sm">
                            <div>
                                <div className="flex items-center gap-space-sm">
                                    <Icon name="schema" size={18} className="text-secondary" />
                                    <h2 className="font-sans font-semibold text-sm text-on-surface uppercase tracking-wide">Ordonnancement HTA — Beja 90/30 kV</h2>
                                </div>
                                <p className="font-mono text-[10px] text-on-surface-variant mt-space-xs">Cliquez pour selectionner · P0 = inviolable · Validation partielle autorisee</p>
                            </div>
                            <div className="flex items-center gap-space-md font-mono text-[9px] flex-wrap">
                                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-surface-container-low border border-surface-container-high inline-block" /> Disponible</span>
                                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-secondary-container inline-block" /> Selectionne</span>
                                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-[#ffb95f]/20 border border-[#ffb95f] inline-block" /> En cours</span>
                                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-error-container inline-block" /> Depassement</span>
                            </div>
                        </div>

                        {/* Tile columns */}
                        <div className="flex gap-space-sm w-full">
                            {postes.map((poste) => (
                                <div key={poste.id} className="flex-1 flex flex-col gap-space-xs min-w-0">
                                    <div className="bg-surface-container-high px-space-xs py-space-xs text-center font-mono text-[10px] font-bold text-secondary uppercase tracking-wider">
                                        {poste.label}<br />
                                        <span className="text-on-surface-variant font-normal normal-case">{poste.sub}</span>
                                    </div>
                                    {poste.feeders.map((f) => (
                                        <div key={f.ref}
                                            onClick={() => !f.locked && !['executing','overdue','restored'].includes(f.status) && toggleFeeder(poste.id, f.ref)}
                                            className={`w-full p-space-xs flex flex-col gap-0.5 transition-all ${tileCls(f)}`}>
                                            <div className="flex items-center justify-between">
                                                <span className={`font-mono text-[10px] font-bold ${refCls(f)}`}>{f.ref}</span>
                                                {f.locked ? <Icon name="lock" size={11} className="text-error" /> : <span className={`font-mono text-[9px] px-0.5 ${priorityCls(f)}`}>{f.priority}</span>}
                                            </div>
                                            <span className="font-mono text-[10px] text-on-surface-variant leading-tight truncate">{f.nom}</span>
                                            <span className={`font-mono text-[11px] font-bold ${mwCls(f)}`}>{f.locked ? f.priority : `${f.mw} MW`}</span>
                                            <span className="font-mono text-[9px] text-on-surface-variant">
                                                {f.locked         ? 'VERROUILLE'
                                                 : f.status === 'executing' ? `${f.elapsed} min`
                                                 : f.status === 'overdue'   ? `${f.elapsed}m >45!`
                                                 : f.daysSince !== null ? `${f.daysSince} j` : ''}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>

                        {/* MW balance bar + Validate */}
                        <div className="flex flex-col md:flex-row items-center justify-between gap-space-md bg-surface-container p-space-md">
                            <div className="w-full md:w-3/5 flex flex-col gap-space-xs">
                                <div className="flex items-center justify-between font-mono text-[10px]">
                                    <span className="text-on-surface font-semibold">
                                        PUISSANCE MOBILISEE :&nbsp;
                                        <span className={wouldExceed ? 'text-error' : withinTol ? 'text-secondary' : 'text-tertiary'}>
                                            {selectedMW.toFixed(1)} MW
                                        </span>
                                        &nbsp;/ {effectiveTarget.toFixed(1)} MW
                                    </span>
                                    <span className={`px-space-xs py-0.5 font-bold ${wouldExceed ? 'bg-error-container text-on-error-container' : withinTol ? 'bg-surface-container-high text-secondary' : 'bg-tertiary-container/30 text-tertiary'}`}>
                                        {wouldExceed
                                            ? `DEPASSEMENT +${(selectedMW - effectiveTarget).toFixed(1)} MW`
                                            : `Ecart: ${gap >= 0 ? '+' : ''}${gap.toFixed(1)} MW ${withinTol ? '(CONFORME)' : '(INCOMPLET)'}`}
                                    </span>
                                </div>
                                {/* Segmented bar: amber = executing, blue = selected pending */}
                                <div className="w-full h-3 bg-surface-container-lowest overflow-hidden flex">
                                    <div className="h-full bg-tertiary transition-all" style={{ width: `${executedPct}%` }} />
                                    <div className={`h-full transition-all ${wouldExceed ? 'bg-error' : 'bg-secondary-container'}`} style={{ width: `${Math.max(0, pendingPct)}%` }} />
                                </div>
                                <div className="flex justify-between font-mono text-[9px] text-on-surface-variant">
                                    <span>0 MW</span>
                                    <span>{(effectiveTarget - TOLERANCE).toFixed(1)} MW</span>
                                    <span className={`font-bold ${urgenceDelta > 0 ? 'text-error' : 'text-secondary'}`}>Cible : {effectiveTarget.toFixed(1)} MW</span>
                                    <span>{(effectiveTarget + TOLERANCE).toFixed(1)} MW</span>
                                </div>
                            </div>
                            <button onClick={handleValidate} disabled={!canValidate}
                                className={`flex items-center justify-center gap-space-sm px-space-xl py-space-md font-mono text-xs font-bold uppercase tracking-wider transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed
                                    ${wouldExceed ? 'bg-error-container text-on-error-container cursor-not-allowed' : 'bg-secondary-container hover:bg-secondary text-on-secondary-container'}`}
                                type="button">
                                <Icon name={everValidated ? 'add_circle' : 'bolt'} size={18} />
                                <span>
                                    {wouldExceed
                                        ? 'Depassement — reduire la selection'
                                        : everValidated
                                            ? `Valider round suivant (${selectedMW.toFixed(1)} MW)`
                                            : `Valider & Executer (${selectedMW.toFixed(1)} MW)`}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right 4/12 — execution + AI + J+1 */}
                <div className="lg:col-span-4 flex flex-col gap-space-md">

                    {/* Execution tracking */}
                    <div className="bg-surface-container-low p-space-md shadow-md flex flex-col gap-space-sm">
                        <div className="flex items-center justify-between pb-space-xs border-b border-surface-container-high">
                            <div className="flex items-center gap-space-sm">
                                <Icon name="timelapse" size={16} className={hasOverdue ? 'text-error animate-pulse' : 'text-tertiary'} />
                                <h3 className="font-sans font-semibold text-xs text-on-surface uppercase">Departs en cours</h3>
                            </div>
                            <span className="font-mono text-[10px] text-tertiary font-bold">{activeFeeders.length} ACTIFS</span>
                        </div>
                        {hasOverdue && (
                            <div className="flex items-center gap-space-xs px-space-sm py-space-xs bg-error-container/20 border border-error/40 font-mono text-[10px] text-error">
                                <Icon name="warning" size={13} className="animate-pulse" />
                                <span>Depassement 45 min — Realimentation requise</span>
                            </div>
                        )}
                        {activeFeeders.length === 0
                            ? <p className="font-mono text-[10px] text-on-surface-variant italic">Aucun depart en cours.</p>
                            : activeFeeders.map((f) => <ExecutionCard key={f.ref} feeder={f} onRestore={handleRestore} />)
                        }
                        {restored.length > 0 && (
                            <div className="pt-space-xs border-t border-surface-container-high">
                                <p className="font-mono text-[9px] text-on-surface-variant uppercase mb-space-xs">Retablis ({restored.length})</p>
                                {allFeeders.filter((f) => restored.includes(f.ref)).map((f) => (
                                    <div key={f.ref} className="flex items-center gap-space-xs font-mono text-[10px] text-secondary mb-0.5">
                                        <Icon name="check_circle" size={11} />
                                        <span>{f.ref} — {f.nom} · {f.mw} MW</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* AI suggestion card */}
                    <div className="bg-surface-container-low p-space-md shadow-md flex flex-col gap-space-sm">
                        <div className="flex items-center gap-space-sm">
                            <Icon name="psychology" size={16} className="text-secondary" />
                            <h3 className="font-sans font-semibold text-xs text-on-surface uppercase">Assistant IA</h3>
                        </div>
                        <div className="bg-surface-container-lowest border border-surface-container-high p-space-sm font-mono text-[10px] text-on-surface-variant leading-relaxed">
                            <p className="text-secondary font-semibold mb-space-xs flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse inline-block" />PLAN OPTIMAL
                            </p>
                            <p>Selection : F08+F15+F21+F11+F25+F09+F07+F18 = <strong className="text-secondary">39,6 MW</strong></p>
                            <p className="mt-space-xs">Equite 92/100. P0 sanctuarises.</p>
                        </div>
                        <button onClick={applyAiSuggestion} className="w-full flex items-center justify-center gap-space-xs py-space-xs bg-surface-container-highest hover:bg-secondary-container hover:text-on-secondary-container text-secondary font-mono text-xs font-bold transition-colors" type="button">
                            <Icon name="auto_fix_high" size={14} /><span>Appliquer la suggestion IA</span>
                        </button>
                    </div>

                    {/* J+1 preview */}
                    <div className="bg-surface-container-low p-space-md shadow-md flex flex-col gap-space-sm">
                        <div className="flex items-center justify-between pb-space-xs border-b border-surface-container-high">
                            <div className="flex items-center gap-space-sm">
                                <Icon name="calendar_clock" size={16} className="text-primary" />
                                <h3 className="font-sans font-semibold text-xs text-on-surface uppercase">Programme J+1</h3>
                            </div>
                            <span className="font-mono text-[10px] text-on-surface-variant">
                                {new Date(Date.now() + 86400000).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' })}
                            </span>
                        </div>
                        <div className="flex flex-col gap-space-xs">
                            {J1_SLOTS.map((s, i) => (
                                <div key={i} className="flex items-center justify-between px-space-sm py-space-xs bg-surface-container font-mono text-[10px]">
                                    <span className="text-on-surface font-bold">{s.time}</span>
                                    <span className="text-on-surface-variant">{s.mw} MW</span>
                                    <span className={s.feeders.length > 0 ? 'text-secondary font-bold' : 'text-tertiary'}>
                                        {s.feeders.length > 0 ? `${s.feeders.length} departs` : 'Non planifie'}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setJ1Open(true)} className="w-full flex items-center justify-center gap-space-xs py-space-xs bg-surface-container hover:bg-surface-container-high text-on-surface font-mono text-xs transition-colors border border-surface-container-high" type="button">
                            <Icon name="edit_calendar" size={13} /><span>Ouvrir editeur J+1</span>
                        </button>
                    </div>
                </div>
            </section>

            {/* SECTION 4 — Audit log */}
            <section className="px-space-md pb-space-md">
                <div className="bg-surface-container-low shadow-md flex flex-col overflow-hidden">
                    <div className="bg-surface-container-lowest px-space-md py-space-sm border-b border-surface-container-high flex items-center gap-space-sm">
                        <Icon name="history" size={16} className="text-secondary" />
                        <h3 className="font-sans font-semibold text-xs text-on-surface uppercase">Journal des Manoeuvres HTA — Session en cours</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left font-mono text-[10px]">
                            <thead className="bg-surface-container font-mono text-[9px] text-on-surface-variant uppercase tracking-wider">
                                <tr>
                                    <th className="py-space-sm px-space-md">Ref.</th>
                                    <th className="py-space-sm px-space-md">Nom</th>
                                    <th className="py-space-sm px-space-md text-center">Debut</th>
                                    <th className="py-space-sm px-space-md text-center">Fin</th>
                                    <th className="py-space-sm px-space-md text-center">Duree</th>
                                    <th className="py-space-sm px-space-md text-right">MW</th>
                                    <th className="py-space-sm px-space-md">Operateur</th>
                                    <th className="py-space-sm px-space-md text-center">Statut</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-container-high">
                                {auditLog.map((l, i) => (
                                    <tr key={i} className={`transition-colors ${l.statut === 'overdue' ? 'bg-error-container/20 border-l-2 border-error hover:bg-error-container/30' : 'bg-surface-container-low hover:bg-surface-container'}`}>
                                        <td className={`py-space-sm px-space-md font-bold ${l.statut === 'overdue' ? 'text-error' : l.statut === 'restored' ? 'text-on-surface-variant' : 'text-secondary'}`}>{l.ref}</td>
                                        <td className="py-space-sm px-space-md text-on-surface">{l.nom}</td>
                                        <td className="py-space-sm px-space-md text-center text-on-surface-variant">{l.debut}</td>
                                        <td className="py-space-sm px-space-md text-center text-on-surface-variant">{l.fin}</td>
                                        <td className={`py-space-sm px-space-md text-center font-bold ${l.statut === 'overdue' ? 'text-error' : l.statut === 'executing' ? 'text-tertiary' : 'text-on-surface-variant'}`}>{l.dur}</td>
                                        <td className="py-space-sm px-space-md text-right font-bold text-secondary">{l.mw} MW</td>
                                        <td className="py-space-sm px-space-md text-on-surface-variant">Tech. S. Dridi</td>
                                        <td className="py-space-sm px-space-md text-center">{statutBadge(l.statut)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <ProgrammeJ1Modal isOpen={j1Open} onClose={() => setJ1Open(false)} />
            <AiPanel isOpen={aiOpen} onClose={() => setAiOpen(false)} onApplySuggestion={applyAiSuggestion} />
        </div>
    )
}
