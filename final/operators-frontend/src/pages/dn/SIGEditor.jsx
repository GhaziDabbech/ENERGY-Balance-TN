import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useNavigate }    from 'react-router-dom'
import { useAuthStore }   from '../../stores/authStore'
import { useNetworkStore } from '../../stores/networkStore'
import { TUNISIA_OUTLINE } from '../../data/mockData'
import GOVERNORATES_GJ    from '../../data/governorates.json'

// ── Inline input modal — replaces window.prompt() everywhere in this file ────
function InputModal({ title, label, placeholder, onConfirm, onCancel })
{
    const [value, setValue] = useState('')
    const inputRef          = useRef(null)

    // Auto-focus the input when the modal mounts
    const mountRef = useCallback((node) =>
    {
        if (node) { inputRef.current = node; node.focus() }
    }, [])

    const handleConfirm = () =>
    {
        if (!value.trim()) return
        onConfirm(value.trim())
    }

    const handleKey = (e) =>
    {
        if (e.key === 'Enter')  handleConfirm()
        if (e.key === 'Escape') onCancel()
    }

    return (
        <div
            className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onCancel}
        >
            <div
                className="bg-surface-container-low border border-surface-container-high w-full max-w-sm flex flex-col shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-space-lg py-space-md bg-surface-container border-b border-surface-container-high">
                    <div className="flex items-center gap-space-sm">
                        <span className="material-symbols-outlined text-secondary" style={{ fontSize: 16 }}>edit</span>
                        <span className="font-sans font-bold text-xs text-on-surface uppercase tracking-wide">{title}</span>
                    </div>
                    <button onClick={onCancel} className="p-space-xs hover:bg-surface-container-high text-on-surface-variant transition-colors" type="button">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                    </button>
                </div>

                {/* Body */}
                <div className="p-space-lg flex flex-col gap-space-md">
                    <div className="flex flex-col gap-space-xs">
                        <label className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">
                            {label}
                        </label>
                        <input
                            ref={mountRef}
                            type="text"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            onKeyDown={handleKey}
                            placeholder={placeholder}
                            className="bg-surface-container-lowest border border-surface-container-high focus:border-secondary text-on-surface font-mono text-sm px-space-md py-space-sm focus:outline-none transition-colors"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-space-sm px-space-lg py-space-md border-t border-surface-container-high">
                    <button
                        onClick={onCancel}
                        className="px-space-md py-space-xs bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono text-xs border border-surface-container-high transition-colors"
                        type="button"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!value.trim()}
                        className="flex items-center gap-space-xs px-space-md py-space-xs bg-secondary-container hover:bg-secondary text-on-secondary-container font-mono text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        type="button"
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check</span>
                        <span>Confirmer</span>
                    </button>
                </div>
            </div>
        </div>
    )
}

function Icon({ name, size = 20, className = '', filled = false })
{
    return (
        <span
            className={`material-symbols-outlined select-none ${className}`}
            style={{ fontSize: size, fontVariationSettings: filled ? "'FILL' 1" : "'FILL' 0" }}
        >
            {name}
        </span>
    )
}

// ── Projection (Mercator, same constants as TunisiaMap) ───────────────────────
const VW = 560, VH = 1000, PAD = 28
const LAT_MIN = 29.9, LAT_MAX = 37.65, LNG_MIN = 7.45, LNG_MAX = 11.65
const TO_RAD    = Math.PI / 180
const mercY_MIN = Math.log(Math.tan(Math.PI / 4 + LAT_MIN * TO_RAD / 2))
const mercY_MAX = Math.log(Math.tan(Math.PI / 4 + LAT_MAX * TO_RAD / 2))

function project(lat, lng)
{
    const x  = PAD + ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * (VW - PAD * 2)
    const my = Math.log(Math.tan(Math.PI / 4 + lat * TO_RAD / 2))
    const y  = PAD + ((mercY_MAX - my) / (mercY_MAX - mercY_MIN)) * (VH - PAD * 2)
    return [x, y]
}

function geomToPath(geometry)
{
    if (!geometry) return ''
    const ring = (r) => `M${r.map(([lo, la]) => { const [x,y]=project(la,lo); return `${x.toFixed(1)},${y.toFixed(1)}` }).join(' L')} Z`
    if (geometry.type === 'Polygon')      return geometry.coordinates.map(ring).join(' ')
    if (geometry.type === 'MultiPolygon') return geometry.coordinates.flatMap(p => p.map(ring)).join(' ')
    return ''
}

function centroid(geometry)
{
    let c = []
    if (geometry?.type === 'Polygon')      c = geometry.coordinates[0]
    if (geometry?.type === 'MultiPolygon') c = geometry.coordinates[0]?.[0] ?? []
    if (!c.length) return null
    const n = c.length
    return project(c.reduce((s,p)=>s+p[1],0)/n, c.reduce((s,p)=>s+p[0],0)/n)
}

const TUNISIA_PATH = (() =>
{
    const pts = TUNISIA_OUTLINE.map(([la,lo]) => { const [x,y]=project(la,lo); return `${x.toFixed(1)},${y.toFixed(1)}` })
    return `M${pts.join(' L')} Z`
})()

const ZOOM_MIN = 0.9, ZOOM_MAX = 16, ZOOM_STEP = 1.4
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// Status fill tints for edit mode (brighter than read-only map)
const S_STROKE = { ok: '#4ade80', warn: '#ffb95f', crit: '#ff4444', unassigned: '#4a6080' }
const S_FILL   = { ok: 0.10,     warn: 0.16,      crit: 0.24,     unassigned: 0.04      }

// ── Left panel tree ───────────────────────────────────────────────────────────

function BccNode({ bcc, crc, store, notify, govNames, selectedBccId, onSelect })
{
    const [open, setOpen] = useState(false)
    const isSelected = selectedBccId === bcc.id

    const allAssigned = useMemo(() =>
    {
        const map = store.getGovToBcc()
        return new Set(Object.keys(map))
    }, [store.crcs])

    const available = govNames.filter(g => !allAssigned.has(g) || bcc.governorates.includes(g))
    const unassignableOptions = available.filter(g => !(bcc.governorates ?? []).includes(g))

    return (
        <div className={`rounded transition-colors ${isSelected ? 'ring-1 ring-secondary/50 bg-surface-container' : ''}`}>
            {/* BCC row */}
            <div className="flex items-center justify-between px-space-xs py-space-xs rounded hover:bg-surface-container transition-colors">
                <button
                    onClick={() => { setOpen(o => !o); onSelect(bcc.id) }}
                    className="flex items-center gap-space-xs flex-1 text-left min-w-0"
                    type="button"
                >
                    <Icon
                        name={open ? 'expand_more' : 'chevron_right'}
                        size={13}
                        className={isSelected ? 'text-secondary' : 'text-on-surface-variant'}
                    />
                    <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: bcc.color ?? '#ffb95f' }}
                    />
                    <span className={`font-body-sm text-[11px] truncate ${isSelected ? 'text-secondary font-semibold' : 'text-on-surface'}`}>
                        {bcc.name}
                    </span>
                    <span className="font-label-telemetry-sm text-[9px] text-on-surface-variant shrink-0 ml-1">
                        ({bcc.governorates?.length ?? 0})
                    </span>
                </button>
                <button
                    onClick={() =>
                    {
                        if (!window.confirm(`Supprimer ${bcc.name} et désassigner ses gouvernorats ?`)) return
                        store.removeBcc(crc.id, bcc.id)
                        notify(`BCC "${bcc.name}" supprimé`, 'text-error')
                    }}
                    className="text-on-surface-variant hover:text-error transition-colors shrink-0 ml-space-xs"
                    title="Supprimer ce BCC"
                    type="button"
                >
                    <Icon name="close" size={12} />
                </button>
            </div>

            {/* Governorate list (expanded) */}
            {open && (
                <div className="ml-3 mt-0.5 border-l border-surface-container-highest pl-space-xs pb-space-xs space-y-0.5">
                    <div className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider px-space-xs mb-space-xs">
                        Gouvernorats assignés
                    </div>

                    {(bcc.governorates ?? []).length === 0 && (
                        <p className="font-label-telemetry-sm text-[10px] text-on-surface-variant italic px-space-xs">
                            Aucun. Cliquez sur la carte ou utilisez le menu ci-dessous.
                        </p>
                    )}

                    {(bcc.governorates ?? []).map(gov => (
                        <div
                            key={gov}
                            className="flex items-center justify-between px-space-xs py-0.5 rounded hover:bg-surface-container transition-colors group"
                        >
                            <div className="flex items-center gap-space-xs min-w-0">
                                <span className="w-1 h-1 rounded-full shrink-0" style={{ background: bcc.color ?? '#ffb95f' }} />
                                <span className="font-label-telemetry-sm text-[10px] text-on-surface truncate">{gov}</span>
                            </div>
                            <button
                                onClick={() =>
                                {
                                    store.removeGovernorate(crc.id, bcc.id, gov)
                                    notify(`${gov} retiré de ${bcc.name}`, 'text-tertiary')
                                }}
                                className="text-on-surface-variant hover:text-error transition-colors opacity-0 group-hover:opacity-100"
                                type="button"
                            >
                                <Icon name="close" size={11} />
                            </button>
                        </div>
                    ))}

                    {/* Add governorate dropdown */}
                    {unassignableOptions.length > 0 && (
                        <select
                            className="w-full steg-input text-[10px] py-space-xs mt-space-xs"
                            value=""
                            onChange={e =>
                            {
                                const gov = e.target.value
                                if (!gov) return
                                store.addGovernorate(crc.id, bcc.id, gov)
                                notify(`${gov} assigné à ${bcc.name}`, 'text-secondary')
                            }}
                        >
                            <option value="">+ Assigner un gouvernorat…</option>
                            {unassignableOptions.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                    )}
                </div>
            )}
        </div>
    )
}

function CrcNode({ crc, store, notify, govNames, selectedBccId, onSelectBcc, onAddBcc })
{
    const [open, setOpen] = useState(true)

    return (
        <div className="mb-space-sm">
            {/* CRC header */}
            <div className="flex items-center justify-between px-space-xs py-space-xs rounded bg-surface-container-high hover:bg-surface-bright transition-colors">
                <button
                    onClick={() => setOpen(o => !o)}
                    className="flex items-center gap-space-xs flex-1 text-left"
                    type="button"
                >
                    <Icon name={open ? 'expand_more' : 'chevron_right'} size={14} className="text-secondary shrink-0" />
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: crc.color ?? '#acc7ff' }} />
                    <span className="font-label-caps text-[10px] text-on-surface font-bold">{crc.name}</span>
                    <span className="font-label-telemetry-sm text-[9px] text-on-surface-variant ml-1">
                        ({crc.bccs?.length ?? 0} BCCs · {crc.bccs?.flatMap(b => b.governorates ?? []).length ?? 0} gouv.)
                    </span>
                </button>
                <div className="flex items-center gap-space-xs">
                    <button
                        onClick={() => onAddBcc(crc)}
                        className="text-secondary hover:text-on-surface transition-colors"
                        title="Ajouter un BCC"
                        type="button"
                    >
                        <Icon name="add" size={13} />
                    </button>
                    <button
                        onClick={() =>
                        {
                            if (!window.confirm(`Supprimer ${crc.name} et tous ses BCCs ?`)) return
                            store.removeCrc(crc.id)
                            notify(`CRC "${crc.name}" supprimé`, 'text-error')
                        }}
                        className="text-on-surface-variant hover:text-error transition-colors"
                        title="Supprimer ce CRC"
                        type="button"
                    >
                        <Icon name="delete" size={12} />
                    </button>
                </div>
            </div>

            {open && (
                <div className="ml-3 mt-space-xs space-y-space-xs border-l border-surface-container-highest pl-space-xs">
                    {(crc.bccs ?? []).map(bcc => (
                        <BccNode
                            key={bcc.id}
                            bcc={bcc}
                            crc={crc}
                            store={store}
                            notify={notify}
                            govNames={govNames}
                            selectedBccId={selectedBccId}
                            onSelect={onSelectBcc}
                        />
                    ))}
                    {(!crc.bccs || crc.bccs.length === 0) && (
                        <p className="font-label-telemetry-sm text-[10px] text-on-surface-variant italic px-space-xs py-space-xs">
                            Aucun BCC. Cliquez + pour en ajouter un.
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Right inspector panel ─────────────────────────────────────────────────────
function BccInspector({ bcc, crc, store, notify, govNames })
{
    const [editingName, setEditingName] = useState(false)
    const [nameVal,     setNameVal]     = useState(bcc.name)
    const inputRef = useRef(null)

    // Keep local state in sync if bcc changes (different BCC selected)
    useEffect(() =>
    {
        setNameVal(bcc.name)
        setEditingName(false)
    }, [bcc.id])

    useEffect(() =>
    {
        if (editingName) inputRef.current?.focus()
    }, [editingName])

    const commitName = () =>
    {
        const trimmed = nameVal.trim()
        if (!trimmed || trimmed === bcc.name) { setNameVal(bcc.name); setEditingName(false); return }
        store.updateBcc(crc.id, bcc.id, { name: trimmed })
        notify(`Renommé en "${trimmed}"`, 'text-secondary')
        setEditingName(false)
    }

    const allAssigned = useMemo(() => new Set(Object.keys(store.getGovToBcc())), [store.crcs])
    const available   = govNames.filter(g => !allAssigned.has(g) || bcc.governorates.includes(g))
    const unassignable = available.filter(g => !(bcc.governorates ?? []).includes(g))

    const statusColor =
        bcc.status === 'crit' ? 'text-error'
        : bcc.status === 'warn' ? 'text-tertiary'
        : 'text-[#4ade80]'

    const statusLabel =
        bcc.status === 'crit' ? 'ALERTE CRITIQUE'
        : bcc.status === 'warn' ? 'ÉCART MODÉRÉ'
        : 'NOMINAL'

    return (
        <div className="flex flex-col h-full">

            {/* Panel header */}
            <div className="px-space-md py-space-md bg-surface-container-high shrink-0">
                <div className="flex items-center gap-space-xs mb-space-sm">
                    <Icon name="tune" size={14} className="text-tertiary" />
                    <span className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider">
                        Éditeur BCC
                    </span>
                    <span className={`ml-auto font-label-caps text-[9px] font-bold ${statusColor}`}>
                        {statusLabel}
                    </span>
                </div>

                {/* BCC name — click to edit */}
                <div className="flex items-center gap-space-xs">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: bcc.color ?? '#ffb95f' }} />
                    {editingName
                        ? (
                            <div className="flex items-center gap-space-xs flex-1">
                                <input
                                    ref={inputRef}
                                    className="steg-input text-[13px] flex-1 py-space-xs"
                                    value={nameVal}
                                    onChange={e => setNameVal(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameVal(bcc.name); setEditingName(false) } }}
                                    onBlur={commitName}
                                />
                            </div>
                        )
                        : (
                            <button
                                className="flex items-center gap-space-xs group flex-1 text-left"
                                onClick={() => setEditingName(true)}
                                title="Cliquer pour renommer"
                                type="button"
                            >
                                <span className="font-headline-sm text-body-md text-on-surface font-bold truncate">{bcc.name}</span>
                                <Icon name="edit" size={13} className="text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            </button>
                        )
                    }
                </div>

                <div className="font-label-telemetry-sm text-[10px] text-on-surface-variant mt-space-xs">
                    {crc.name} · {bcc.governorates?.length ?? 0} gouvernorat{(bcc.governorates?.length ?? 0) !== 1 ? 's' : ''}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-space-md space-y-space-md">

                {/* Gouvernorats list */}
                <div>
                    <div className="flex items-center justify-between mb-space-xs">
                        <span className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider">
                            Gouvernorats gérés
                        </span>
                        <span className="font-label-telemetry-sm text-[10px] text-secondary">
                            {bcc.governorates?.length ?? 0} / {govNames.length}
                        </span>
                    </div>

                    {(bcc.governorates ?? []).length === 0 && (
                        <div className="bg-surface-container p-space-md rounded text-center">
                            <Icon name="map" size={24} className="text-on-surface-variant opacity-30 mb-space-xs" />
                            <p className="font-label-telemetry-sm text-[10px] text-on-surface-variant">
                                Cliquez sur un gouvernorat sur la carte pour l'assigner à ce BCC.
                            </p>
                        </div>
                    )}

                    <div className="space-y-space-xs">
                        {(bcc.governorates ?? []).map(gov => (
                            <div
                                key={gov}
                                className="flex items-center justify-between px-space-sm py-space-xs rounded bg-surface-container hover:bg-surface-container-high transition-colors group"
                            >
                                <div className="flex items-center gap-space-xs">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: bcc.color ?? '#ffb95f' }} />
                                    <span className="font-label-telemetry-sm text-[11px] text-on-surface">{gov}</span>
                                </div>
                                <button
                                    onClick={() =>
                                    {
                                        store.removeGovernorate(crc.id, bcc.id, gov)
                                        notify(`${gov} retiré de ${bcc.name}`, 'text-tertiary')
                                    }}
                                    className="text-on-surface-variant hover:text-error transition-colors opacity-0 group-hover:opacity-100"
                                    type="button"
                                    title="Retirer ce gouvernorat"
                                >
                                    <Icon name="close" size={13} />
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Add governorate dropdown */}
                    {unassignable.length > 0 && (
                        <select
                            className="w-full steg-input text-[11px] py-space-sm mt-space-sm"
                            value=""
                            onChange={e =>
                            {
                                const gov = e.target.value
                                if (!gov) return
                                store.addGovernorate(crc.id, bcc.id, gov)
                                notify(`${gov} assigné à ${bcc.name}`, 'text-secondary')
                            }}
                        >
                            <option value="">+ Assigner un gouvernorat…</option>
                            {unassignable.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                    )}
                </div>

                {/* Hint */}
                <div className="bg-surface-container-low rounded p-space-sm flex gap-space-xs">
                    <Icon name="info" size={13} className="text-secondary shrink-0 mt-0.5" />
                    <p className="font-label-telemetry-sm text-[10px] text-on-surface-variant leading-relaxed">
                        Cliquez sur un gouvernorat non assigné sur la carte pour l'ajouter directement à ce BCC.
                        Un gouvernorat ne peut appartenir qu'à un seul BCC à la fois.
                    </p>
                </div>

                {/* Unassign all */}
                {(bcc.governorates ?? []).length > 0 && (
                    <button
                        onClick={() =>
                        {
                            if (!window.confirm(`Retirer tous les gouvernorats de ${bcc.name} ?`)) return
                            const govsCopy = [...(bcc.governorates ?? [])]
                            govsCopy.forEach(g => store.removeGovernorate(crc.id, bcc.id, g))
                            notify(`Gouvernorats de ${bcc.name} effacés`, 'text-error')
                        }}
                        className="w-full flex items-center justify-center gap-space-xs py-space-sm rounded bg-surface-container hover:bg-error-container hover:text-on-error-container text-on-surface-variant font-body-sm text-[11px] transition-colors"
                        type="button"
                    >
                        <Icon name="layer_clear" size={14} />
                        <span>Retirer tous les gouvernorats</span>
                    </button>
                )}
            </div>

            {/* Footer — metadata */}
            <div className="px-space-md py-space-xs border-t border-surface-container-high shrink-0 space-y-0.5">
                <div className="flex justify-between font-label-telemetry-sm text-[10px]">
                    <span className="text-on-surface-variant">ID</span>
                    <span className="text-on-surface font-bold">{bcc.id}</span>
                </div>
                <div className="flex justify-between font-label-telemetry-sm text-[10px]">
                    <span className="text-on-surface-variant">Opérateur</span>
                    <span className="text-on-surface">{bcc.operator ?? '—'}</span>
                </div>
                <div className="flex justify-between font-label-telemetry-sm text-[10px]">
                    <span className="text-on-surface-variant">Ville</span>
                    <span className="text-on-surface">{bcc.city ?? '—'}</span>
                </div>
                <div className="flex justify-between font-label-telemetry-sm text-[10px]">
                    <span className="text-on-surface-variant">Cible délestage</span>
                    <span className="text-secondary font-bold">{bcc.targetMW ?? '—'} MW</span>
                </div>
            </div>
        </div>
    )
}

// ── Main SIG Editor ───────────────────────────────────────────────────────────
export default function SIGEditor()
{
    const navigate    = useNavigate()
    const { user }    = useAuthStore()
    const store       = useNetworkStore()

    // Map transform
    const containerRef = useRef(null)
    const trRef        = useRef({ scale: 1, tx: 0, ty: 0 })
    const drag         = useRef({ on: false, sx: 0, sy: 0, stx: 0, sty: 0 })
    const [tr,          setTr]          = useState({ scale: 1, tx: 0, ty: 0 })

    // Editor state
    const [selectedBccId,  setSelectedBccId]  = useState(null)
    const [notification,   setNotification]   = useState(null)
    const [saveState,      setSaveState]       = useState('idle')
    const [dirtyCount,     setDirtyCount]      = useState(0)
    const [hoveredGovName, setHoveredGovName]  = useState(null)
    // Replaces window.prompt() — { title, label, placeholder, onConfirm }
    const [inputModal,     setInputModal]      = useState(null)

    // Track dirty state: increment whenever store.crcs changes after mount
    const initVersionRef = useRef(store.version)
    useEffect(() =>
    {
        if (store.version !== initVersionRef.current) return  // after save, reset baseline
        setDirtyCount(c => c + 1)
    }, [store.crcs])  // eslint-disable-line react-hooks/exhaustive-deps

    const notify = useCallback((msg, color = 'text-secondary') =>
    {
        setNotification({ msg, color })
        setTimeout(() => setNotification(null), 3000)
    }, [])

    // Opens the InputModal to add a BCC — called from CrcNode
    const handleAddBcc = useCallback((crc) =>
    {
        setInputModal({
            title:       `Ajouter un BCC — ${crc.name}`
            ,label:      'Nom du nouveau BCC'
            ,placeholder:'ex: BCC 8 — Nabeul'
            ,onConfirm:  (name) =>
            {
                store.addBcc(crc.id, {
                    name
                    ,color:       '#acc7ff'
                    ,targetMW:    50
                    ,actualMW:    50
                    ,status:      'ok'
                    ,governorates: []
                })
                notify(`BCC "${name}" ajouté à ${crc.name}`, 'text-secondary')
                setInputModal(null)
            }
        })
    }, [store, notify])

    // ── Transform engine ──────────────────────────────────────────────────────
    const apply = useCallback((scale, tx, ty) =>
    {
        const m = PAD * scale
        const t = {
            scale
            ,tx: clamp(tx, -(VW * scale - VW + m), m)
            ,ty: clamp(ty, -(VH * scale - VH + m), m)
        }
        trRef.current = t
        setTr(t)
    }, [])

    // Wheel zoom
    useEffect(() =>
    {
        const el = containerRef.current
        if (!el) return
        const onWheel = (e) =>
        {
            e.preventDefault()
            const { scale, tx, ty } = trRef.current
            const s2   = clamp(scale * Math.exp(-e.deltaY * 0.0015 * 3), ZOOM_MIN, ZOOM_MAX)
            const rect = el.getBoundingClientRect()
            const mx   = ((e.clientX - rect.left) / rect.width)  * VW
            const my   = ((e.clientY - rect.top)  / rect.height) * VH
            apply(s2, mx - (mx - tx) * (s2 / scale), my - (my - ty) * (s2 / scale))
        }
        el.addEventListener('wheel', onWheel, { passive: false })
        return () => el.removeEventListener('wheel', onWheel)
    }, [apply])

    // Mouse drag
    const onMouseDown = useCallback((e) =>
    {
        if (e.button !== 0) return
        drag.current = { on: true, sx: e.clientX, sy: e.clientY, stx: trRef.current.tx, sty: trRef.current.ty }
        e.currentTarget.style.cursor = 'grabbing'
    }, [])

    const onMouseMove = useCallback((e) =>
    {
        if (!drag.current.on) return
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        apply(
            trRef.current.scale
            ,drag.current.stx + (e.clientX - drag.current.sx) * VW / rect.width
            ,drag.current.sty + (e.clientY - drag.current.sy) * VH / rect.height
        )
    }, [apply])

    const onMouseUp = useCallback((e) =>
    {
        drag.current.on = false
        if (e.currentTarget) e.currentTarget.style.cursor = 'grab'
    }, [])

    // ── Save handler ──────────────────────────────────────────────────────────
    const handleSave = () =>
    {
        setSaveState('saving')
        setTimeout(() =>
        {
            store.save(user?.displayName ?? user?.username ?? 'Opérateur')
            initVersionRef.current = store.version + 1  // reset dirty baseline
            setDirtyCount(0)
            setSaveState('saved')
            setTimeout(() => navigate('/dn/dashboard'), 1400)
        }, 600)
    }

    // ── Gov → BCC lookup (derived) ────────────────────────────────────────────
    const govToBcc = useMemo(() => store.getGovToBcc(), [store.crcs])
    const allBccs  = useMemo(() => store.crcs.flatMap(c => c.bccs), [store.crcs])
    const govNames = useMemo(() => GOVERNORATES_GJ.features.map(f => f.properties.name), [])

    // Selected BCC and its CRC
    const selectedBcc = useMemo(() => allBccs.find(b => b.id === selectedBccId) ?? null, [allBccs, selectedBccId])
    const selectedCrc = useMemo(() =>
        selectedBcc ? store.crcs.find(c => c.id === selectedBcc.crcId) ?? null : null
    , [selectedBcc, store.crcs])

    // Governorate render data
    const govData = useMemo(() =>
        GOVERNORATES_GJ.features.map(f =>
        {
            const name   = f.properties.name
            const nameFr = f.properties.name_fr || name
            const bccId  = govToBcc[name]
            const bcc    = allBccs.find(b => b.id === bccId)
            const status = bcc?.status ?? 'unassigned'
            return { name, nameFr, bccId, bcc, status, path: geomToPath(f.geometry), center: centroid(f.geometry) }
        })
    , [govToBcc, allBccs])

    // ── Governorate click → assign or select ──────────────────────────────────
    const handleGovClick = useCallback((e, gd) =>
    {
        e.stopPropagation()

        // If we have a selected BCC and this gov is unassigned — assign it directly
        if (selectedBccId && selectedBcc && !gd.bccId)
        {
            store.addGovernorate(selectedCrc.id, selectedBccId, gd.name)
            notify(`${gd.nameFr} assigné à ${selectedBcc.name}`, 'text-secondary')
            return
        }

        // If this gov belongs to a BCC — select that BCC
        if (gd.bccId)
        {
            setSelectedBccId(gd.bccId)
            return
        }

        // Unassigned and no BCC selected — deselect
        setSelectedBccId(null)
    }, [selectedBccId, selectedBcc, selectedCrc, store, notify])

    const { scale, tx, ty } = tr
    const isDirty  = dirtyCount > 0
    const isSaving = saveState === 'saving'
    const isSaved  = saveState === 'saved'

    return (
        <div className="flex flex-col w-full h-full bg-surface-container-lowest overflow-hidden">

            {/* ── Top bar ───────────────────────────────────────────────────── */}
            <div className="shrink-0 flex items-center justify-between px-space-lg py-space-xs bg-tertiary-container/60 backdrop-blur-md shadow-sm z-40 gap-space-md">

                {/* Left: mode badge + dirty indicator */}
                <div className="flex items-center gap-space-md min-w-0">
                    <div className="flex items-center gap-space-xs px-space-sm py-space-xs rounded bg-tertiary text-on-tertiary font-label-caps text-[10px] font-bold shrink-0">
                        <Icon name="edit_road" size={14} />
                        <span>ÉDITION TOPOLOGIE</span>
                    </div>

                    {isDirty && !isSaved && (
                        <div className="flex items-center gap-space-xs px-space-sm py-space-xs rounded bg-tertiary/20 border border-tertiary/40 font-label-caps text-[10px] text-tertiary animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                            <span>Modifications non sauvegardées</span>
                        </div>
                    )}

                    <span className="hidden lg:inline font-label-telemetry-sm text-[10px] text-on-surface-variant">
                        v{store.version}{store.lastSaved
                            ? ` · Dernière sauvegarde ${new Date(store.lastSaved).toLocaleTimeString('fr-TN', { hour: '2-digit', minute: '2-digit' })}`
                            : ''}
                    </span>
                </div>

                {/* Right: undo/redo + save */}
                <div className="flex items-center gap-space-xs shrink-0">
                    <button
                        onClick={() => { store.undo(); notify('Annulé', 'text-tertiary') }}
                        disabled={!store._history?.length}
                        className="px-space-md py-space-xs rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm flex items-center gap-space-xs disabled:opacity-30 transition-colors"
                        type="button"
                    >
                        <Icon name="undo" size={15} />
                        <span className="hidden sm:inline">Annuler</span>
                    </button>
                    <button
                        onClick={() => { store.redo(); notify('Rétabli', 'text-tertiary') }}
                        disabled={!store._future?.length}
                        className="px-space-md py-space-xs rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm flex items-center gap-space-xs disabled:opacity-30 transition-colors"
                        type="button"
                    >
                        <Icon name="redo" size={15} />
                        <span className="hidden sm:inline">Rétablir</span>
                    </button>

                    <div className="w-px h-4 bg-surface-container-highest" />

                    {/* Discard — navigate back without saving */}
                    <button
                        onClick={() => navigate('/dn/dashboard')}
                        className="px-space-md py-space-xs rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-body-sm text-body-sm flex items-center gap-space-xs transition-colors"
                        type="button"
                    >
                        <Icon name="close" size={15} />
                        <span className="hidden sm:inline">Annuler les modifs</span>
                    </button>

                    {/* Save */}
                    <button
                        onClick={handleSave}
                        disabled={isSaving || isSaved}
                        className={`px-space-lg py-space-xs rounded font-body-sm text-body-sm flex items-center gap-space-xs shadow-sm transition-all ${
                            isSaved  ? 'bg-secondary text-on-secondary scale-105'
                            : isSaving ? 'bg-tertiary/60 text-on-tertiary cursor-wait'
                            : isDirty  ? 'bg-tertiary hover:bg-tertiary-fixed text-on-tertiary'
                            : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-bright'
                        }`}
                        type="button"
                    >
                        <Icon name={isSaved ? 'check_circle' : isSaving ? 'hourglass_top' : 'save'} size={16} filled={isSaved} />
                        <span>{isSaved ? 'Sauvegardé ✓' : isSaving ? 'Sauvegarde…' : 'Enregistrer'}</span>
                    </button>
                </div>
            </div>

            {/* ── Notification bar ─────────────────────────────────────────── */}
            {notification && (
                <div className={`shrink-0 px-space-lg py-space-xs border-b border-surface-container-high font-label-caps text-label-caps text-[11px] ${notification.color} bg-surface-container-low transition-all`}>
                    {notification.msg}
                </div>
            )}

            {/* ── Main workspace ───────────────────────────────────────────── */}
            <div className="flex flex-1 overflow-hidden">

                {/* ── Left panel: CRC/BCC/Governorate tree ─────────────────── */}
                <div className="w-72 shrink-0 bg-surface-container-low flex flex-col z-20 shadow-xl overflow-hidden">

                    {/* Panel header */}
                    <div className="px-space-md py-space-sm bg-surface-container border-b border-surface-container-high shrink-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-space-xs">
                                <Icon name="account_tree" size={15} className="text-secondary" />
                                <span className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider">
                                    Architecture réseau
                                </span>
                            </div>
                            {/* Add CRC */}
                            <button
                                onClick={() =>
                                {
                                    setInputModal({
                                        title:       'Ajouter un CRC'
                                        ,label:      'Nom du nouveau CRC'
                                        ,placeholder:'ex: CRC Centre'
                                        ,onConfirm:  (name) =>
                                        {
                                            store.addCrc({ name, color: '#acc7ff', city: '' })
                                            notify(`CRC "${name}" ajouté`, 'text-secondary')
                                            setInputModal(null)
                                        }
                                    })
                                }}
                                className="flex items-center gap-space-xs px-space-xs py-space-xs rounded bg-surface-container-high hover:bg-surface-bright text-secondary font-label-caps text-[10px] transition-colors"
                                title="Ajouter un CRC"
                                type="button"
                            >
                                <Icon name="add" size={12} />
                                <span>CRC</span>
                            </button>
                        </div>

                        {/* Stats summary */}
                        <div className="flex items-center gap-space-md mt-space-xs font-label-telemetry-sm text-[10px] text-on-surface-variant">
                            <span>{store.crcs.length} CRC{store.crcs.length !== 1 ? 's' : ''}</span>
                            <span>·</span>
                            <span>{allBccs.length} BCCs</span>
                            <span>·</span>
                            <span className={Object.keys(govToBcc).length < govNames.length ? 'text-tertiary' : 'text-[#4ade80]'}>
                                {Object.keys(govToBcc).length}/{govNames.length} gouv.
                            </span>
                        </div>
                    </div>

                    {/* Unassigned governorates warning */}
                    {Object.keys(govToBcc).length < govNames.length && (
                        <div className="px-space-md py-space-xs border-b border-tertiary/30 bg-tertiary/10 flex items-center gap-space-xs shrink-0">
                            <Icon name="warning" size={13} className="text-tertiary shrink-0" />
                            <span className="font-label-caps text-[10px] text-tertiary">
                                {govNames.length - Object.keys(govToBcc).length} gouvernorat{govNames.length - Object.keys(govToBcc).length !== 1 ? 's' : ''} non assigné{govNames.length - Object.keys(govToBcc).length !== 1 ? 's' : ''}
                            </span>
                        </div>
                    )}

                    {/* Tree */}
                    <div className="flex-1 overflow-y-auto p-space-sm">
                        {store.crcs.map(crc => (
                            <CrcNode
                                key={crc.id}
                                crc={crc}
                                store={store}
                                notify={notify}
                                govNames={govNames}
                                selectedBccId={selectedBccId}
                                onSelectBcc={setSelectedBccId}
                                onAddBcc={handleAddBcc}
                            />
                        ))}
                        {store.crcs.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-8 gap-space-sm text-on-surface-variant text-center">
                                <Icon name="device_hub" size={32} className="opacity-20" />
                                <p className="font-body-sm text-[11px]">Aucun CRC. Cliquez + CRC pour commencer.</p>
                            </div>
                        )}
                    </div>

                    {/* Reset to defaults */}
                    <div className="p-space-sm border-t border-surface-container-high shrink-0">
                        <button
                            onClick={() =>
                            {
                                if (!window.confirm('Réinitialiser toute la structure aux valeurs par défaut STEG ?')) return
                                store.resetToDefault()
                                setSelectedBccId(null)
                                setDirtyCount(c => c + 1)
                                notify('Structure réinitialisée aux défauts', 'text-tertiary')
                            }}
                            className="w-full flex items-center gap-space-xs p-space-xs rounded text-on-surface-variant hover:bg-error-container hover:text-on-error-container font-body-sm text-[11px] transition-colors"
                            type="button"
                        >
                            <Icon name="restart_alt" size={13} />
                            <span>Réinitialiser aux défauts</span>
                        </button>
                    </div>
                </div>

                {/* ── Map canvas ───────────────────────────────────────────── */}
                <div
                    ref={containerRef}
                    className="relative flex-1 overflow-hidden"
                    style={{ cursor: 'grab', background: '#020d1c' }}
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseUp}
                >
                    <svg
                        viewBox={`0 0 ${VW} ${VH}`}
                        preserveAspectRatio="xMidYMid meet"
                        className="w-full h-full"
                    >
                        <defs>
                            <pattern id="sig-dots" patternUnits="userSpaceOnUse" width="16" height="16">
                                <circle cx="8" cy="8" r="0.5" fill="#0e2540" />
                            </pattern>
                            <filter id="sig-glow-sel" x="-30%" y="-30%" width="160%" height="160%">
                                <feGaussianBlur stdDeviation="2.5" result="b" />
                                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                            </filter>
                        </defs>

                        <rect width={VW} height={VH} fill="#020d1c" />
                        <rect width={VW} height={VH} fill="url(#sig-dots)" />

                        <g transform={`translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${scale.toFixed(4)})`}>

                            {/* Tunisia land */}
                            <path d={TUNISIA_PATH} fill="#061828" stroke="none" />

                            {/* ── Governorate fills ──────────────────── */}
                            {govData.map(gd =>
                            {
                                const isBccSelected  = gd.bccId && gd.bccId === selectedBccId
                                const isHovered      = gd.name === hoveredGovName
                                const isUnassigned   = !gd.bccId
                                const canAssign      = isUnassigned && selectedBccId

                                const stroke  = isBccSelected
                                    ? '#ffffff'
                                    : (gd.bcc?.color ?? S_STROKE[gd.status])
                                const fillClr = gd.bcc?.color ?? (isUnassigned ? '#4a6080' : '#4ade80')
                                const fillOp  = isBccSelected
                                    ? (S_FILL[gd.status] ?? 0.06) * 4
                                    : isHovered
                                        ? (S_FILL[gd.status] ?? 0.06) * 2.5
                                        : (S_FILL[gd.status] ?? 0.04)

                                return (
                                    <path
                                        key={gd.name}
                                        d={gd.path}
                                        fill={fillClr}
                                        fillOpacity={fillOp}
                                        stroke={isHovered ? '#ffffff' : stroke}
                                        strokeWidth={(isBccSelected ? 2.5 : isHovered ? 1.5 : 0.6) / scale}
                                        strokeOpacity={isBccSelected || isHovered ? 0.9 : 0.5}
                                        strokeLinejoin="round"
                                        style={{ cursor: canAssign ? 'cell' : gd.bccId ? 'pointer' : 'default' }}
                                        onClick={e => handleGovClick(e, gd)}
                                        onMouseEnter={() => setHoveredGovName(gd.name)}
                                        onMouseLeave={() => setHoveredGovName(null)}
                                        filter={isBccSelected ? 'url(#sig-glow-sel)' : undefined}
                                    />
                                )
                            })}

                            {/* Tunisia outer border */}
                            <path d={TUNISIA_PATH} fill="none" stroke="#0d2d50" strokeWidth={5 / scale} strokeLinejoin="round" opacity={0.5} />
                            <path d={TUNISIA_PATH} fill="none" stroke="#1a5080" strokeWidth={1.5 / scale} strokeLinejoin="round" />

                            {/* ── Governorate name labels ─────────────── */}
                            {govData.map(gd =>
                            {
                                if (!gd.center) return null
                                const [cx, cy]  = gd.center
                                const isSel     = gd.bccId === selectedBccId
                                const labelFill = isSel ? '#ffffff' : (gd.bcc?.color ?? '#3d7aaa')
                                return (
                                    <text
                                        key={`lbl-${gd.name}`}
                                        x={cx}
                                        y={cy}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fontSize={11 / scale}
                                        fontFamily="IBM Plex Sans,sans-serif"
                                        fontWeight={isSel ? '700' : '500'}
                                        fill={labelFill}
                                        fillOpacity={isSel ? 1 : 0.75}
                                        style={{ pointerEvents: 'none' }}
                                    >
                                        {gd.nameFr}
                                    </text>
                                )
                            })}

                            {/* Graticule at low zoom */}
                            {scale < 1.4 && [31,32,33,34,35,36,37].map(lat =>
                            {
                                const [, y] = project(lat, LNG_MIN)
                                return <text key={`g${lat}`} x={PAD - 4} y={y} textAnchor="end" dominantBaseline="middle" fontSize={7 / scale} fontFamily="JetBrains Mono,monospace" fill="#1a3a5a">{lat}°N</text>
                            })}
                            {scale < 1.4 && [8,9,10,11].map(lng =>
                            {
                                const [x] = project(LAT_MIN, lng)
                                return <text key={`g${lng}`} x={x} y={VH - PAD + 12} textAnchor="middle" fontSize={7 / scale} fontFamily="JetBrains Mono,monospace" fill="#1a3a5a">{lng}°E</text>
                            })}
                        </g>
                    </svg>

                    {/* ── Map legend ──────────────────────────────── */}
                    <div className="absolute top-3 left-3 z-10 bg-surface-container/85 backdrop-blur px-space-md py-space-sm rounded shadow-md font-label-caps text-label-caps space-y-1 pointer-events-none">
                        <div className="text-on-surface-variant uppercase text-[9px] tracking-wider mb-space-xs font-bold">
                            LÉGENDE ÉDITEUR
                        </div>
                        <div className="flex items-center gap-space-sm">
                            <span className="w-2 h-2 rounded-full bg-secondary shrink-0" />
                            <span className="text-on-surface text-[10px]">BCC sélectionné (surbrillance)</span>
                        </div>
                        <div className="flex items-center gap-space-sm">
                            <span className="w-2 h-2 rounded-full bg-[#4a6080] shrink-0" />
                            <span className="text-on-surface text-[10px]">Gouvernorat non assigné</span>
                        </div>
                        <div className="flex items-center gap-space-sm">
                            <span className="w-2 h-2 rounded-full bg-on-surface shrink-0" />
                            <span className="text-on-surface text-[10px]">Cliquer → assigner au BCC actif</span>
                        </div>
                    </div>

                    {/* ── Hover tooltip ───────────────────────────── */}
                    {hoveredGovName && (() =>
                    {
                        const gd = govData.find(g => g.name === hoveredGovName)
                        if (!gd) return null
                        const label = gd.bcc
                            ? `${gd.nameFr} → ${gd.bcc.name}`
                            : selectedBccId
                                ? `${gd.nameFr} — cliquer pour assigner à ${selectedBcc?.name}`
                                : `${gd.nameFr} — non assigné`
                        return (
                            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 pointer-events-none bg-surface-container/95 border border-surface-container-high rounded shadow-lg px-space-md py-space-sm font-label-caps text-[10px] text-secondary whitespace-nowrap z-20">
                                {label}
                            </div>
                        )
                    })()}

                    {/* ── Zoom controls ───────────────────────────── */}
                    <div className="absolute bottom-3 right-3 flex flex-col gap-space-xs z-10">
                        <button
                            onClick={() => { const { scale:s,tx:t,ty:u } = trRef.current; const s2=clamp(s*ZOOM_STEP,ZOOM_MIN,ZOOM_MAX); apply(s2,VW/2-(VW/2-t)*(s2/s),VH/2-(VH/2-u)*(s2/s)) }}
                            className="w-7 h-7 flex items-center justify-center rounded bg-surface-container-high hover:bg-surface-bright text-on-surface shadow-md"
                            type="button"
                        >
                            <Icon name="add" size={15} />
                        </button>
                        <button
                            onClick={() => { const { scale:s,tx:t,ty:u } = trRef.current; const s2=clamp(s/ZOOM_STEP,ZOOM_MIN,ZOOM_MAX); apply(s2,VW/2-(VW/2-t)*(s2/s),VH/2-(VH/2-u)*(s2/s)) }}
                            className="w-7 h-7 flex items-center justify-center rounded bg-surface-container-high hover:bg-surface-bright text-on-surface shadow-md"
                            type="button"
                        >
                            <Icon name="remove" size={15} />
                        </button>
                        <button
                            onClick={() => apply(1, 0, 0)}
                            className="w-7 h-7 flex items-center justify-center rounded bg-surface-container-high hover:bg-surface-bright text-secondary shadow-md"
                            type="button"
                        >
                            <Icon name="crop_free" size={15} />
                        </button>
                    </div>

                    {/* ── Zoom badge ──────────────────────────────── */}
                    <div className="absolute top-2 right-2 pointer-events-none">
                        <span className="font-label-telemetry-sm text-[9px] text-on-surface-variant bg-surface-container/70 px-1.5 py-0.5 rounded">
                            ×{scale.toFixed(scale < 2 ? 1 : 0)}
                        </span>
                    </div>

                    {/* ── Save overlay (success flash) ─────────────── */}
                    {isSaved && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-none">
                            <div className="flex flex-col items-center gap-space-md bg-surface-container-low rounded shadow-2xl px-space-lg py-space-lg ring-2 ring-secondary">
                                <Icon name="check_circle" size={48} className="text-secondary" filled />
                                <span className="font-headline-sm text-body-md text-on-surface font-bold">
                                    Sauvegardé avec succès
                                </span>
                                <span className="font-label-telemetry-sm text-[11px] text-on-surface-variant">
                                    Retour à la cartographie…
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Right inspector ──────────────────────────────────────── */}
                <div className="w-80 shrink-0 bg-surface-container-low flex flex-col z-20 shadow-2xl overflow-hidden">
                    {selectedBcc && selectedCrc
                        ? (
                            <BccInspector
                                bcc={selectedBcc}
                                crc={selectedCrc}
                                store={store}
                                notify={notify}
                                govNames={govNames}
                            />
                        )
                        : (
                            <div className="flex flex-col h-full">
                                <div className="px-space-md py-space-md bg-surface-container-high border-b border-surface-container-highest shrink-0">
                                    <div className="flex items-center gap-space-xs font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider">
                                        <Icon name="tune" size={15} className="text-tertiary" />
                                        <span>Inspecteur BCC</span>
                                    </div>
                                </div>
                                <div className="flex-1 flex flex-col items-center justify-center gap-space-lg text-on-surface-variant p-space-lg text-center">
                                    <Icon name="touch_app" size={40} className="opacity-20" />
                                    <div>
                                        <p className="font-body-sm text-[12px] text-on-surface mb-space-xs">
                                            Aucun BCC sélectionné
                                        </p>
                                        <p className="font-label-telemetry-sm text-[10px] text-on-surface-variant leading-relaxed">
                                            Cliquez sur un BCC dans l'arbre à gauche ou sur un gouvernorat coloré sur la carte pour afficher son panneau d'édition.
                                        </p>
                                    </div>
                                </div>
                                <div className="px-space-md py-space-xs border-t border-surface-container-high font-label-telemetry-sm text-[10px] text-on-surface-variant shrink-0 flex items-center justify-between">
                                    <span>EPSG:4326</span>
                                    <span>SIG ↔ SCADA v{store.version}</span>
                                </div>
                            </div>
                        )
                    }
                </div>
            </div>

            {/* InputModal — replaces window.prompt() for CRC and BCC creation */}
            {inputModal && (
                <InputModal
                    title={inputModal.title}
                    label={inputModal.label}
                    placeholder={inputModal.placeholder}
                    onConfirm={inputModal.onConfirm}
                    onCancel={() => setInputModal(null)}
                />
            )}
        </div>
    )
}
