import { create }       from 'zustand'
import { persist }      from 'zustand/middleware'
import { DEFAULT_NETWORK } from '../data/networkConfig'

// ── Deep-clone helper (avoids mutating the default config) ────────────────────
const clone = (obj) => JSON.parse(JSON.stringify(obj))

// ── networkStore ──────────────────────────────────────────────────────────────
//
// Two separate concerns live here:
//
// 1. STRUCTURAL DATA — the editable CRC/BCC/governorate/posteSource hierarchy.
//    Seeded from DEFAULT_NETWORK on first run, then editable via SIG Editor.
//    This defines zone boundaries (which govs belong to which BCC) and
//    operational metadata (targetMW, status, operator…).
//
// 2. DRAWN LAYERS — GeoJSON features drawn/imported by operators in the SIG
//    Editor (custom lines, P0 sites, feeder routes not in OSM).
//
// Both are persisted to localStorage under key 'steg-network'.
//
export const useNetworkStore = create(
    persist(
        (set, get) =>
        ({
            // ── 1. STRUCTURAL: CRC / BCC hierarchy ───────────────────
            // Seeded from DEFAULT_NETWORK; user edits override these.
            crcs:  clone(DEFAULT_NETWORK.crcs)

            // ── 2. DRAWN LAYERS (GeoJSON Features) ───────────────────
            ,p0Sites:     []   // Point features — hospitals, water, telecoms
            ,customLines: []   // LineString — extra HT lines not in OSM

            // ── Edit history ──────────────────────────────────────────
            ,_history: []
            ,_future:  []

            // ── Save metadata ─────────────────────────────────────────
            ,lastSaved:   null
            ,lastSavedBy: null
            ,version:     1

            // ─────────────────────────────────────────────────────────
            // SNAPSHOT / UNDO / REDO
            // ─────────────────────────────────────────────────────────
            ,_snapshot: () =>
            {
                const { crcs, p0Sites, customLines, _history } = get()
                const snap = { crcs: clone(crcs), p0Sites: [...p0Sites], customLines: [...customLines] }
                set({ _history: [...(_history ?? []).slice(-19), snap], _future: [] })
            }

            ,undo: () =>
            {
                const { _history, _future, crcs, p0Sites, customLines } = get()
                const hist = _history ?? []
                const fut  = _future  ?? []
                if (!hist.length) return
                const prev    = hist[hist.length - 1]
                const current = { crcs: clone(crcs), p0Sites: [...p0Sites], customLines: [...customLines] }
                set({ ...prev, _history: hist.slice(0, -1), _future: [current, ...fut.slice(0, 19)] })
            }

            ,redo: () =>
            {
                const { _future, _history, crcs, p0Sites, customLines } = get()
                const hist = _history ?? []
                const fut  = _future  ?? []
                if (!fut.length) return
                const next    = fut[0]
                const current = { crcs: clone(crcs), p0Sites: [...p0Sites], customLines: [...customLines] }
                set({ ...next, _history: [...hist.slice(-19), current], _future: fut.slice(1) })
            }

            // ─────────────────────────────────────────────────────────
            // CRC OPERATIONS
            // ─────────────────────────────────────────────────────────
            ,addCrc: (crc) =>
            {
                get()._snapshot()
                const newCrc = { bccs: [], ...crc, id: crc.id ?? `crc-${Date.now()}` }
                set(s => ({ crcs: [...s.crcs, newCrc] }))
            }

            ,updateCrc: (crcId, patch) =>
            {
                get()._snapshot()
                set(s => ({ crcs: s.crcs.map(c => c.id === crcId ? { ...c, ...patch } : c) }))
            }

            ,removeCrc: (crcId) =>
            {
                get()._snapshot()
                set(s => ({ crcs: s.crcs.filter(c => c.id !== crcId) }))
            }

            // ─────────────────────────────────────────────────────────
            // BCC OPERATIONS
            // ─────────────────────────────────────────────────────────
            ,addBcc: (crcId, bcc) =>
            {
                get()._snapshot()
                const newBcc = { governorates: [], posteSources: [], ...bcc, id: bcc.id ?? `bcc-${Date.now()}`, crcId }
                set(s => ({
                    crcs: s.crcs.map(c =>
                        c.id === crcId ? { ...c, bccs: [...c.bccs, newBcc] } : c
                    )
                }))
            }

            ,updateBcc: (crcId, bccId, patch) =>
            {
                get()._snapshot()
                set(s => ({
                    crcs: s.crcs.map(c =>
                        c.id !== crcId ? c :
                        { ...c, bccs: c.bccs.map(b => b.id === bccId ? { ...b, ...patch } : b) }
                    )
                }))
            }

            ,removeBcc: (crcId, bccId) =>
            {
                get()._snapshot()
                set(s => ({
                    crcs: s.crcs.map(c =>
                        c.id !== crcId ? c :
                        { ...c, bccs: c.bccs.filter(b => b.id !== bccId) }
                    )
                }))
            }

            // Move a BCC from one CRC to another (uniqueness enforced — removed from source)
            ,moveBcc: (bccId, fromCrcId, toCrcId) =>
            {
                get()._snapshot()
                set(s =>
                {
                    const fromCrc = s.crcs.find(c => c.id === fromCrcId)
                    const bcc     = fromCrc?.bccs.find(b => b.id === bccId)
                    if (!bcc) return s
                    return {
                        crcs: s.crcs.map(c =>
                        {
                            if (c.id === fromCrcId) return { ...c, bccs: c.bccs.filter(b => b.id !== bccId) }
                            if (c.id === toCrcId)   return { ...c, bccs: [...c.bccs, { ...bcc, crcId: toCrcId }] }
                            return c
                        })
                    }
                })
            }

            // ─────────────────────────────────────────────────────────
            // GOVERNORATE OPERATIONS (within a BCC)
            // A governorate can only belong to one BCC — adding it to a
            // new BCC removes it from any previous BCC automatically.
            // ─────────────────────────────────────────────────────────
            ,addGovernorate: (crcId, bccId, govName) =>
            {
                get()._snapshot()
                set(s =>
                ({
                    crcs: s.crcs.map(c => ({
                        ...c
                        ,bccs: c.bccs.map(b =>
                        {
                            // Remove from any BCC that currently has it
                            if (b.governorates.includes(govName) && b.id !== bccId)
                                return { ...b, governorates: b.governorates.filter(g => g !== govName) }
                            // Add to target BCC
                            if (b.id === bccId && !b.governorates.includes(govName))
                                return { ...b, governorates: [...b.governorates, govName] }
                            return b
                        })
                    }))
                }))
            }

            ,removeGovernorate: (crcId, bccId, govName) =>
            {
                get()._snapshot()
                set(s => ({
                    crcs: s.crcs.map(c =>
                        c.id !== crcId ? c :
                        { ...c, bccs: c.bccs.map(b =>
                            b.id !== bccId ? b :
                            { ...b, governorates: b.governorates.filter(g => g !== govName) }
                        )}
                    )
                }))
            }

            // ─────────────────────────────────────────────────────────
            // POSTE SOURCE OPERATIONS
            // ─────────────────────────────────────────────────────────
            ,addPosteSource: (crcId, bccId, ps) =>
            {
                get()._snapshot()
                const newPs = { ...ps, id: ps.id ?? `ps-${Date.now()}` }
                set(s => ({
                    crcs: s.crcs.map(c =>
                        c.id !== crcId ? c :
                        { ...c, bccs: c.bccs.map(b =>
                            b.id !== bccId ? b :
                            { ...b, posteSources: [...(b.posteSources ?? []), newPs] }
                        )}
                    )
                }))
            }

            ,removePosteSource: (crcId, bccId, psId) =>
            {
                get()._snapshot()
                set(s => ({
                    crcs: s.crcs.map(c =>
                        c.id !== crcId ? c :
                        { ...c, bccs: c.bccs.map(b =>
                            b.id !== bccId ? b :
                            { ...b, posteSources: (b.posteSources ?? []).filter(p => p.id !== psId) }
                        )}
                    )
                }))
            }

            // Update live telemetry for a BCC (called when real SCADA data arrives)
            ,updateBccTelemetry: (bccId, { actualMW, status }) =>
            {
                set(s => ({
                    crcs: s.crcs.map(c => ({
                        ...c
                        ,bccs: c.bccs.map(b =>
                            b.id !== bccId ? b :
                            { ...b, actualMW: actualMW ?? b.actualMW, status: status ?? b.status }
                        )
                    }))
                }))
            }

            // ─────────────────────────────────────────────────────────
            // P0 SITES (drawn layer)
            // ─────────────────────────────────────────────────────────
            ,addP0Site: (feature) =>
            {
                get()._snapshot()
                set(s => ({ p0Sites: [...s.p0Sites, { ...feature, id: feature.id ?? `p0-${Date.now()}` }] }))
            }

            ,updateP0Site: (id, patch) =>
            {
                get()._snapshot()
                set(s => ({ p0Sites: s.p0Sites.map(f => f.id !== id ? f : { ...f, ...patch, properties: { ...f.properties, ...patch.properties } }) }))
            }

            ,deleteP0Site: (id) =>
            {
                get()._snapshot()
                set(s => ({ p0Sites: s.p0Sites.filter(f => f.id !== id) }))
            }

            // ─────────────────────────────────────────────────────────
            // CUSTOM LINES (drawn layer)
            // ─────────────────────────────────────────────────────────
            ,addCustomLine: (feature) =>
            {
                get()._snapshot()
                set(s => ({ customLines: [...s.customLines, { ...feature, id: feature.id ?? `line-${Date.now()}` }] }))
            }

            ,deleteCustomLine: (id) =>
            {
                get()._snapshot()
                set(s => ({ customLines: s.customLines.filter(f => f.id !== id) }))
            }

            // ─────────────────────────────────────────────────────────
            // IMPORT GeoJSON
            // Supports two formats:
            //   a) Structure export (metadata.type === 'network-structure')
            //      → replaces crcs array entirely
            //   b) Layer export (features with sigType)
            //      → merges into p0Sites / customLines
            // ─────────────────────────────────────────────────────────
            ,importGeoJSON: (gj) =>
            {
                get()._snapshot()

                if (gj.metadata?.type === 'network-structure')
                {
                    set({ crcs: gj.crcs ?? get().crcs })
                    return
                }

                const features = gj.features ?? []
                const p0s   = features.filter(f => f.properties?.sigType === 'p0')
                const lines = features.filter(f => ['customLine', 'line'].includes(f.properties?.sigType))

                const merge = (existing, incoming) =>
                {
                    const map = new Map(existing.map(f => [f.id, f]))
                    incoming.forEach(f => map.set(f.id ?? `import-${Date.now()}-${Math.random()}`, f))
                    return Array.from(map.values())
                }

                set(s => ({
                    p0Sites:     merge(s.p0Sites, p0s)
                    ,customLines: merge(s.customLines, lines)
                }))
            }

            // ─────────────────────────────────────────────────────────
            // EXPORT GeoJSON
            // ─────────────────────────────────────────────────────────
            ,exportGeoJSON: () =>
            {
                const { crcs, p0Sites, customLines, version } = get()
                const stamp = (arr, type) => arr.map(f => ({ ...f, properties: { ...f.properties, sigType: type } }))
                return {
                    type: 'FeatureCollection'
                    ,metadata: {
                        exported:  new Date().toISOString()
                        ,version
                        ,generator: 'STEG SIG Editor v1.0'
                    }
                    ,features: [
                        ...stamp(p0Sites, 'p0')
                        ,...stamp(customLines, 'customLine')
                    ]
                }
            }

            // Export the full structural config (CRC/BCC/gov tree)
            ,exportStructure: () =>
            {
                const { crcs, version } = get()
                return {
                    metadata: { type: 'network-structure', exported: new Date().toISOString(), version }
                    ,crcs: clone(crcs)
                }
            }

            // ─────────────────────────────────────────────────────────
            // SAVE
            // ─────────────────────────────────────────────────────────
            ,save: (username) =>
            {
                set(s => ({
                    lastSaved:   new Date().toISOString()
                    ,lastSavedBy: username
                    ,version:    s.version + 1
                }))
            }

            // Reset structural data back to the default spec
            ,resetToDefault: () =>
            {
                get()._snapshot()
                set({ crcs: clone(DEFAULT_NETWORK.crcs) })
            }

            // Clear all drawn layers (keeps structural data)
            ,clearDrawnLayers: () =>
            {
                get()._snapshot()
                set({ p0Sites: [], customLines: [] })
            }

            // ─────────────────────────────────────────────────────────
            // DERIVED GETTERS (computed on demand, not stored)
            // ─────────────────────────────────────────────────────────

            // Flat list of all BCCs
            ,getAllBccs: () => get().crcs.flatMap(c => c.bccs)

            // Map: governorate name → bcc id
            ,getGovToBcc: () =>
            {
                const map = {}
                get().crcs.forEach(c => c.bccs.forEach(b =>
                    b.governorates.forEach(g => { map[g] = b.id })
                ))
                return map
            }

            // Map: governorate name → crc id
            ,getGovToCrc: () =>
            {
                const map = {}
                get().crcs.forEach(c => c.bccs.forEach(b =>
                    b.governorates.forEach(g => { map[g] = c.id })
                ))
                return map
            }

            // Get a single BCC by id
            ,getBcc: (bccId) => get().crcs.flatMap(c => c.bccs).find(b => b.id === bccId)

            // Get a single CRC by id
            ,getCrc: (crcId) => get().crcs.find(c => c.id === crcId)

            // List of all governorate names currently unassigned to any BCC
            ,getUnassignedGovs: (allGovNames) =>
            {
                const assigned = new Set()
                get().crcs.forEach(c => c.bccs.forEach(b => b.governorates.forEach(g => assigned.add(g))))
                return allGovNames.filter(g => !assigned.has(g))
            }
        })
        ,{
            name: 'steg-network'
            ,partialize: (s) => ({
                crcs:         s.crcs
                ,p0Sites:     s.p0Sites
                ,customLines: s.customLines
                ,lastSaved:   s.lastSaved
                ,lastSavedBy: s.lastSavedBy
                ,version:     s.version
            })
        }
    )
)
