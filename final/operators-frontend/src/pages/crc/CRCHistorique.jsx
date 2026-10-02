import { useState, useMemo } from 'react'

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

// ── CRC Nord BCC data (4 BCCs only) ──────────────────────────────────────────
const CRC_NORD_BCC_DATA =
{
    'BCC 1':
    {
        label:  'BCC 1 — Grand Tunis Nord'
        ,crc:   'CRC Nord'
        ,kpis:  { plan: '280,0 MW', real: '278,2 MW', ecart: '-1,8 MW (-0,6 %)', ens: '1 240,0 MWh' }
        ,poste: 'Poste Source La Goulette 225/30 kV'
        ,departs:
        [
            { ref:'F01', nom:'Hopital Militaire Tunis',  p:'P0', mwCoupe:'0,0',  statut:'Protege — NON deleste'  }
            ,{ ref:'F04', nom:'Tunis Medina',             p:'P3', mwCoupe:'28,5', statut:'Retabli (15h29)'        }
            ,{ ref:'F08', nom:'Ariana Ville',             p:'P3', mwCoupe:'32,0', statut:'Retabli (15h28)'        }
            ,{ ref:'F12', nom:'La Marsa',                 p:'P4', mwCoupe:'25,0', statut:'Retabli (15h30)'        }
            ,{ ref:'F15', nom:'El Menzah',                p:'P3', mwCoupe:'42,5', statut:'Retabli (15h31)'        }
        ]
        ,cuts:
        [
            { date:'28/08/2025', ref:'F04', nom:'Tunis Medina',  slot:'13h00 — 13h45 (45 min)', mw:'28,5 MW' }
            ,{ date:'28/08/2025', ref:'F08', nom:'Ariana Ville', slot:'13h00 — 13h45 (45 min)', mw:'32,0 MW' }
            ,{ date:'28/08/2025', ref:'F12', nom:'La Marsa',     slot:'14h00 — 14h45 (45 min)', mw:'25,0 MW' }
            ,{ date:'21/08/2025', ref:'F04', nom:'Tunis Medina', slot:'14h00 — 14h45 (45 min)', mw:'28,5 MW' }
            ,{ date:'21/08/2025', ref:'F15', nom:'El Menzah',    slot:'14h00 — 14h45 (45 min)', mw:'42,5 MW' }
            ,{ date:'15/08/2025', ref:'F08', nom:'Ariana Ville', slot:'12h30 — 13h15 (45 min)', mw:'32,0 MW' }
            ,{ date:'10/08/2025', ref:'F12', nom:'La Marsa',     slot:'13h00 — 13h45 (45 min)', mw:'25,0 MW' }
        ]
    }
    ,'BCC 2':
    {
        label:  'BCC 2 — Tunis Sud / Ben Arous'
        ,crc:   'CRC Nord'
        ,kpis:  { plan: '220,0 MW', real: '218,6 MW', ecart: '-1,4 MW (-0,6 %)', ens: '980,0 MWh' }
        ,poste: 'Poste Source Naassen / Ben Arous 225/90/30 kV'
        ,departs:
        [
            { ref:'F03', nom:'Hopital Ben Arous',  p:'P0', mwCoupe:'0,0',  statut:'Protege — NON deleste'  }
            ,{ ref:'F05', nom:'Ben Arous Centre',  p:'P3', mwCoupe:'29,0', statut:'Retabli (14h58)'        }
            ,{ ref:'F07', nom:'Megrine',            p:'P4', mwCoupe:'31,0', statut:'Retabli (14h57)'        }
            ,{ ref:'F10', nom:'Rades',              p:'P3', mwCoupe:'29,0', statut:'Retabli (14h59)'        }
        ]
        ,cuts:
        [
            { date:'29/08/2025', ref:'F05', nom:'Ben Arous Centre', slot:'12h30 — 13h15 (45 min)', mw:'29,0 MW' }
            ,{ date:'29/08/2025', ref:'F07', nom:'Megrine',         slot:'12h30 — 13h15 (45 min)', mw:'31,0 MW' }
            ,{ date:'22/08/2025', ref:'F10', nom:'Rades',           slot:'13h00 — 13h45 (45 min)', mw:'29,0 MW' }
            ,{ date:'22/08/2025', ref:'F05', nom:'Ben Arous Centre', slot:'14h00 — 14h45 (45 min)', mw:'29,0 MW' }
            ,{ date:'15/08/2025', ref:'F07', nom:'Megrine',         slot:'13h30 — 14h15 (45 min)', mw:'31,0 MW' }
            ,{ date:'10/08/2025', ref:'F10', nom:'Rades',           slot:'14h00 — 14h45 (45 min)', mw:'29,0 MW' }
        ]
    }
    ,'BCC 3':
    {
        label:  'BCC 3 — Nord-Ouest (Beja / Jendouba)'
        ,crc:   'CRC Nord'
        ,kpis:  { plan: '560,0 MW', real: '542,0 MW', ecart: '-18,0 MW (-3,2 %)', ens: '2 410,0 MWh' }
        ,poste: 'Poste Source Beja 225/30 kV'
        ,departs:
        [
            { ref:'F02', nom:'Hopital Regional Beja',    p:'P0', mwCoupe:'0,0', statut:'Protege — NON deleste' }
            ,{ ref:'F07', nom:'Zone Industrielle Beja',  p:'P3', mwCoupe:'4,2', statut:'Retabli (16h28)'       }
            ,{ ref:'F09', nom:'Faubourg Est Oueslatia',  p:'P4', mwCoupe:'3,8', statut:'Retabli (16h30)'       }
            ,{ ref:'F14', nom:'Station Pompage SONEDE',  p:'P0', mwCoupe:'0,0', statut:'Protege — NON deleste' }
            ,{ ref:'F18', nom:'Nefza Rural',             p:'P2', mwCoupe:'2,6', statut:'Non retabli — Depassement 45min' }
        ]
        ,cuts:
        [
            { date:'03/09/2025', ref:'F07', nom:'Zone Industrielle Beja', slot:'12h00 — 16h28 (4h28)', mw:'4,2 MW' }
            ,{ date:'03/09/2025', ref:'F09', nom:'Faubourg Est Oueslatia', slot:'12h00 — 16h30 (4h30)', mw:'3,8 MW' }
            ,{ date:'03/09/2025', ref:'F18', nom:'Nefza Rural',           slot:'12h30 — 16h15 (3h45)', mw:'2,6 MW' }
            ,{ date:'01/09/2025', ref:'F07', nom:'Zone Industrielle Beja', slot:'13h00 — 17h00 (4h00)', mw:'4,0 MW' }
            ,{ date:'29/08/2025', ref:'F09', nom:'Faubourg Est Oueslatia', slot:'11h30 — 15h30 (4h00)', mw:'3,7 MW' }
            ,{ date:'26/08/2025', ref:'F07', nom:'Zone Industrielle Beja', slot:'12h00 — 15h45 (3h45)', mw:'4,1 MW' }
            ,{ date:'21/08/2025', ref:'F18', nom:'Nefza Rural',           slot:'12h15 — 16h00 (3h45)', mw:'2,4 MW' }
            ,{ date:'15/08/2025', ref:'F09', nom:'Faubourg Est Oueslatia', slot:'12h00 — 15h30 (3h30)', mw:'3,5 MW' }
        ]
    }
    ,'BCC 4':
    {
        label:  'BCC 4 — Bizerte / Mateur'
        ,crc:   'CRC Nord'
        ,kpis:  { plan: '60,0 MW', real: '67,2 MW', ecart: '+7,2 MW (+12,0 %)', ens: '690,0 MWh' }
        ,poste: 'Poste Source Mateur 150/30 kV'
        ,departs:
        [
            { ref:'F01', nom:'Hopital Regional Mateur',  p:'P0', mwCoupe:'0,0', statut:'Protege — NON deleste' }
            ,{ ref:'F04', nom:'Mateur Sud Agglomeration', p:'P3', mwCoupe:'3,1', statut:'Retabli (15h45)'      }
            ,{ ref:'F06', nom:'Tindja ZI',               p:'P2', mwCoupe:'2,9', statut:'Retabli (15h30)'       }
        ]
        ,cuts:
        [
            { date:'26/08/2025', ref:'F04', nom:'Mateur Sud Agglomeration', slot:'12h00 — 15h45 (3h45)', mw:'3,1 MW' }
            ,{ date:'26/08/2025', ref:'F06', nom:'Tindja ZI',               slot:'12h30 — 15h30 (3h00)', mw:'2,9 MW' }
            ,{ date:'19/08/2025', ref:'F04', nom:'Mateur Sud Agglomeration', slot:'11h30 — 14h30 (3h00)', mw:'3,0 MW' }
            ,{ date:'11/08/2025', ref:'F06', nom:'Tindja ZI',               slot:'13h00 — 15h30 (2h30)', mw:'2,8 MW' }
        ]
    }
}

const ALL_BCCS = Object.entries(CRC_NORD_BCC_DATA).map
(
    ([key, val]) => ({ ...val, key, evenements: val.cuts.length, dureeTotale: key === 'BCC 3' ? '28h 40min' : key === 'BCC 1' ? '14h 15min' : key === 'BCC 2' ? '11h 30min' : '8h 15min', dernierDate: val.cuts[0]?.date ?? '—', joursSince: key === 'BCC 3' ? 0 : key === 'BCC 2' ? 5 : key === 'BCC 1' ? 6 : 8, ensMWh: key === 'BCC 3' ? 2410 : key === 'BCC 1' ? 1240 : key === 'BCC 2' ? 980 : 690, equite: key === 'BCC 3' ? 68 : key === 'BCC 1' ? 88 : key === 'BCC 2' ? 91 : 94, totalPlan: key === 'BCC 3' ? 560 : key === 'BCC 1' ? 280 : key === 'BCC 2' ? 220 : 60, totalReal: key === 'BCC 3' ? 542 : key === 'BCC 1' ? 278 : key === 'BCC 2' ? 219 : 67 })
)

const PAGE_SIZE = 10

function parseDateFR(d)
{
    const p = d.split('/')
    if (p.length === 3) return new Date(p[2], p[1]-1, p[0]).getTime()
    return 0
}

function P0Badge()
{
    return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] bg-[#93000a] text-[#ffdad6] font-bold text-[10px] border border-[#ffb4ab]/40">
            <Icon name="lock" size={11} />
            <span>P0 (VERROUILLE)</span>
        </span>
    )
}

function BCCDetailModal({ bccKey, onClose })
{
    const [sortAsc,   setSortAsc]   = useState(false)
    const [filterRef, setFilterRef] = useState('tous')
    const [page,      setPage]      = useState(1)

    const bcc = CRC_NORD_BCC_DATA[bccKey]
    if (!bcc) return null

    const uniqueRefs = useMemo
    (
        () =>
        {
            const seen = new Set()
            const out  = []
            bcc.cuts.forEach((c) =>
            {
                if (!seen.has(c.ref)) { seen.add(c.ref); out.push({ ref: c.ref, nom: c.nom }) }
            })
            return out.sort((a, b) => a.ref.localeCompare(b.ref))
        }
        ,[bcc]
    )

    const processedCuts = useMemo
    (
        () =>
        {
            let result = [...bcc.cuts]
            if (filterRef !== 'tous') result = result.filter((c) => c.ref === filterRef)
            result.sort((a, b) =>
            {
                const diff = parseDateFR(a.date) - parseDateFR(b.date)
                return sortAsc ? diff : -diff
            })
            return result
        }
        ,[bcc, filterRef, sortAsc]
    )

    const totalPages = Math.max(1, Math.ceil(processedCuts.length / PAGE_SIZE))
    const safePage   = Math.min(page, totalPages)
    const startIdx   = (safePage - 1) * PAGE_SIZE
    const paginated  = processedCuts.slice(startIdx, Math.min(startIdx + PAGE_SIZE, processedCuts.length))
    const ecartIsNeg = bcc.kpis.ecart.startsWith('-')

    return (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="relative w-full max-w-5xl bg-[#0b1c30] border border-[#1b2b3f] rounded-[2px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 bg-[#102034] border-b border-[#1b2b3f]">
                    <div className="flex items-center gap-2.5">
                        <Icon name="analytics" size={20} className="text-[#acc7ff]" />
                        <div>
                            <h3 className="font-sans font-bold text-sm text-[#d3e4fe]">Detail — {bcc.label} · {bcc.crc}</h3>
                            <span className="font-mono text-[10px] text-[#8f9097]">Horodatage audit SCADA · Comptage telemesuree certifie</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-[2px] hover:bg-[#1b2b3f] text-[#8f9097] hover:text-[#d3e4fe] transition-colors" type="button">
                        <Icon name="close" size={20} />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto flex flex-col gap-5">
                    {/* KPIs */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-[#000f21] p-3 rounded-[2px] border border-[#1b2b3f] font-mono">
                        <div className="flex flex-col"><span className="text-[10px] text-[#8f9097] uppercase">MW Planifie</span><span className="text-base font-bold text-[#acc7ff]">{bcc.kpis.plan}</span></div>
                        <div className="flex flex-col"><span className="text-[10px] text-[#8f9097] uppercase">MW Realise</span><span className="text-base font-bold text-[#d3e4fe]">{bcc.kpis.real}</span></div>
                        <div className="flex flex-col"><span className="text-[10px] text-[#8f9097] uppercase">Ecart</span><span className={`text-base font-bold ${ecartIsNeg ? 'text-[#ffb4ab]' : 'text-[#4ade80]'}`}>{bcc.kpis.ecart}</span></div>
                        <div className="flex flex-col"><span className="text-[10px] text-[#8f9097] uppercase">ENS Cumulee</span><span className="text-base font-bold text-[#ffb95f]">{bcc.kpis.ens}</span></div>
                    </div>

                    {/* Departs table */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <span className="font-sans text-[11px] font-semibold text-[#8f9097] uppercase tracking-wide">DECOUPAGE PAR DEPART HTA ({bcc.poste.toUpperCase()})</span>
                            <span className="font-mono text-[10px] text-[#8f9097]">{bcc.departs.length} departs</span>
                        </div>
                        <div className="overflow-x-auto border border-[#1b2b3f] rounded-[2px]">
                            <table className="w-full text-left font-sans text-xs border-collapse">
                                <thead>
                                    <tr className="bg-[#000f21] border-b border-[#1b2b3f] font-mono text-[10px] text-[#8f9097] uppercase">
                                        <th className="py-2 px-2.5">Ref.</th>
                                        <th className="py-2 px-2.5">Zone</th>
                                        <th className="py-2 px-2.5 text-center">Priorite</th>
                                        <th className="py-2 px-2.5 text-right">MW Coupe</th>
                                        <th className="py-2 px-2.5 text-right">Statut</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#1b2b3f] font-mono text-xs">
                                    {bcc.departs.map((d) =>
                                    {
                                        const isP0 = d.p === 'P0'
                                        return (
                                            <tr key={d.ref} className={isP0 ? 'bg-[#93000a]/10 hover:bg-[#93000a]/20' : 'hover:bg-[#102034]'}>
                                                <td className="py-2 px-2.5 font-bold text-[#d3e4fe]">{d.ref}</td>
                                                <td className={`py-2 px-2.5 font-sans ${isP0 ? 'font-medium text-[#d3e4fe]' : 'text-[#c5c6cd]'}`}>{d.nom}</td>
                                                <td className="py-2 px-2.5 text-center">{isP0 ? <P0Badge /> : <span className="px-1.5 py-0.5 rounded-[2px] bg-[#102034] text-[#acc7ff] border border-[#1b2b3f] text-[10px]">{d.p}</span>}</td>
                                                <td className={`py-2 px-2.5 text-right font-bold ${isP0 ? 'text-[#4ade80]' : 'text-[#d3e4fe]'}`}>{d.mwCoupe} MW</td>
                                                <td className="py-2 px-2.5 text-right">
                                                    {isP0
                                                        ? <span className="inline-flex items-center gap-1 font-semibold text-[#ffb4ab] text-[11px]"><Icon name="lock" size={13} /><span>Protege — NON deleste</span></span>
                                                        : <span className={d.statut.toLowerCase().includes('non') ? 'text-[#ffb4ab]' : 'text-[#4ade80]'}>{d.statut}</span>
                                                    }
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-2 bg-[#000f21] border border-[#1b2b3f] rounded-[2px] font-mono text-[10px] text-[#8f9097] flex flex-wrap items-center justify-between gap-1">
                            <span>P0 = Infrastructure critique inviolable</span>
                            <span>P1–P5 = Departs mobilisables par ordre de priorite croissante</span>
                        </div>
                    </div>

                    {/* Cuts history */}
                    <div className="flex flex-col gap-2 pt-1 border-t border-[#1b2b3f]">
                        <span className="font-sans text-[11px] font-semibold text-[#d3e4fe] uppercase tracking-wide">HISTORIQUE DES DELESTAGES</span>
                        <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-[2px] bg-[#000f21] border border-[#1b2b3f]">
                            <div className="flex items-center gap-2">
                                <button
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] bg-[#102034] hover:bg-[#1b2b3f] text-[#acc7ff] border border-[#1b2b3f] font-mono text-xs transition-colors"
                                    onClick={() => { setSortAsc((v) => !v); setPage(1) }}
                                    type="button"
                                >
                                    <Icon name="swap_vert" size={14} />
                                    <span>{sortAsc ? 'Plus ancien en premier' : 'Plus recent en premier'}</span>
                                </button>
                                <div className="flex items-center gap-1.5 pl-2 border-l border-[#26364a]">
                                    <label className="font-sans text-[10px] uppercase text-[#8f9097]">Filtrer :</label>
                                    <select
                                        className="bg-[#0b1c30] text-[#d3e4fe] border border-[#1b2b3f] rounded-[2px] px-2 py-0.5 text-xs font-mono focus:outline-none focus:border-[#0365cf]"
                                        value={filterRef}
                                        onChange={(e) => { setFilterRef(e.target.value); setPage(1) }}
                                    >
                                        <option value="tous">Tous les departs</option>
                                        {uniqueRefs.map((r) => <option key={r.ref} value={r.ref}>{r.ref} — {r.nom}</option>)}
                                    </select>
                                </div>
                            </div>
                            <span className="font-mono text-xs text-[#8f9097]">Page {safePage} / {totalPages}</span>
                        </div>
                        <div className="overflow-x-auto border border-[#1b2b3f] rounded-[2px]">
                            <table className="w-full text-left font-sans text-xs border-collapse">
                                <thead>
                                    <tr className="bg-[#000f21] border-b border-[#1b2b3f] font-mono text-[10px] text-[#8f9097] uppercase">
                                        <th className="py-2 px-2.5">Date</th>
                                        <th className="py-2 px-2.5">Ref.</th>
                                        <th className="py-2 px-2.5">Nom du depart</th>
                                        <th className="py-2 px-2.5">Creneau</th>
                                        <th className="py-2 px-2.5 text-right">MW gagnes</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#1b2b3f] font-mono text-xs">
                                    {paginated.length === 0
                                        ? <tr><td colSpan={5} className="py-4 text-center text-[#8f9097] font-mono">Aucun evenement.</td></tr>
                                        : paginated.map((c, i) => (
                                            <tr key={i} className="hover:bg-[#102034] transition-colors">
                                                <td className="py-2 px-2.5 text-[#acc7ff] font-medium">{c.date}</td>
                                                <td className="py-2 px-2.5 font-bold text-[#d3e4fe]">{c.ref}</td>
                                                <td className="py-2 px-2.5 font-sans text-[#c5c6cd]">{c.nom}</td>
                                                <td className="py-2 px-2.5 text-[#8f9097]">{c.slot}</td>
                                                <td className="py-2 px-2.5 text-right font-bold text-[#ffb95f]">{c.mw}</td>
                                            </tr>
                                        ))
                                    }
                                </tbody>
                            </table>
                        </div>
                        <div className="flex items-center justify-between px-1 py-1 font-mono text-xs">
                            <button className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[2px] bg-[#102034] hover:bg-[#1b2b3f] disabled:opacity-40 disabled:pointer-events-none text-[#d3e4fe] border border-[#1b2b3f] transition-colors" disabled={safePage <= 1} onClick={() => setPage((p) => p-1)} type="button">
                                <Icon name="chevron_left" size={14} /><span>Precedent</span>
                            </button>
                            <span className="text-[#8f9097] text-[11px]">
                                {processedCuts.length === 0 ? 'Aucun evenement' : `${startIdx+1} a ${Math.min(startIdx+PAGE_SIZE, processedCuts.length)} sur ${processedCuts.length}`}
                            </span>
                            <button className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[2px] bg-[#102034] hover:bg-[#1b2b3f] disabled:opacity-40 disabled:pointer-events-none text-[#d3e4fe] border border-[#1b2b3f] transition-colors" disabled={safePage >= totalPages} onClick={() => setPage((p) => p+1)} type="button">
                                <span>Suivant</span><Icon name="chevron_right" size={14} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="px-4 py-2.5 bg-[#102034] border-t border-[#1b2b3f] flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8f9097]">
                        <Icon name="verified" size={14} className="text-[#acc7ff]" />
                        <span>Registre audite CRC Nord · Signature horodatee</span>
                    </div>
                    <button className="px-3 py-1.5 bg-[#000f21] hover:bg-[#1b2b3f] text-[#d3e4fe] border border-[#1b2b3f] rounded-[2px] font-sans text-xs transition-colors" onClick={onClose} type="button">
                        Fermer
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CRCHistorique()
{
    const [dateDebut,  setDateDebut]  = useState('2025-08-04')
    const [dateFin,    setDateFin]    = useState('2025-09-03')
    const [modalKey,   setModalKey]   = useState(null)

    const fmtDate = (iso) =>
    {
        const [y, m, d] = iso.split('-')
        return `${d}/${m}/${y}`
    }

    const totalENS    = ALL_BCCS.reduce((s, b) => s + b.ensMWh, 0)
    const equiteAvg   = Math.round(ALL_BCCS.reduce((s, b) => s + b.equite, 0) / ALL_BCCS.length)
    const totalEvents = ALL_BCCS.reduce((s, b) => s + b.evenements, 0)

    return (
        <div className="w-full min-h-full bg-[#031427] text-[#d3e4fe] font-sans text-xs">
            <div className="p-4 flex flex-col gap-4 max-w-[1720px] mx-auto">

                {/* Header */}
                <section className="bg-[#0b1c30] p-4 rounded-[2px] border border-[#1b2b3f] shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-[2px] bg-[#102034] border border-[#1b2b3f] flex items-center justify-center text-[#acc7ff] shrink-0">
                            <Icon name="query_stats" size={24} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="font-sans font-bold text-lg text-[#d3e4fe] tracking-tight">Analyse & Historique ENS</h1>
                                <span className="px-2 py-0.5 rounded-[2px] bg-[#102034] text-[#8f9097] font-mono text-[10px] uppercase border border-[#1b2b3f]">
                                    CRC Nord · 4 BCCs
                                </span>
                            </div>
                            <p className="font-sans text-xs text-[#8f9097] mt-0.5">
                                Historique des delestages BCC 1, 2, 3, 4 · Periode : {fmtDate(dateDebut)} — {fmtDate(dateFin)}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 bg-[#000f21] p-1.5 rounded-[2px] border border-[#1b2b3f]">
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-[2px] bg-[#0b1c30] border border-[#1b2b3f]">
                                <span className="text-[10px] font-mono text-[#8f9097] uppercase">Du</span>
                                <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} className="bg-transparent border-0 p-0 text-xs font-mono text-[#d3e4fe] focus:ring-0 focus:outline-none w-32" />
                            </div>
                            <span className="text-[#8f9097] font-mono text-xs">&#8594;</span>
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-[2px] bg-[#0b1c30] border border-[#1b2b3f]">
                                <span className="text-[10px] font-mono text-[#8f9097] uppercase">Au</span>
                                <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} className="bg-transparent border-0 p-0 text-xs font-mono text-[#d3e4fe] focus:ring-0 focus:outline-none w-32" />
                            </div>
                        </div>
                        <button className="flex items-center gap-1.5 px-3 py-2 rounded-[2px] bg-[#102034] hover:bg-[#1b2b3f] border border-[#1b2b3f] text-[#acc7ff] font-sans font-medium text-xs transition-colors" type="button">
                            <Icon name="download" size={16} />
                            <span>Exporter PDF</span>
                        </button>
                    </div>
                </section>

                {/* KPIs */}
                <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                        { label:'ENS Cumulee', value:`${totalENS.toLocaleString('fr-FR')} MWh`, icon:'trending_down', iconCls:'text-[#acc7ff]', sub:'Sur la periode selectionnee', subCls:'text-[#acc7ff]' }
                        ,{ label:'Duree Totale Delestage', value:'62h 40min', icon:'schedule', iconCls:'text-[#acc7ff]', sub:'Moy: 3h55 / evenement', subCls:'text-[#c5c6cd]' }
                        ,{ label:"Indice d'Equite CRC Nord", value:`${equiteAvg} / 100`, icon:'balance', iconCls:'text-[#ffb95f]', sub: equiteAvg < 80 ? 'Rotation desequilibree' : 'Rotation acceptable', subCls: equiteAvg < 80 ? 'text-[#ffb95f]' : 'text-[#4ade80]', badge: equiteAvg < 80 ? 'VIGILANCE < 80' : null }
                    ].map(({ label, value, icon, iconCls, sub, subCls, badge }) => (
                        <div key={label} className="bg-[#0b1c30] p-4 rounded-[2px] border border-[#1b2b3f] flex flex-col justify-between">
                            <div className="flex items-center justify-between text-[#8f9097]">
                                <span className="font-sans text-[11px] font-semibold uppercase tracking-wider">{label}</span>
                                <Icon name={icon} size={18} className={iconCls} />
                            </div>
                            <div className="my-3 flex items-baseline gap-2.5">
                                <div className="font-mono text-3xl font-bold text-[#d3e4fe] tracking-tight">{value}</div>
                                {badge && <span className="px-2 py-0.5 rounded-[2px] bg-[#231200] text-[#ffb95f] border border-[#ffb95f]/40 font-mono text-[11px] font-semibold">{badge}</span>}
                            </div>
                            <div className="flex items-center justify-between font-mono text-[11px] text-[#8f9097] pt-2 border-t border-[#1b2b3f]">
                                <span>Periode d'audit</span>
                                <span className={subCls}>{sub}</span>
                            </div>
                        </div>
                    ))}
                </section>

                {/* BCC table */}
                <section className="bg-[#0b1c30] rounded-[2px] border border-[#1b2b3f] p-4 flex flex-col gap-4 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#1b2b3f]">
                        <div className="flex items-center gap-2">
                            <Icon name="analytics" size={18} className="text-[#acc7ff]" />
                            <h2 className="font-sans font-semibold text-xs text-[#d3e4fe] uppercase tracking-wide">
                                Bilan par BCC — CRC Nord
                            </h2>
                            <span className="px-2 py-0.5 rounded-[2px] bg-[#000f21] text-[#8f9097] font-mono text-[10px] border border-[#1b2b3f]">4 BCCs</span>
                        </div>
                        <div className="flex items-center gap-3 font-mono text-[10px] text-[#8f9097]">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ffb4ab]" /> Indice &lt; 70</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#ffb95f]" /> 70–84</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#4ade80]" /> &ge; 85</span>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left font-sans text-xs border-collapse">
                            <thead>
                                <tr className="border-b border-[#1b2b3f] bg-[#000f21] font-mono text-[10px] text-[#8f9097] uppercase">
                                    <th className="py-2.5 px-3">Zone BCC</th>
                                    <th className="py-2.5 px-3 text-right">Nb Evenements</th>
                                    <th className="py-2.5 px-3 text-right">MW Planifie</th>
                                    <th className="py-2.5 px-3 text-right">MW Realise</th>
                                    <th className="py-2.5 px-3 text-right">Ecart</th>
                                    <th className="py-2.5 px-3 text-right">ENS Cumulee</th>
                                    <th className="py-2.5 px-3 text-right">Duree Totale</th>
                                    <th className="py-2.5 px-3 text-center">Dernier Delestage</th>
                                    <th className="py-2.5 px-3 text-center">Jours Depuis</th>
                                    <th className="py-2.5 px-3 text-center">Indice Equite</th>
                                    <th className="py-2.5 px-3 text-center">Detail</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#1b2b3f]/70 font-mono text-xs">
                                {ALL_BCCS.map((b) =>
                                {
                                    const ecart   = b.totalReal - b.totalPlan
                                    const isCrit  = b.equite < 60
                                    const isWarn  = b.equite < 80 && !isCrit
                                    const equiteCls = b.equite >= 85 ? 'text-[#4ade80] border-[#16a34a]/40' : b.equite >= 70 ? 'text-[#ffb95f] border-[#ffb95f]/40' : 'text-[#ffb4ab] border-[#ffb4ab]/60'

                                    return (
                                        <tr key={b.key} className={`hover:bg-[#102034]/60 transition-colors ${isCrit ? 'bg-[#93000a]/5' : ''}`}>
                                            <td className={`py-2 px-3 font-sans font-semibold ${isCrit ? 'text-[#ffb4ab]' : isWarn ? 'text-[#ffb95f]' : 'text-[#d3e4fe]'}`}>{b.label}</td>
                                            <td className="py-2 px-3 text-right text-[#c5c6cd]">{b.evenements}</td>
                                            <td className="py-2 px-3 text-right text-[#8f9097]">{b.totalPlan} MW</td>
                                            <td className="py-2 px-3 text-right text-[#d3e4fe] font-semibold">{b.totalReal} MW</td>
                                            <td className={`py-2 px-3 text-right font-semibold ${ecart < -50 ? 'text-[#ffb4ab]' : ecart < -10 ? 'text-[#ffb95f]' : 'text-[#4ade80]'}`}>
                                                {ecart >= 0 ? '+' : ''}{ecart} MW
                                            </td>
                                            <td className={`py-2 px-3 text-right font-bold ${isCrit ? 'text-[#ffb4ab]' : isWarn ? 'text-[#ffb95f]' : 'text-[#acc7ff]'}`}>
                                                {b.ensMWh.toLocaleString('fr-FR')} MWh
                                            </td>
                                            <td className="py-2 px-3 text-right text-[#c5c6cd]">{b.dureeTotale}</td>
                                            <td className="py-2 px-3 text-center text-[#8f9097]">{b.dernierDate}</td>
                                            <td className="py-2 px-3 text-center">
                                                {b.joursSince === 0
                                                    ? <span className="px-1.5 py-0.5 rounded-[2px] bg-[#93000a]/40 text-[#ffb4ab] border border-[#ffb4ab]/40 font-bold">Aujourd'hui</span>
                                                    : b.joursSince <= 2
                                                        ? <span className="px-1.5 py-0.5 rounded-[2px] bg-[#93000a]/30 text-[#ffb4ab] border border-[#ffb4ab]/40 font-bold">{b.joursSince} j</span>
                                                        : <span className="font-mono text-[10px] text-[#8f9097]">{b.joursSince} j</span>
                                                }
                                            </td>
                                            <td className="py-2 px-3 text-center">
                                                <span className={`inline-block px-2 py-0.5 rounded-[2px] bg-[#000f21] border font-bold text-[10px] ${equiteCls}`}>
                                                    {b.equite} / 100
                                                </span>
                                            </td>
                                            <td className="py-2 px-3 text-center">
                                                <button
                                                    onClick={() => setModalKey(b.key)}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] bg-[#000f21] hover:bg-[#1b2b3f] text-[#acc7ff] border border-[#1b2b3f] transition-colors font-sans text-[10px]"
                                                    type="button"
                                                >
                                                    <Icon name="open_in_new" size={12} />
                                                    <span>Voir</span>
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="bg-[#000f21] border-t-2 border-[#1b2b3f] font-mono text-xs font-bold text-[#d3e4fe]">
                                    <td className="py-3 px-3 uppercase tracking-wider font-sans">Total CRC Nord (4 BCCs)</td>
                                    <td className="py-3 px-3 text-right text-[#acc7ff]">{totalEvents} coupures</td>
                                    <td className="py-3 px-3 text-right text-[#d3e4fe]">{ALL_BCCS.reduce((s,b) => s+b.totalPlan,0)} MW</td>
                                    <td className="py-3 px-3 text-right text-[#d3e4fe]">{ALL_BCCS.reduce((s,b) => s+b.totalReal,0)} MW</td>
                                    <td className="py-3 px-3 text-right text-[#ffb4ab]">{ALL_BCCS.reduce((s,b) => s+(b.totalReal-b.totalPlan),0)} MW</td>
                                    <td className="py-3 px-3 text-right text-[#ffb95f]">{totalENS.toLocaleString('fr-FR')} MWh</td>
                                    <td className="py-3 px-3 text-right text-[#acc7ff]">62h 40min</td>
                                    <td colSpan={3} className="py-3 px-3 text-center text-[#8f9097]">—</td>
                                    <td className="py-3 px-3 text-center">
                                        <span className={`inline-block px-2.5 py-0.5 rounded-[2px] border font-bold text-[10px] ${equiteAvg < 80 ? 'bg-[#231200] text-[#ffb95f] border-[#ffb95f]' : 'bg-[#000f21] text-[#4ade80] border-[#16a34a]/40'}`}>
                                            {equiteAvg} / 100
                                        </span>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {equiteAvg < 80 && (
                        <div className="p-3 rounded-[2px] bg-[#231200]/90 border border-[#ffb95f]/50 flex items-start gap-3">
                            <Icon name="warning" size={20} className="text-[#ffb95f] shrink-0 mt-0.5" />
                            <div className="flex flex-col gap-0.5 text-xs">
                                <span className="font-sans font-bold text-[#ffb95f] uppercase tracking-wide">
                                    Attention : Indice d'equite CRC Nord &lt; 80 ({equiteAvg}/100).
                                </span>
                                <p className="font-sans text-[#d3e4fe] leading-relaxed">
                                    <span className="font-semibold text-[#ffb4ab]">BCC 3 (Nord-Ouest)</span> est sur-sollicite (68/100).
                                    Recommandation : Revoir la repartition dans le prochain programme J+1.
                                </p>
                            </div>
                        </div>
                    )}
                </section>
            </div>

            {modalKey && <BCCDetailModal bccKey={modalKey} onClose={() => setModalKey(null)} />}
        </div>
    )
}
