import { useState, useMemo, useCallback, useEffect } from 'react'
import api from '../../lib/api'

// ── Icon helper ───────────────────────────────────────────────────────────────
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

// ── BCC data ──────────────────────────────────────────────────────────────────
const BCC_DATA =
{
    'BCC 1':
    {
        label:  'BCC 1 — Grand Tunis Nord'
        ,crc:   'CRC Nord'
        ,kpis:  { plan: '280,0 MW', real: '278,2 MW', ecart: '-1,8 MW (-0,6 %)', ens: '1 240,0 MWh' }
        ,poste: 'Poste Source La Goulette 225/30 kV'
        ,departs:
        [
            { ref: 'F01', nom: 'Hopital Militaire Tunis',     p: 'P0', mwCoupe: '0,0',  statut: 'Protege — NON deleste'  }
            ,{ ref: 'F03', nom: 'Zone Portuaire Rades',       p: 'P3', mwCoupe: '4,5',  statut: 'Retabli (15h40)'        }
            ,{ ref: 'F05', nom: 'Le Kram Centre',             p: 'P4', mwCoupe: '3,2',  statut: 'Retabli (15h20)'        }
            ,{ ref: 'F08', nom: 'La Marsa Residentiel',       p: 'P2', mwCoupe: '2,8',  statut: 'Retabli (16h10)'        }
            ,{ ref: 'F12', nom: 'Carthage Presidence',        p: 'P0', mwCoupe: '0,0',  statut: 'Protege — NON deleste'  }
        ]
        ,cuts:
        [
            { date: '28/08/2025', ref: 'F03', nom: 'Zone Portuaire Rades',   slot: '11h00 — 15h40 (4h40)', mw: '4,5 MW' }
            ,{ date: '28/08/2025', ref: 'F05', nom: 'Le Kram Centre',        slot: '12h00 — 15h20 (3h20)', mw: '3,2 MW' }
            ,{ date: '28/08/2025', ref: 'F08', nom: 'La Marsa Residentiel',  slot: '13h00 — 16h10 (3h10)', mw: '2,8 MW' }
            ,{ date: '22/08/2025', ref: 'F03', nom: 'Zone Portuaire Rades',  slot: '10h30 — 14h00 (3h30)', mw: '4,2 MW' }
            ,{ date: '18/08/2025', ref: 'F05', nom: 'Le Kram Centre',        slot: '12h00 — 15h00 (3h00)', mw: '3,0 MW' }
            ,{ date: '14/08/2025', ref: 'F08', nom: 'La Marsa Residentiel',  slot: '11h30 — 14h30 (3h00)', mw: '2,6 MW' }
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
            { ref: 'F02', nom: 'Centre Traumatologie Ben Arous', p: 'P0', mwCoupe: '0,0', statut: 'Protege — NON deleste' }
            ,{ ref: 'F04', nom: 'ZI Ben Arous Ouest',            p: 'P3', mwCoupe: '5,1', statut: 'Retabli (16h00)'       }
            ,{ ref: 'F06', nom: 'Mornag Sud',                    p: 'P2', mwCoupe: '3,4', statut: 'Retabli (15h30)'       }
            ,{ ref: 'F11', nom: 'Fouchana Peri-urbain',          p: 'P4', mwCoupe: '4,0', statut: 'Retabli (16h15)'       }
        ]
        ,cuts:
        [
            { date: '29/08/2025', ref: 'F04', nom: 'ZI Ben Arous Ouest', slot: '12h00 — 16h00 (4h00)', mw: '5,1 MW' }
            ,{ date: '29/08/2025', ref: 'F06', nom: 'Mornag Sud',        slot: '12h30 — 15h30 (3h00)', mw: '3,4 MW' }
            ,{ date: '29/08/2025', ref: 'F11', nom: 'Fouchana Peri-urbain', slot: '13h00 — 16h15 (3h15)', mw: '4,0 MW' }
            ,{ date: '20/08/2025', ref: 'F04', nom: 'ZI Ben Arous Ouest', slot: '11h00 — 14h30 (3h30)', mw: '4,8 MW' }
            ,{ date: '15/08/2025', ref: 'F06', nom: 'Mornag Sud',        slot: '12h00 — 15h00 (3h00)', mw: '3,1 MW' }
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
            { ref: 'F02', nom: 'Hopital Regional Beja',    p: 'P0', mwCoupe: '0,0', statut: 'Protege — NON deleste' }
            ,{ ref: 'F07', nom: 'Zone Industrielle Beja Nord', p: 'P3', mwCoupe: '4,2', statut: 'Retabli (16h28)' }
            ,{ ref: 'F09', nom: 'Faubourg Est & Ouestlatia',   p: 'P4', mwCoupe: '3,8', statut: 'Retabli (16h30)' }
            ,{ ref: 'F14', nom: 'Station Pompage SONEDE',   p: 'P0', mwCoupe: '0,0', statut: 'Protege — NON deleste' }
            ,{ ref: 'F18', nom: 'Nefza Rural',              p: 'P2', mwCoupe: '2,6', statut: 'Retabli (16h15)' }
        ]
        ,cuts:
        [
            { date: '03/09/2025', ref: 'F07', nom: 'Zone Industrielle Beja Nord', slot: '12h00 — 16h28 (4h28)', mw: '4,2 MW' }
            ,{ date: '03/09/2025', ref: 'F09', nom: 'Faubourg Est & Ouestlatia',  slot: '12h00 — 16h30 (4h30)', mw: '3,8 MW' }
            ,{ date: '03/09/2025', ref: 'F18', nom: 'Nefza Rural',                slot: '12h30 — 16h15 (3h45)', mw: '2,6 MW' }
            ,{ date: '01/09/2025', ref: 'F07', nom: 'Zone Industrielle Beja Nord', slot: '13h00 — 17h00 (4h00)', mw: '4,0 MW' }
            ,{ date: '30/08/2025', ref: 'F09', nom: 'Faubourg Est & Ouestlatia',  slot: '11h30 — 15h30 (4h00)', mw: '3,7 MW' }
            ,{ date: '28/08/2025', ref: 'F18', nom: 'Nefza Rural',                slot: '12h00 — 16h00 (4h00)', mw: '2,5 MW' }
            ,{ date: '26/08/2025', ref: 'F07', nom: 'Zone Industrielle Beja Nord', slot: '12h00 — 15h45 (3h45)', mw: '4,1 MW' }
            ,{ date: '24/08/2025', ref: 'F09', nom: 'Faubourg Est & Ouestlatia',  slot: '13h00 — 16h30 (3h30)', mw: '3,6 MW' }
            ,{ date: '21/08/2025', ref: 'F18', nom: 'Nefza Rural',                slot: '12h15 — 16h00 (3h45)', mw: '2,4 MW' }
            ,{ date: '18/08/2025', ref: 'F07', nom: 'Zone Industrielle Beja Nord', slot: '11h45 — 16h15 (4h30)', mw: '3,9 MW' }
            ,{ date: '15/08/2025', ref: 'F09', nom: 'Faubourg Est & Ouestlatia',  slot: '12h00 — 15h30 (3h30)', mw: '3,5 MW' }
            ,{ date: '12/08/2025', ref: 'F18', nom: 'Nefza Rural',                slot: '13h00 — 16h45 (3h45)', mw: '2,6 MW' }
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
            { ref: 'F01', nom: 'Hopital Regional Mateur',      p: 'P0', mwCoupe: '0,0', statut: 'Protege — NON deleste' }
            ,{ ref: 'F04', nom: 'Mateur Sud Agglomeration',    p: 'P3', mwCoupe: '3,1', statut: 'Retabli (15h45)' }
            ,{ ref: 'F06', nom: 'Tindja ZI',                   p: 'P2', mwCoupe: '2,9', statut: 'Retabli (15h30)' }
        ]
        ,cuts:
        [
            { date: '26/08/2025', ref: 'F04', nom: 'Mateur Sud Agglomeration', slot: '12h00 — 15h45 (3h45)', mw: '3,1 MW' }
            ,{ date: '26/08/2025', ref: 'F06', nom: 'Tindja ZI',               slot: '12h30 — 15h30 (3h00)', mw: '2,9 MW' }
            ,{ date: '19/08/2025', ref: 'F04', nom: 'Mateur Sud Agglomeration', slot: '11h30 — 14h30 (3h00)', mw: '3,0 MW' }
            ,{ date: '11/08/2025', ref: 'F06', nom: 'Tindja ZI',               slot: '13h00 — 15h30 (2h30)', mw: '2,8 MW' }
        ]
    }
    ,'BCC 5':
    {
        label:  'BCC 5 — Centre (Kairouan / Sidi Bouzid)'
        ,crc:   'CRC Sud'
        ,kpis:  { plan: '940,0 MW', real: '868,0 MW', ecart: '-72,0 MW (-7,7 %)', ens: '3 980,0 MWh' }
        ,poste: 'Poste Source Kairouan Sud 225/150/30 kV'
        ,departs:
        [
            { ref: 'F01', nom: 'CHU Ibn El Jazzar',              p: 'P0', mwCoupe: '0,0', statut: 'Protege — NON deleste' }
            ,{ ref: 'F03', nom: 'Sidi Bouzid Ville',             p: 'P2', mwCoupe: '4,6', statut: 'Retabli (16h50)' }
            ,{ ref: 'F05', nom: 'Kairouan Ouest Agricole',       p: 'P1', mwCoupe: '5,2', statut: 'Retabli (17h00)' }
            ,{ ref: 'F08', nom: 'Regueb Stations Forages',       p: 'P3', mwCoupe: '3,8', statut: 'Retabli (16h40)' }
            ,{ ref: 'F11', nom: 'Haffouz Rural',                 p: 'P2', mwCoupe: '3,1', statut: 'Retabli (16h10)' }
            ,{ ref: 'F15', nom: 'Station Pompage Canal Medjerda', p: 'P0', mwCoupe: '0,0', statut: 'Protege — NON deleste' }
        ]
        ,cuts:
        [
            { date: '03/09/2025', ref: 'F03', nom: 'Sidi Bouzid Ville',       slot: '11h30 — 16h50 (5h20)', mw: '4,6 MW' }
            ,{ date: '03/09/2025', ref: 'F05', nom: 'Kairouan Ouest Agricole', slot: '11h00 — 17h00 (6h00)', mw: '5,2 MW' }
            ,{ date: '03/09/2025', ref: 'F08', nom: 'Regueb Stations Forages', slot: '12h00 — 16h40 (4h40)', mw: '3,8 MW' }
            ,{ date: '02/09/2025', ref: 'F11', nom: 'Haffouz Rural',           slot: '12h30 — 16h10 (3h40)', mw: '3,1 MW' }
            ,{ date: '01/09/2025', ref: 'F03', nom: 'Sidi Bouzid Ville',       slot: '12h00 — 16h30 (4h30)', mw: '4,5 MW' }
            ,{ date: '31/08/2025', ref: 'F05', nom: 'Kairouan Ouest Agricole', slot: '11h30 — 16h45 (5h15)', mw: '5,0 MW' }
            ,{ date: '29/08/2025', ref: 'F08', nom: 'Regueb Stations Forages', slot: '13h00 — 17h00 (4h00)', mw: '3,7 MW' }
            ,{ date: '27/08/2025', ref: 'F11', nom: 'Haffouz Rural',           slot: '12h00 — 15h40 (3h40)', mw: '3,0 MW' }
            ,{ date: '25/08/2025', ref: 'F03', nom: 'Sidi Bouzid Ville',       slot: '11h00 — 16h00 (5h00)', mw: '4,4 MW' }
            ,{ date: '23/08/2025', ref: 'F05', nom: 'Kairouan Ouest Agricole', slot: '12h00 — 16h30 (4h30)', mw: '5,1 MW' }
            ,{ date: '21/08/2025', ref: 'F08', nom: 'Regueb Stations Forages', slot: '12h30 — 16h15 (3h45)', mw: '3,6 MW' }
            ,{ date: '19/08/2025', ref: 'F11', nom: 'Haffouz Rural',           slot: '13h00 — 16h30 (3h30)', mw: '2,9 MW' }
        ]
    }
    ,'BCC 6':
    {
        label:  'BCC 6 — Sahel (Sousse / Monastir)'
        ,crc:   'CRC Sud'
        ,kpis:  { plan: '480,0 MW', real: '462,0 MW', ecart: '-18,0 MW (-3,75 %)', ens: '1 860,0 MWh' }
        ,poste: 'Poste Source Sousse Nord 150/30 kV'
        ,departs:
        [
            { ref: 'F02', nom: 'CHU Sahloul Sousse',              p: 'P0', mwCoupe: '0,0', statut: 'Protege — NON deleste' }
            ,{ ref: 'F04', nom: 'Monastir Aeroport',              p: 'P0', mwCoupe: '0,0', statut: 'Protege — NON deleste' }
            ,{ ref: 'F07', nom: 'Zone Hoteliere Port El Kantaoui', p: 'P3', mwCoupe: '4,8', statut: 'Retabli (16h10)' }
            ,{ ref: 'F09', nom: 'Kalaa Kebira Centre',            p: 'P2', mwCoupe: '3,5', statut: 'Retabli (15h50)' }
            ,{ ref: 'F12', nom: 'Moknine Artisanat',              p: 'P4', mwCoupe: '2,7', statut: 'Retabli (15h30)' }
        ]
        ,cuts:
        [
            { date: '02/09/2025', ref: 'F07', nom: 'Zone Hoteliere Port El Kantaoui', slot: '12h30 — 16h10 (3h40)', mw: '4,8 MW' }
            ,{ date: '02/09/2025', ref: 'F09', nom: 'Kalaa Kebira Centre',            slot: '13h00 — 15h50 (2h50)', mw: '3,5 MW' }
            ,{ date: '02/09/2025', ref: 'F12', nom: 'Moknine Artisanat',              slot: '12h00 — 15h30 (3h30)', mw: '2,7 MW' }
            ,{ date: '29/08/2025', ref: 'F07', nom: 'Zone Hoteliere Port El Kantaoui', slot: '12h00 — 15h40 (3h40)', mw: '4,5 MW' }
            ,{ date: '25/08/2025', ref: 'F09', nom: 'Kalaa Kebira Centre',            slot: '13h30 — 16h30 (3h00)', mw: '3,3 MW' }
            ,{ date: '22/08/2025', ref: 'F12', nom: 'Moknine Artisanat',              slot: '11h30 — 15h00 (3h30)', mw: '2,6 MW' }
            ,{ date: '18/08/2025', ref: 'F07', nom: 'Zone Hoteliere Port El Kantaoui', slot: '12h00 — 15h30 (3h30)', mw: '4,6 MW' }
            ,{ date: '14/08/2025', ref: 'F09', nom: 'Kalaa Kebira Centre',            slot: '12h45 — 16h00 (3h15)', mw: '3,4 MW' }
            ,{ date: '10/08/2025', ref: 'F12', nom: 'Moknine Artisanat',              slot: '11h00 — 14h30 (3h30)', mw: '2,5 MW' }
            ,{ date: '06/08/2025', ref: 'F07', nom: 'Zone Hoteliere Port El Kantaoui', slot: '12h00 — 15h15 (3h15)', mw: '4,4 MW' }
        ]
    }
    ,'BCC 7':
    {
        label:  'BCC 7 — Sud (Sfax / Gabes / Gafsa)'
        ,crc:   'CRC Sud'
        ,kpis:  { plan: '760,0 MW', real: '722,0 MW', ecart: '-38,0 MW (-5,0 %)', ens: '3 120,0 MWh' }
        ,poste: 'Poste Source Thyna / Sfax 225/150/30 kV'
        ,departs:
        [
            { ref: 'F01', nom: 'CHU Hedi Chaker Sfax',        p: 'P0', mwCoupe: '0,0', statut: 'Protege — NON deleste' }
            ,{ ref: 'F03', nom: 'Complexe Chimique Gabes',    p: 'P0', mwCoupe: '0,0', statut: 'Protege — NON deleste' }
            ,{ ref: 'F05', nom: 'Sfax Poudriere Industrielle', p: 'P3', mwCoupe: '5,4', statut: 'Retabli (16h50)' }
            ,{ ref: 'F08', nom: 'Gafsa Mines Nord',           p: 'P2', mwCoupe: '4,2', statut: 'Retabli (16h30)' }
            ,{ ref: 'F10', nom: 'Gabes Sud Urbain',           p: 'P3', mwCoupe: '3,6', statut: 'Retabli (16h15)' }
            ,{ ref: 'F14', nom: 'Metlaoui Oasis',             p: 'P1', mwCoupe: '2,9', statut: 'Retabli (15h50)' }
        ]
        ,cuts:
        [
            { date: '03/09/2025', ref: 'F05', nom: 'Sfax Poudriere Industrielle', slot: '11h00 — 16h50 (5h50)', mw: '5,4 MW' }
            ,{ date: '03/09/2025', ref: 'F08', nom: 'Gafsa Mines Nord',           slot: '12h00 — 16h30 (4h30)', mw: '4,2 MW' }
            ,{ date: '03/09/2025', ref: 'F10', nom: 'Gabes Sud Urbain',           slot: '12h30 — 16h15 (3h45)', mw: '3,6 MW' }
            ,{ date: '02/09/2025', ref: 'F14', nom: 'Metlaoui Oasis',             slot: '13h00 — 15h50 (2h50)', mw: '2,9 MW' }
            ,{ date: '01/09/2025', ref: 'F05', nom: 'Sfax Poudriere Industrielle', slot: '11h30 — 16h30 (5h00)', mw: '5,1 MW' }
            ,{ date: '30/08/2025', ref: 'F08', nom: 'Gafsa Mines Nord',           slot: '12h00 — 16h00 (4h00)', mw: '4,0 MW' }
            ,{ date: '28/08/2025', ref: 'F10', nom: 'Gabes Sud Urbain',           slot: '12h15 — 16h00 (3h45)', mw: '3,5 MW' }
            ,{ date: '26/08/2025', ref: 'F14', nom: 'Metlaoui Oasis',             slot: '11h45 — 15h30 (3h45)', mw: '2,8 MW' }
            ,{ date: '24/08/2025', ref: 'F05', nom: 'Sfax Poudriere Industrielle', slot: '12h00 — 16h15 (4h15)', mw: '5,3 MW' }
            ,{ date: '22/08/2025', ref: 'F08', nom: 'Gafsa Mines Nord',           slot: '13h00 — 16h45 (3h45)', mw: '4,1 MW' }
            ,{ date: '19/08/2025', ref: 'F10', nom: 'Gabes Sud Urbain',           slot: '12h30 — 16h00 (3h30)', mw: '3,4 MW' }
            ,{ date: '17/08/2025', ref: 'F14', nom: 'Metlaoui Oasis',             slot: '11h30 — 15h15 (3h45)', mw: '2,7 MW' }
        ]
    }
}

const PAGE_SIZE = 10

function parseDateFR(d)
{
    const p = d.split('/')
    if (p.length === 3) return new Date(p[2], p[1] - 1, p[0]).getTime()
    return 0
}

// ── P0 priority badge ─────────────────────────────────────────────────────────
function P0Badge()
{
    return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] bg-[#93000a] text-[#ffdad6] font-bold text-[10px] border border-[#ffb4ab]/40">
            <Icon name="lock" size={11} />
            <span>P0 (VERROUILLE)</span>
        </span>
    )
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function BCCDetailModal({ bccKey, onClose, activePeriod, apiOverride })
{
    const [sortAsc,    setSortAsc]    = useState(false)
    const [filterRef,  setFilterRef]  = useState('tous')
    const [page,       setPage]       = useState(1)

    // Use API data if available, otherwise fall back to static BCC_DATA
    const bcc = apiOverride ?? BCC_DATA[bccKey]
    if (!bcc) return null

    // ── Apply date filter — only used for static fallback ─────────────────────
    const filteredCuts = useMemo
    (
        () =>
        {
            // API override already has filtered cuts (from the /historique call)
            if (apiOverride) return apiOverride.cuts
            if (!activePeriod) return bcc.cuts
            const { from, to } = activePeriod
            return bcc.cuts.filter
            (
                (c) =>
                {
                    const ts = parseDateFR(c.date)
                    return ts >= from && ts <= to
                }
            )
        }
        ,[bcc, activePeriod, apiOverride]
    )

    // Unique refs from cuts (no P0 ever in cuts)
    const uniqueRefs = useMemo
    (
        () =>
        {
            const seen = new Set()
            const out  = []
            filteredCuts.forEach
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
        ,[filteredCuts]
    )

    // Filtered + sorted cuts
    const processedCuts = useMemo
    (
        () =>
        {
            let result = [...filteredCuts]
            if (filterRef !== 'tous') result = result.filter((c) => c.ref === filterRef)
            result.sort
            (
                (a, b) =>
                {
                    const diff = parseDateFR(a.date) - parseDateFR(b.date)
                    return sortAsc ? diff : -diff
                }
            )
            return result
        }
        ,[filteredCuts, filterRef, sortAsc]
    )

    const totalPages  = Math.max(1, Math.ceil(processedCuts.length / PAGE_SIZE))
    const safePage    = Math.min(page, totalPages)
    const startIdx    = (safePage - 1) * PAGE_SIZE
    const endIdx      = Math.min(startIdx + PAGE_SIZE, processedCuts.length)
    const paginated   = processedCuts.slice(startIdx, endIdx)

    const handleFilter = (val) =>
    {
        setFilterRef(val)
        setPage(1)
    }

    const handleSort = () =>
    {
        setSortAsc((v) => !v)
        setPage(1)
    }

    const ecartIsNeg = bcc.kpis.ecart.startsWith('-')

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="relative w-full max-w-5xl bg-[#0b1c30] border border-[#1b2b3f] rounded-[2px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-[#102034] border-b border-[#1b2b3f]">
                    <div className="flex items-center gap-2.5">
                        <Icon name="analytics" size={20} className="text-[#acc7ff]" />
                        <div>
                            <h3 className="font-sans font-bold text-sm text-[#d3e4fe]">
                                Detail Operationnel — {bcc.label} · {bcc.crc}
                            </h3>
                            <span className="font-mono text-[10px] text-[#8f9097]">
                                Horodatage audit SCADA · Comptage telemesuree certifie classe 0.2s
                            </span>
                        </div>
                    </div>
                    <button
                        className="p-1 rounded-[2px] hover:bg-[#1b2b3f] text-[#8f9097] hover:text-[#d3e4fe] transition-colors"
                        onClick={onClose}
                        title="Fermer"
                        type="button"
                    >
                        <Icon name="close" size={20} />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="p-4 overflow-y-auto flex flex-col gap-5">

                    {/* Section 1 — 4 KPIs */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-[#000f21] p-3 rounded-[2px] border border-[#1b2b3f] font-mono">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-[#8f9097] uppercase">MW Planifie</span>
                            <span className="text-base font-bold text-[#acc7ff]">{bcc.kpis.plan}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-[#8f9097] uppercase">MW Realise</span>
                            <span className="text-base font-bold text-[#d3e4fe]">{bcc.kpis.real}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-[#8f9097] uppercase">Ecart Residuel</span>
                            <span className={`text-base font-bold ${ecartIsNeg ? 'text-[#ffb4ab]' : 'text-[#4ade80]'}`}>
                                {bcc.kpis.ecart}
                            </span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-[#8f9097] uppercase">ENS Cumulee</span>
                            <span className="text-base font-bold text-[#ffb95f]">{bcc.kpis.ens}</span>
                        </div>
                    </div>

                    {/* Section 2 — Departs table */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <span className="font-sans text-[11px] font-semibold text-[#8f9097] uppercase tracking-wide">
                                DECOUPAGE PAR DEPART HTA MOBILISE ({bcc.poste.toUpperCase()})
                            </span>
                            <span className="font-mono text-[10px] text-[#8f9097]">
                                {bcc.departs.length} departs traces
                            </span>
                        </div>
                        <div className="overflow-x-auto border border-[#1b2b3f] rounded-[2px]">
                            <table className="w-full text-left font-sans text-xs border-collapse">
                                <thead>
                                    <tr className="bg-[#000f21] border-b border-[#1b2b3f] font-mono text-[10px] text-[#8f9097] uppercase">
                                        <th className="py-2 px-2.5">Ref. Depart</th>
                                        <th className="py-2 px-2.5">Zone / Quartier Couvert</th>
                                        <th className="py-2 px-2.5 text-center">Priorite Reseau</th>
                                        <th className="py-2 px-2.5 text-right">MW Coupe</th>
                                        <th className="py-2 px-2.5 text-right">Statut Teleconduite</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#1b2b3f] font-mono text-xs">
                                    {bcc.departs.map
                                    (
                                        (d) =>
                                        {
                                            const isP0 = d.p === 'P0'
                                            return (
                                                <tr
                                                    key={d.ref}
                                                    className={isP0
                                                        ? 'bg-[#93000a]/10 hover:bg-[#93000a]/20 transition-colors'
                                                        : 'hover:bg-[#102034] transition-colors'
                                                    }
                                                >
                                                    <td className="py-2 px-2.5 font-bold text-[#d3e4fe]">{d.ref}</td>
                                                    <td className={`py-2 px-2.5 font-sans ${isP0 ? 'font-medium text-[#d3e4fe]' : 'text-[#c5c6cd]'}`}>
                                                        {d.nom}
                                                    </td>
                                                    <td className="py-2 px-2.5 text-center">
                                                        {isP0
                                                            ? <P0Badge />
                                                            : <span className="px-1.5 py-0.5 rounded-[2px] bg-[#102034] text-[#acc7ff] border border-[#1b2b3f] text-[10px]">{d.p}</span>
                                                        }
                                                    </td>
                                                    <td className={`py-2 px-2.5 text-right font-bold ${isP0 ? 'text-[#4ade80]' : 'text-[#d3e4fe]'}`}>
                                                        {d.mwCoupe} MW
                                                    </td>
                                                    <td className="py-2 px-2.5 text-right">
                                                        {isP0
                                                            ? (
                                                                <span className="inline-flex items-center gap-1 font-semibold text-[#ffb4ab] text-[11px]">
                                                                    <Icon name="lock" size={13} />
                                                                    <span>Protege — NON deleste</span>
                                                                </span>
                                                            )
                                                            : (
                                                                <span className={d.statut.toLowerCase().includes('non') ? 'text-[#ffb4ab]' : 'text-[#4ade80]'}>
                                                                    {d.statut}
                                                                </span>
                                                            )
                                                        }
                                                    </td>
                                                </tr>
                                            )
                                        }
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-2 bg-[#000f21] border border-[#1b2b3f] rounded-[2px] font-mono text-[10px] text-[#8f9097] flex flex-wrap items-center justify-between gap-1">
                            <span>Regle d'exploitation : P0 = Infrastructure critique inviolable</span>
                            <span>P1–P5 = Departs mobilisables par ordre de priorite croissante</span>
                        </div>
                    </div>

                    {/* Section 3 — Cuts history */}
                    <div className="flex flex-col gap-2 pt-1 border-t border-[#1b2b3f]">
                        <span className="font-sans text-[11px] font-semibold text-[#d3e4fe] uppercase tracking-wide">
                            HISTORIQUE DES DELESTAGES — {activePeriod
                                ? `${new Date(activePeriod.from).toLocaleDateString('fr-FR')} → ${new Date(activePeriod.to).toLocaleDateString('fr-FR')}`
                                : 'Periode selectionnee'
                            } ({filteredCuts.length} evenement{filteredCuts.length !== 1 ? 's' : ''})
                        </span>

                        {/* Toolbar */}
                        <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-[2px] bg-[#000f21] border border-[#1b2b3f]">
                            <div className="flex items-center gap-2">
                                <button
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] bg-[#102034] hover:bg-[#1b2b3f] text-[#acc7ff] border border-[#1b2b3f] font-mono text-xs transition-colors"
                                    onClick={handleSort}
                                    type="button"
                                >
                                    <Icon name="swap_vert" size={14} />
                                    <span>{sortAsc ? 'Plus ancien en premier' : 'Plus recent en premier'}</span>
                                </button>
                                <div className="flex items-center gap-1.5 pl-2 border-l border-[#1b2b3f]">
                                    <label className="font-sans text-[10px] uppercase text-[#8f9097]">
                                        Filtrer :
                                    </label>
                                    <select
                                        className="bg-[#0b1c30] text-[#d3e4fe] border border-[#1b2b3f] rounded-[2px] px-2 py-0.5 text-xs font-mono focus:outline-none focus:border-[#0365cf]"
                                        value={filterRef}
                                        onChange={(e) => handleFilter(e.target.value)}
                                    >
                                        <option value="tous">Tous les departs</option>
                                        {uniqueRefs.map
                                        (
                                            (r) => (
                                                <option key={r.ref} value={r.ref}>
                                                    {r.ref} — {r.nom}
                                                </option>
                                            )
                                        )}
                                    </select>
                                </div>
                            </div>
                            <span className="font-mono text-xs text-[#8f9097]">
                                Page {safePage} / {totalPages}
                            </span>
                        </div>

                        {/* Cuts table */}
                        <div className="overflow-x-auto border border-[#1b2b3f] rounded-[2px]">
                            <table className="w-full text-left font-sans text-xs border-collapse">
                                <thead>
                                    <tr className="bg-[#000f21] border-b border-[#1b2b3f] font-mono text-[10px] text-[#8f9097] uppercase">
                                        <th className="py-2 px-2.5">Date</th>
                                        <th className="py-2 px-2.5">Ref. Depart</th>
                                        <th className="py-2 px-2.5">Nom du depart</th>
                                        <th className="py-2 px-2.5">Creneau</th>
                                        <th className="py-2 px-2.5 text-right">MW Gagnes</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#1b2b3f] font-mono text-xs">
                                    {paginated.length === 0
                                        ? (
                                            <tr>
                                                <td colSpan={5} className="py-4 text-center text-[#8f9097] font-mono">
                                                    Aucun evenement de delestage enregistre pour ce filtre.
                                                </td>
                                            </tr>
                                        )
                                        : paginated.map
                                        (
                                            (c, i) => (
                                                <tr key={i} className="hover:bg-[#102034] transition-colors">
                                                    <td className="py-2 px-2.5 text-[#acc7ff] font-medium">{c.date}</td>
                                                    <td className="py-2 px-2.5 font-bold text-[#d3e4fe]">{c.ref}</td>
                                                    <td className="py-2 px-2.5 font-sans text-[#c5c6cd]">{c.nom}</td>
                                                    <td className="py-2 px-2.5 text-[#8f9097]">{c.slot}</td>
                                                    <td className="py-2 px-2.5 text-right font-bold text-[#ffb95f]">{c.mw}</td>
                                                </tr>
                                            )
                                        )
                                    }
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination controls */}
                        <div className="flex items-center justify-between px-1 py-1 font-mono text-xs">
                            <button
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[2px] bg-[#102034] hover:bg-[#1b2b3f] disabled:opacity-40 disabled:pointer-events-none text-[#d3e4fe] border border-[#1b2b3f] transition-colors"
                                disabled={safePage <= 1}
                                onClick={() => setPage((p) => p - 1)}
                                type="button"
                            >
                                <Icon name="chevron_left" size={14} />
                                <span>Precedent</span>
                            </button>
                            <span className="text-[#8f9097] text-[11px]">
                                {processedCuts.length === 0
                                    ? 'Aucun evenement'
                                    : `Affichage de ${startIdx + 1} a ${endIdx} sur ${processedCuts.length} coupures`
                                }
                            </span>
                            <button
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[2px] bg-[#102034] hover:bg-[#1b2b3f] disabled:opacity-40 disabled:pointer-events-none text-[#d3e4fe] border border-[#1b2b3f] transition-colors"
                                disabled={safePage >= totalPages}
                                onClick={() => setPage((p) => p + 1)}
                                type="button"
                            >
                                <span>Suivant</span>
                                <Icon name="chevron_right" size={14} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Modal footer */}
                <div className="px-4 py-2.5 bg-[#102034] border-t border-[#1b2b3f] flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8f9097]">
                        <Icon name="verified" size={14} className="text-[#acc7ff]" />
                        <span>Registre audite DN Tunis · Signature horodatee</span>
                    </div>
                    <button
                        className="px-3 py-1.5 bg-[#000f21] hover:bg-[#1b2b3f] text-[#d3e4fe] border border-[#1b2b3f] rounded-[2px] font-sans text-xs transition-colors"
                        onClick={onClose}
                        type="button"
                    >
                        Fermer
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HistoriqueENS()
{
    // Default date range: today - 30 days → today
    const todayISO = useMemo
    (
        () =>
        {
            const d = new Date()
            return d.toISOString().slice(0, 10)
        }
        ,[]
    )
    const thirtyAgoISO = useMemo
    (
        () =>
        {
            const d = new Date()
            d.setDate(d.getDate() - 30)
            return d.toISOString().slice(0, 10)
        }
        ,[]
    )

    const [dateDebut,    setDateDebut]    = useState(thirtyAgoISO)
    const [dateFin,      setDateFin]      = useState(todayISO)
    const [activePeriod, setActivePeriod] = useState(null)
    const [modalKey,     setModalKey]     = useState(null)
    const [pdfLoading,   setPdfLoading]   = useState(false)

    // ── API data state ────────────────────────────────────────────────────────
    const [apiData,   setApiData]   = useState(null)   // response from /historique
    const [loading,   setLoading]   = useState(true)
    const [apiError,  setApiError]  = useState(null)

    // ── Fetch from backend ────────────────────────────────────────────────────
    const fetchHistorique = useCallback
    (
        async (from, to) =>
        {
            setLoading(true)
            setApiError(null)
            try
            {
                const params = new URLSearchParams({ date_from: from, date_to: to })
                const { data } = await api.get(`/api/v1/historique?${params}`)
                setApiData(data)
            }
            catch (err)
            {
                console.error('[HistoriqueENS] API error:', err)
                setApiError('Impossible de joindre le serveur. Données de démonstration affichées.')
                setApiData(null)
            }
            finally { setLoading(false) }
        }
        ,[]
    )

    // Load on mount with default 30-day range
    useEffect
    (
        () => { fetchHistorique(thirtyAgoISO, todayISO) }
        ,[fetchHistorique, thirtyAgoISO, todayISO]
    )

    // ── Print styles ──────────────────────────────────────────────────────────
    useEffect
    (
        () =>
        {
            const id  = 'steg-print-styles'
            if (document.getElementById(id)) return
            const style = document.createElement('style')
            style.id    = id
            style.textContent = `
                @media print {
                    header, aside, footer,
                    [class*="fixed"], [class*="sidebar"],
                    .no-print { display: none !important; }
                    body { background: white !important; color: black !important; }
                    main { padding: 0 !important; margin: 0 !important; }
                    #ens-report-content { padding: 16px !important; font-size: 10px !important; }
                    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    table { page-break-inside: auto; }
                    tr    { page-break-inside: avoid; }
                }
            `
            document.head.appendChild(style)
            return () => { const el = document.getElementById(id); if (el) el.remove() }
        }
        ,[]
    )

    // ── Appliquer: fetch with new date range ──────────────────────────────────
    const handleApply = useCallback
    (
        () =>
        {
            if (!dateDebut || !dateFin) return
            if (dateDebut > dateFin)
            {
                alert('La date de début doit être antérieure à la date de fin.')
                return
            }
            // Also keep activePeriod for the modal header badge
            setActivePeriod({
                from: new Date(dateDebut).setHours(0,  0,  0, 0)
                ,to:  new Date(dateFin).setHours(23, 59, 59, 999)
            })
            fetchHistorique(dateDebut, dateFin)
        }
        ,[dateDebut, dateFin, fetchHistorique]
    )

    // ── Count cuts per BCC — from API data or fall back to BCC_DATA ───────────
    const filteredCount = useCallback
    (
        (bccName) =>
        {
            if (apiData)
            {
                const bcc = apiData.bccs?.find((b) => b.bcc_name === bccName)
                return bcc?.total_cuts ?? 0
            }
            // Fallback to static mock
            const cuts = BCC_DATA[bccName]?.cuts ?? []
            if (!activePeriod) return cuts.length
            const { from, to } = activePeriod
            return cuts.filter((c) =>
            {
                const ts = parseDateFR(c.date)
                return ts >= from && ts <= to
            }).length
        }
        ,[apiData, activePeriod]
    )

    // ── Resolve BCC data for the modal — API first, static fallback ───────────
    // BCCDetailModal now accepts either a bccKey (for static) or bccApiData
    const getModalData = useCallback
    (
        (bccName) =>
        {
            if (!apiData) return null
            const bcc = apiData.bccs?.find((b) => b.bcc_name === bccName)
            if (!bcc) return null
            return {
                label:  `${bcc.bcc_name} — ${bcc.bcc_zone}`
                ,crc:   bcc.crc_name
                ,kpis:
                {
                    plan:  '—'
                    ,real: '—'
                    ,ecart:'—'
                    ,ens:  `${bcc.total_ens_mwh.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} MWh`
                }
                ,poste: `BCC ${bcc.bcc_name}`
                ,departs: []   // no depart detail in API response — kept from mock
                ,cuts: bcc.cuts.map((c) => ({
                    date:  c.date
                    ,ref:  c.feeder_ref
                    ,nom:  c.feeder_nom
                    ,slot: c.slot
                    ,mw:   `${c.mw_shed} MW`
                }))
            }
        }
        ,[apiData]
    )

    // ── Export PDF ────────────────────────────────────────────────────────────
    const handleExportPDF = useCallback
    (
        () =>
        {
            setPdfLoading(true)
            setTimeout
            (
                () =>
                {
                    window.print()
                    setPdfLoading(false)
                }
                ,200
            )
        }
        ,[]
    )

    // ── Derived national totals (API or static) ───────────────────────────────
    const nationals = useMemo
    (
        () =>
        {
            if (apiData?.national_totals)
            {
                const n = apiData.national_totals
                return {
                    ens:    n.total_ens_mwh.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' MWh'
                    ,durH:  Math.floor(n.total_duration_h)
                    ,durM:  Math.round((n.total_duration_h % 1) * 60)
                    ,equity: n.equity_score
                    ,cuts:   n.total_cuts
                }
            }
            return { ens: '14 280,0 MWh', durH: 127, durM: 30, equity: 73, cuts: 74 }
        }
        ,[apiData]
    )

    // ── getBcc: live row data for a BCC ───────────────────────────────────────
    const getBcc = useCallback((name) =>
    {
        const b = apiData?.bccs?.find((x) => x.bcc_name === name)
        if (!b || b.total_cuts === 0) return { hasData: false, cuts: 0, ens: '0,0 MWh', mwShed: '—', durH: 0, durM: 0, lastCut: '—', daysSince: '—', equity: null, ensCls: 'text-[#8f9097]' }
        const h = Math.floor(b.total_duration_h)
        const m = Math.round((b.total_duration_h % 1) * 60)
        return {
            hasData:   true
            ,cuts:     b.total_cuts
            ,ens:      `${b.total_ens_mwh.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} MWh`
            ,mwShed:   `${(b.total_mw_shed ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} MW`
            ,durH:     h
            ,durM:     m
            ,lastCut:  b.last_cut_date ?? '—'
            ,daysSince: b.days_since_last != null ? `${b.days_since_last} j` : '—'
            ,equity:   b.equity_score
            ,ensCls:   b.total_ens_mwh > 1000 ? 'text-[#ffb4ab]' : b.total_ens_mwh > 400 ? 'text-[#ffb95f]' : 'text-[#acc7ff]'
        }
    }, [apiData])

    // ── equityBadge ───────────────────────────────────────────────────────────
    const equityBadge = (score) =>
    {
        if (score === null) return <span className="text-[#8f9097]">—</span>
        const cls = score >= 85
            ? 'bg-[#000f21] text-[#4ade80] border-[#16a34a]/40'
            : score >= 70
                ? 'bg-[#000f21] text-[#ffb95f] border-[#ffb95f]/40'
                : 'bg-[#93000a]/30 text-[#ffb4ab] border-[#ffb4ab]/40'
        return <span className={`inline-block px-2 py-0.5 rounded-[2px] font-bold border ${cls}`}>{score} / 100</span>
    }

    // ── CRC subtotals ─────────────────────────────────────────────────────────
    const getCrcTotals = useCallback((names) =>
    {
        if (!apiData) return null
        const rows   = apiData.bccs?.filter((b) => names.includes(b.bcc_name)) ?? []
        const ens    = rows.reduce((s, b) => s + b.total_ens_mwh,     0)
        const mwShed = rows.reduce((s, b) => s + (b.total_mw_shed ?? 0), 0)
        const durH   = rows.reduce((s, b) => s + b.total_duration_h,  0)
        const cuts   = rows.reduce((s, b) => s + b.total_cuts,        0)
        const scores = rows.filter((b) => b.total_cuts > 0).map((b) => b.equity_score)
        return {
            ens:    cuts > 0 ? `${ens.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} MWh` : '0,0 MWh'
            ,mwShed: cuts > 0 ? `${mwShed.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} MW` : '—'
            ,durH:  Math.floor(durH)
            ,durM:  Math.round((durH % 1) * 60)
            ,equity: scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null
            ,cuts
        }
    }, [apiData])

    return (
        <div className="w-full min-h-full bg-[#031427] text-[#d3e4fe] font-sans text-xs">
            <div className="p-4 flex flex-col gap-4 max-w-[1720px] mx-auto" id="ens-report-content">

                {/* ── Page Header ─────────────────────────────────────────── */}
                <section className="bg-[#0b1c30] p-4 rounded-[2px] border border-[#1b2b3f] shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-[2px] bg-[#102034] border border-[#1b2b3f] flex items-center justify-center text-[#acc7ff] shrink-0">
                            <Icon name="query_stats" size={24} />
                        </div>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <h1 className="font-sans font-bold text-lg text-[#d3e4fe] tracking-tight">
                                    Analyse &amp; Historique ENS
                                </h1>
                                <span className="px-2 py-0.5 rounded-[2px] bg-[#102034] text-[#8f9097] font-mono text-[10px] uppercase border border-[#1b2b3f]">
                                    Outil Decisionnel · DN Tunis
                                </span>
                            </div>
                            <p className="font-sans text-xs text-[#8f9097] mt-0.5">
                                Pilotage strategique — Energie Non Distribuee et equite regionale
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 bg-[#000f21] p-1.5 rounded-[2px] border border-[#1b2b3f]">
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-[2px] bg-[#0b1c30] border border-[#1b2b3f]">
                                    <span className="text-[10px] font-mono text-[#8f9097] uppercase">Du</span>
                                    <input
                                        aria-label="Date de debut"
                                        className="bg-transparent border-0 p-0 text-xs font-mono text-[#d3e4fe] focus:ring-0 focus:outline-none w-32"
                                        type="date"
                                        value={dateDebut}
                                        onChange={(e) => setDateDebut(e.target.value)}
                                    />
                                </div>
                                <span className="text-[#8f9097] font-mono text-xs">&#8594;</span>
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-[2px] bg-[#0b1c30] border border-[#1b2b3f]">
                                    <span className="text-[10px] font-mono text-[#8f9097] uppercase">Au</span>
                                    <input
                                        aria-label="Date de fin"
                                        className="bg-transparent border-0 p-0 text-xs font-mono text-[#d3e4fe] focus:ring-0 focus:outline-none w-32"
                                        type="date"
                                        value={dateFin}
                                        onChange={(e) => setDateFin(e.target.value)}
                                    />
                                </div>
                                <button
                                    className="flex items-center gap-1 px-3 py-1 rounded-[2px] bg-[#0365cf] hover:bg-[#0365cf]/80 text-white font-sans font-medium text-xs transition-colors shadow-sm"
                                    onClick={handleApply}
                                    type="button"
                                >
                                    <Icon name="tune" size={15} />
                                    <span>Appliquer</span>
                                </button>
                            </div>
                            {/* Active period badge */}
                            {activePeriod && (
                                <div className="flex items-center gap-1.5 px-2 py-1 bg-[#0365cf]/20 border border-[#0365cf]/40 rounded-[2px] font-mono text-[10px] text-[#acc7ff]">
                                    <Icon name="filter_alt" size={12} />
                                    <span>
                                        {new Date(activePeriod.from).toLocaleDateString('fr-FR')} → {new Date(activePeriod.to).toLocaleDateString('fr-FR')}
                                    </span>
                                    <button
                                        onClick={() => setActivePeriod(null)}
                                        className="ml-1 text-[#acc7ff]/60 hover:text-[#acc7ff] transition-colors"
                                        title="Effacer le filtre"
                                        type="button"
                                    >
                                        <Icon name="close" size={11} />
                                    </button>
                                </div>
                            )}
                        </div>
                        <button
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-[2px] bg-[#102034] hover:bg-[#1b2b3f] border border-[#1b2b3f] text-[#acc7ff] font-sans font-medium text-xs transition-colors shadow-sm ${pdfLoading ? 'opacity-60 cursor-wait' : ''}`}
                            onClick={handleExportPDF}
                            disabled={pdfLoading}
                            type="button"
                        >
                            <Icon name="download" size={16} />
                            <span>{pdfLoading ? 'Préparation...' : 'Exporter rapport PDF'}</span>
                        </button>
                    </div>
                </section>

                {/* ── API status banner ───────────────────────────────────── */}
                {loading && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-[#102034] border border-[#1b2b3f] font-mono text-[10px] text-[#acc7ff]">
                        <Icon name="hourglass_empty" size={14} className="animate-spin" />
                        <span>Chargement des données depuis la base de données...</span>
                    </div>
                )}
                {apiError && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-[#231200] border border-[#ffb95f]/40 font-mono text-[10px] text-[#ffb95f]">
                        <Icon name="wifi_off" size={14} />
                        <span>{apiError}</span>
                    </div>
                )}
                {!loading && !apiError && apiData && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-[#000f21] border border-[#1b2b3f] font-mono text-[10px] text-[#8f9097]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
                        <span>
                            Données réelles · {apiData.period.from} → {apiData.period.to} ·{' '}
                            {nationals.cuts} coupures · {nationals.ens}
                        </span>
                    </div>
                )}

                {/* ── 3 KPI Cards ─────────────────────────────────────────── */}
                <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-[#0b1c30] p-4 rounded-[2px] border border-[#1b2b3f] flex flex-col justify-between">
                        <div className="flex items-center justify-between text-[#8f9097]">
                            <span className="font-sans text-[11px] font-semibold uppercase tracking-wider">ENS Cumulée</span>
                            <Icon name="trending_down" size={18} className="text-[#acc7ff]" />
                        </div>
                        <div className="my-3">
                            <div className="font-mono text-3xl font-bold text-[#d3e4fe] tracking-tight">
                                {loading
                                    ? <span className="text-[#8f9097]">—</span>
                                    : nationals.ens
                                }
                            </div>
                        </div>
                        <div className="flex items-center justify-between font-mono text-[11px] text-[#8f9097] pt-2 border-t border-[#1b2b3f]">
                            <span>Période d'audit</span>
                            <span className="text-[#acc7ff]">
                                {apiData ? `${nationals.cuts} coupures` : 'Sur la période sélectionnée'}
                            </span>
                        </div>
                    </div>

                    <div className="bg-[#0b1c30] p-4 rounded-[2px] border border-[#1b2b3f] flex flex-col justify-between">
                        <div className="flex items-center justify-between text-[#8f9097]">
                            <span className="font-sans text-[11px] font-semibold uppercase tracking-wider">Durée Totale Délestage</span>
                            <Icon name="schedule" size={18} className="text-[#acc7ff]" />
                        </div>
                        <div className="my-3">
                            <div className="font-mono text-3xl font-bold text-[#d3e4fe] tracking-tight">
                                {loading
                                    ? <span className="text-[#8f9097]">—</span>
                                    : <>{nationals.durH}<span className="text-base font-normal text-[#8f9097]">h</span>{' '}{nationals.durM}<span className="text-base font-normal text-[#8f9097]">min</span></>
                                }
                            </div>
                        </div>
                        <div className="flex items-center justify-between font-mono text-[11px] text-[#8f9097] pt-2 border-t border-[#1b2b3f]">
                            <span>Durée cumulée toutes coupures</span>
                            <span className="text-[#c5c6cd]">
                                {apiData && nationals.cuts > 0
                                    ? `Moy: ${Math.round(nationals.durH * 60 / nationals.cuts)}min / evt`
                                    : 'Moy: 4h15 / évt'
                                }
                            </span>
                        </div>
                    </div>

                    <div className="bg-[#0b1c30] p-4 rounded-[2px] border border-[#1b2b3f] flex flex-col justify-between">
                        <div className="flex items-center justify-between text-[#8f9097]">
                            <span className="font-sans text-[11px] font-semibold uppercase tracking-wider">Indice d'Equite National</span>
                            <Icon name="balance" size={18} className="text-[#ffb95f]" />
                        </div>
                        <div className="my-3 flex items-baseline gap-2.5">
                            <div className="font-mono text-3xl font-bold text-[#ffb95f] tracking-tight">
                                {loading ? <span className="text-[#8f9097]">—</span> : <>{nationals.equity} <span className="text-base font-normal text-[#8f9097]">/ 100</span></>}
                            </div>
                            <span className={`px-2 py-0.5 rounded-[2px] font-mono text-[11px] font-semibold tracking-wide border ${nationals.equity >= 85 ? 'bg-[#000f21] text-[#4ade80] border-[#4ade80]/40' : nationals.equity >= 70 ? 'bg-[#231200] text-[#ffb95f] border-[#ffb95f]/40' : 'bg-[#93000a]/40 text-[#ffb4ab] border-[#ffb4ab]/40'}`}>
                                {nationals.equity >= 85 ? 'CONFORME' : nationals.equity >= 70 ? 'VIGILANCE < 80' : 'CRITIQUE < 70'}
                            </span>
                        </div>
                        <div className="flex items-center justify-between font-mono text-[11px] text-[#8f9097] pt-2 border-t border-[#1b2b3f]">
                            <span>Diagnostic telemetrique</span>
                            <span className="text-[#ffb95f] font-semibold">Rotation desequilibree</span>
                        </div>
                    </div>
                </section>

                {/* ── CRC + BCC Table ──────────────────────────────────────── */}
                <section className="bg-[#0b1c30] rounded-[2px] border border-[#1b2b3f] p-4 flex flex-col gap-4 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#1b2b3f]">
                        <div className="flex items-center gap-2">
                            <Icon name="analytics" size={18} className="text-[#acc7ff]" />
                            <h2 className="font-sans font-semibold text-xs text-[#d3e4fe] uppercase tracking-wide">
                                Bilan d'Execution &amp; Equite Regionale par CRC et BCC
                            </h2>
                            <span className="px-2 py-0.5 rounded-[2px] bg-[#000f21] text-[#8f9097] font-mono text-[10px] border border-[#1b2b3f]">
                                2 CRCs · 7 BCCs Audites
                            </span>
                        </div>
                        <div className="flex items-center gap-3 font-mono text-[10px] text-[#8f9097]">
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-[#ffb4ab]" /> Indice &lt; 70 (Critique)
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-[#ffb95f]" /> 70–84 (Vigilance)
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-[#4ade80]" /> &ge; 85 (Conforme)
                            </span>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left font-sans text-xs border-collapse">
                            <thead>
                                <tr className="border-b border-[#1b2b3f] bg-[#000f21] font-mono text-[10px] text-[#8f9097] uppercase">
                                    <th className="py-2.5 px-3">Zone BCC</th>
                                    <th className="py-2.5 px-3 text-right">Nb Evenements</th>
                                    <th className="py-2.5 px-3 text-right">MW Planifie Total</th>
                                    <th className="py-2.5 px-3 text-right">MW Realise Total</th>
                                    <th className="py-2.5 px-3 text-right">Ecart Residuel</th>                                    <th className="py-2.5 px-3 text-right">ENS Cumulee</th>
                                    <th className="py-2.5 px-3 text-right">Duree Totale</th>
                                    <th className="py-2.5 px-3 text-center">Dernier Delestage</th>
                                    <th className="py-2.5 px-3 text-center">Jours Depuis</th>
                                    <th className="py-2.5 px-3 text-center">Indice d'Equite</th>
                                    <th className="py-2.5 px-3 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#1b2b3f]/70 font-mono text-xs">
                                {/* ── CRC NORD ───────────────────────────────── */}
                                {(() => {
                                    const nord = getCrcTotals(['BCC 1','BCC 2','BCC 3','BCC 4'])
                                    return (
                                        <tr className="bg-[#102034] border-t-2 border-b border-[#1b2b3f]">
                                            <td className="py-2.5 px-3 font-sans font-bold text-[#acc7ff]" colSpan={2}>
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2.5 h-2.5 rounded-full bg-[#acc7ff] shadow-[0_0_6px_#acc7ff]" />
                                                    <span className="text-xs uppercase tracking-wider">CRC Nord (Grand Tunis, Bizerte, Nord-Ouest)</span>
                                                </div>
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-bold text-[#8f9097]" title="Nécessite les données J+1">—</td>
                                            <td className="py-2.5 px-3 text-right font-bold text-[#d3e4fe]">{nord ? nord.mwShed : '—'}</td>
                                            <td className="py-2.5 px-3 text-right font-bold text-[#8f9097]" title="Nécessite les données J+1">—</td>
                                            <td className="py-2.5 px-3 text-right font-bold text-[#acc7ff]">{nord ? nord.ens : '—'}</td>
                                            <td className="py-2.5 px-3 text-right font-bold text-[#c5c6cd]">{nord && nord.cuts > 0 ? `${nord.durH}h ${nord.durM}min` : '—'}</td>
                                            <td className="py-2.5 px-3 text-center text-[#8f9097]" colSpan={2}>Sous-total CRC Nord</td>
                                            <td className="py-2.5 px-3 text-center">{equityBadge(nord?.equity ?? null)}</td>
                                            <td />
                                        </tr>
                                    )
                                })()}

                                {/* ── BCC rows — rendered dynamically ──────── */}
                                {[
                                    { key: 'BCC 1', label: 'BCC 1 — Grand Tunis Nord',                   alert: null           }
                                    ,{ key: 'BCC 2', label: 'BCC 2 — Tunis Sud / Ben Arous',             alert: null           }
                                    ,{ key: 'BCC 3', label: 'BCC 3 — Nord-Ouest (Béja / Jendouba)',      alert: 'INSPECTABLE'  }
                                    ,{ key: 'BCC 4', label: 'BCC 4 — Bizerte / Mateur',                  alert: null           }
                                ].map(({ key, label, alert }) => {
                                    const d = getBcc(key)
                                    return (
                                        <tr key={key} className={`hover:bg-[#102034]/60 transition-colors ${!d.hasData ? 'opacity-60' : ''}`}>
                                            <td className="py-2 px-3 font-sans font-medium text-[#d3e4fe] pl-6">
                                                {label}
                                                {alert && <span className="ml-1.5 px-1 py-0.5 rounded-[2px] bg-[#231200] text-[#ffb95f] border border-[#ffb95f]/30 text-[9px] font-mono">{alert}</span>}
                                            </td>
                                            <td className="py-2 px-3 text-right text-[#c5c6cd]">{d.cuts}</td>
                                            <td className="py-2 px-3 text-right text-[#8f9097]" title="Nécessite les données J+1">—</td>
                                            <td className="py-2 px-3 text-right text-[#d3e4fe]">{d.hasData ? d.mwShed : '—'}</td>
                                            <td className="py-2 px-3 text-right text-[#8f9097]" title="Nécessite les données J+1">—</td>
                                            <td className={`py-2 px-3 text-right font-semibold ${d.ensCls}`}>{d.ens}</td>
                                            <td className="py-2 px-3 text-right text-[#c5c6cd]">{d.hasData ? `${d.durH}h ${d.durM}min` : '—'}</td>
                                            <td className="py-2 px-3 text-center text-[#8f9097]">{d.lastCut}</td>
                                            <td className="py-2 px-3 text-center">
                                                {d.hasData
                                                    ? <span className="px-2 py-0.5 rounded-[2px] bg-[#000f21] text-[#c5c6cd] border border-[#1b2b3f]">{d.daysSince}</span>
                                                    : <span className="text-[#8f9097]">—</span>
                                                }
                                            </td>
                                            <td className="py-2 px-3 text-center">{equityBadge(d.equity)}</td>
                                            <td className="py-2 px-3 text-center">
                                                <button className="inline-flex items-center gap-1 px-2 py-1 rounded-[2px] bg-[#000f21] hover:bg-[#1b2b3f] text-[#acc7ff] border border-[#1b2b3f] transition-colors" onClick={() => setModalKey(key)} type="button">
                                                    <Icon name="visibility" size={14} /><span className="font-sans text-[11px]">Détail</span>
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}

                                {/* ── CRC SUD ────────────────────────────────── */}
                                {(() => {
                                    const sud = getCrcTotals(['BCC 5','BCC 6','BCC 7'])
                                    return (
                                        <tr className="bg-[#102034] border-t-2 border-b border-[#1b2b3f]">
                                            <td className="py-2.5 px-3 font-sans font-bold text-[#ffb95f]" colSpan={2}>
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2.5 h-2.5 rounded-full bg-[#ffb95f] shadow-[0_0_6px_#ffb95f]" />
                                                    <span className="text-xs uppercase tracking-wider">CRC Sud (Centre, Sahel, Sud)</span>
                                                </div>
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-bold text-[#8f9097]" title="Nécessite les données J+1">—</td>
                                            <td className="py-2.5 px-3 text-right font-bold text-[#d3e4fe]">{sud ? sud.mwShed : '—'}</td>
                                            <td className="py-2.5 px-3 text-right font-bold text-[#8f9097]" title="Nécessite les données J+1">—</td>
                                            <td className="py-2.5 px-3 text-right font-bold text-[#ffb95f]">{sud ? sud.ens : '—'}</td>
                                            <td className="py-2.5 px-3 text-right font-bold text-[#c5c6cd]">{sud && sud.cuts > 0 ? `${sud.durH}h ${sud.durM}min` : '—'}</td>
                                            <td className="py-2.5 px-3 text-center text-[#8f9097]" colSpan={2}>Sous-total CRC Sud</td>
                                            <td className="py-2.5 px-3 text-center">{equityBadge(sud?.equity ?? null)}</td>
                                            <td />
                                        </tr>
                                    )
                                })()}

                                {[
                                    { key: 'BCC 5', label: 'BCC 5 — Centre (Kairouan / Sidi Bouzid)', alert: 'SUR-SOLLICITE' }
                                    ,{ key: 'BCC 6', label: 'BCC 6 — Sahel (Sousse / Monastir)',      alert: null           }
                                    ,{ key: 'BCC 7', label: 'BCC 7 — Sud (Sfax / Gabès / Gafsa)',     alert: 'SUR-SOLLICITE' }
                                ].map(({ key, label, alert }) => {
                                    const d = getBcc(key)
                                    return (
                                        <tr key={key} className={`hover:bg-[#102034]/60 transition-colors ${!d.hasData ? 'opacity-60' : ''}`}>
                                            <td className="py-2 px-3 font-sans font-medium text-[#d3e4fe] pl-6">
                                                {label}
                                                {alert && <span className="ml-1.5 px-1 py-0.5 rounded-[2px] bg-[#231200] text-[#ffb95f] border border-[#ffb95f]/30 text-[9px] font-mono">{alert}</span>}
                                            </td>
                                            <td className="py-2 px-3 text-right text-[#c5c6cd]">{d.cuts}</td>
                                            <td className="py-2 px-3 text-right text-[#8f9097]" title="Nécessite les données J+1">—</td>
                                            <td className="py-2 px-3 text-right text-[#d3e4fe]">{d.hasData ? d.mwShed : '—'}</td>
                                            <td className="py-2 px-3 text-right text-[#8f9097]" title="Nécessite les données J+1">—</td>
                                            <td className={`py-2 px-3 text-right font-semibold ${d.ensCls}`}>{d.ens}</td>
                                            <td className="py-2 px-3 text-right text-[#c5c6cd]">{d.hasData ? `${d.durH}h ${d.durM}min` : '—'}</td>
                                            <td className="py-2 px-3 text-center text-[#8f9097]">{d.lastCut}</td>
                                            <td className="py-2 px-3 text-center">
                                                {d.hasData
                                                    ? <span className="px-2 py-0.5 rounded-[2px] bg-[#000f21] text-[#c5c6cd] border border-[#1b2b3f]">{d.daysSince}</span>
                                                    : <span className="text-[#8f9097]">—</span>
                                                }
                                            </td>
                                            <td className="py-2 px-3 text-center">{equityBadge(d.equity)}</td>
                                            <td className="py-2 px-3 text-center">
                                                <button className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[2px] bg-[#102034] hover:bg-[#1b2b3f] text-[#ffb95f] border border-[#ffb95f]/40 font-sans text-[11px] font-medium transition-colors" onClick={() => setModalKey(key)} type="button">
                                                    <Icon name="expand_content" size={14} /><span>Voir détail</span>
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}

                            </tbody>

                            {/* National totals — fully dynamic */}
                            <tfoot>
                                <tr className="bg-[#000f21] border-t-2 border-[#1b2b3f] font-mono text-xs font-bold text-[#d3e4fe]">
                                    <td className="py-3 px-3 uppercase tracking-wider font-sans">Total National (7 BCCs)</td>
                                    <td className="py-3 px-3 text-right text-[#acc7ff]">{nationals.cuts} coupures</td>
                                    <td className="py-3 px-3 text-right text-[#8f9097]" title="Nécessite les données J+1">—</td>
                                    <td className="py-3 px-3 text-right text-[#d3e4fe]">
                                        {apiData
                                            ? `${apiData.bccs.reduce((s, b) => s + (b.total_mw_shed ?? 0), 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} MW`
                                            : '—'
                                        }
                                    </td>
                                    <td className="py-3 px-3 text-right text-[#8f9097]" title="Nécessite les données J+1">—</td>
                                    <td className="py-3 px-3 text-right text-[#ffb95f]">{nationals.ens}</td>
                                    <td className="py-3 px-3 text-right text-[#acc7ff]">{nationals.durH}h {nationals.durM}min</td>
                                    <td className="py-3 px-3 text-center text-[#8f9097]">—</td>
                                    <td className="py-3 px-3 text-center text-[#8f9097]">—</td>
                                    <td className="py-3 px-3 text-center">{equityBadge(nationals.equity)}</td>
                                    <td className="py-3 px-3 text-center text-[#8f9097]">—</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Amber warning */}
                    <div className="p-3 rounded-[2px] bg-[#231200]/90 border border-[#ffb95f]/50 flex items-start gap-3">
                        <Icon name="warning" size={20} className="text-[#ffb95f] shrink-0 mt-0.5" />
                        <div className="flex flex-col gap-0.5 text-xs">
                            <span className="font-sans font-bold text-[#ffb95f] uppercase tracking-wide">
                                Attention : Indice d'equite national &lt; 80 (73/100).
                            </span>
                            <p className="font-sans text-[#d3e4fe] leading-relaxed">
                                Les zones{' '}
                                <span className="font-semibold text-[#ffb4ab]">BCC 5 (Centre)</span>
                                {' '}et{' '}
                                <span className="font-semibold text-[#ffb4ab]">BCC 7 (Sud)</span>
                                {' '}sont en sur-sollicitation critique avec des scores respectifs de 48/100 et 59/100.{' '}
                                <span className="text-[#ffb95f] font-medium">
                                    Recommandation : Revision de la cle de repartition CRC dans les Parametres &amp; Seuils.
                                </span>
                            </p>
                        </div>
                    </div>
                </section>
            </div>

            {/* Modal */}
            {modalKey && (
                <BCCDetailModal
                    bccKey={modalKey}
                    onClose={() => setModalKey(null)}
                    activePeriod={activePeriod}
                    apiOverride={getModalData(modalKey)}
                />
            )}
        </div>
    )
}
