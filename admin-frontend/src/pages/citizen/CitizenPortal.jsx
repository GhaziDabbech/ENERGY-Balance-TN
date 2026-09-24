import { useState, useRef, useEffect } from 'react'
import L from 'leaflet'
import { TUNISIA_OUTLINE, BCC_ZONES } from '../../data/mockData'
import clsx from 'clsx'

const ZONE_SCHEDULE =
[
    { zone: 'Grand Tunis Nord',              status: 'ok',        nextCut: null,    restore: null,    gov: 'Tunis, Ariana, Ben Arous'                        }
    ,{ zone: 'Tunis Sud et Ben Arous',       status: 'ok',        nextCut: null,    restore: null,    gov: 'Ben Arous, Manouba'                              }
    ,{ zone: 'Nord-Ouest (Beja/Jendouba)',   status: 'active',    nextCut: '14h05', restore: '14h50', gov: 'Beja, Jendouba, Siliana'                         }
    ,{ zone: 'Bizerte / Mateur',             status: 'scheduled', nextCut: '15h30', restore: '16h15', gov: 'Bizerte'                                         }
    ,{ zone: 'Centre (Kairouan/Sidi Bouzid)',status: 'active',    nextCut: '13h52', restore: '14h37', gov: 'Kairouan, Sidi Bouzid'                           }
    ,{ zone: 'Sahel (Sousse/Monastir)',      status: 'restored',  nextCut: '12h10', restore: '12h55', gov: 'Sousse, Monastir, Mahdia'                        }
    ,{ zone: 'Sud (Sfax/Gabes/Medenine)',    status: 'scheduled', nextCut: '16h00', restore: '16h45', gov: 'Sfax, Gabes, Medenine, Tataouine, Kebili'        }
]

const STATUS_MAP =
{
    ok:        { color: '#16a34a', label: 'Alimente',          bg: 'bg-green-900/20 border-green-700/40'  }
    ,active:   { color: '#dc2626', label: 'Coupure en cours',  bg: 'bg-red-900/20 border-red-700/40'     }
    ,scheduled:{ color: '#d97706', label: 'Coupure prevue',    bg: 'bg-amber-900/20 border-amber-700/40' }
    ,restored: { color: '#2563eb', label: 'Retabli recemment', bg: 'bg-blue-900/20 border-blue-700/40'   }
}

const BCC_STATUS_COLOR =
{
    ok:        '#16a34a'
    ,active:   '#dc2626'
    ,scheduled:'#d97706'
    ,restored: '#2563eb'
}

const BOT_REPLIES =
{
    default:  "Je ne comprends pas votre question. Essayez: 'Mon quartier est-il concerne?' ou 'A quelle heure revient l'electricite a Beja?'"
    ,beja:    "Zone Beja (BCC 3 — Nord-Ouest): Coupure en cours depuis 14h05. Retablissement estime a 14h50. Duree maximale: 45 min."
    ,sousse:  "Zone Sousse (BCC 6 — Sahel): Electricite retablie depuis 12h55. Aucune coupure prevue dans l'immediat."
    ,sfax:    "Zone Sfax (BCC 7): Coupure programmee de 16h00 a 16h45 environ. Preparez-vous en avance."
    ,kairouan:"Zone Kairouan (BCC 5 — Centre): Coupure en cours depuis 13h52. Retablissement estime a 14h37."
    ,hopital: "Les hopitaux, cliniques et infrastructures critiques sont classes P0 et ne sont jamais concernes par les coupures."
}

function getReply(msg)
{
    const m = msg.toLowerCase()
    if (m.includes('beja') || m.includes('jendouba'))             return BOT_REPLIES.beja
    if (m.includes('sousse') || m.includes('monastir'))           return BOT_REPLIES.sousse
    if (m.includes('sfax') || m.includes('gabes'))                return BOT_REPLIES.sfax
    if (m.includes('kairouan') || m.includes('sidi bouzid'))      return BOT_REPLIES.kairouan
    if (m.includes('hopital') || m.includes('clinique'))          return BOT_REPLIES.hopital
    return BOT_REPLIES.default
}

function Chatbot()
{
    const [open,  setOpen]  = useState(false)
    const [msgs,  setMsgs]  = useState
    (
        [{ role: 'bot', text: "Bonjour ! Je suis l'assistant STEG. Posez-moi une question sur les coupures dans votre zone." }]
    )
    const [input, setInput] = useState('')
    const bottomRef         = useRef(null)

    useEffect
    (
        () => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }
        ,[msgs]
    )

    const send = () =>
    {
        if (!input.trim()) return
        const q = input.trim()
        setInput('')
        setMsgs((m) => [...m, { role: 'user', text: q }])
        setTimeout
        (
            () => setMsgs((m) => [...m, { role: 'bot', text: getReply(q) }])
            ,600
        )
    }

    return (
        <>
            <button
                onClick={() => setOpen((o) => !o)}
                className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors flex items-center justify-center font-bold text-lg"
            >
                {open ? 'X' : 'Chat'}
            </button>

            {open && (
                <div className="fixed bottom-24 right-6 z-50 w-80 bg-white border border-gray-200 rounded-xl shadow-2xl flex flex-col overflow-hidden">
                    <div className="bg-blue-600 px-4 py-3 flex items-center gap-2">
                        <span className="text-white font-semibold text-sm">Assistant STEG</span>
                        <span className="ml-auto w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 max-h-72">
                        {msgs.map
                        (
                            (m, i) => (
                                <div
                                    key={i}
                                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={clsx
                                    (
                                        'max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed'
                                        ,m.role === 'user'
                                            ? 'bg-blue-600 text-white rounded-br-sm'
                                            : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                                    )}>
                                        {m.text}
                                    </div>
                                </div>
                            )
                        )}
                        <div ref={bottomRef} />
                    </div>
                    <div className="flex gap-2 p-3 border-t border-gray-100">
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') send() }}
                            placeholder="Votre question..."
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                        <button
                            onClick={send}
                            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                        >
                            -&gt;
                        </button>
                    </div>
                </div>
            )}
        </>
    )
}

function CitizenMap()
{
    const mapRef     = useRef(null)
    const leafletRef = useRef(null)

    useEffect
    (
        () =>
        {
            if (leafletRef.current) return

            const map = L.map
            (
                mapRef.current
                ,{
                    center:              [33.5, 9.3]
                    ,zoom:               6
                    ,minZoom:            5
                    ,maxZoom:            11
                    ,zoomControl:        true
                    ,attributionControl: false
                    ,maxBounds:          [[28.5, 6.0], [38.8, 13.5]]
                    ,maxBoundsViscosity: 1.0
                }
            )
            leafletRef.current = map

            map.getContainer().style.background = '#f0f4f8'

            const tunisiaPoly = L.polygon
            (
                TUNISIA_OUTLINE
                ,{
                    fillColor:   '#e2e8f0'
                    ,fillOpacity: 0.9
                    ,color:       '#94a3b8'
                    ,weight:      1.5
                    ,opacity:     0.8
                    ,interactive: false
                }
            ).addTo(map)

            setTimeout
            (
                () =>
                {
                    map.invalidateSize()
                    map.fitBounds(tunisiaPoly.getBounds(), { padding: [30, 30] })
                }
                ,100
            )

            BCC_ZONES.forEach
            (
                (zone, i) =>
                {
                    const sched = ZONE_SCHEDULE[i]
                    const color = BCC_STATUS_COLOR[sched?.status ?? 'ok']

                    L.polygon
                    (
                        zone.coords
                        ,{ color, weight: 2, opacity: 0.9, fillColor: color, fillOpacity: 0.25 }
                    ).addTo(map).bindTooltip
                    (
                        `<div style="font-family:sans-serif;font-size:12px;padding:6px 10px;background:white;
                                     border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.15);min-width:180px">
                            <div style="font-weight:700;color:#1e293b;margin-bottom:3px">${zone.name}</div>
                            <div style="color:${color};font-weight:600">${STATUS_MAP[sched?.status ?? 'ok'].label}</div>
                            ${sched?.nextCut ? `<div style="color:#64748b;font-size:11px;margin-top:2px">Creneau: ${sched.nextCut} - ${sched.restore}</div>` : ''}
                            <div style="color:#64748b;font-size:11px">${sched?.gov ?? ''}</div>
                        </div>`
                        ,{ sticky: true, opacity: 1 }
                    )
                }
            )

            return () => { map.remove(); leafletRef.current = null }
        }
        ,[]
    )

    return <div ref={mapRef} className="w-full h-full" style={{ background: '#f0f4f8' }} />
}

export default function CitizenPortal()
{
    const [search, setSearch] = useState('')
    const [result, setResult] = useState(null)

    const handleSearch = () =>
    {
        const q     = search.toLowerCase()
        const found = ZONE_SCHEDULE.find
        (
            (z) => z.zone.toLowerCase().includes(q) || z.gov.toLowerCase().includes(q)
        )
        setResult(found ?? 'notfound')
    }

    const activeCount    = ZONE_SCHEDULE.filter((z) => z.status === 'active').length
    const scheduledCount = ZONE_SCHEDULE.filter((z) => z.status === 'scheduled').length

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900">

            {/* Header */}
            <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
                <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M9 2L4 9H8L7 14L12 7H8L9 2Z" fill="white" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="font-semibold text-gray-900 text-sm">
                                Suivi du Delestage en Temps Reel
                            </h1>
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
                                {scheduledCount} programmee{scheduledCount > 1 ? 's' : ''}
                            </span>
                        )}
                        <span className="text-xs text-gray-400">FR | AR (bientot)</span>
                    </div>
                </div>
            </header>

            <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">

                {/* Search */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-3">
                    <h2 className="font-semibold text-gray-800">Verifiez votre zone</h2>
                    <div className="flex gap-2">
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
                            placeholder="Entrez votre gouvernorat, delegation ou zone..."
                            className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                        <button
                            onClick={handleSearch}
                            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                        >
                            Rechercher
                        </button>
                    </div>

                    {result && result !== 'notfound' && (
                        <div className={clsx('border rounded-xl p-4', STATUS_MAP[result.status].bg)}>
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-semibold text-gray-900">{result.zone}</h3>
                                <span
                                    className="text-xs font-bold px-2 py-1 rounded-full"
                                    style=
                                    {{
                                        background: STATUS_MAP[result.status].color + '20'
                                        ,color:     STATUS_MAP[result.status].color
                                    }}
                                >
                                    {STATUS_MAP[result.status].label}
                                </span>
                            </div>
                            <p className="text-sm text-gray-600">{result.gov}</p>
                            {result.nextCut && (
                                <div className="mt-2 text-sm">
                                    <span className="text-gray-500">Creneau: </span>
                                    <span className="font-semibold">{result.nextCut} — {result.restore}</span>
                                </div>
                            )}
                            {result.status === 'active' && (
                                <p className="mt-2 text-sm text-red-700 font-medium">
                                    ! Coupure en cours. Debranchez les appareils sensibles. Duree max: 45 min.
                                </p>
                            )}
                            {result.status === 'ok' && (
                                <p className="mt-2 text-sm text-green-700">
                                    Votre zone est actuellement alimentee normalement.
                                </p>
                            )}
                        </div>
                    )}

                    {result === 'notfound' && (
                        <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-4 py-3">
                            Aucune zone trouvee pour "{search}". Essayez Beja, Sousse, Kairouan, Sfax...
                        </p>
                    )}
                </div>

                {/* Map */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <h2 className="font-semibold text-gray-800">Carte du delestage</h2>
                        <div className="flex items-center gap-3 text-xs">
                            {Object.entries(STATUS_MAP).map
                            (
                                ([k, v]) => (
                                    <span key={k} className="flex items-center gap-1.5">
                                        <span
                                            className="w-3 h-3 rounded-full inline-block"
                                            style={{ background: v.color }}
                                        />
                                        {v.label}
                                    </span>
                                )
                            )}
                        </div>
                    </div>
                    <div style={{ height: '360px' }}>
                        <CitizenMap />
                    </div>
                </div>

                {/* Schedule table */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100">
                        <h2 className="font-semibold text-gray-800">Planning des zones — Aujourd'hui</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wider">
                                    <th className="px-4 py-3 text-left font-medium">Zone</th>
                                    <th className="px-4 py-3 text-left font-medium">Gouvernorats</th>
                                    <th className="px-4 py-3 text-center font-medium">Statut</th>
                                    <th className="px-4 py-3 text-center font-medium">Debut</th>
                                    <th className="px-4 py-3 text-center font-medium">Fin prevue</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ZONE_SCHEDULE.map
                                (
                                    (z, i) => (
                                        <tr
                                            key={i}
                                            className={clsx
                                            (
                                                'border-b border-gray-50 hover:bg-gray-50 transition-colors'
                                                ,z.status === 'active' && 'bg-red-50'
                                            )}
                                        >
                                            <td className="px-4 py-3 font-medium text-gray-900">{z.zone}</td>
                                            <td className="px-4 py-3 text-gray-500 text-xs">{z.gov}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span
                                                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold"
                                                    style=
                                                    {{
                                                        background: STATUS_MAP[z.status].color + '18'
                                                        ,color:     STATUS_MAP[z.status].color
                                                    }}
                                                >
                                                    {z.status === 'active' && (
                                                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
                                                    )}
                                                    {STATUS_MAP[z.status].label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center text-gray-600">{z.nextCut ?? '—'}</td>
                                            <td className="px-4 py-3 text-center text-gray-600">{z.restore ?? '—'}</td>
                                        </tr>
                                    )
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* FAQ */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <h2 className="font-semibold text-gray-800 mb-3">Questions frequentes</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600">
                        {[
                            [
                                'Pourquoi 45 minutes?'
                                ,'La duree maximale de 45 minutes par depart garantit une rotation equitable entre toutes les zones.'
                            ]
                            ,[
                                'Les hopitaux sont-ils concernes?'
                                ,"Non. Les hopitaux, cliniques et infrastructures d'eau sont classes P0 et ne sont jamais delestes."
                            ]
                            ,[
                                'Puis-je etre prevenu?'
                                ,'Les notifications SMS/WhatsApp sont en cours de developpement.'
                            ]
                            ,[
                                'Urgences electriques?'
                                ,'Appelez le numero vert STEG: 80 100 444 (24h/24).'
                            ]
                        ].map
                        (
                            ([q, a]) => (
                                <div key={q} className="bg-gray-50 rounded-lg p-3">
                                    <p className="font-semibold text-gray-700 mb-1">{q}</p>
                                    <p className="text-gray-500 text-xs leading-relaxed">{a}</p>
                                </div>
                            )
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="text-center text-xs text-gray-400 pb-4">
                    Plateforme Nationale de Gestion du Delestage — STEG 2026 ·
                    <a href="/login" className="ml-1 text-blue-500 hover:underline">Acces operateur</a>
                </div>
            </div>

            <Chatbot />
        </div>
    )
}
