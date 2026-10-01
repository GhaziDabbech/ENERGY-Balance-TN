import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import clsx from 'clsx'
import GOVERNORATES_GJ from '../../data/governorates.json'
import { DEFAULT_NETWORK, GOV_NAMES } from '../../data/networkConfig'
import api from '../../lib/api'

// ── SVG projection (Mercator — identical constants to TunisiaMap) ─────────────
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
    const ring = (r) =>
    {
        const pts = r.map(([lo, la]) => { const [x,y] = project(la, lo); return `${x.toFixed(1)},${y.toFixed(1)}` })
        return `M${pts.join(' L')} Z`
    }
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
    return project(c.reduce((s, p) => s + p[1], 0) / n, c.reduce((s, p) => s + p[0], 0) / n)
}

// ── Tunisia outer boundary (from TunisiaMap) ─────────────────────────────────
// Build it from all governorate polygons union (cheaper than replicating TUNISIA_OUTLINE)
const TUNISIA_PATH = (() =>
{
    const rings = []
    GOVERNORATES_GJ.features.forEach(f =>
    {
        const geom = f.geometry
        const process = (ring) =>
        {
            const pts = ring.map(([lo, la]) => { const [x, y] = project(la, lo); return `${x.toFixed(1)},${y.toFixed(1)}` })
            rings.push(`M${pts.join(' L')} Z`)
        }
        if (geom.type === 'Polygon') geom.coordinates.forEach(process)
        if (geom.type === 'MultiPolygon') geom.coordinates.forEach(poly => poly.forEach(process))
    })
    return rings.join(' ')
})()

// ── Build index: gov name → BCC ──────────────────────────────────────────────
const ALL_BCCS = DEFAULT_NETWORK.crcs.flatMap(c => c.bccs)
const GOV_TO_BCC_MAP = {}
ALL_BCCS.forEach(bcc => bcc.governorates.forEach(g => { GOV_TO_BCC_MAP[g] = bcc }))

// ── Status colour palette (light/public theme) ────────────────────────────────
const STATUS_CFG =
{
    active:    { fill: '#dc2626', fillOp: 0.22, stroke: '#ef4444', label: 'Coupure en cours',  dot: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50 border-red-200'    }
    ,scheduled:{ fill: '#d97706', fillOp: 0.16, stroke: '#f59e0b', label: 'Coupure prévue',    dot: 'bg-amber-500',  text: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' }
    ,restored: { fill: '#2563eb', fillOp: 0.14, stroke: '#60a5fa', label: 'Rétabli récemment', dot: 'bg-blue-500',   text: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200'   }
    ,ok:       { fill: '#16a34a', fillOp: 0.08, stroke: '#4ade80', label: 'Alimenté',           dot: 'bg-green-500',  text: 'text-green-700',  bg: 'bg-green-50 border-green-200' }
}

// ── Map bcc.status (ok/warn/crit) → display status ───────────────────────────
function bccToDisplayStatus(bcc)
{
    if (!bcc) return 'ok'
    if (bcc.status === 'crit') return 'active'
    if (bcc.status === 'warn') return 'scheduled'
    return 'ok'
}

// ── Zoom clamp ────────────────────────────────────────────────────────────────
const ZOOM_MIN = 0.85, ZOOM_MAX = 18, ZOOM_STEP = 1.35
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// ─────────────────────────────────────────────────────────────────────────────
// PosteAccordion — one post source with expandable feeders list
// ─────────────────────────────────────────────────────────────────────────────
function PosteAccordion({ poste, govName })
{
    const [open,    setOpen]    = useState(false)
    const [feeders, setFeeders] = useState([])
    const [loading, setLoading] = useState(false)
    const [error,   setError]   = useState(null)

    const load = useCallback(async () =>
    {
        if (feeders.length || loading) return
        setLoading(true)
        setError(null)
        try
        {
            const res = await api.get('/api/v1/citizen/departes', {
                params: { governorate: govName, poste_source: poste.name }
            })
            setFeeders(res.data ?? [])
        }
        catch
        {
            // Fall back to static posteSources feeders list (no backend data yet)
            setFeeders([])
            setError('Données indisponibles — connexion serveur requise')
        }
        finally { setLoading(false) }
    }, [govName, poste.name, feeders.length, loading])

    const toggle = () =>
    {
        setOpen(o => !o)
        if (!open) load()
    }

    return (
        <div className="border border-gray-200 rounded-lg overflow-hidden">

            {/* Header row */}
            <button
                type="button"
                onClick={toggle}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-white hover:bg-gray-50 transition-colors text-left"
            >
                <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-blue-600 text-[18px] shrink-0">electrical_services</span>
                    <div className="min-w-0">
                        <div className="font-semibold text-gray-800 text-sm truncate">{poste.name}</div>
                        <div className="text-gray-400 text-[11px]">Poste source · {poste.lat.toFixed(3)}°N {poste.lng.toFixed(3)}°E</div>
                    </div>
                </div>
                <span className={`material-symbols-outlined text-gray-400 text-[18px] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
                    expand_more
                </span>
            </button>

            {/* Feeder list */}
            {open && (
                <div className="border-t border-gray-100 bg-gray-50">
                    {loading && (
                        <div className="flex items-center gap-2 px-4 py-3 text-gray-500 text-sm">
                            <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                            Chargement des départs…
                        </div>
                    )}

                    {error && (
                        <div className="px-4 py-3 text-amber-700 text-xs bg-amber-50 border-t border-amber-100">
                            <span className="material-symbols-outlined text-[13px] align-middle mr-1">warning</span>
                            {error}
                        </div>
                    )}

                    {!loading && feeders.length === 0 && !error && (
                        <div className="px-4 py-3 text-gray-400 text-xs italic">
                            Aucun départ HTA configuré pour ce poste
                        </div>
                    )}

                    {!loading && feeders.length > 0 && (
                        <div className="divide-y divide-gray-100">
                            {feeders.map((f, i) => (
                                <div key={f.feeder_id ?? i} className="flex items-center justify-between px-4 py-2 hover:bg-gray-100 transition-colors">
                                    <div className="min-w-0">
                                        <div className="text-xs font-semibold text-gray-700 font-mono">{f.ref}</div>
                                        <div className="text-[11px] text-gray-500 truncate">{f.nom ?? f.zone}</div>
                                    </div>
                                    <span className="ml-2 shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping inline-block"/>
                                        DÉLESTÉ
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// GovSidePanel — right slide-in panel when a gouvernorat is selected
// ─────────────────────────────────────────────────────────────────────────────
function GovSidePanel({ govName, onClose })
{
    const bcc         = GOV_TO_BCC_MAP[govName] ?? null
    const dispStatus  = bccToDisplayStatus(bcc)
    const cfg         = STATUS_CFG[dispStatus]
    const displayName = GOV_NAMES[govName] ?? govName

    // The post sources for this governorate come from networkConfig
    // We show only posts that belong to the BCC covering this governorate.
    // If no BCC found we show nothing meaningful.
    const postesForGov = useMemo(() =>
    {
        if (!bcc) return []
        // All posteSources of the BCC (multi-gov BCC shares one set of posts)
        // We could filter to only those geographically in govName if we had that data.
        // For now, show them all — they are the posts managing this zone.
        return bcc.posteSources ?? []
    }, [bcc])

    const isActive = dispStatus === 'active' || dispStatus === 'scheduled'

    return (
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full shadow-xl shrink-0 overflow-hidden">

            {/* ── Header ── */}
            <div className={clsx('px-4 py-3 border-b flex flex-col gap-1', cfg.bg)}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} ${dispStatus === 'active' ? 'animate-ping' : ''} shrink-0`} />
                        <span className={`text-xs font-bold uppercase tracking-wide ${cfg.text}`}>{cfg.label}</span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/10 text-gray-500 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>
                <h2 className="font-bold text-gray-900 text-base leading-tight">Gouvernorat de {displayName}</h2>
                {bcc && (
                    <p className="text-xs text-gray-600">
                        Zone {bcc.name} · {bcc.city}
                    </p>
                )}
            </div>

            {/* ── Status banner ── */}
            {isActive && (
                <div className={clsx('mx-3 mt-3 px-3 py-2 rounded-lg border text-xs font-medium flex items-start gap-2', cfg.bg, cfg.text)}>
                    <span className="material-symbols-outlined text-[14px] shrink-0 mt-0.5">
                        {dispStatus === 'active' ? 'flash_off' : 'schedule'}
                    </span>
                    <span>
                        {dispStatus === 'active'
                            ? 'Ce gouvernorat est actuellement en délestage. Débranchez les appareils sensibles.'
                            : 'Une coupure est planifiée pour ce gouvernorat. Préparez-vous à l\'avance.'}
                    </span>
                </div>
            )}

            {!isActive && dispStatus === 'ok' && (
                <div className="mx-3 mt-3 px-3 py-2 rounded-lg border text-xs font-medium flex items-start gap-2 bg-green-50 border-green-200 text-green-700">
                    <span className="material-symbols-outlined text-[14px] shrink-0 mt-0.5">check_circle</span>
                    <span>Ce gouvernorat est actuellement alimenté normalement. Aucune coupure en cours.</span>
                </div>
            )}

            {/* ── Postes section ── */}
            <div className="flex-1 overflow-y-auto px-3 pt-3 pb-4 space-y-2">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        Postes sources en délestage
                    </span>
                    <span className="text-[11px] text-gray-400">{postesForGov.length} postes</span>
                </div>

                {postesForGov.length === 0 && (
                    <div className="text-center text-gray-400 text-sm py-6">
                        <span className="material-symbols-outlined text-[32px] block mb-2 opacity-40">hub</span>
                        Aucun poste source configuré pour ce gouvernorat
                    </div>
                )}

                {postesForGov.map(poste => (
                    <PosteAccordion key={poste.id} poste={poste} govName={govName} />
                ))}
            </div>

            {/* ── Footer note ── */}
            <div className="border-t border-gray-100 px-4 py-2 text-[10px] text-gray-400 flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">info</span>
                <span>Les départs P0 (hôpitaux, eau) ne sont jamais délestés.</span>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// CitizenSVGMap — the main SVG-based interactive Tunisia map
// ─────────────────────────────────────────────────────────────────────────────
function CitizenSVGMap({ zonesData, onSelectGov })
{
    const containerRef = useRef(null)
    const trRef        = useRef({ scale: 1, tx: 0, ty: 0 })
    const drag         = useRef({ on: false, sx: 0, sy: 0, stx: 0, sty: 0 })
    const [tr,       setTr]       = useState({ scale: 1, tx: 0, ty: 0 })
    const [tooltip,  setTooltip]  = useState(null)
    const [selected, setSelected] = useState(null)

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

    // ── Wheel zoom ────────────────────────────────────────────────────────────
    useEffect(() =>
    {
        const el = containerRef.current
        if (!el) return
        const h = (e) =>
        {
            e.preventDefault()
            const { scale, tx, ty } = trRef.current
            const s2   = clamp(scale * Math.exp(-e.deltaY * 0.0015 * 3), ZOOM_MIN, ZOOM_MAX)
            const rect = el.getBoundingClientRect()
            const mx   = ((e.clientX - rect.left) / rect.width) * VW
            const my   = ((e.clientY - rect.top) / rect.height) * VH
            apply(s2, mx - (mx - tx) * (s2 / scale), my - (my - ty) * (s2 / scale))
        }
        el.addEventListener('wheel', h, { passive: false })
        return () => el.removeEventListener('wheel', h)
    }, [apply])

    // ── Drag ──────────────────────────────────────────────────────────────────
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
        apply(trRef.current.scale, drag.current.stx + (e.clientX - drag.current.sx) * VW / rect.width, drag.current.sty + (e.clientY - drag.current.sy) * VH / rect.height)
    }, [apply])
    const onMouseUp = useCallback((e) =>
    {
        drag.current.on = false
        if (e.currentTarget) e.currentTarget.style.cursor = 'grab'
    }, [])

    // ── Tooltip ───────────────────────────────────────────────────────────────
    const showTip = useCallback((e, title, sub) =>
    {
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        setTooltip({ x: e.clientX - rect.left + 14, y: e.clientY - rect.top - 10, title, sub })
    }, [])
    const hideTip = useCallback(() => setTooltip(null), [])

    // ── Click ─────────────────────────────────────────────────────────────────
    const handleClick = useCallback((e, gd) =>
    {
        e.stopPropagation()
        setSelected(gd.name)
        onSelectGov(gd.name)
        hideTip()
    }, [onSelectGov, hideTip])

    // ── Gov render data ───────────────────────────────────────────────────────
    const govData = useMemo(() =>
        GOVERNORATES_GJ.features.map(f =>
        {
            const name      = f.properties.name
            const nameFr    = GOV_NAMES[name] ?? f.properties.name_fr ?? name
            const bcc       = GOV_TO_BCC_MAP[name]
            const dispSt    = bccToDisplayStatus(bcc)
            // Override with live zone data if available
            const liveStatus = zonesData[name]
            const finalSt   = liveStatus ?? dispSt
            const cfg       = STATUS_CFG[finalSt] ?? STATUS_CFG.ok
            const center    = centroid(f.geometry)
            return { name, nameFr, bcc, status: finalSt, cfg, path: geomToPath(f.geometry), center }
        })
    , [zonesData])

    const { scale, tx, ty } = tr
    const scaleBarKm = Math.max(10, Math.round(100 / scale / 1.1 / 10) * 10)
    const scaleBarPx = Math.min(scaleBarKm * 1.1 * scale, 160)

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full overflow-hidden select-none"
            style={{ cursor: 'grab', background: '#f0f4f8' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
        >
            <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
                <defs>
                    {/* Light grid pattern */}
                    <pattern id="cp-grid" patternUnits="userSpaceOnUse" width="20" height="20">
                        <path d="M20,0 L0,0 0,20" fill="none" stroke="#d1d9e6" strokeWidth="0.4"/>
                    </pattern>
                    <filter id="cp-sel-glow" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="4" result="b"/>
                        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                </defs>

                {/* Background */}
                <rect width={VW} height={VH} fill="#e8f0f8"/>
                <rect width={VW} height={VH} fill="url(#cp-grid)"/>

                <g transform={`translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${scale.toFixed(4)})`}>

                    {/* Tunisia land base */}
                    <path d={TUNISIA_PATH} fill="#f5f8fc" stroke="none"/>

                    {/* ── Governorate fills ── */}
                    {govData.map(gd =>
                    {
                        const isSelected = selected === gd.name
                        return (
                            <path
                                key={gd.name}
                                d={gd.path}
                                fill={gd.cfg.fill}
                                fillOpacity={isSelected ? gd.cfg.fillOp * 2.8 : gd.cfg.fillOp}
                                stroke={isSelected ? gd.cfg.stroke : '#8facc4'}
                                strokeWidth={(isSelected ? 2.5 : 0.6) / scale}
                                strokeLinejoin="round"
                                style={{ cursor: 'pointer', transition: 'fill-opacity 0.15s' }}
                                onClick={e => handleClick(e, gd)}
                                onMouseEnter={e => showTip(e, `Gouvernorat de ${gd.nameFr}`, gd.cfg.label)}
                                onMouseLeave={hideTip}
                            />
                        )
                    })}

                    {/* Tunisia outer border */}
                    <path d={TUNISIA_PATH} fill="none" stroke="#7a9cbf" strokeWidth={2 / scale} strokeLinejoin="round"/>

                    {/* ── Governorate name labels ── */}
                    {govData.map(gd =>
                    {
                        if (!gd.center) return null
                        const [cx, cy] = gd.center
                        const isSelected = selected === gd.name
                        return (
                            <g key={`lbl-${gd.name}`} style={{ pointerEvents: 'none' }}>
                                {/* Shadow for legibility */}
                                <text
                                    x={cx} y={cy}
                                    textAnchor="middle" dominantBaseline="middle"
                                    fontSize={11 / scale}
                                    fontFamily="IBM Plex Sans,sans-serif"
                                    fontWeight="700"
                                    fill="white"
                                    fillOpacity={0.7}
                                    stroke="white"
                                    strokeWidth={3 / scale}
                                    paintOrder="stroke"
                                >
                                    {gd.nameFr}
                                </text>
                                <text
                                    x={cx} y={cy}
                                    textAnchor="middle" dominantBaseline="middle"
                                    fontSize={11 / scale}
                                    fontFamily="IBM Plex Sans,sans-serif"
                                    fontWeight="700"
                                    fill={isSelected ? gd.cfg.stroke : '#2d5c8a'}
                                    fillOpacity={isSelected ? 1 : 0.9}
                                >
                                    {gd.nameFr}
                                </text>
                            </g>
                        )
                    })}

                    {/* ── Selection ring (drawn on top) ── */}
                    {selected && govData.filter(g => g.name === selected).map(gd => (
                        <path
                            key={`sel-${gd.name}`}
                            d={gd.path}
                            fill="none"
                            stroke={gd.cfg.stroke}
                            strokeWidth={3 / scale}
                            strokeLinejoin="round"
                            filter="url(#cp-sel-glow)"
                            style={{ pointerEvents: 'none' }}
                        />
                    ))}
                </g>
            </svg>

            {/* ── Legend ── */}
            <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg px-3 py-2 shadow-md text-xs space-y-1 pointer-events-none">
                <div className="font-semibold text-gray-600 uppercase tracking-wide text-[10px] mb-1.5">État du délestage</div>
                {Object.entries(STATUS_CFG).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${v.dot} ${k === 'active' ? 'animate-ping' : ''}`}/>
                        <span className="text-gray-700">{v.label}</span>
                    </div>
                ))}
            </div>

            {/* ── Scale bar ── */}
            <div className="absolute bottom-3 right-3 pointer-events-none flex flex-col items-end gap-0.5">
                <div className="flex items-end gap-0.5">
                    <div className="w-px h-2 bg-blue-400 opacity-60"/>
                    <div className="h-1 bg-blue-400 opacity-60 rounded-sm" style={{ width: scaleBarPx }}/>
                    <div className="w-px h-2 bg-blue-400 opacity-60"/>
                </div>
                <span className="text-[9px] text-gray-500">{scaleBarKm} km</span>
            </div>

            {/* ── Zoom controls ── */}
            <div className="absolute bottom-3 left-3 flex flex-col gap-1 z-10">
                <button
                    type="button"
                    onClick={() => { const { scale: s, tx: t, ty: u } = trRef.current; const s2 = clamp(s * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX); apply(s2, VW / 2 - (VW / 2 - t) * (s2 / s), VH / 2 - (VH / 2 - u) * (s2 / s)) }}
                    className="w-8 h-8 flex items-center justify-center rounded bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 shadow-sm font-bold text-base"
                >+</button>
                <button
                    type="button"
                    onClick={() => { const { scale: s, tx: t, ty: u } = trRef.current; const s2 = clamp(s / ZOOM_STEP, ZOOM_MIN, ZOOM_MAX); apply(s2, VW / 2 - (VW / 2 - t) * (s2 / s), VH / 2 - (VH / 2 - u) * (s2 / s)) }}
                    className="w-8 h-8 flex items-center justify-center rounded bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 shadow-sm font-bold text-base"
                >−</button>
                <button
                    type="button"
                    onClick={() => apply(1, 0, 0)}
                    className="w-8 h-8 flex items-center justify-center rounded bg-white border border-gray-200 hover:bg-gray-50 text-blue-600 shadow-sm text-sm"
                    title="Réinitialiser la vue"
                >
                    <span className="material-symbols-outlined text-[16px]">crop_free</span>
                </button>
            </div>

            {/* ── Click hint (shown at national zoom) ── */}
            {!selected && tr.scale < 2 && (
                <div className="absolute top-3 right-3 pointer-events-none bg-white/80 backdrop-blur-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-[11px] text-gray-500 flex items-center gap-1.5 shadow-sm">
                    <span className="material-symbols-outlined text-[14px]">touch_app</span>
                    Cliquez sur un gouvernorat
                </div>
            )}

            {/* ── Hover tooltip ── */}
            {tooltip && (
                <div
                    className="absolute pointer-events-none z-50 bg-white border border-gray-200 rounded-lg shadow-lg px-2.5 py-1.5"
                    style={{ left: tooltip.x, top: tooltip.y, maxWidth: 200 }}
                >
                    <div className="font-semibold text-gray-800 text-xs">{tooltip.title}</div>
                    {tooltip.sub && <div className="text-gray-500 text-[10px] mt-0.5">{tooltip.sub}</div>}
                </div>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Chatbot
// ─────────────────────────────────────────────────────────────────────────────
const BOT_REPLIES =
{
    default:   "Je ne comprends pas votre question. Essayez : « Mon quartier est-il concerné ? » ou « À quelle heure revient l'électricité à Béja ? »"
    ,beja:     "Zone Béja (BCC 3 — Nord-Ouest) : Coupure en cours depuis 14h05. Rétablissement estimé à 14h50. Durée maximale : 45 min."
    ,sousse:   "Zone Sousse (BCC 4) : Électricité rétablie depuis 12h55. Aucune coupure prévue dans l'immédiat."
    ,sfax:     "Zone Sfax (BCC 5) : Coupure programmée de 16h00 à 16h45 environ. Préparez-vous à l'avance."
    ,kairouan: "Zone Kairouan (BCC 4 — Centre) : Coupure en cours depuis 13h52. Rétablissement estimé à 14h37."
    ,hopital:  "Les hôpitaux, cliniques et infrastructures critiques sont classés P0 et ne sont jamais concernés par les coupures."
}

function getReply(msg)
{
    const m = msg.toLowerCase()
    if (m.includes('beja') || m.includes('béja') || m.includes('jendouba')) return BOT_REPLIES.beja
    if (m.includes('sousse') || m.includes('monastir'))                      return BOT_REPLIES.sousse
    if (m.includes('sfax') || m.includes('gabes') || m.includes('gabès'))   return BOT_REPLIES.sfax
    if (m.includes('kairouan') || m.includes('sidi bouzid'))                 return BOT_REPLIES.kairouan
    if (m.includes('hopital') || m.includes('hôpital') || m.includes('clinique')) return BOT_REPLIES.hopital
    return BOT_REPLIES.default
}

function Chatbot()
{
    const [open,  setOpen]  = useState(false)
    const [msgs,  setMsgs]  = useState(
        [{ role: 'bot', text: "Bonjour ! Je suis l'assistant STEG. Posez-moi une question sur les coupures dans votre zone." }]
    )
    const [input, setInput] = useState('')
    const bottomRef         = useRef(null)

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

    const send = () =>
    {
        if (!input.trim()) return
        const q = input.trim()
        setInput('')
        setMsgs(m => [...m, { role: 'user', text: q }])
        setTimeout(() => setMsgs(m => [...m, { role: 'bot', text: getReply(q) }]), 600)
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
            >
                <span className="material-symbols-outlined text-[22px]">{open ? 'close' : 'chat'}</span>
            </button>

            {open && (
                <div className="fixed bottom-24 right-6 z-50 w-80 bg-white border border-gray-200 rounded-xl shadow-2xl flex flex-col overflow-hidden">
                    <div className="bg-blue-600 px-4 py-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-white text-[18px]">support_agent</span>
                        <span className="text-white font-semibold text-sm">Assistant STEG</span>
                        <span className="ml-auto w-2 h-2 bg-green-400 rounded-full animate-pulse"/>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 max-h-72">
                        {msgs.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={clsx(
                                    'max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed'
                                    ,m.role === 'user'
                                        ? 'bg-blue-600 text-white rounded-br-sm'
                                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                                )}>
                                    {m.text}
                                </div>
                            </div>
                        ))}
                        <div ref={bottomRef}/>
                    </div>
                    <div className="flex gap-2 p-3 border-t border-gray-100">
                        <input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') send() }}
                            placeholder="Votre question…"
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                        <button
                            type="button"
                            onClick={send}
                            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center"
                        >
                            <span className="material-symbols-outlined text-[16px]">send</span>
                        </button>
                    </div>
                </div>
            )}
        </>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// CitizenPortal — main page
// ─────────────────────────────────────────────────────────────────────────────
export default function CitizenPortal()
{
    const [selectedGov, setSelectedGov] = useState(null)
    const [zonesData,   setZonesData]   = useState({})   // govName → display-status from API
    const [search,      setSearch]      = useState('')
    const [searchResult, setSearchResult] = useState(null)

    // ── Fetch live zone statuses from backend ─────────────────────────────────
    useEffect(() =>
    {
        api.get('/api/v1/citizen/zones')
            .then(res =>
            {
                const map = {}
                ;(res.data ?? []).forEach(zone =>
                {
                    // zone.governorate is a raw governorate name like "Béja"
                    // Map to display status
                    const st = zone.currentStatus
                    const ds = st === 'outage' ? 'active' : st === 'demand' ? 'scheduled' : 'ok'
                    // Try to find which GJ feature this governorate matches
                    // (zone.governorate is already the French name from the DB)
                    const feature = GOVERNORATES_GJ.features.find(f =>
                    {
                        const fr = GOV_NAMES[f.properties.name]
                        return fr === zone.governorate || f.properties.name === zone.governorate || f.properties.name_fr === zone.governorate
                    })
                    if (feature) map[feature.properties.name] = ds
                })
                setZonesData(map)
            })
            .catch(() => {/* fallback to networkConfig static statuses */})
    }, [])

    // ── Search ────────────────────────────────────────────────────────────────
    const handleSearch = () =>
    {
        const q = search.toLowerCase().trim()
        if (!q) return
        // Search across GJ feature names and French names
        const found = GOVERNORATES_GJ.features.find(f =>
        {
            const fr = (GOV_NAMES[f.properties.name] ?? '').toLowerCase()
            return fr.includes(q) || f.properties.name.toLowerCase().includes(q)
        })
        if (found)
        {
            setSearchResult({ name: found.properties.name, nameFr: GOV_NAMES[found.properties.name] ?? found.properties.name_fr })
            setSelectedGov(found.properties.name)
        }
        else
        {
            setSearchResult('notfound')
        }
    }

    // Count active/scheduled zones
    const allBccsFlat = DEFAULT_NETWORK.crcs.flatMap(c => c.bccs)
    const activeCount    = allBccsFlat.filter(b => b.status === 'crit').length
    const scheduledCount = allBccsFlat.filter(b => b.status === 'warn').length

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900">

            {/* ── Header ────────────────────────────────────────────────── */}
            <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M9 2L4 9H8L7 14L12 7H8L9 2Z" fill="white"/>
                            </svg>
                        </div>
                        <div>
                            <h1 className="font-semibold text-gray-900 text-sm">Suivi du Délestage en Temps Réel</h1>
                            <p className="text-gray-500 text-[11px]">STEG — Service public d'information</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {activeCount > 0 && (
                            <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold animate-pulse">
                                {activeCount} coupure{activeCount > 1 ? 's' : ''} active{activeCount > 1 ? 's' : ''}
                            </span>
                        )}
                        {scheduledCount > 0 && (
                            <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
                                {scheduledCount} programmée{scheduledCount > 1 ? 's' : ''}
                            </span>
                        )}
                        <a href="/login" className="text-xs text-blue-500 hover:underline hidden sm:inline">Accès opérateur</a>
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">

                {/* ── Search bar ────────────────────────────────────────── */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-3">
                    <h2 className="font-semibold text-gray-800">Vérifiez votre gouvernorat</h2>
                    <div className="flex gap-2">
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
                            placeholder="Entrez votre gouvernorat (ex : Béja, Sousse, Sfax…)"
                            className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                        <button
                            type="button"
                            onClick={handleSearch}
                            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                        >
                            Rechercher
                        </button>
                    </div>
                    {searchResult && searchResult !== 'notfound' && (() =>
                    {
                        const bcc  = GOV_TO_BCC_MAP[searchResult.name]
                        const disp = bccToDisplayStatus(bcc)
                        const cfg  = STATUS_CFG[disp]
                        return (
                            <div className={clsx('border rounded-xl p-4 flex items-start justify-between gap-3', cfg.bg)}>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`w-2 h-2 rounded-full ${cfg.dot} ${disp === 'active' ? 'animate-ping' : ''}`}/>
                                        <h3 className="font-semibold text-gray-900">Gouvernorat de {searchResult.nameFr}</h3>
                                    </div>
                                    <p className={clsx('text-sm font-semibold', cfg.text)}>{cfg.label}</p>
                                    {bcc && <p className="text-xs text-gray-500 mt-0.5">Zone {bcc.name} · {bcc.city}</p>}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedGov(searchResult.name)}
                                    className="shrink-0 px-3 py-1.5 rounded-lg border text-xs font-semibold bg-white hover:bg-gray-50 transition-colors text-gray-700 border-gray-200"
                                >
                                    Voir la carte
                                </button>
                            </div>
                        )
                    })()}
                    {searchResult === 'notfound' && (
                        <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-4 py-3">
                            Aucun gouvernorat trouvé pour « {search} ». Essayez Béja, Sousse, Kairouan, Sfax…
                        </p>
                    )}
                </div>

                {/* ── Map + Side panel ──────────────────────────────────── */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-blue-600 text-[18px]">map</span>
                            <h2 className="font-semibold text-gray-800">Carte du délestage par gouvernorat</h2>
                        </div>
                        {selectedGov && (
                            <button
                                type="button"
                                onClick={() => setSelectedGov(null)}
                                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                            >
                                <span className="material-symbols-outlined text-[14px]">close</span>
                                Fermer le panneau
                            </button>
                        )}
                    </div>

                    {/* Map row: map + optional side panel */}
                    <div className="flex" style={{ height: 520 }}>
                        <div className="flex-1 min-w-0">
                            <CitizenSVGMap
                                zonesData={zonesData}
                                onSelectGov={gn => setSelectedGov(gn)}
                            />
                        </div>

                        {/* Side panel — slide in when a gov is selected */}
                        {selectedGov && (
                            <GovSidePanel
                                govName={selectedGov}
                                onClose={() => setSelectedGov(null)}
                            />
                        )}
                    </div>
                </div>

                {/* ── Summary table ─────────────────────────────────────── */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100">
                        <h2 className="font-semibold text-gray-800">Récapitulatif des zones — Aujourd'hui</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wider">
                                    <th className="px-4 py-3 text-left font-medium">Zone BCC</th>
                                    <th className="px-4 py-3 text-left font-medium">Gouvernorats couverts</th>
                                    <th className="px-4 py-3 text-center font-medium">Statut</th>
                                    <th className="px-4 py-3 text-center font-medium">Consigne</th>
                                    <th className="px-4 py-3 text-center font-medium">Réalisé</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allBccsFlat.map(bcc =>
                                {
                                    const disp = bccToDisplayStatus(bcc)
                                    const cfg  = STATUS_CFG[disp]
                                    return (
                                        <tr
                                            key={bcc.id}
                                            className={clsx(
                                                'border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer'
                                                ,disp === 'active' && 'bg-red-50'
                                            )}
                                            onClick={() => setSelectedGov(bcc.governorates[0])}
                                        >
                                            <td className="px-4 py-3 font-medium text-gray-900 text-sm">{bcc.name}</td>
                                            <td className="px-4 py-3 text-gray-500 text-xs">
                                                {bcc.governorates.map(g => GOV_NAMES[g] ?? g).join(', ')}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={clsx(
                                                    'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold'
                                                    ,cfg.bg, cfg.text
                                                )}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${disp === 'active' ? 'animate-ping' : ''}`}/>
                                                    {cfg.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center text-gray-600 font-mono text-xs">
                                                {bcc.targetMW} MW
                                            </td>
                                            <td className="px-4 py-3 text-center font-mono text-xs">
                                                <span className={clsx(
                                                    'font-semibold'
                                                    ,bcc.actualMW < bcc.targetMW * 0.9 ? 'text-red-600'
                                                    : bcc.actualMW < bcc.targetMW ? 'text-amber-600'
                                                    : 'text-green-600'
                                                )}>
                                                    {bcc.actualMW.toFixed(1)} MW
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ── FAQ ───────────────────────────────────────────────── */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <h2 className="font-semibold text-gray-800 mb-3">Questions fréquentes</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600">
                        {[
                            ['Pourquoi 45 minutes ?',          'La durée maximale de 45 minutes par départ garantit une rotation équitable entre toutes les zones.']
                            ,['Les hôpitaux sont-ils concernés ?', "Non. Les hôpitaux, cliniques et infrastructures d'eau sont classés P0 et ne sont jamais délestés."]
                            ,['Puis-je être prévenu ?',         'Les notifications SMS/WhatsApp sont en cours de développement.']
                            ,['Urgences électriques ?',        'Appelez le numéro vert STEG : 80 100 444 (24h/24).']
                        ].map(([q, a]) => (
                            <div key={q} className="bg-gray-50 rounded-lg p-3">
                                <p className="font-semibold text-gray-700 mb-1">{q}</p>
                                <p className="text-gray-500 text-xs leading-relaxed">{a}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Footer ────────────────────────────────────────────── */}
                <div className="text-center text-xs text-gray-400 pb-4">
                    Plateforme Nationale de Gestion du Délestage — STEG 2026 ·
                    <a href="/login" className="ml-1 text-blue-500 hover:underline">Accès opérateur</a>
                </div>
            </div>

            <Chatbot/>
        </div>
    )
}
