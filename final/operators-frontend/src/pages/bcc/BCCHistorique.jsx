import { useState, useMemo } from 'react'

function Icon({ name, size = 18, className = '' })
{
    return (
        <span className={`material-symbols-outlined ${className}`} style={{ fontSize: size }}>
            {name}
        </span>
    )
}

// ── Static data — BCC 3 feeders with cumulative cut stats ─────────────────────
const FEEDERS =
[
    { ref: 'F07', nom: 'Z.I. Béja Nord',       priority: 'P3', mwNom: 4.2, cutsDayCount: 3, cutsWeekH: 3.5,  cutsMonthH: 11.2, ensMWh: 46.4,  daysSinceLast: 0  }
    ,{ ref: 'F08', nom: 'Medjez El Bab Ville',  priority: 'P3', mwNom: 6.5, cutsDayCount: 1, cutsWeekH: 1.2,  cutsMonthH: 5.0,  ensMWh: 32.5,  daysSinceLast: 12 }
    ,{ ref: 'F09', nom: 'Faubourg Est',          priority: 'P4', mwNom: 3.8, cutsDayCount: 3, cutsWeekH: 3.2,  cutsMonthH: 10.8, ensMWh: 41.0,  daysSinceLast: 0  }
    ,{ ref: 'F11', nom: 'Testour Bourg',         priority: 'P3', mwNom: 7.0, cutsDayCount: 2, cutsWeekH: 2.5,  cutsMonthH: 7.5,  ensMWh: 52.5,  daysSinceLast: 5  }
    ,{ ref: 'F15', nom: 'Téboursouk Agricole',   priority: 'P4', mwNom: 5.2, cutsDayCount: 1, cutsWeekH: 0.8,  cutsMonthH: 3.5,  ensMWh: 18.2,  daysSinceLast: 16 }
    ,{ ref: 'F18', nom: 'Nefza Rural',           priority: 'P2', mwNom: 2.6, cutsDayCount: 4, cutsWeekH: 4.2,  cutsMonthH: 13.0, ensMWh: 33.8,  daysSinceLast: 0  }
    ,{ ref: 'F21', nom: 'Amdoun Rural Nord',     priority: 'P4', mwNom: 4.8, cutsDayCount: 0, cutsWeekH: 0.5,  cutsMonthH: 2.2,  ensMWh: 10.6,  daysSinceLast: 19 }
    ,{ ref: 'F25', nom: 'Bou Salem Centre',      priority: 'P2', mwNom: 5.5, cutsDayCount: 2, cutsWeekH: 2.8,  cutsMonthH: 8.2,  ensMWh: 45.1,  daysSinceLast: 0  }
    ,{ ref: 'F28', nom: 'Goubellat Sud',         priority: 'P5', mwNom: 3.5, cutsDayCount: 0, cutsWeekH: 0.3,  cutsMonthH: 1.5,  ensMWh: 5.3,   daysSinceLast: 24 }
    ,{ ref: 'F31', nom: 'Jendouba Centre',       priority: 'P3', mwNom: 4.1, cutsDayCount: 1, cutsWeekH: 1.5,  cutsMonthH: 4.8,  ensMWh: 19.7,  daysSinceLast: 8  }
    ,{ ref: 'F33', nom: 'Oued Meliz',            priority: 'P5', mwNom: 3.2, cutsDayCount: 0, cutsWeekH: 0.4,  cutsMonthH: 1.8,  ensMWh: 5.8,   daysSinceLast: 11 }
    ,{ ref: 'F36', nom: 'Ghardimaou Ville',      priority: 'P3', mwNom: 5.8, cutsDayCount: 0, cutsWeekH: 0.6,  cutsMonthH: 2.5,  ensMWh: 14.5,  daysSinceLast: 3  }
    ,{ ref: 'F02', nom: 'Hôpital Rég. Béja',    priority: 'P0', mwNom: 4.5, cutsDayCount: 0, cutsWeekH: 0,    cutsMonthH: 0,    ensMWh: 0,     daysSinceLast: null }
    ,{ ref: 'F14', nom: 'SONEDE Béja',           priority: 'P0', mwNom: 3.2, cutsDayCount: 0, cutsWeekH: 0,    cutsMonthH: 0,    ensMWh: 0,     daysSinceLast: null }
    ,{ ref: 'F42', nom: 'Hôp. Jendouba',        priority: 'P0', mwNom: 2.8, cutsDayCount: 0, cutsWeekH: 0,    cutsMonthH: 0,    ensMWh: 0,     daysSinceLast: null }
]

// ── Cut history — last 30 days ─────────────────────────────────────────────────
const CUT_HISTORY =
[
    { date: '03/09/2026', ref: 'F18', nom: 'Nefza Rural',          slot: '13h00 — 13h52 (52 min)', mw: 2.6, statut: 'EN COURS' }
    ,{ date: '03/09/2026', ref: 'F07', nom: 'Z.I. Béja Nord',      slot: '13h20 — 13h52 (32 min)', mw: 4.2, statut: 'EN COURS' }
    ,{ date: '03/09/2026', ref: 'F09', nom: 'Faubourg Est',         slot: '13h24 — 13h52 (28 min)', mw: 3.8, statut: 'EN COURS' }
    ,{ date: '03/09/2026', ref: 'F25', nom: 'Bou Salem Centre',     slot: '13h37 — 13h52 (15 min)', mw: 5.5, statut: 'EN COURS' }
    ,{ date: '03/09/2026', ref: 'F11', nom: 'Testour Bourg',        slot: '13h00 — 13h45 (45 min)', mw: 7.0, statut: 'RÉTABLI'  }
    ,{ date: '01/09/2026', ref: 'F07', nom: 'Z.I. Béja Nord',      slot: '14h00 — 15h30 (1h30)',   mw: 4.2, statut: 'RÉTABLI'  }
    ,{ date: '01/09/2026', ref: 'F09', nom: 'Faubourg Est',         slot: '14h00 — 15h30 (1h30)',   mw: 3.8, statut: 'RÉTABLI'  }
    ,{ date: '01/09/2026', ref: 'F18', nom: 'Nefza Rural',          slot: '14h30 — 16h00 (1h30)',   mw: 2.6, statut: 'RÉTABLI'  }
    ,{ date: '30/08/2026', ref: 'F25', nom: 'Bou Salem Centre',     slot: '13h00 — 14h30 (1h30)',   mw: 5.5, statut: 'RÉTABLI'  }
    ,{ date: '30/08/2026', ref: 'F08', nom: 'Medjez El Bab Ville',  slot: '13h00 — 14h30 (1h30)',   mw: 6.5, statut: 'RÉTABLI'  }
    ,{ date: '28/08/2026', ref: 'F11', nom: 'Testour Bourg',        slot: '12h30 — 14h00 (1h30)',   mw: 7.0, statut: 'RÉTABLI'  }
    ,{ date: '28/08/2026', ref: 'F07', nom: 'Z.I. Béja Nord',      slot: '12h30 — 14h00 (1h30)',   mw: 4.2, statut: 'RÉTABLI'  }
    ,{ date: '26/08/2026', ref: 'F18', nom: 'Nefza Rural',          slot: '11h30 — 13h15 (1h45)',   mw: 2.6, statut: 'RÉTABLI'  }
    ,{ date: '24/08/2026', ref: 'F09', nom: 'Faubourg Est',         slot: '13h00 — 14h30 (1h30)',   mw: 3.8, statut: 'RÉTABLI'  }
    ,{ date: '24/08/2026', ref: 'F36', nom: 'Ghardimaou Ville',     slot: '13h00 — 14h30 (1h30)',   mw: 5.8, statut: 'RÉTABLI'  }
    ,{ date: '22/08/2026', ref: 'F31', nom: 'Jendouba Centre',      slot: '12h00 — 13h30 (1h30)',   mw: 4.1, statut: 'RÉTABLI'  }
    ,{ date: '21/08/2026', ref: 'F25', nom: 'Bou Salem Centre',     slot: '11h00 — 12h30 (1h30)',   mw: 5.5, statut: 'RÉTABLI'  }
    ,{ date: '19/08/2026', ref: 'F07', nom: 'Z.I. Béja Nord',      slot: '14h00 — 15h45 (1h45)',   mw: 4.2, statut: 'RÉTABLI'  }
    ,{ date: '17/08/2026', ref: 'F18', nom: 'Nefza Rural',          slot: '13h30 — 15h00 (1h30)',   mw: 2.6, statut: 'RÉTABLI'  }
    ,{ date: '15/08/2026', ref: 'F09', nom: 'Faubourg Est',         slot: '13h00 — 14h30 (1h30)',   mw: 3.8, statut: 'RÉTABLI'  }
    ,{ date: '15/08/2026', ref: 'F15', nom: 'Téboursouk Agricole',  slot: '13h00 — 14h30 (1h30)',   mw: 5.2, statut: 'RÉTABLI'  }
    ,{ date: '12/08/2026', ref: 'F18', nom: 'Nefza Rural',          slot: '14h00 — 15h45 (1h45)',   mw: 2.6, statut: 'RÉTABLI'  }
    ,{ date: '10/08/2026', ref: 'F07', nom: 'Z.I. Béja Nord',      slot: '12h00 — 13h30 (1h30)',   mw: 4.2, statut: 'RÉTABLI'  }
]

const MAX_MONTH_H = 15  // axis max for equity bars

const PAGE_SIZE = 10

function parseDateFR(d)
{
    const p = d.split('/')
    if (p.length === 3) return new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0])).getTime()
    return 0
}

// ── Equity bar: horizontal progress bar coloured by load ─────────────────────
function EquityBar({ hours, max = MAX_MONTH_H, size = 'md' })
{
    const pct = Math.min((hours / max) * 100, 100)
    const color = pct >= 80 ? '#ffb4ab' : pct >= 55 ? '#ffb95f' : '#4ade80'
    const h = size === 'sm' ? 'h-1.5' : 'h-2.5'
    return (
        <div className={`w-full bg-surface-container-lowest ${h} overflow-hidden`}>
            <div className={`${h} transition-all`} style={{ width: `${pct}%`, background: color }} />
        </div>
    )
}

// ── Priority badge ────────────────────────────────────────────────────────────
function PriBadge({ p })
{
    if (p === 'P0') return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-error-container text-on-error-container font-mono text-[9px] font-bold border border-error/30">
            <Icon name="lock" size={10} />P0
        </span>
    )
    const cls =
        p === 'P1' ? 'bg-error-container/40 text-error border-error/20'
        : p === 'P2' ? 'bg-tertiary-container/40 text-tertiary border-tertiary/20'
        : p === 'P3' ? 'bg-secondary-container/40 text-secondary border-secondary/20'
        : 'bg-surface-container text-on-surface-variant border-surface-container-high'
    return <span className={`inline-block px-1.5 py-0.5 font-mono text-[9px] font-bold border ${cls}`}>{p}</span>
}

export default function BCCHistorique()
{
    const [period,     setPeriod]     = useState('month')   // 'week' | 'month'
    const [filterRef,  setFilterRef]  = useState('tous')
    const [sortAsc,    setSortAsc]    = useState(false)
    const [page,       setPage]       = useState(1)
    const [dateDebut,  setDateDebut]  = useState('2026-08-04')
    const [dateFin,    setDateFin]    = useState('2026-09-03')

    // Derived feeder list sorted by cut load for equity chart
    const activeFeeders = FEEDERS.filter((f) => f.priority !== 'P0')
    const sortedByLoad  = [...activeFeeders].sort
    (
        (a, b) => (period === 'week' ? b.cutsWeekH - a.cutsWeekH : b.cutsMonthH - a.cutsMonthH)
    )

    // KPIs
    const totalENS    = activeFeeders.reduce((s, f) => s + f.ensMWh, 0)
    const totalCuts   = CUT_HISTORY.filter((c) => c.statut === 'RÉTABLI' || c.statut === 'EN COURS').length
    const maxLoad     = Math.max(...activeFeeders.map((f) => period === 'week' ? f.cutsWeekH : f.cutsMonthH))
    const minLoad     = Math.min(...activeFeeders.filter((f) => f.cutsMonthH > 0).map((f) => f.cutsMonthH))
    const equityScore = Math.round(100 - ((maxLoad - minLoad) / (maxLoad || 1)) * 60)

    // Unique refs for filter
    const uniqueRefs = useMemo
    (
        () =>
        {
            const seen = new Set()
            const out  = []
            CUT_HISTORY.forEach
            (
                (c) =>
                {
                    if (!seen.has(c.ref))
                    {
                        seen.add(c.ref)
                        out.push({ ref: c.ref, nom: c.nom })
                    }
                }
            )
            return out.sort((a, b) => a.ref.localeCompare(b.ref))
        }
        ,[]
    )

    // Filtered + sorted history
    const processedHistory = useMemo
    (
        () =>
        {
            let r = [...CUT_HISTORY]
            if (filterRef !== 'tous') r = r.filter((c) => c.ref === filterRef)
            r.sort
            (
                (a, b) =>
                {
                    const diff = parseDateFR(a.date) - parseDateFR(b.date)
                    return sortAsc ? diff : -diff
                }
            )
            return r
        }
        ,[filterRef, sortAsc]
    )

    const totalPages = Math.max(1, Math.ceil(processedHistory.length / PAGE_SIZE))
    const safePage   = Math.min(page, totalPages)
    const startIdx   = (safePage - 1) * PAGE_SIZE
    const paginated  = processedHistory.slice(startIdx, startIdx + PAGE_SIZE)

    const handleFilter = (v) => { setFilterRef(v); setPage(1) }

    return (
        <div className="w-full text-on-surface flex flex-col gap-space-md p-space-md">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <section className="bg-surface-container-low border border-surface-container-high p-space-md flex flex-col lg:flex-row lg:items-center justify-between gap-space-md shadow-sm">
                <div className="flex items-center gap-space-md">
                    <div className="w-10 h-10 bg-surface-container border border-surface-container-high flex items-center justify-center text-secondary shrink-0">
                        <Icon name="query_stats" size={22} />
                    </div>
                    <div>
                        <div className="flex items-center gap-space-sm">
                            <h1 className="font-sans font-bold text-sm text-on-surface uppercase tracking-wide">
                                Analyse &amp; Historique ENS — BCC 3
                            </h1>
                            <span className="px-space-sm py-0.5 bg-surface-container text-on-surface-variant font-mono text-[10px] border border-surface-container-high">
                                Béja &amp; Jendouba · Poste source 90/30 kV
                            </span>
                        </div>
                        <p className="font-mono text-[10px] text-on-surface-variant mt-space-xs">
                            Énergie Non Servie · Équité de rotation · Audit des manœuvres HTA
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-space-sm">
                    <div className="flex items-center gap-space-sm bg-surface-container-lowest p-space-xs border border-surface-container-high">
                        <div className="flex items-center gap-space-xs px-space-sm py-space-xs bg-surface-container border border-surface-container-high">
                            <span className="font-mono text-[10px] text-on-surface-variant uppercase">Du</span>
                            <input
                                type="date"
                                value={dateDebut}
                                onChange={(e) => setDateDebut(e.target.value)}
                                className="bg-transparent text-xs font-mono text-on-surface focus:outline-none w-28"
                            />
                        </div>
                        <span className="text-on-surface-variant font-mono text-xs">→</span>
                        <div className="flex items-center gap-space-xs px-space-sm py-space-xs bg-surface-container border border-surface-container-high">
                            <span className="font-mono text-[10px] text-on-surface-variant uppercase">Au</span>
                            <input
                                type="date"
                                value={dateFin}
                                onChange={(e) => setDateFin(e.target.value)}
                                className="bg-transparent text-xs font-mono text-on-surface focus:outline-none w-28"
                            />
                        </div>
                        <button className="flex items-center gap-space-xs px-space-md py-space-xs bg-secondary-container hover:bg-secondary text-on-secondary-container font-mono text-xs font-bold transition-colors" type="button">
                            <Icon name="tune" size={14} />
                            <span>Appliquer</span>
                        </button>
                    </div>
                    <button className="flex items-center gap-space-xs px-space-md py-space-xs bg-surface-container hover:bg-surface-container-high border border-surface-container-high text-secondary font-mono text-xs transition-colors" type="button">
                        <Icon name="download" size={14} />
                        <span>Export PDF</span>
                    </button>
                </div>
            </section>

            {/* ── 4 KPI cards ─────────────────────────────────────────────── */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-space-md">
                {[
                    {
                        label: 'ENS Cumulée BCC 3'
                        ,value: `${totalENS.toFixed(1)}`
                        ,unit: 'MWh'
                        ,sub: 'Période sélectionnée'
                        ,icon: 'trending_down'
                        ,cls: 'text-tertiary'
                    }
                    ,{
                        label: 'Coupures enregistrées'
                        ,value: String(totalCuts)
                        ,unit: 'manœuvres'
                        ,sub: `${activeFeeders.length} départs actifs`
                        ,icon: 'history_toggle_off'
                        ,cls: 'text-on-surface'
                    }
                    ,{
                        label: 'Départ le plus sollicité'
                        ,value: sortedByLoad[0]?.ref ?? '—'
                        ,unit: `${sortedByLoad[0]?.[period === 'week' ? 'cutsWeekH' : 'cutsMonthH'].toFixed(1)}h`,
                        sub: `${sortedByLoad[0]?.nom ?? ''}`
                        ,icon: 'warning'
                        ,cls: 'text-error'
                    }
                    ,{
                        label: 'Indice d\'équité BCC 3'
                        ,value: String(equityScore)
                        ,unit: '/ 100'
                        ,sub: equityScore >= 85 ? 'CONFORME' : equityScore >= 70 ? 'VIGILANCE' : 'DÉSÉQUILIBRÉ'
                        ,icon: 'balance'
                        ,cls: equityScore >= 85 ? 'text-[#4ade80]' : equityScore >= 70 ? 'text-tertiary' : 'text-error'
                    }
                ].map(({ label, value, unit, sub, icon, cls }) => (
                    <div key={label} className="bg-surface-container-low border border-surface-container-high p-space-md flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="font-mono text-[10px] text-on-surface-variant uppercase">{label}</span>
                            <Icon name={icon} size={16} className={cls} />
                        </div>
                        <div className="my-space-sm flex items-baseline gap-space-xs">
                            <span className={`font-mono text-2xl font-bold ${cls}`}>{value}</span>
                            <span className="font-mono text-xs text-on-surface-variant">{unit}</span>
                        </div>
                        <span className="font-mono text-[10px] text-on-surface-variant border-t border-surface-container-high pt-space-xs">{sub}</span>
                    </div>
                ))}
            </section>

            {/* ── Equity bar chart + feeder ENS table ─────────────────────── */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-space-md">

                {/* Left — equity bars */}
                <div className="lg:col-span-5 bg-surface-container-low border border-surface-container-high p-space-md flex flex-col gap-space-md">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-space-sm">
                            <Icon name="balance" size={16} className="text-secondary" />
                            <h2 className="font-sans font-semibold text-xs text-on-surface uppercase tracking-wide">
                                Équité de rotation — Heures coupures
                            </h2>
                        </div>
                        <div className="flex items-center gap-space-xs bg-surface-container-lowest border border-surface-container-high p-space-xs">
                            {[
                                { key: 'week',  label: '7 j' }
                                ,{ key: 'month', label: '30 j' }
                            ].map(({ key, label }) => (
                                <button
                                    key={key}
                                    onClick={() => setPeriod(key)}
                                    className={`px-space-sm py-0.5 font-mono text-[10px] transition-colors ${period === key ? 'bg-surface-container-high text-secondary font-bold' : 'text-on-surface-variant hover:text-on-surface'}`}
                                    type="button"
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Legend */}
                    <div className="flex items-center gap-space-md font-mono text-[9px] text-on-surface-variant">
                        <span className="flex items-center gap-1"><span className="w-2 h-1.5 inline-block bg-[#4ade80]" /> &lt; 55% (Repos)</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-1.5 inline-block bg-tertiary" /> 55–80% (Vigilance)</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-1.5 inline-block bg-error" /> &gt; 80% (Sur-sollicité)</span>
                    </div>

                    {/* Bars */}
                    <div className="flex flex-col gap-space-sm">
                        {sortedByLoad.map((f) =>
                        {
                            const h      = period === 'week' ? f.cutsWeekH : f.cutsMonthH
                            const pct    = Math.min((h / MAX_MONTH_H) * 100, 100)
                            const color  = pct >= 80 ? 'text-error' : pct >= 55 ? 'text-tertiary' : 'text-[#4ade80]'
                            return (
                                <div key={f.ref} className="flex items-center gap-space-sm">
                                    <span className="font-mono text-[10px] font-bold text-secondary w-8 shrink-0">{f.ref}</span>
                                    <span className="font-mono text-[10px] text-on-surface-variant truncate w-28 shrink-0">{f.nom}</span>
                                    <div className="flex-1 flex items-center gap-space-xs">
                                        <div className="flex-1 bg-surface-container-lowest h-2 overflow-hidden">
                                            <div
                                                className="h-full transition-all"
                                                style={{ width: `${pct}%`, background: pct >= 80 ? '#ffb4ab' : pct >= 55 ? '#ffb95f' : '#4ade80' }}
                                            />
                                        </div>
                                        <span className={`font-mono text-[10px] font-bold w-10 text-right shrink-0 ${color}`}>
                                            {h.toFixed(1)}h
                                        </span>
                                    </div>
                                    <PriBadge p={f.priority} />
                                </div>
                            )
                        })}
                    </div>

                    {/* P0 notice */}
                    <div className="flex items-center gap-space-xs px-space-sm py-space-xs bg-error-container/10 border border-error/20 font-mono text-[10px] text-error">
                        <Icon name="lock" size={12} />
                        <span>F02 · F14 · F42 (P0) — Jamais délestés — exclus du calcul d'équité</span>
                    </div>
                </div>

                {/* Right — feeder ENS table */}
                <div className="lg:col-span-7 bg-surface-container-low border border-surface-container-high p-space-md flex flex-col gap-space-md">
                    <div className="flex items-center gap-space-sm">
                        <Icon name="table_rows" size={16} className="text-secondary" />
                        <h2 className="font-sans font-semibold text-xs text-on-surface uppercase tracking-wide">
                            ENS &amp; Statistiques par Départ HTA
                        </h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left font-mono text-[10px] border-collapse">
                            <thead className="bg-surface-container-lowest border-b border-surface-container-high text-on-surface-variant uppercase tracking-wider">
                                <tr>
                                    <th className="py-space-sm px-space-md">Réf.</th>
                                    <th className="py-space-sm px-space-md">Départ / Zone</th>
                                    <th className="py-space-sm px-space-md text-center">Priorité</th>
                                    <th className="py-space-sm px-space-md text-right">MW Nom.</th>
                                    <th className="py-space-sm px-space-md text-right">ENS (MWh)</th>
                                    <th className="py-space-sm px-space-md text-right">Coupures J</th>
                                    <th className="py-space-sm px-space-md text-right">H/sem.</th>
                                    <th className="py-space-sm px-space-md text-right">H/mois</th>
                                    <th className="py-space-sm px-space-md">Équité 30j</th>
                                    <th className="py-space-sm px-space-md text-right">Jours depuis</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-container-high">
                                {FEEDERS.map((f) =>
                                {
                                    const isP0   = f.priority === 'P0'
                                    const loadPct = Math.min((f.cutsMonthH / MAX_MONTH_H) * 100, 100)
                                    return (
                                        <tr
                                            key={f.ref}
                                            className={`transition-colors ${isP0 ? 'bg-error-container/10 hover:bg-error-container/20' : 'hover:bg-surface-container'}`}
                                        >
                                            <td className={`py-space-sm px-space-md font-bold ${isP0 ? 'text-error' : 'text-secondary'}`}>{f.ref}</td>
                                            <td className="py-space-sm px-space-md text-on-surface truncate max-w-[120px]">{f.nom}</td>
                                            <td className="py-space-sm px-space-md text-center"><PriBadge p={f.priority} /></td>
                                            <td className="py-space-sm px-space-md text-right text-on-surface-variant">{f.mwNom}</td>
                                            <td className={`py-space-sm px-space-md text-right font-bold ${isP0 ? 'text-[#4ade80]' : f.ensMWh > 40 ? 'text-error' : f.ensMWh > 20 ? 'text-tertiary' : 'text-secondary'}`}>
                                                {isP0 ? '0,0' : f.ensMWh.toFixed(1)}
                                            </td>
                                            <td className="py-space-sm px-space-md text-right text-on-surface-variant">{f.cutsDayCount}</td>
                                            <td className="py-space-sm px-space-md text-right text-on-surface-variant">{f.cutsWeekH.toFixed(1)}</td>
                                            <td className={`py-space-sm px-space-md text-right font-bold ${isP0 ? 'text-[#4ade80]' : loadPct >= 80 ? 'text-error' : loadPct >= 55 ? 'text-tertiary' : 'text-on-surface-variant'}`}>
                                                {isP0 ? '0,0' : f.cutsMonthH.toFixed(1)}
                                            </td>
                                            <td className="py-space-sm px-space-md w-24">
                                                {isP0
                                                    ? <span className="font-mono text-[9px] text-error flex items-center gap-0.5"><Icon name="lock" size={10} />Protégé</span>
                                                    : <EquityBar hours={f.cutsMonthH} size="sm" />
                                                }
                                            </td>
                                            <td className="py-space-sm px-space-md text-right">
                                                {isP0
                                                    ? <span className="text-[#4ade80]">—</span>
                                                    : f.daysSinceLast === null
                                                        ? <span className="text-on-surface-variant">—</span>
                                                        : f.daysSinceLast === 0
                                                            ? <span className="px-1 py-0.5 bg-error-container/40 text-error border border-error/30 font-bold">Auj.</span>
                                                            : <span className={f.daysSinceLast >= 15 ? 'text-[#4ade80] font-bold' : 'text-on-surface-variant'}>{f.daysSinceLast} j</span>
                                                }
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            {/* ── Cut history ─────────────────────────────────────────────── */}
            <section className="bg-surface-container-low border border-surface-container-high p-space-md flex flex-col gap-space-md">
                <div className="flex items-center justify-between flex-wrap gap-space-sm">
                    <div className="flex items-center gap-space-sm">
                        <Icon name="history" size={16} className="text-secondary" />
                        <h2 className="font-sans font-semibold text-xs text-on-surface uppercase tracking-wide">
                            Journal des Coupures HTA — BCC 3
                        </h2>
                        <span className="px-space-sm py-0.5 bg-surface-container text-on-surface-variant font-mono text-[10px] border border-surface-container-high">
                            {processedHistory.length} événements
                        </span>
                    </div>
                    {/* Toolbar */}
                    <div className="flex items-center gap-space-sm flex-wrap">
                        <button
                            onClick={() => { setSortAsc((v) => !v); setPage(1) }}
                            className="flex items-center gap-space-xs px-space-sm py-space-xs bg-surface-container hover:bg-surface-container-high border border-surface-container-high text-on-surface-variant font-mono text-[10px] transition-colors"
                            type="button"
                        >
                            <Icon name="swap_vert" size={13} />
                            <span>{sortAsc ? 'Plus ancien en premier' : 'Plus récent en premier'}</span>
                        </button>
                        <div className="flex items-center gap-space-xs">
                            <span className="font-mono text-[10px] text-on-surface-variant">Départ :</span>
                            <select
                                value={filterRef}
                                onChange={(e) => handleFilter(e.target.value)}
                                className="bg-surface-container-lowest text-on-surface border border-surface-container-high px-space-sm py-space-xs font-mono text-[10px] focus:outline-none focus:border-secondary"
                            >
                                <option value="tous">Tous</option>
                                {uniqueRefs.map((r) => (
                                    <option key={r.ref} value={r.ref}>{r.ref} — {r.nom}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono text-[10px] border-collapse">
                        <thead className="bg-surface-container-lowest border-b border-surface-container-high text-on-surface-variant uppercase tracking-wider">
                            <tr>
                                <th className="py-space-sm px-space-md">Date</th>
                                <th className="py-space-sm px-space-md">Réf.</th>
                                <th className="py-space-sm px-space-md">Nom du départ</th>
                                <th className="py-space-sm px-space-md">Créneau</th>
                                <th className="py-space-sm px-space-md text-right">MW</th>
                                <th className="py-space-sm px-space-md text-center">Statut</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-container-high">
                            {paginated.length === 0
                                ? (
                                    <tr>
                                        <td colSpan={6} className="py-space-xl text-center text-on-surface-variant italic">
                                            Aucun événement pour ce filtre.
                                        </td>
                                    </tr>
                                )
                                : paginated.map((c, i) => (
                                    <tr key={i} className={`transition-colors ${c.statut === 'EN COURS' ? 'bg-tertiary-container/10 hover:bg-tertiary-container/20' : 'hover:bg-surface-container'}`}>
                                        <td className="py-space-sm px-space-md text-secondary font-semibold">{c.date}</td>
                                        <td className="py-space-sm px-space-md font-bold text-on-surface">{c.ref}</td>
                                        <td className="py-space-sm px-space-md text-on-surface-variant">{c.nom}</td>
                                        <td className="py-space-sm px-space-md text-on-surface-variant">{c.slot}</td>
                                        <td className="py-space-sm px-space-md text-right font-bold text-tertiary">{c.mw} MW</td>
                                        <td className="py-space-sm px-space-md text-center">
                                            {c.statut === 'EN COURS'
                                                ? <span className="px-space-xs py-0.5 bg-tertiary-container text-tertiary font-bold animate-pulse">EN COURS</span>
                                                : <span className="px-space-xs py-0.5 bg-surface-container text-secondary font-bold">RÉTABLI</span>
                                            }
                                        </td>
                                    </tr>
                                ))
                            }
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between font-mono text-[10px]">
                    <button
                        onClick={() => setPage((p) => p - 1)}
                        disabled={safePage <= 1}
                        className="flex items-center gap-space-xs px-space-md py-space-xs bg-surface-container hover:bg-surface-container-high border border-surface-container-high text-on-surface disabled:opacity-40 disabled:pointer-events-none transition-colors"
                        type="button"
                    >
                        <Icon name="chevron_left" size={14} />
                        <span>Précédent</span>
                    </button>
                    <span className="text-on-surface-variant">
                        {processedHistory.length === 0
                            ? 'Aucun résultat'
                            : `${startIdx + 1}–${Math.min(startIdx + PAGE_SIZE, processedHistory.length)} sur ${processedHistory.length}`
                        }
                    </span>
                    <button
                        onClick={() => setPage((p) => p + 1)}
                        disabled={safePage >= totalPages}
                        className="flex items-center gap-space-xs px-space-md py-space-xs bg-surface-container hover:bg-surface-container-high border border-surface-container-high text-on-surface disabled:opacity-40 disabled:pointer-events-none transition-colors"
                        type="button"
                    >
                        <span>Suivant</span>
                        <Icon name="chevron_right" size={14} />
                    </button>
                </div>
            </section>
        </div>
    )
}
