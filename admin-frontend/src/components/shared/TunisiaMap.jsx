import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useNetworkStore } from '../../stores/networkStore'
import { TUNISIA_OUTLINE, P0_SITES } from '../../data/mockData'
import GOVERNORATES_GJ from '../../data/governorates.json'
import POWER_LINES_GJ  from '../../data/power-lines.json'

// ── Projection ────────────────────────────────────────────────────────────────
const VW = 560, VH = 1000, PAD = 28
const LAT_MIN = 29.9, LAT_MAX = 37.65, LNG_MIN = 7.45, LNG_MAX = 11.65
const TO_RAD    = Math.PI / 180
const mercY_MIN = Math.log(Math.tan(Math.PI / 4 + LAT_MIN * TO_RAD / 2))
const mercY_MAX = Math.log(Math.tan(Math.PI / 4 + LAT_MAX * TO_RAD / 2))

export function project(lat, lng)
{
    const x  = PAD + ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * (VW - PAD * 2)
    const my = Math.log(Math.tan(Math.PI / 4 + lat * TO_RAD / 2))
    const y  = PAD + ((mercY_MAX - my) / (mercY_MAX - mercY_MIN)) * (VH - PAD * 2)
    return [x, y]
}

export function unproject(sx, sy)
{
    const lng = LNG_MIN + ((sx - PAD) / (VW - PAD * 2)) * (LNG_MAX - LNG_MIN)
    const my  = mercY_MAX - ((sy - PAD) / (VH - PAD * 2)) * (mercY_MAX - mercY_MIN)
    const lat = (2 * Math.atan(Math.exp(my)) - Math.PI / 2) / TO_RAD
    return [lat, lng]
}

export function geomToPath(geometry)
{
    if (!geometry) return ''
    const ring = (r) =>
    {
        const pts = r.map(([lo, la]) => { const [x,y] = project(la,lo); return `${x.toFixed(1)},${y.toFixed(1)}` })
        return `M${pts.join(' L')} Z`
    }
    if (geometry.type === 'Polygon')      return geometry.coordinates.map(ring).join(' ')
    if (geometry.type === 'MultiPolygon') return geometry.coordinates.flatMap(p => p.map(ring)).join(' ')
    return ''
}

export function lineToPoints(coords)
{
    if (!coords?.length) return ''
    return coords.map(([lo, la]) => { const [x,y] = project(la,lo); return `${x.toFixed(1)},${y.toFixed(1)}` }).join(' ')
}

export function centroid(geometry)
{
    let c = []
    if (geometry?.type === 'Polygon')      c = geometry.coordinates[0]
    if (geometry?.type === 'MultiPolygon') c = geometry.coordinates[0]?.[0] ?? []
    if (!c.length) return null
    const n = c.length
    return project(c.reduce((s,p) => s+p[1],0)/n, c.reduce((s,p) => s+p[0],0)/n)
}

// Convert an SVG logical point to a percentage position within the SVG viewport
// (used to position DOM overlay elements)
function svgToPct(svgX, svgY, scale, tx, ty)
{
    const screenX = svgX * scale + tx
    const screenY = svgY * scale + ty
    return { left: (screenX / VW) * 100, top: (screenY / VH) * 100 }
}

// ── Pre-computed Tunisia path ─────────────────────────────────────────────────
const TUNISIA_PATH = (() =>
{
    const pts = TUNISIA_OUTLINE.map(([la,lo]) => { const [x,y]=project(la,lo); return `${x.toFixed(1)},${y.toFixed(1)}` })
    return `M${pts.join(' L')} Z`
})()

// ── Build the CRC Nord/Sud geographic boundary ────────────────────────────────
// This traces the actual shared edges between Nord and Sud governorates.
// We collect all ring edges from Sud govs, then keep only those edges
// that are also present (reversed) in Nord govs — those are the shared borders.
function buildCrcBoundary(nordGovNames, sudGovNames)
{
    const nordFeatures = GOVERNORATES_GJ.features.filter(f => nordGovNames.includes(f.properties.name))
    const sudFeatures  = GOVERNORATES_GJ.features.filter(f => sudGovNames.includes(f.properties.name))

    // Collect all edges from a set of features as "lo1,la1→lo2,la2" strings
    const collectEdges = (features) =>
    {
        const edges = new Set()
        features.forEach(f =>
        {
            const rings = f.geometry.type === 'Polygon'
                ? f.geometry.coordinates
                : f.geometry.coordinates.flat(1)
            rings.forEach(ring =>
            {
                for (let i = 0; i < ring.length - 1; i++)
                {
                    const [lo1,la1] = ring[i]
                    const [lo2,la2] = ring[i+1]
                    // Round to 4dp to handle floating point mismatches
                    const key = `${lo1.toFixed(4)},${la1.toFixed(4)}→${lo2.toFixed(4)},${la2.toFixed(4)}`
                    edges.add(key)
                }
            })
        })
        return edges
    }

    const nordEdges = collectEdges(nordFeatures)
    const sudEdges  = collectEdges(sudFeatures)

    // A shared boundary edge appears in Sud going one direction and Nord going the opposite
    const boundarySegments = []
    sudEdges.forEach(edge =>
    {
        const [from, to] = edge.split('→')
        const reversed   = `${to}→${from}`
        if (nordEdges.has(reversed))
        {
            // This edge is a shared border — project both endpoints
            const [lo1,la1] = from.split(',').map(Number)
            const [lo2,la2] = to.split(',').map(Number)
            const [x1,y1]   = project(la1, lo1)
            const [x2,y2]   = project(la2, lo2)
            boundarySegments.push(`M${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}`)
        }
    })

    return boundarySegments.join(' ')
}

// ── Zoom engine ───────────────────────────────────────────────────────────────
const ZOOM_MIN = 0.85, ZOOM_MAX = 18, ZOOM_STEP = 1.4
function clamp(v,lo,hi){ return Math.max(lo,Math.min(hi,v)) }

// ── LOD thresholds ────────────────────────────────────────────────────────────
// CRC labels  : scale 0.8 – 1.3  (national overview)
// BCC labels  : scale ≥ 1.4      (regional zoom)
// BCC outlines: scale ≥ 1.4
// Substations : scale ≥ 5
const LOD_CRC_LABEL_MIN = 0.8
const LOD_CRC_LABEL_MAX = 1.3
const LOD_BCC           = 1.4   // BCC outlines + BCC labels appear from here
const LOD_PS            = 5     // poste source markers

// ── Voltage config ────────────────────────────────────────────────────────────
// Lines are intentionally thin and low-opacity so they don't compete with
// the zone/border hierarchy.  225kV stays the thickest but without glow.
const VCFG =
{
    225000: { stroke:'#3b7bbf', w:1.5, glow:false }   // muted blue
    ,150000: { stroke:'#c47c1a', w:1.0, glow:false }  // muted amber
    ,90000:  { stroke:'#2d7a4a', w:0.7, glow:false }  // muted green
}

// ── Status colours ────────────────────────────────────────────────────────────
const S_STROKE = { ok:'#4ade80', warn:'#ffb95f', crit:'#ff4444' }
const S_FILL   = { ok:0.06,     warn:0.10,      crit:0.18      }

// ── Bounds helpers ────────────────────────────────────────────────────────────
function boundsForGovs(features)
{
    let minLng=Infinity, maxLng=-Infinity, minLat=Infinity, maxLat=-Infinity
    features.forEach(f =>
    {
        const flat = f.geometry.type==='MultiPolygon'
            ? f.geometry.coordinates.flat(2)
            : f.geometry.coordinates.flat(1)
        flat.forEach(([lo,la]) =>
        {
            if (lo<minLng) minLng=lo; if (lo>maxLng) maxLng=lo
            if (la<minLat) minLat=la; if (la>maxLat) maxLat=la
        })
    })
    return { minLng, maxLng, minLat, maxLat }
}

function fitBounds(bounds)
{
    const { minLng, maxLng, minLat, maxLat } = bounds
    const [x1,y2] = project(minLat, minLng)
    const [x2,y1] = project(maxLat, maxLng)
    const scale   = clamp(Math.min((VW*0.82)/(x2-x1), (VH*0.82)/(y2-y1)), ZOOM_MIN, ZOOM_MAX)
    const cx = (x1+x2)/2, cy = (y1+y2)/2
    return { scale, tx: VW/2 - cx*scale, ty: VH/2 - cy*scale }
}

// ── BCC label overlay (DOM, not SVG) ─────────────────────────────────────────
// Positioned using % coordinates derived from the projected BCC centroid
function BccLabel({ bcc, pct, selected, onClick })
{
    const gap    = ((bcc.actualMW ?? 0) - (bcc.targetMW ?? 0))
    const gapStr = `${gap >= 0 ? '+' : ''}${gap.toFixed(1)} MW`
    const pct2   = bcc.targetMW ? Math.round((bcc.actualMW ?? 0) / bcc.targetMW * 100) : 100
    const status = bcc.status ?? 'ok'
    const shortName = bcc.name.replace(/^BCC \d+ — /, '').replace(/^BCC \d+ - /, '')

    if (status === 'crit')
    {
        return (
            <div
                className="absolute flex flex-col items-center z-20 -translate-x-1/2 -translate-y-full"
                style={{ left:`${pct.left}%`, top:`${pct.top}%` }}
            >
                <div
                    className={`relative bg-error-container text-on-error-container px-space-md py-space-xs rounded shadow-xl ring-2 ring-error cursor-pointer select-none animate-bounce`}
                    onClick={onClick}
                >
                    <div className="flex items-center gap-space-xs">
                        <span className="w-2.5 h-2.5 rounded-full bg-error animate-ping shrink-0" />
                        <span className="font-label-caps text-label-caps text-on-error-container font-bold uppercase tracking-wide whitespace-nowrap">
                            {bcc.name.split('—')[0].trim()} — {shortName}
                        </span>
                    </div>
                    <div className="font-label-telemetry-sm text-label-telemetry-sm text-on-error-container font-bold mt-0.5 flex items-center gap-space-xs">
                        <span>{(bcc.actualMW??0).toFixed(1)} MW / {bcc.targetMW??0} MW</span>
                        <span className="bg-error text-on-error px-1 py-0.5 rounded text-[10px] whitespace-nowrap">
                            DÉFICIT {gapStr}
                        </span>
                    </div>
                    {/* Arrow pointer */}
                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-error-container rotate-45 ring-1 ring-error" />
                </div>
            </div>
        )
    }

    if (status === 'warn')
    {
        return (
            <div
                className="absolute flex flex-col items-center z-10 -translate-x-1/2 -translate-y-full"
                style={{ left:`${pct.left}%`, top:`${pct.top}%` }}
            >
                <div
                    className="bg-surface-container-high/95 backdrop-blur px-space-sm py-space-xs rounded shadow-sm hover:scale-105 transition-transform cursor-pointer select-none"
                    onClick={onClick}
                >
                    <div className="flex items-center gap-space-xs">
                        <span className="w-2 h-2 rounded-full bg-tertiary shrink-0" />
                        <span className="font-label-caps text-label-caps text-on-surface font-semibold whitespace-nowrap">
                            {bcc.name.split('—')[0].trim()} — {shortName}
                        </span>
                    </div>
                    <div className="font-label-telemetry-sm text-label-telemetry-sm text-tertiary mt-0.5">
                        {(bcc.actualMW??0).toFixed(1)} MW / {bcc.targetMW??0} MW ({gapStr})
                    </div>
                </div>
            </div>
        )
    }

    // ok
    return (
        <div
            className="absolute flex flex-col items-center z-10 -translate-x-1/2 -translate-y-full"
            style={{ left:`${pct.left}%`, top:`${pct.top}%` }}
        >
            <div
                className="bg-surface-container-high/95 backdrop-blur px-space-sm py-space-xs rounded shadow-sm hover:scale-105 transition-transform cursor-pointer select-none"
                onClick={onClick}
            >
                <div className="flex items-center gap-space-xs">
                    <span className="w-2 h-2 rounded-full bg-secondary shrink-0" />
                    <span className="font-label-caps text-label-caps text-on-surface font-semibold whitespace-nowrap">
                        {bcc.name.split('—')[0].trim()} — {shortName}
                    </span>
                </div>
                <div className="font-label-telemetry-sm text-label-telemetry-sm text-secondary mt-0.5">
                    {(bcc.actualMW??0).toFixed(1)} MW / {bcc.targetMW??0} MW ({pct2}%)
                </div>
            </div>
        </div>
    )
}

// ── Inspection aside panel ────────────────────────────────────────────────────
function InspectionAside({ bcc, crc, onClose, onAiOpen })
{
    if (!bcc && !crc)
    {
        return (
            <aside className="w-96 bg-surface-container h-full overflow-y-auto z-30 flex flex-col shadow-2xl shrink-0">
                <div className="bg-surface-container-high px-space-md py-space-md shadow-sm">
                    <div className="flex items-center gap-space-xs font-label-caps text-label-caps text-on-surface-variant">
                        <span className="material-symbols-outlined text-[16px] text-secondary">explore</span>
                        <span>INSPECTION TOPOLOGIQUE SIG</span>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">
                        Cliquez sur une zone BCC ou CRC pour afficher les détails.
                    </p>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center gap-space-md text-on-surface-variant p-space-lg text-center">
                    <span className="material-symbols-outlined text-[40px] opacity-20">touch_app</span>
                    <span className="font-body-sm text-[11px]">Zoomez et cliquez sur une zone pour afficher les détails d'inspection.</span>
                    <button
                        onClick={onAiOpen}
                        className="flex items-center gap-space-xs px-space-md py-space-sm rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-body-sm text-body-sm transition-colors"
                        type="button"
                    >
                        <span className="material-symbols-outlined text-[15px] text-tertiary">smart_toy</span>
                        <span>Analyse IA du réseau</span>
                    </button>
                </div>
                <div className="bg-surface-container-lowest px-space-md py-space-xs flex items-center justify-between font-label-telemetry-sm text-[10px] text-on-surface-variant shrink-0">
                    <span>DERNIÈRE SYNCHRO SCADA : 14:32:16</span>
                    <span>LATENCE SIG : 12 ms</span>
                </div>
            </aside>
        )
    }

    // CRC summary panel
    if (crc && !bcc)
    {
        const total  = crc.bccs?.reduce((s,b) => s+(b.targetMW??0), 0) ?? 0
        const actual = crc.bccs?.reduce((s,b) => s+(b.actualMW??0), 0) ?? 0
        const gap    = actual - total
        return (
            <aside className="w-96 bg-surface-container h-full overflow-y-auto z-30 flex flex-col shadow-2xl shrink-0">
                <div className="bg-surface-container-high px-space-md py-space-md shadow-sm">
                    <div className="flex items-center justify-between mb-space-xs">
                        <div className="flex items-center gap-space-xs font-label-caps text-label-caps text-on-surface-variant">
                            <span className="material-symbols-outlined text-[16px] text-secondary">explore</span>
                            <span>INSPECTION TOPOLOGIQUE SIG</span>
                        </div>
                    </div>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">{crc.name}</h2>
                    <div className="font-label-telemetry-sm text-label-telemetry-sm text-on-surface-variant mt-0.5">
                        {crc.bccs?.length ?? 0} BCCs rattachés · {actual.toFixed(1)}/{total} MW
                    </div>
                </div>
                <div className="p-space-md space-y-space-sm flex-1">
                    {crc.bccs?.map(b =>
                    {
                        const g = ((b.actualMW??0)-(b.targetMW??0)).toFixed(1)
                        const color = b.status==='crit' ? 'text-error' : b.status==='warn' ? 'text-tertiary' : 'text-[#4ade80]'
                        return (
                            <div key={b.id} className="bg-surface-container-lowest p-space-sm rounded flex items-center justify-between">
                                <div className="flex items-center gap-space-xs">
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${b.status==='crit'?'bg-error animate-pulse':b.status==='warn'?'bg-tertiary':'bg-[#4ade80]'}`} />
                                    <span className="font-body-sm text-[11px] text-on-surface">{b.name}</span>
                                </div>
                                <span className={`font-label-telemetry-sm text-[10px] font-bold ${color}`}>
                                    {(b.actualMW??0).toFixed(1)}/{b.targetMW??0} MW
                                </span>
                            </div>
                        )
                    })}
                </div>
                <div className="bg-surface-container-lowest px-space-md py-space-xs flex items-center justify-between font-label-telemetry-sm text-[10px] text-on-surface-variant shrink-0">
                    <span>DERNIÈRE SYNCHRO SCADA : 14:32:16</span>
                    <span>LATENCE SIG : 12 ms</span>
                </div>
            </aside>
        )
    }

    // BCC detail panel
    const gap    = ((bcc.actualMW??0) - (bcc.targetMW??0))
    const gapStr = `${gap >= 0 ? '+' : ''}${gap.toFixed(1)} MW`
    const pct    = bcc.targetMW ? Math.round((bcc.actualMW??0) / bcc.targetMW * 100) : 100
    const status = bcc.status ?? 'ok'

    const statusBadge =
        status === 'crit' ? { cls: 'bg-error-container text-on-error-container animate-pulse', label: 'ALERTE DÉFICIT' }
        : status === 'warn' ? { cls: 'bg-tertiary-container text-tertiary', label: 'ÉCART MODÉRÉ' }
        : { cls: 'bg-surface-container-highest text-secondary', label: 'NOMINAL' }

    const gapColor = status === 'crit' ? 'text-error' : status === 'warn' ? 'text-tertiary' : 'text-[#4ade80]'

    // Mock feeders per BCC — in a real system these come from SCADA
    const mockFeeders = [
        { ref:`F08 - ${(bcc.governorates?.[0]??'Zone')} Médina`,    priority:'P1', mw:8.5,  elapsed:32, state:'cut'       }
        ,{ ref:`F12 - ${(bcc.governorates?.[1]??'Zone')} Industriel`, priority:'P2', mw:12.0, elapsed:24, state:'cut'       }
        ,{ ref:`F04 - ${(bcc.governorates?.[0]??'Zone')} Nord`,       priority:'P2', mw:13.0, elapsed:18, state:'cut'       }
        ,{ ref:`F19 - ${(bcc.governorates?.[1]??'Zone')} Agro`,       priority:'P3', mw:7.5,  elapsed:null, state:'proposed' }
        ,{ ref:`F02 - CHU ${(bcc.city??'Local')}`,                     priority:'P0', mw:6.2,  elapsed:null, state:'protected' }
    ]

    return (
        <aside className="w-96 bg-surface-container h-full overflow-y-auto z-30 flex flex-col shadow-2xl shrink-0">

            {/* Header */}
            <div className="bg-surface-container-high px-space-md py-space-md shadow-sm shrink-0">
                <div className="flex items-center justify-between mb-space-xs">
                    <div className="flex items-center gap-space-xs font-label-caps text-label-caps text-on-surface-variant">
                        <span className="material-symbols-outlined text-[16px] text-secondary">explore</span>
                        <span>INSPECTION TOPOLOGIQUE SIG</span>
                    </div>
                    <span className={`px-space-sm py-space-xs rounded font-label-caps text-[10px] font-bold tracking-wider ${statusBadge.cls}`}>
                        {statusBadge.label}
                    </span>
                </div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">{bcc.name}</h2>
                <div className="font-label-telemetry-sm text-label-telemetry-sm text-on-surface-variant mt-0.5">
                    Gouvernorats : {(bcc.governorates ?? []).join(' & ')} • Rattaché au {crc?.name ?? '—'}
                </div>
            </div>

            <div className="p-space-md space-y-space-md flex-1">

                {/* Telemetry card */}
                <div className="bg-surface-container-lowest p-space-md rounded space-y-space-sm">
                    <div className="flex items-center justify-between">
                        <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">ÉTAT D'ÉQUILIBRE ACTUEL</span>
                        <span className={`font-label-telemetry-sm font-bold ${gapColor}`}>ÉCART {gapStr}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-space-sm pt-space-xs">
                        <div className="bg-surface-container-high p-space-sm rounded">
                            <span className="font-label-caps text-label-caps text-on-surface-variant block">CIBLE TRANSMIS</span>
                            <span className="font-label-telemetry-lg text-headline-sm text-on-surface">{(bcc.targetMW??0).toFixed(1)}</span>
                            <span className="font-label-telemetry-sm text-on-surface-variant ml-1">MW</span>
                        </div>
                        <div className="bg-surface-container-high p-space-sm rounded">
                            <span className="font-label-caps text-label-caps text-on-surface-variant block">COUPURE OBSERVÉE</span>
                            <span className={`font-label-telemetry-lg text-headline-sm ${gapColor}`}>{(bcc.actualMW??0).toFixed(1)}</span>
                            <span className="font-label-telemetry-sm text-on-surface-variant ml-1">MW</span>
                        </div>
                    </div>
                    <div className="pt-space-xs">
                        <div className="flex justify-between font-label-telemetry-sm text-[11px] text-on-surface-variant mb-1">
                            <span>Exécution consigne : {pct}%</span>
                            {pct < 100 && <span className={`font-semibold ${gapColor}`}>MANQUE: {Math.abs(gap).toFixed(1)} MW</span>}
                        </div>
                        <div className="w-full bg-surface-container-high h-2 rounded overflow-hidden flex">
                            <div className="bg-secondary h-full" style={{ width:`${Math.min(pct,100)}%` }} />
                            {pct < 100 && <div className="bg-error h-full animate-pulse" style={{ width:`${100-Math.min(pct,100)}%` }} />}
                        </div>
                    </div>
                </div>

                {/* Operator contact */}
                <div className="bg-surface-container-low p-space-md rounded space-y-space-xs">
                    <div className="font-label-caps text-label-caps text-on-surface-variant uppercase">POSTE DE COMMANDE LOCAL</div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-space-sm">
                            <div className="w-7 h-7 rounded-full bg-surface-container-highest flex items-center justify-center text-secondary">
                                <span className="material-symbols-outlined text-[16px]">person</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="font-headline-sm text-body-md text-on-surface font-semibold">{bcc.operator ?? 'Opérateur BCC'}</span>
                                <span className="font-label-telemetry-sm text-[11px] text-on-surface-variant">Pupitre Conduite {bcc.name.split('—')[0].trim()}</span>
                            </div>
                        </div>
                        <button
                            className="p-space-sm bg-surface-container-high hover:bg-surface-bright text-secondary rounded flex items-center justify-center transition-colors"
                            title={`Appeler ${bcc.name}`}
                            type="button"
                        >
                            <span className="material-symbols-outlined text-[18px]">call</span>
                        </button>
                    </div>
                    <div className="pt-space-xs flex items-center justify-between font-label-telemetry-sm text-[11px] text-on-surface-variant">
                        <span>VILLE : {bcc.city ?? '—'}</span>
                        <span className="text-secondary">RADIO UHF : CH-0{bcc.id?.replace('bcc-','')}</span>
                    </div>
                </div>

                {/* Feeders */}
                <div className="space-y-space-xs">
                    <div className="flex items-center justify-between">
                        <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">DÉPARTS HTA 30 kV</span>
                        <span className="font-label-telemetry-sm text-label-telemetry-sm text-secondary">{mockFeeders.length} DÉPARTS</span>
                    </div>
                    <div className="space-y-1 font-body-sm">
                        {mockFeeders.map((f,i) =>
                        {
                            if (f.state === 'cut') return (
                                <div key={i} className="bg-surface-container-low p-space-sm rounded flex items-center justify-between hover:bg-surface-container-high transition-colors">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-space-xs">
                                            <span className="font-label-telemetry-sm font-bold text-on-surface">{f.ref}</span>
                                            <span className="font-label-caps text-[9px] px-1 bg-surface-container-highest text-on-surface-variant rounded">{f.priority}</span>
                                        </div>
                                        <span className="font-label-telemetry-sm text-[11px] text-on-surface-variant">{f.mw} MW • Déconnecté depuis {f.elapsed}m</span>
                                    </div>
                                    <span className="px-space-sm py-space-xs rounded bg-tertiary-container text-tertiary font-label-caps text-[10px] font-semibold shrink-0">DÉLESTÉ</span>
                                </div>
                            )
                            if (f.state === 'proposed') return (
                                <div key={i} className="bg-secondary-container/20 p-space-sm rounded flex items-center justify-between ring-1 ring-secondary/30">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-space-xs">
                                            <span className="font-label-telemetry-sm font-bold text-on-surface">{f.ref}</span>
                                            <span className="font-label-caps text-[9px] px-1 bg-secondary-container text-on-secondary-container rounded">P3 PROPOSÉ</span>
                                        </div>
                                        <span className="font-label-telemetry-sm text-[11px] text-secondary">{f.mw} MW • En service (Action requise)</span>
                                    </div>
                                    <button className="px-space-sm py-space-xs rounded bg-secondary text-on-secondary font-label-caps text-[10px] font-bold hover:bg-secondary-fixed transition-colors shrink-0" type="button">
                                        COUPER 30kV
                                    </button>
                                </div>
                            )
                            // protected P0
                            return (
                                <div key={i} className="bg-surface-container-low p-space-sm rounded flex items-center justify-between opacity-80">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-space-xs">
                                            <span className="font-label-telemetry-sm font-bold text-on-surface">{f.ref}</span>
                                            <span className="font-label-caps text-[9px] px-1 bg-error-container text-error rounded font-bold">P0 CRITIQUE</span>
                                        </div>
                                        <span className="font-label-telemetry-sm text-[11px] text-on-surface-variant">{f.mw} MW • Ligne sécurisée prioritaire</span>
                                    </div>
                                    <span className="flex items-center gap-1 font-label-caps text-[10px] text-error font-bold shrink-0">
                                        <span className="material-symbols-outlined text-[13px]">lock</span>
                                        PROTÉGÉ
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Actions */}
                <div className="pt-space-sm space-y-space-xs">
                    {status !== 'ok' && (
                        <button className="w-full flex items-center justify-center gap-space-sm px-space-md py-space-sm rounded bg-secondary hover:bg-secondary-fixed text-on-secondary font-headline-sm text-body-md font-semibold transition-colors shadow-sm" type="button">
                            <span className="material-symbols-outlined text-[18px]">send</span>
                            <span>Émettre Consigne Corrective ({gapStr})</span>
                        </button>
                    )}
                    <div className="grid grid-cols-2 gap-space-xs">
                        <button className="flex items-center justify-center gap-space-xs px-space-sm py-space-sm rounded bg-surface-container-high hover:bg-surface-bright text-on-surface font-body-sm text-body-sm transition-colors" type="button">
                            <span className="material-symbols-outlined text-[16px] text-secondary">headset_mic</span>
                            <span>Appeler {bcc.name.split('—')[0].trim()}</span>
                        </button>
                        <button onClick={onAiOpen} className="flex items-center justify-center gap-space-xs px-space-sm py-space-sm rounded bg-surface-container-high hover:bg-surface-bright text-on-surface font-body-sm text-body-sm transition-colors" type="button">
                            <span className="material-symbols-outlined text-[16px] text-tertiary">smart_toy</span>
                            <span>Recommandation IA</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="bg-surface-container-lowest px-space-md py-space-xs flex items-center justify-between font-label-telemetry-sm text-[10px] text-on-surface-variant shrink-0">
                <span>DERNIÈRE SYNCHRO SCADA : 14:32:16</span>
                <span>LATENCE SIG : 12 ms</span>
            </div>
        </aside>
    )
}

// ── Main TunisiaMap ───────────────────────────────────────────────────────────
export default function TunisiaMap({
    scope       = 'all'
    ,onReady
    ,onSelectBcc
    ,onSelectCrc
    ,showToolbar = false
    ,className   = ''
})
{
    const containerRef = useRef(null)
    const trRef        = useRef({ scale:1, tx:0, ty:0 })
    const drag         = useRef({ on:false, sx:0, sy:0, stx:0, sty:0 })
    const [tr,       setTr]       = useState({ scale:1, tx:0, ty:0 })
    const [tooltip,  setTooltip]  = useState(null)
    const [selected, setSelected] = useState(null)   // bcc.id
    const [aiOpen,   setAiOpen]   = useState(false)

    const { crcs, p0Sites, getGovToBcc, getGovToCrc } = useNetworkStore()

    const govToBcc = useMemo(() => getGovToBcc(), [crcs])
    const govToCrc = useMemo(() => getGovToCrc(), [crcs])
    const allBccs  = useMemo(() => crcs.flatMap(c => c.bccs), [crcs])

    const activeCrcId = scope === 'all' ? null : scope.type === 'crc' ? scope.id : null
    const activeBccId = scope === 'all' ? null : scope.type === 'bcc' ? scope.id : null

    // Governorate render data
    const govData = useMemo(() =>
        GOVERNORATES_GJ.features.map(f =>
        {
            const name   = f.properties.name
            const nameFr = f.properties.name_fr || name
            const bccId  = govToBcc[name]
            const crcId  = govToCrc[name]
            const bcc    = allBccs.find(b => b.id === bccId)
            const active = scope === 'all' || govToCrc[name] === activeCrcId || govToBcc[name] === activeBccId
            return { name, nameFr, bccId, crcId, bcc, active, path:geomToPath(f.geometry), center:centroid(f.geometry), status:bcc?.status??'ok', color:bcc?.color??'#4a6080' }
        })
    , [crcs, govToBcc, govToCrc, allBccs, scope, activeCrcId, activeBccId])

    // Power lines
    const powerLines = useMemo(() =>
        POWER_LINES_GJ.features.map(f => ({ id:f.properties.id, voltage:f.properties.voltage, name:f.properties.name, pts:lineToPoints(f.geometry.coordinates), cfg:VCFG[f.properties.voltage]??{stroke:'#4a6080',w:0.8,glow:false} }))
    , [])

    // CRC geographic boundary (real shared edges)
    const crcBoundaryPath = useMemo(() =>
    {
        const nordCrc = crcs.find(c => c.id === 'crc-nord')
        const sudCrc  = crcs.find(c => c.id === 'crc-sud')
        if (!nordCrc || !sudCrc) return ''
        const nordGovs = nordCrc.bccs.flatMap(b => b.governorates)
        const sudGovs  = sudCrc.bccs.flatMap(b => b.governorates)
        return buildCrcBoundary(nordGovs, sudGovs)
    }, [crcs])

    // BCC label positions — computed from centroid projected to SVG, then spread
    // to avoid overlapping labels (e.g. BCC1 Grand Tunis + BCC2 Nord are very close)
    const bccLabelPositions = useMemo(() =>
    {
        // 1. Compute raw centroids
        const positions = allBccs.map(bcc =>
        {
            const bccGovFeatures = GOVERNORATES_GJ.features.filter(f => bcc.governorates.includes(f.properties.name))
            if (!bccGovFeatures.length) return { bcc, svgPt: null }
            const centers = bccGovFeatures.map(f => centroid(f.geometry)).filter(Boolean)
            if (!centers.length) return { bcc, svgPt: null }
            const cx = centers.reduce((s,[x])=>s+x,0)/centers.length
            const cy = centers.reduce((s,[,y])=>s+y,0)/centers.length
            return { bcc, svgPt:[cx, cy] }
        })

        // 2. Iterative collision separation in SVG-space
        // Min distance in SVG units to avoid overlap (~label height ≈ 28px on a 560px-wide canvas)
        const MIN_DIST = 32
        const MAX_ITER = 20

        for (let iter = 0; iter < MAX_ITER; iter++)
        {
            let moved = false
            for (let i = 0; i < positions.length; i++)
            {
                if (!positions[i].svgPt) continue
                for (let j = i + 1; j < positions.length; j++)
                {
                    if (!positions[j].svgPt) continue
                    const dx = positions[j].svgPt[0] - positions[i].svgPt[0]
                    const dy = positions[j].svgPt[1] - positions[i].svgPt[1]
                    const dist = Math.sqrt(dx*dx + dy*dy)
                    if (dist < MIN_DIST && dist > 0)
                    {
                        // Push apart along Y axis primarily (labels stack vertically)
                        const push = (MIN_DIST - dist) / 2 + 2
                        // If nearly same X, push purely vertically; otherwise use full vector
                        const nx = dist > 4 ? dx / dist : 0
                        const ny = dist > 4 ? dy / dist : 1
                        positions[i].svgPt = [
                            positions[i].svgPt[0] - nx * push * 0.3
                            ,positions[i].svgPt[1] - ny * push
                        ]
                        positions[j].svgPt = [
                            positions[j].svgPt[0] + nx * push * 0.3
                            ,positions[j].svgPt[1] + ny * push
                        ]
                        moved = true
                    }
                }
            }
            if (!moved) break
        }

        return positions
    }, [crcs, allBccs])

    // CRC separator latitude (for label text positioning)
    const crcSeparatorLat = useMemo(() =>
    {
        const nordCrc  = crcs.find(c => c.id === 'crc-nord')
        if (!nordCrc) return 35.0
        const nordGovs = nordCrc.bccs.flatMap(b => b.governorates)
        const nordFeatures = GOVERNORATES_GJ.features.filter(f => nordGovs.includes(f.properties.name))
        let minLat = Infinity
        nordFeatures.forEach(f =>
        {
            const flat = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.flat(2) : f.geometry.coordinates.flat(1)
            flat.forEach(([,la]) => { if (la < minLat) minLat = la })
        })
        return minLat === Infinity ? 35.0 : minLat
    }, [crcs])

    // Auto-zoom on mount
    useEffect(() =>
    {
        if (scope === 'all') return
        const targetGovs = GOVERNORATES_GJ.features.filter(f =>
            activeCrcId ? govToCrc[f.properties.name] === activeCrcId
            : activeBccId ? govToBcc[f.properties.name] === activeBccId
            : false
        )
        if (!targetGovs.length) return
        const { scale, tx, ty } = fitBounds(boundsForGovs(targetGovs))
        apply(scale, tx, ty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scope])

    // Transform engine
    const apply = useCallback((scale, tx, ty) =>
    {
        const m = PAD * scale
        const t = { scale, tx:clamp(tx,-(VW*scale-VW+m),m), ty:clamp(ty,-(VH*scale-VH+m),m) }
        trRef.current = t
        setTr(t)
    }, [])

    // Expose controls
    useEffect(() =>
    {
        if (!onReady) return
        const zoom = (f) => { const {scale,tx,ty}=trRef.current; const s2=clamp(scale*f,ZOOM_MIN,ZOOM_MAX); apply(s2,VW/2-(VW/2-tx)*(s2/scale),VH/2-(VH/2-ty)*(s2/scale)) }
        onReady({
            zoomIn:   () => zoom(ZOOM_STEP)
            ,zoomOut:  () => zoom(1/ZOOM_STEP)
            ,reset:    () => apply(1,0,0)
            ,fitScope: () =>
            {
                if (scope==='all') { apply(1,0,0); return }
                const govs = GOVERNORATES_GJ.features.filter(f =>
                    activeCrcId ? govToCrc[f.properties.name]===activeCrcId
                    : activeBccId ? govToBcc[f.properties.name]===activeBccId : false
                )
                if (!govs.length) return
                const { scale:s2, tx:t2, ty:u2 } = fitBounds(boundsForGovs(govs))
                apply(s2,t2,u2)
            }
        })
    }, [onReady, apply, scope, activeCrcId, activeBccId, govToCrc, govToBcc])

    // Wheel zoom
    useEffect(() =>
    {
        const el = containerRef.current
        if (!el) return
        const h = (e) =>
        {
            e.preventDefault()
            const {scale,tx,ty} = trRef.current
            const s2   = clamp(scale*Math.exp(-e.deltaY*0.0015*3), ZOOM_MIN, ZOOM_MAX)
            const rect = el.getBoundingClientRect()
            const mx   = ((e.clientX-rect.left)/rect.width)*VW
            const my   = ((e.clientY-rect.top)/rect.height)*VH
            apply(s2, mx-(mx-tx)*(s2/scale), my-(my-ty)*(s2/scale))
        }
        el.addEventListener('wheel', h, { passive:false })
        return () => el.removeEventListener('wheel', h)
    }, [apply])

    // Mouse drag
    const onMouseDown = useCallback((e) =>
    {
        if (e.button !== 0) return
        drag.current = { on:true, sx:e.clientX, sy:e.clientY, stx:trRef.current.tx, sty:trRef.current.ty }
        e.currentTarget.style.cursor = 'grabbing'
    }, [])
    const onMouseMove = useCallback((e) =>
    {
        if (!drag.current.on) return
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        apply(trRef.current.scale, drag.current.stx+(e.clientX-drag.current.sx)*VW/rect.width, drag.current.sty+(e.clientY-drag.current.sy)*VH/rect.height)
    }, [apply])
    const onMouseUp = useCallback((e) =>
    {
        drag.current.on = false
        if (e.currentTarget) e.currentTarget.style.cursor = 'grab'
    }, [])

    // Tooltip
    const showTip = useCallback((e,title,sub='') =>
    {
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        setTooltip({ x:e.clientX-rect.left+14, y:e.clientY-rect.top-10, title, sub })
    }, [])
    const hideTip = useCallback(() => setTooltip(null), [])

    // Gov click
    const handleGovClick = useCallback((e, gd) =>
    {
        e.stopPropagation()
        if (!gd.active) return
        if (gd.bcc) { setSelected(gd.bcc.id); onSelectBcc?.(gd.bcc) }
        else { const crc = crcs.find(c => c.id === gd.crcId); if (crc) onSelectCrc?.(crc) }
    }, [crcs, onSelectBcc, onSelectCrc])

    // ── Render ────────────────────────────────────────────────────────────
    const { scale, tx, ty } = tr

    // LOD gates
    const showCrcLabels  = scale >= LOD_CRC_LABEL_MIN && scale <= LOD_CRC_LABEL_MAX
    const showBccLabels  = scale >= LOD_BCC || scope !== 'all'
    const showBccBorders = scale >= LOD_BCC || scope !== 'all'
    const showSubstations = scale >= LOD_PS

    // Power-line detail: only 225kV at national zoom, more as we zoom in
    const visibleLines = powerLines.filter(l =>
        scale < LOD_BCC      ? l.voltage === 225000
        : scale < LOD_PS     ? l.voltage >= 90000
        : true
    )

    const scaleBarKm = Math.max(10, Math.round(100/scale/1.1/10)*10)
    const scaleBarPx = Math.min(scaleBarKm*1.1*scale, 160)

    const allP0 = p0Sites.length ? p0Sites : P0_SITES.map(s => ({
        id:s.id, geometry:{type:'Point',coordinates:[s.lng,s.lat]}, properties:{name:s.name,type:s.type}
    }))

    // Selected BCC and its CRC for the aside panel
    const selectedBcc = allBccs.find(b => b.id === selected) ?? null
    const selectedCrc = selectedBcc ? crcs.find(c => c.id === selectedBcc.crcId) ?? null : null

    // LOD dot indicator (1/2/3 for the UI badge)
    const lodDot = scale < LOD_BCC ? 1 : scale < LOD_PS ? 2 : 3

    return (
        <div className={`relative w-full h-full flex overflow-hidden ${className}`}>

            {/* ── Map area ─────────────────────────────────────────── */}
            <div className="relative flex-1 h-full">
                <div
                    ref={containerRef}
                    className="relative w-full h-full overflow-hidden select-none"
                    style={{ cursor:'grab', background:'#020d1c' }}
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseUp}
                >
                    {/* ── SVG layer ─────────────────────────────────── */}
                    <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
                        <defs>
                            <pattern id="tm-dots" patternUnits="userSpaceOnUse" width="16" height="16">
                                <circle cx="8" cy="8" r="0.5" fill="#0e2540"/>
                            </pattern>
                            <filter id="tm-glow-line" x="-30%" y="-60%" width="160%" height="220%">
                                <feGaussianBlur stdDeviation="1.5" result="b"/>
                                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                            </filter>
                            <filter id="tm-glow-ps" x="-60%" y="-60%" width="220%" height="220%">
                                <feGaussianBlur stdDeviation="2" result="b"/>
                                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                            </filter>
                            <filter id="tm-glow-crit" x="-40%" y="-40%" width="180%" height="180%">
                                <feGaussianBlur stdDeviation="3" result="b"/>
                                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                            </filter>
                            <filter id="tm-glow-border" x="-10%" y="-10%" width="120%" height="120%">
                                <feGaussianBlur stdDeviation="2" result="b"/>
                                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                            </filter>
                        </defs>

                        <rect width={VW} height={VH} fill="#020d1c"/>
                        <rect width={VW} height={VH} fill="url(#tm-dots)"/>

                        <g transform={`translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${scale.toFixed(4)})`}>

                            {/* Tunisia land */}
                            <path d={TUNISIA_PATH} fill="#061828" stroke="none"/>

                            {/* ── Governorate fills ───────────────────
                                Very light fill + ultra-thin border so they provide
                                geographic context without competing with BCC or power lines */}
                            {govData.map(gd =>
                            {
                                const isSel  = selected === gd.bccId
                                const fill   = gd.active ? (S_STROKE[gd.status]??'#4a6080') : '#1a2d40'
                                const fillOp = gd.active
                                    ? (isSel ? (S_FILL[gd.status]??0.06)*2.5 : S_FILL[gd.status]??0.06)
                                    : 0.25
                                return (
                                    <path
                                        key={gd.name}
                                        d={gd.path}
                                        fill={fill} fillOpacity={fillOp}
                                        // Governorate borders: very thin, very dark — just enough to see
                                        stroke="#0d2a3e"
                                        strokeWidth={0.4/scale}
                                        strokeLinejoin="round"
                                        style={{ cursor:gd.active?'pointer':'default' }}
                                        onClick={e => handleGovClick(e,gd)}
                                        onMouseEnter={e => gd.active && showTip(e,
                                            gd.bcc ? gd.bcc.name : gd.nameFr,
                                            gd.bcc ? `${gd.nameFr} · ${gd.bcc.actualMW?.toFixed(1)??'—'}/${gd.bcc.targetMW??'—'} MW` : gd.crcId??''
                                        )}
                                        onMouseLeave={hideTip}
                                    />
                                )
                            })}

                            {/* Tunisia outer border */}
                            <path d={TUNISIA_PATH} fill="none" stroke="#0d2d50" strokeWidth={5/scale} strokeLinejoin="round" opacity={0.5}/>
                            <path d={TUNISIA_PATH} fill="none" stroke="#1a5080" strokeWidth={1.5/scale} strokeLinejoin="round"/>

                            {/* ── CRC geographic boundary ──────────────
                                Orange-amber so it's clearly distinct from:
                                - power lines (blue/amber/green, thin)
                                - BCC borders (BCC color, medium)
                                - gov borders (dark, ultra-thin) */}
                            {crcBoundaryPath && (
                                <g>
                                    {/* Soft glow halo */}
                                    <path d={crcBoundaryPath} fill="none"
                                        stroke="#ff9800" strokeWidth={10/scale} strokeOpacity={0.07}
                                        strokeLinecap="round"/>
                                    {/* Wide background stroke for visibility */}
                                    <path d={crcBoundaryPath} fill="none"
                                        stroke="#b35c00" strokeWidth={4/scale}
                                        strokeOpacity={0.35} strokeLinecap="round"/>
                                    {/* Primary dashed line — bright orange */}
                                    <path d={crcBoundaryPath} fill="none"
                                        stroke="#ff9800" strokeWidth={2/scale}
                                        strokeDasharray={`${10/scale} ${5/scale}`}
                                        strokeOpacity={0.9} strokeLinecap="round"/>
                                </g>
                            )}

                            {/* ── BCC boundary outlines ────────────────
                                Thicker than gov borders, BCC-colored, dashed.
                                Only shown when zoomed in enough (showBccBorders). */}
                            {showBccBorders && allBccs.map(bcc =>
                            {
                                const isActive   = scope==='all' || bcc.id===activeBccId || bcc.crcId===activeCrcId
                                const isSelected = selected === bcc.id
                                if (!isActive) return null
                                const bccColor = bcc.color ?? S_STROKE[bcc.status]
                                return GOVERNORATES_GJ.features
                                    .filter(f => bcc.governorates.includes(f.properties.name))
                                    .map(f => (
                                        <path
                                            key={`bb-${bcc.id}-${f.properties.name}`}
                                            d={geomToPath(f.geometry)}
                                            fill="none"
                                            stroke={bccColor}
                                            strokeWidth={(isSelected ? 3 : 2) / scale}
                                            strokeDasharray={isSelected ? 'none' : `${5/scale} ${3/scale}`}
                                            strokeLinejoin="round"
                                            strokeOpacity={isSelected ? 1 : 0.7}
                                            style={{ pointerEvents:'none' }}
                                        />
                                    ))
                            })}

                            {/* ── Governorate name labels ──────────────
                                Only show for active govs; dimmed ones get no label */}
                            {govData.map(gd =>
                            {
                                if (!gd.center) return null
                                if (!gd.active) return null   // never label dimmed govs
                                const [cx,cy] = gd.center
                                return (
                                    <text key={`gl-${gd.name}`}
                                        x={cx} y={cy}
                                        textAnchor="middle" dominantBaseline="middle"
                                        fontSize={13/scale}
                                        fontFamily="IBM Plex Sans,sans-serif" fontWeight="600"
                                        fill="#3d7aaa"
                                        fillOpacity={0.85}
                                        style={{ pointerEvents:'none' }}
                                    >
                                        {gd.nameFr}
                                    </text>
                                )
                            })}

                            {/* Graticule — only at very low zoom */}
                            {scale < 1.4 && [31,32,33,34,35,36,37].map(lat =>{ const [,y]=project(lat,LNG_MIN); return <text key={`gl${lat}`} x={PAD-4} y={y} textAnchor="end" dominantBaseline="middle" fontSize={7/scale} fontFamily="JetBrains Mono,monospace" fill="#1a3a5a">{lat}°N</text> })}
                            {scale < 1.4 && [8,9,10,11].map(lng =>{ const [x]=project(LAT_MIN,lng); return <text key={`gl${lng}`} x={x} y={VH-PAD+12} textAnchor="middle" fontSize={7/scale} fontFamily="JetBrains Mono,monospace" fill="#1a3a5a">{lng}°E</text> })}
                        </g>
                    </svg>

                    {/* ── DOM overlay: CRC label cards (×0.8 – ×1.3) ── */}
                    {showCrcLabels && crcs.map(crc =>
                    {
                        const crcGovFeatures = GOVERNORATES_GJ.features.filter(f =>
                            crc.bccs.some(b => b.governorates.includes(f.properties.name))
                        )
                        if (!crcGovFeatures.length) return null
                        const centers = crcGovFeatures.map(f => centroid(f.geometry)).filter(Boolean)
                        if (!centers.length) return null
                        const cx      = centers.reduce((s,[x])=>s+x,0)/centers.length
                        const cy      = centers.reduce((s,[,y])=>s+y,0)/centers.length
                        const pct     = svgToPct(cx, cy, scale, tx, ty)
                        const totalMW  = crc.bccs.reduce((s,b)=>s+(b.targetMW??0),0)
                        const actualMW = crc.bccs.reduce((s,b)=>s+(b.actualMW??0),0)
                        const gap      = actualMW - totalMW
                        const gapStr   = `${gap>=0?'+':''}${gap.toFixed(1)} MW`
                        const alerts   = crc.bccs.filter(b=>b.status!=='ok').length
                        const isNord   = crc.id === 'crc-nord'
                        const accent   = isNord ? '#acc7ff' : '#ff9800'

                        return (
                            <div
                                key={crc.id}
                                className="absolute flex flex-col items-center z-20 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                                style={{ left:`${pct.left}%`, top:`${pct.top}%` }}
                            >
                                <div
                                    className="bg-surface-container/90 backdrop-blur-md px-space-md py-space-sm rounded shadow-xl"
                                    style={{ borderLeft: `4px solid ${accent}` }}
                                >
                                    <div className="flex items-center gap-space-sm mb-space-xs">
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent, boxShadow: alerts>0?`0 0 6px ${accent}`:undefined }} />
                                        <span className="font-headline-sm text-body-md font-bold uppercase tracking-wide" style={{ color: accent }}>
                                            {crc.name}
                                        </span>
                                    </div>
                                    <div className="font-label-telemetry-sm text-label-telemetry-sm text-on-surface flex items-baseline gap-space-xs">
                                        <span className="font-bold">{actualMW.toFixed(0)}</span>
                                        <span className="text-on-surface-variant text-[10px]">/ {totalMW} MW</span>
                                        <span className="font-semibold text-[10px]" style={{ color: alerts>0?'#ffb95f':'#4ade80' }}>{gapStr}</span>
                                    </div>
                                    <div className="font-label-caps text-[9px] text-on-surface-variant mt-space-xs">
                                        {crc.bccs.length} BCCs{alerts>0 && <span style={{color:'#ffb95f'}}> • {alerts} anomalie{alerts>1?'s':''}</span>}
                                    </div>
                                </div>
                            </div>
                        )
                    })}

                    {/* ── DOM overlay: BCC labels (×1.4 – ×18) ─────── */}
                    {showBccLabels && bccLabelPositions.map(({ bcc, svgPt }) =>
                    {
                        if (!svgPt) return null
                        const isActive = scope==='all' || bcc.id===activeBccId || bcc.crcId===activeCrcId
                        if (!isActive) return null
                        const pct = svgToPct(svgPt[0], svgPt[1], scale, tx, ty)
                        return (
                            <BccLabel
                                key={bcc.id}
                                bcc={bcc}
                                pct={pct}
                                selected={selected === bcc.id}
                                onClick={() => { setSelected(bcc.id); onSelectBcc?.(bcc) }}
                            />
                        )
                    })}

                    {/* ── Legend ───────────────────────────────────────── */}
                    <div className="absolute top-4 left-4 z-10 bg-surface-container/85 backdrop-blur px-space-md py-space-sm rounded shadow-md font-label-caps text-label-caps space-y-1 pointer-events-none">
                        <div className="text-on-surface-variant uppercase text-[10px] tracking-wider mb-1 font-bold">LÉGENDE CONDUITE SIG</div>
                        <div className="flex items-center gap-space-sm">
                            <span className="w-2.5 h-2.5 rounded-full bg-secondary shrink-0"/>
                            <span className="text-on-surface">Consigne respectée (±0 MW)</span>
                        </div>
                        <div className="flex items-center gap-space-sm">
                            <span className="w-2.5 h-2.5 rounded-full bg-tertiary shrink-0"/>
                            <span className="text-on-surface">Sous-délestage modéré (-5 à -15 MW)</span>
                        </div>
                        <div className="flex items-center gap-space-sm">
                            <span className="w-2.5 h-2.5 rounded-full bg-error animate-ping shrink-0"/>
                            <span className="text-error font-semibold">Déficit critique (&gt; -15 MW)</span>
                        </div>
                        <div className="flex items-center gap-space-sm">
                            <span className="inline-block w-5 h-0" style={{ borderTop:'2px dashed #ff9800' }}/>
                            <span className="text-on-surface">Frontière CRC Nord / Sud</span>
                        </div>
                    </div>

                    {/* ── LOD dots + zoom badge ─────────────────────── */}
                    <div className="absolute top-2 right-2 pointer-events-none flex items-center gap-1">
                        {[1,2,3].map(l => (
                            <span key={l} className={`w-1.5 h-1.5 rounded-full transition-all ${lodDot>=l?'bg-secondary opacity-80':'bg-surface-container-high opacity-40'}`}/>
                        ))}
                        <span className="font-label-telemetry-sm text-[9px] text-on-surface-variant bg-surface-container/70 px-1.5 py-0.5 rounded ml-1">
                            ×{scale.toFixed(scale<2?1:0)}
                        </span>
                    </div>

                    {/* ── Scale bar ─────────────────────────────────── */}
                    <div className="absolute bottom-3 right-3 pointer-events-none flex flex-col items-end gap-0.5">
                        <div className="flex items-end gap-0.5">
                            <div className="w-px h-2 bg-secondary opacity-40"/>
                            <div className="h-1 bg-secondary opacity-40 rounded-sm" style={{ width:scaleBarPx }}/>
                            <div className="w-px h-2 bg-secondary opacity-40"/>
                        </div>
                        <span className="font-label-telemetry-sm text-[9px] text-on-surface-variant">{scaleBarKm} km</span>
                    </div>

                    {/* ── Built-in zoom toolbar ─────────────────────── */}
                    {showToolbar && (
                        <div className="absolute bottom-3 left-3 flex flex-col gap-space-xs z-10">
                            <button onClick={() => { const {scale:s,tx:t,ty:u}=trRef.current; const s2=clamp(s*ZOOM_STEP,ZOOM_MIN,ZOOM_MAX); apply(s2,VW/2-(VW/2-t)*(s2/s),VH/2-(VH/2-u)*(s2/s)) }} className="w-7 h-7 flex items-center justify-center rounded bg-surface-container-high hover:bg-surface-bright text-on-surface shadow-md text-lg font-bold" type="button">+</button>
                            <button onClick={() => { const {scale:s,tx:t,ty:u}=trRef.current; const s2=clamp(s/ZOOM_STEP,ZOOM_MIN,ZOOM_MAX); apply(s2,VW/2-(VW/2-t)*(s2/s),VH/2-(VH/2-u)*(s2/s)) }} className="w-7 h-7 flex items-center justify-center rounded bg-surface-container-high hover:bg-surface-bright text-on-surface shadow-md text-lg font-bold" type="button">−</button>
                            <button onClick={() => apply(1,0,0)} className="w-7 h-7 flex items-center justify-center rounded bg-surface-container-high hover:bg-surface-bright text-secondary shadow-md text-sm" type="button">⊙</button>
                        </div>
                    )}

                    {/* Tooltip */}
                    {tooltip && (
                        <div className="absolute pointer-events-none z-50 bg-surface-container/95 border border-surface-container-high rounded shadow-lg px-2 py-1.5" style={{ left:tooltip.x, top:tooltip.y, maxWidth:220 }}>
                            <div className="font-label-caps text-label-caps text-secondary">{tooltip.title}</div>
                            {tooltip.sub && <div className="font-label-telemetry-sm text-[10px] text-on-surface-variant mt-0.5">{tooltip.sub}</div>}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Inspection aside ─────────────────────────────────── */}
            <InspectionAside
                bcc={selectedBcc}
                crc={selectedBcc ? crcs.find(c=>c.id===selectedBcc.crcId)??null : null}
                onClose={() => setSelected(null)}
                onAiOpen={() => setAiOpen(true)}
            />
        </div>
    )
}
