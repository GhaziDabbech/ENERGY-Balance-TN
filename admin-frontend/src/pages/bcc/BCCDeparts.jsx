import { useState, useRef, useEffect, useCallback } from 'react'
import api from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'

function Icon({ name, size = 18, className = '' })
{
    return (
        <span className={`material-symbols-outlined ${className}`} style={{ fontSize: size }}>
            {name}
        </span>
    )
}

// ── Initial feeder catalogue (BCC 3) ─────────────────────────────────────────
const INITIAL_FEEDERS =
[
    { id: 1,  ref: 'F02', nom: 'Hôpital Régional de Béja',        poste: 'Béja Centre TR1', mw: 4.5, priority: 'P0', zone: 'Béja Centre',   statut: 'Actif'     }
    ,{ id: 2, ref: 'F07', nom: 'Z.I. Béja Nord',                  poste: 'Béja Centre TR1', mw: 4.2, priority: 'P3', zone: 'Béja Nord',     statut: 'Actif'     }
    ,{ id: 3, ref: 'F08', nom: 'Medjez El Bab Ville',             poste: 'Béja Centre TR1', mw: 6.5, priority: 'P3', zone: 'Medjez El Bab', statut: 'Actif'     }
    ,{ id: 4, ref: 'F11', nom: 'Testour Bourg',                   poste: 'Béja Centre TR1', mw: 7.0, priority: 'P3', zone: 'Testour',       statut: 'Actif'     }
    ,{ id: 5, ref: 'F14', nom: 'Station de Pompage SONEDE Béja',  poste: 'Béja Est TR2',    mw: 3.2, priority: 'P0', zone: 'Béja Est',      statut: 'Actif'     }
    ,{ id: 6, ref: 'F18', nom: 'Nefza Rural',                     poste: 'Béja Est TR2',    mw: 2.6, priority: 'P2', zone: 'Nefza',         statut: 'Actif'     }
    ,{ id: 7, ref: 'F09', nom: 'Faubourg Est & Oueslatia',        poste: 'Béja Est TR2',    mw: 3.8, priority: 'P4', zone: 'Béja Est',      statut: 'Actif'     }
    ,{ id: 8, ref: 'F21', nom: 'Amdoun Rural Nord',               poste: 'Béja Est TR2',    mw: 4.8, priority: 'P4', zone: 'Amdoun',        statut: 'Actif'     }
    ,{ id: 9, ref: 'F28', nom: 'Goubellat Sud',                   poste: 'Béja Est TR2',    mw: 3.5, priority: 'P5', zone: 'Goubellat',     statut: 'Actif'     }
    ,{ id: 10, ref: 'F25', nom: 'Bou Salem Centre',               poste: 'Jendouba N. TR1', mw: 5.5, priority: 'P2', zone: 'Bou Salem',     statut: 'Actif'     }
    ,{ id: 11, ref: 'F15', nom: 'Téboursouk Agricole',            poste: 'Jendouba N. TR1', mw: 5.2, priority: 'P4', zone: 'Téboursouk',    statut: 'Actif'     }
    ,{ id: 12, ref: 'F31', nom: 'Jendouba Centre',                poste: 'Jendouba N. TR1', mw: 4.1, priority: 'P3', zone: 'Jendouba',      statut: 'Actif'     }
    ,{ id: 13, ref: 'F33', nom: 'Oued Meliz',                     poste: 'Jendouba N. TR1', mw: 3.2, priority: 'P5', zone: 'Oued Meliz',    statut: 'Actif'     }
    ,{ id: 14, ref: 'F42', nom: 'Hôpital Régional Jendouba',      poste: 'Jendouba S. TR2', mw: 2.8, priority: 'P0', zone: 'Jendouba',      statut: 'Actif'     }
    ,{ id: 15, ref: 'F36', nom: 'Ghardimaou Ville',               poste: 'Jendouba S. TR2', mw: 5.8, priority: 'P3', zone: 'Ghardimaou',    statut: 'Actif'     }
    ,{ id: 16, ref: 'F38', nom: 'Aïn Draham',                     poste: 'Jendouba S. TR2', mw: 4.4, priority: 'P4', zone: 'Aïn Draham',    statut: 'Actif'     }
    ,{ id: 17, ref: 'F40', nom: 'Fernana Rural',                  poste: 'Jendouba S. TR2', mw: 3.6, priority: 'P5', zone: 'Fernana',       statut: 'Actif'     }
    ,{ id: 18, ref: 'F44', nom: 'Tabarka Ville',                  poste: 'Tabarka TR1',     mw: 4.0, priority: 'P3', zone: 'Tabarka',       statut: 'Actif'     }
    ,{ id: 19, ref: 'F45', nom: 'Nefza Bourg',                    poste: 'Tabarka TR1',     mw: 3.1, priority: 'P4', zone: 'Nefza',         statut: 'Actif'     }
    ,{ id: 20, ref: 'F46', nom: 'Aïn Snoussi',                    poste: 'Tabarka TR1',     mw: 2.8, priority: 'P5', zone: 'Aïn Snoussi',   statut: 'Inactif'  }
]

const POSTES    = ['Béja Centre TR1', 'Béja Est TR2', 'Jendouba N. TR1', 'Jendouba S. TR2', 'Tabarka TR1']
const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']

function priCls(p)
{
    if (p === 'P0') return 'bg-error-container text-on-error-container border-error/30'
    if (p === 'P1') return 'bg-error-container/40 text-error border-error/20'
    if (p === 'P2') return 'bg-tertiary-container/40 text-tertiary border-tertiary/20'
    if (p === 'P3') return 'bg-secondary-container/40 text-secondary border-secondary/20'
    return 'bg-surface-container text-on-surface-variant border-surface-container-high'
}

function PriBadge({ p })
{
    return (
        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 font-mono text-[9px] font-bold border ${priCls(p)}`}>
            {p === 'P0' && <Icon name="lock" size={10} />}
            {p}
        </span>
    )
}

// ── CONFIRMER safety modal ────────────────────────────────────────────────────
function ConfirmerModal({ message, onConfirm, onCancel })
{
    const [txt, setTxt] = useState('')
    const ok            = txt.toUpperCase() === 'CONFIRMER'

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-space-md">
            <div className="bg-surface-container-low border border-error/40 w-full max-w-md flex flex-col shadow-2xl overflow-hidden">
                <div className="flex items-center gap-space-md px-space-lg py-space-md bg-error-container/20 border-b border-error/30">
                    <div className="w-8 h-8 bg-error-container flex items-center justify-center shrink-0">
                        <Icon name="warning" size={18} className="text-on-error-container" />
                    </div>
                    <div>
                        <p className="font-sans font-bold text-xs text-on-surface uppercase tracking-wide">
                            Action irréversible — Confirmation requise
                        </p>
                        <p className="font-mono text-[10px] text-on-surface-variant mt-space-xs">{message}</p>
                    </div>
                </div>
                <div className="p-space-lg flex flex-col gap-space-md">
                    <p className="font-sans text-xs text-on-surface-variant">
                        Tapez <strong className="text-error font-mono">CONFIRMER</strong> pour valider cette action.
                        Elle sera horodatée dans l'audit BCC.
                    </p>
                    <input
                        autoFocus
                        type="text"
                        value={txt}
                        onChange={(e) => setTxt(e.target.value)}
                        placeholder="Tapez CONFIRMER"
                        className="bg-surface-container-lowest border border-surface-container-high focus:border-error text-on-surface font-mono text-sm px-space-md py-space-sm focus:outline-none tracking-widest transition-colors"
                    />
                    <div className="flex items-center justify-end gap-space-sm pt-space-xs border-t border-surface-container-high">
                        <button
                            onClick={onCancel}
                            className="px-space-md py-space-xs bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono text-xs border border-surface-container-high transition-colors"
                            type="button"
                        >
                            Annuler
                        </button>
                        <button
                            onClick={() => ok && onConfirm()}
                            disabled={!ok}
                            className="px-space-md py-space-xs bg-error-container hover:bg-error text-on-error-container font-mono text-xs font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            type="button"
                        >
                            Valider l'action
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Add feeder modal ──────────────────────────────────────────────────────────
const EMPTY_FEEDER = { ref: '', nom: '', poste: POSTES[0], mw: '', priority: 'P3', zone: '', statut: 'Actif' }

function AddFeederModal({ onSave, onCancel, nextId })
{
    const [form,    setForm]    = useState({ ...EMPTY_FEEDER })
    const [confirm, setConfirm] = useState(false)

    const isP0    = form.priority === 'P0'
    const isValid = form.ref.trim() && form.nom.trim() && form.mw && Number(form.mw) > 0

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

    const handleSave = () =>
    {
        if (!isValid) return
        if (isP0) { setConfirm(true); return }
        doSave()
    }

    const doSave = () =>
    {
        onSave({ ...form, id: nextId, mw: Number(form.mw) })
    }

    return (
        <>
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-space-md">
                <div className="bg-surface-container-low border border-surface-container-high w-full max-w-lg flex flex-col shadow-2xl overflow-hidden">

                    <div className="flex items-center justify-between px-space-lg py-space-md bg-surface-container border-b border-surface-container-high">
                        <div className="flex items-center gap-space-sm">
                            <Icon name="add_circle" size={18} className="text-secondary" />
                            <h3 className="font-sans font-bold text-xs text-on-surface uppercase">Ajouter un départ HTA</h3>
                        </div>
                        <button onClick={onCancel} className="p-space-xs hover:bg-surface-container-high text-on-surface-variant transition-colors" type="button">
                            <Icon name="close" size={16} />
                        </button>
                    </div>

                    <div className="p-space-lg flex flex-col gap-space-md overflow-y-auto">
                        <div className="grid grid-cols-2 gap-space-md">
                            {/* Ref */}
                            <div className="flex flex-col gap-space-xs">
                                <label className="font-mono text-[10px] text-on-surface-variant uppercase">Référence *</label>
                                <input
                                    value={form.ref}
                                    onChange={(e) => set('ref', e.target.value.toUpperCase())}
                                    placeholder="Ex: F47"
                                    className="bg-surface-container-lowest border border-surface-container-high focus:border-secondary text-on-surface font-mono text-xs px-space-sm py-space-xs focus:outline-none transition-colors"
                                />
                            </div>
                            {/* MW */}
                            <div className="flex flex-col gap-space-xs">
                                <label className="font-mono text-[10px] text-on-surface-variant uppercase">Charge nominale (MW) *</label>
                                <input
                                    type="number"
                                    min={0.1}
                                    step={0.1}
                                    value={form.mw}
                                    onChange={(e) => set('mw', e.target.value)}
                                    placeholder="Ex: 4.5"
                                    className="bg-surface-container-lowest border border-surface-container-high focus:border-secondary text-on-surface font-mono text-xs px-space-sm py-space-xs focus:outline-none transition-colors"
                                />
                            </div>
                            {/* Nom */}
                            <div className="col-span-2 flex flex-col gap-space-xs">
                                <label className="font-mono text-[10px] text-on-surface-variant uppercase">Nom / Libellé *</label>
                                <input
                                    value={form.nom}
                                    onChange={(e) => set('nom', e.target.value)}
                                    placeholder="Ex: Aïn Snoussi Zone Résidentielle"
                                    className="bg-surface-container-lowest border border-surface-container-high focus:border-secondary text-on-surface font-mono text-xs px-space-sm py-space-xs focus:outline-none transition-colors"
                                />
                            </div>
                            {/* Poste source */}
                            <div className="flex flex-col gap-space-xs">
                                <label className="font-mono text-[10px] text-on-surface-variant uppercase">Poste source</label>
                                <select
                                    value={form.poste}
                                    onChange={(e) => set('poste', e.target.value)}
                                    className="bg-surface-container-lowest border border-surface-container-high focus:border-secondary text-on-surface font-mono text-xs px-space-sm py-space-xs focus:outline-none transition-colors"
                                >
                                    {POSTES.map((p) => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            {/* Zone */}
                            <div className="flex flex-col gap-space-xs">
                                <label className="font-mono text-[10px] text-on-surface-variant uppercase">Zone / Localité</label>
                                <input
                                    value={form.zone}
                                    onChange={(e) => set('zone', e.target.value)}
                                    placeholder="Ex: Aïn Snoussi"
                                    className="bg-surface-container-lowest border border-surface-container-high focus:border-secondary text-on-surface font-mono text-xs px-space-sm py-space-xs focus:outline-none transition-colors"
                                />
                            </div>
                            {/* Priority */}
                            <div className="flex flex-col gap-space-xs">
                                <label className="font-mono text-[10px] text-on-surface-variant uppercase">Niveau de priorité</label>
                                <select
                                    value={form.priority}
                                    onChange={(e) => set('priority', e.target.value)}
                                    className="bg-surface-container-lowest border border-surface-container-high focus:border-secondary text-on-surface font-mono text-xs px-space-sm py-space-xs focus:outline-none transition-colors"
                                >
                                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            {/* Statut */}
                            <div className="flex flex-col gap-space-xs">
                                <label className="font-mono text-[10px] text-on-surface-variant uppercase">Statut</label>
                                <select
                                    value={form.statut}
                                    onChange={(e) => set('statut', e.target.value)}
                                    className="bg-surface-container-lowest border border-surface-container-high focus:border-secondary text-on-surface font-mono text-xs px-space-sm py-space-xs focus:outline-none transition-colors"
                                >
                                    <option>Actif</option>
                                    <option>Inactif</option>
                                    <option>En maintenance</option>
                                </select>
                            </div>
                        </div>

                        {isP0 && (
                            <div className="flex items-center gap-space-sm p-space-sm bg-error-container/20 border border-error/40 font-mono text-[10px] text-error">
                                <Icon name="warning" size={14} className="animate-pulse" />
                                <span>
                                    Priorité P0 sélectionnée — Ce départ sera marqué inviolable et exclu de tout délestage.
                                    Une confirmation supplémentaire sera demandée.
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="px-space-lg py-space-md bg-surface-container border-t border-surface-container-high flex items-center justify-between">
                        <span className="font-mono text-[10px] text-on-surface-variant flex items-center gap-space-xs">
                            <Icon name="info" size={13} className="text-secondary" />
                            Les champs marqués * sont obligatoires
                        </span>
                        <div className="flex items-center gap-space-sm">
                            <button onClick={onCancel} className="px-space-md py-space-xs bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono text-xs border border-surface-container-high transition-colors" type="button">
                                Annuler
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={!isValid}
                                className="px-space-md py-space-xs bg-secondary-container hover:bg-secondary text-on-secondary-container font-mono text-xs font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                type="button"
                            >
                                <span className="flex items-center gap-space-xs">
                                    <Icon name="add" size={14} />
                                    Ajouter le départ
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            {confirm && (
                <ConfirmerModal
                    message={`Ajout du départ ${form.ref} (${form.nom}) en priorité P0 — départ inviolable.`}
                    onConfirm={() => { setConfirm(false); doSave() }}
                    onCancel={() => setConfirm(false)}
                />
            )}
        </>
    )
}

// ── Inline edit cell ──────────────────────────────────────────────────────────
function EditCell({ value, type = 'text', options, onChange, mono = true })
{
    const base = `bg-surface-container-lowest border border-secondary/60 focus:border-secondary text-on-surface ${mono ? 'font-mono' : 'font-sans'} text-[10px] px-space-xs py-0.5 focus:outline-none transition-colors w-full`
    if (options)
    {
        return (
            <select value={value} onChange={(e) => onChange(e.target.value)} className={base}>
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
        )
    }
    return (
        <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={base}
            step={type === 'number' ? '0.1' : undefined}
        />
    )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BCCDeparts()
{
    const { user }                                    = useAuthStore()
    const [feeders,     setFeeders]     = useState([])
    const [loading,     setLoading]     = useState(true)
    const [apiError,    setApiError]    = useState(null)
    const [tab,         setTab]         = useState('catalogue')   // 'catalogue' | 'import'
    const [editingId,   setEditingId]   = useState(null)
    const [editBuf,     setEditBuf]     = useState({})
    const [showAdd,     setShowAdd]     = useState(false)
    const [confirmInfo, setConfirmInfo] = useState(null)   // { message, onConfirm }
    const [toast,       setToast]       = useState(null)
    const [search,      setSearch]      = useState('')
    const [filterPri,   setFilterPri]   = useState('tous')

    // CSV import state
    const fileRef                             = useRef(null)
    const [fileName,    setFileName]          = useState(null)
    const [fileError,   setFileError]         = useState(null)
    const [importMode,  setImportMode]        = useState('merge')   // 'merge' | 'replace'
    const [importConf,  setImportConf]        = useState(false)
    const [importDone,  setImportDone]        = useState(false)

    // ── Load feeders from API ────────────────────────────────────────────────
    const loadFeeders = useCallback(async () =>
    {
        try
        {
            setLoading(true)
            const { data } = await api.get('/api/v1/feeders')
            setFeeders(data.map((f) => ({
                id:       f.id
                ,ref:     f.ref
                ,nom:     f.nom
                ,poste:   f.poste_source
                ,mw:      f.mw_nominal
                ,priority:f.priority
                ,zone:    f.zone
                ,statut:  f.statut
            })))
            setApiError(null)
        }
        catch (err)
        {
            console.error('[BCCDeparts] Failed to load feeders:', err)
            setApiError('Impossible de charger les départs. Vérifiez la connexion au serveur.')
            setFeeders(INITIAL_FEEDERS)   // graceful fallback
        }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { loadFeeders() }, [loadFeeders])

    const showToast = (msg, type = 'ok') =>
    {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3000)
    }

    // ── CRUD — API-backed ─────────────────────────────────────────────────────
    const applyEdit = async () =>
    {
        try
        {
            await api.put(`/api/v1/feeders/${editBuf.id}`,
            {
                nom:          editBuf.nom
                ,poste_source: editBuf.poste
                ,zone:         editBuf.zone
                ,mw_nominal:   Number(editBuf.mw)
                ,priority:     editBuf.priority
                ,statut:       editBuf.statut
            })
            await loadFeeders()
            setEditingId(null)
            setEditBuf({})
            showToast(`Départ ${editBuf.ref} mis à jour.`)
        }
        catch (err)
        {
            showToast('Erreur lors de la mise à jour.', 'warn')
        }
    }

    const handleAdd = async (newFeeder) =>
    {
        try
        {
            await api.post('/api/v1/feeders',
            {
                ref:          newFeeder.ref
                ,nom:         newFeeder.nom
                ,poste_source: newFeeder.poste
                ,zone:        newFeeder.zone
                ,mw_nominal:  Number(newFeeder.mw)
                ,priority:    newFeeder.priority
                ,statut:      newFeeder.statut
            })
            await loadFeeders()
            setShowAdd(false)
            showToast(`Départ ${newFeeder.ref} ajouté avec succès.`)
        }
        catch (err)
        {
            const detail = err?.response?.data?.detail ?? 'Erreur lors de l\'ajout.'
            showToast(detail, 'warn')
        }
    }

    const deleteFeeder = (f) =>
    {
        const msg = f.priority === 'P0'
            ? `Suppression du départ P0 ${f.ref} (${f.nom}). Ce départ est marqué inviolable.`
            : `Suppression du départ ${f.ref} — ${f.nom}. Cette action est irréversible.`

        setConfirmInfo
        ({
            message: msg
            ,onConfirm: async () =>
            {
                try
                {
                    await api.delete(`/api/v1/feeders/${f.id}`)
                    await loadFeeders()
                    setConfirmInfo(null)
                    showToast(`Départ ${f.ref} supprimé.`, 'warn')
                }
                catch
                {
                    showToast('Erreur lors de la suppression.', 'warn')
                    setConfirmInfo(null)
                }
            }
        })
    }
    const filtered = feeders.filter
    (
        (f) =>
        {
            const matchSearch = !search || f.ref.toLowerCase().includes(search.toLowerCase()) || f.nom.toLowerCase().includes(search.toLowerCase()) || f.zone.toLowerCase().includes(search.toLowerCase())
            const matchPri    = filterPri === 'tous' || f.priority === filterPri
            return matchSearch && matchPri
        }
    )

    // Start inline edit
    const startEdit = (f) =>
    {
        setEditingId(f.id)
        setEditBuf({ ...f })
    }

    const cancelEdit = () => { setEditingId(null); setEditBuf({}) }

    // Save inline edit — if P0 changed, require CONFIRMER
    const saveEdit = () =>
    {
        const original = feeders.find((f) => f.id === editBuf.id)
        const p0Changed = (original?.priority !== 'P0' && editBuf.priority === 'P0')
            || (original?.priority === 'P0' && editBuf.priority !== 'P0')

        if (p0Changed)
        {
            setConfirmInfo
            ({
                message: `Modification de la priorité du départ ${editBuf.ref} (${original?.priority} → ${editBuf.priority}). Cette action modifie le statut de protection du départ.`
                ,onConfirm: () =>
                {
                    applyEdit()
                    setConfirmInfo(null)
                }
            })
            return
        }
        applyEdit()
    }

    // CSV file select
    const handleFileChange = (e) =>
    {
        const file = e.target.files?.[0]
        if (!file) return
        setFileError(null)
        setImportDone(false)
        if (!file.name.match(/\.(csv)$/i))
        {
            setFileError('Format non supporté. Utilisez un fichier CSV.')
            return
        }
        setFileName(file.name)
    }

    const handleImport = () =>
    {
        if (!fileName) return
        setImportConf(true)
    }

    const doImport = () =>
    {
        // Demo: just show success — in production would parse CSV rows
        setImportConf(false)
        setImportDone(true)
        setFileName(null)
        if (fileRef.current) fileRef.current.value = ''
        showToast('Catalogue importé avec succès (mode ' + importMode + ').', 'ok')
    }

    // KPIs
    const totalMW = feeders.filter((f) => f.statut === 'Actif').reduce((s, f) => s + f.mw, 0)
    const p0count = feeders.filter((f) => f.priority === 'P0').length
    const actif   = feeders.filter((f) => f.statut === 'Actif').length

    return (
        <div className="w-full text-on-surface flex flex-col gap-space-md p-space-md">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <section className="bg-surface-container-low border border-surface-container-high p-space-md flex flex-col lg:flex-row lg:items-center justify-between gap-space-md shadow-sm">
                <div className="flex items-center gap-space-md">
                    <div className="w-10 h-10 bg-surface-container border border-surface-container-high flex items-center justify-center text-secondary shrink-0">
                        <Icon name="tune" size={22} />
                    </div>
                    <div>
                        <div className="flex items-center gap-space-sm">
                            <h1 className="font-sans font-bold text-sm text-on-surface uppercase tracking-wide">
                                Gestion des Départs HTA — BCC 3
                            </h1>
                            <span className="px-space-sm py-0.5 bg-surface-container text-on-surface-variant font-mono text-[10px] border border-surface-container-high">
                                Béja &amp; Jendouba · 5 postes sources
                            </span>
                        </div>
                        <p className="font-mono text-[10px] text-on-surface-variant mt-space-xs">
                            Catalogue des départs HTA · Priorités P0–P5 · Import CSV · Saisie manuelle
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-space-sm flex-wrap">
                    <button
                        onClick={() => setShowAdd(true)}
                        className="flex items-center gap-space-xs px-space-md py-space-xs bg-secondary-container hover:bg-secondary text-on-secondary-container font-mono text-xs font-bold transition-colors shadow-sm"
                        type="button"
                    >
                        <Icon name="add" size={15} />
                        <span>Nouveau départ</span>
                    </button>
                    <button
                        onClick={() => setTab('import')}
                        className="flex items-center gap-space-xs px-space-md py-space-xs bg-surface-container hover:bg-surface-container-high border border-surface-container-high text-secondary font-mono text-xs transition-colors"
                        type="button"
                    >
                        <Icon name="upload_file" size={15} />
                        <span>Importer CSV</span>
                    </button>
                </div>
            </section>

            {/* ── KPI strip ───────────────────────────────────────────────── */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-space-md">
                {[
                    { label: 'Départs au catalogue', value: String(feeders.length), unit: 'total', icon: 'schema',    cls: 'text-secondary' }
                    ,{ label: 'Départs actifs',       value: String(actif),          unit: 'actifs', icon: 'power',     cls: 'text-[#4ade80]' }
                    ,{ label: 'Départs P0 protégés',  value: String(p0count),        unit: 'P0',     icon: 'lock',      cls: 'text-error'     }
                    ,{ label: 'Charge totale active', value: totalMW.toFixed(1),     unit: 'MW',     icon: 'bolt',      cls: 'text-tertiary'  }
                ].map(({ label, value, unit, icon, cls }) => (
                    <div key={label} className="bg-surface-container-low border border-surface-container-high p-space-md flex items-center justify-between gap-space-md">
                        <div className="flex flex-col">
                            <span className="font-mono text-[10px] text-on-surface-variant uppercase">{label}</span>
                            <div className="flex items-baseline gap-space-xs mt-space-xs">
                                <span className={`font-mono text-2xl font-bold ${cls}`}>{value}</span>
                                <span className="font-mono text-xs text-on-surface-variant">{unit}</span>
                            </div>
                        </div>
                        <Icon name={icon} size={28} className={`${cls} opacity-20`} />
                    </div>
                ))}
            </section>

            {/* ── Tabs ────────────────────────────────────────────────────── */}
            <div className="flex items-center bg-surface-container-lowest border border-surface-container-high p-space-xs gap-space-xs self-start">
                {[
                    { key: 'catalogue', icon: 'table_rows',   label: 'Catalogue des départs' }
                    ,{ key: 'import',   icon: 'upload_file',  label: 'Import CSV'            }
                ].map(({ key, icon, label }) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={`flex items-center gap-space-xs px-space-md py-space-xs font-mono text-xs transition-all ${tab === key ? 'bg-surface-container-high text-secondary font-bold' : 'text-on-surface-variant hover:text-on-surface'}`}
                        type="button"
                    >
                        <Icon name={icon} size={14} />
                        <span>{label}</span>
                    </button>
                ))}
            </div>

            {/* ── CATALOGUE TAB ───────────────────────────────────────────── */}
            {tab === 'catalogue' && (
                <section className="bg-surface-container-low border border-surface-container-high flex flex-col shadow-sm">

                    {/* Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-space-sm px-space-md py-space-sm bg-surface-container-lowest border-b border-surface-container-high">
                        <div className="flex items-center gap-space-sm flex-wrap">
                            {/* Search */}
                            <div className="flex items-center gap-space-xs bg-surface-container border border-surface-container-high px-space-sm py-space-xs">
                                <Icon name="search" size={14} className="text-on-surface-variant" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Chercher réf, nom, zone..."
                                    className="bg-transparent text-on-surface font-mono text-[10px] focus:outline-none w-44"
                                />
                                {search && (
                                    <button onClick={() => setSearch('')} className="text-on-surface-variant hover:text-on-surface" type="button">
                                        <Icon name="close" size={12} />
                                    </button>
                                )}
                            </div>
                            {/* Priority filter */}
                            <div className="flex items-center gap-space-xs">
                                <span className="font-mono text-[10px] text-on-surface-variant">Priorité :</span>
                                <select
                                    value={filterPri}
                                    onChange={(e) => setFilterPri(e.target.value)}
                                    className="bg-surface-container-lowest border border-surface-container-high text-on-surface font-mono text-[10px] px-space-sm py-space-xs focus:outline-none focus:border-secondary"
                                >
                                    <option value="tous">Toutes</option>
                                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                        </div>
                        <span className="font-mono text-[10px] text-on-surface-variant">
                            {filtered.length} départ{filtered.length !== 1 ? 's' : ''} affiché{filtered.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left font-mono text-[10px] border-collapse">
                            <thead className="bg-surface-container border-b border-surface-container-high text-on-surface-variant uppercase tracking-wider">
                                <tr>
                                    <th className="py-space-sm px-space-md">Réf.</th>
                                    <th className="py-space-sm px-space-md">Nom / Libellé</th>
                                    <th className="py-space-sm px-space-md">Poste source</th>
                                    <th className="py-space-sm px-space-md">Zone</th>
                                    <th className="py-space-sm px-space-md text-right">MW nom.</th>
                                    <th className="py-space-sm px-space-md text-center">Priorité</th>
                                    <th className="py-space-sm px-space-md text-center">Statut</th>
                                    <th className="py-space-sm px-space-md text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-container-high">
                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="py-space-xl text-center text-on-surface-variant italic">
                                            Aucun départ ne correspond aux filtres.
                                        </td>
                                    </tr>
                                )}
                                {filtered.map((f) =>
                                {
                                    const isEditing = editingId === f.id
                                    const isP0      = f.priority === 'P0'
                                    const rowBg     = isP0
                                        ? 'bg-error-container/10 hover:bg-error-container/20'
                                        : isEditing
                                            ? 'bg-secondary-container/10'
                                            : 'hover:bg-surface-container'

                                    return (
                                        <tr key={f.id} className={`transition-colors ${rowBg}`}>

                                            {/* Ref */}
                                            <td className={`py-space-sm px-space-md font-bold ${isP0 ? 'text-error' : 'text-secondary'}`}>
                                                {isEditing
                                                    ? <EditCell value={editBuf.ref} onChange={(v) => setEditBuf((b) => ({ ...b, ref: v.toUpperCase() }))} />
                                                    : f.ref
                                                }
                                            </td>

                                            {/* Nom */}
                                            <td className="py-space-sm px-space-md text-on-surface max-w-[180px]">
                                                {isEditing
                                                    ? <EditCell value={editBuf.nom} onChange={(v) => setEditBuf((b) => ({ ...b, nom: v }))} />
                                                    : <span className="truncate block">{f.nom}</span>
                                                }
                                            </td>

                                            {/* Poste */}
                                            <td className="py-space-sm px-space-md text-on-surface-variant">
                                                {isEditing
                                                    ? <EditCell value={editBuf.poste} options={POSTES} onChange={(v) => setEditBuf((b) => ({ ...b, poste: v }))} />
                                                    : f.poste
                                                }
                                            </td>

                                            {/* Zone */}
                                            <td className="py-space-sm px-space-md text-on-surface-variant">
                                                {isEditing
                                                    ? <EditCell value={editBuf.zone} onChange={(v) => setEditBuf((b) => ({ ...b, zone: v }))} />
                                                    : f.zone
                                                }
                                            </td>

                                            {/* MW */}
                                            <td className="py-space-sm px-space-md text-right text-on-surface">
                                                {isEditing
                                                    ? <EditCell value={editBuf.mw} type="number" onChange={(v) => setEditBuf((b) => ({ ...b, mw: v }))} />
                                                    : <span className={isP0 ? 'text-error' : ''}>{f.mw}</span>
                                                }
                                            </td>

                                            {/* Priority */}
                                            <td className="py-space-sm px-space-md text-center">
                                                {isEditing
                                                    ? (
                                                        <select
                                                            value={editBuf.priority}
                                                            onChange={(e) => setEditBuf((b) => ({ ...b, priority: e.target.value }))}
                                                            className="bg-surface-container-lowest border border-secondary/60 text-on-surface font-mono text-[10px] px-space-xs py-0.5 focus:outline-none"
                                                        >
                                                            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                                                        </select>
                                                    )
                                                    : <PriBadge p={f.priority} />
                                                }
                                            </td>

                                            {/* Statut */}
                                            <td className="py-space-sm px-space-md text-center">
                                                {isEditing
                                                    ? (
                                                        <select
                                                            value={editBuf.statut}
                                                            onChange={(e) => setEditBuf((b) => ({ ...b, statut: e.target.value }))}
                                                            className="bg-surface-container-lowest border border-secondary/60 text-on-surface font-mono text-[10px] px-space-xs py-0.5 focus:outline-none"
                                                        >
                                                            <option>Actif</option>
                                                            <option>Inactif</option>
                                                            <option>En maintenance</option>
                                                        </select>
                                                    )
                                                    : (
                                                        <span className={`px-space-xs py-0.5 font-bold text-[9px] ${f.statut === 'Actif' ? 'bg-[#4ade80]/20 text-[#4ade80] border border-[#4ade80]/30' : f.statut === 'En maintenance' ? 'bg-tertiary-container/40 text-tertiary border-tertiary/20' : 'bg-surface-container text-on-surface-variant border-surface-container-high'}`}>
                                                            {f.statut.toUpperCase()}
                                                        </span>
                                                    )
                                                }
                                            </td>

                                            {/* Actions */}
                                            <td className="py-space-sm px-space-md text-center">
                                                {isEditing
                                                    ? (
                                                        <div className="flex items-center justify-center gap-space-xs">
                                                            <button
                                                                onClick={saveEdit}
                                                                className="flex items-center gap-space-xs px-space-sm py-0.5 bg-secondary-container hover:bg-secondary text-on-secondary-container font-mono text-[10px] font-bold transition-colors"
                                                                type="button"
                                                            >
                                                                <Icon name="check" size={13} />
                                                                <span>Enregistrer</span>
                                                            </button>
                                                            <button
                                                                onClick={cancelEdit}
                                                                className="p-space-xs bg-surface-container hover:bg-surface-container-high text-on-surface-variant border border-surface-container-high transition-colors"
                                                                type="button"
                                                            >
                                                                <Icon name="close" size={13} />
                                                            </button>
                                                        </div>
                                                    )
                                                    : (
                                                        <div className="flex items-center justify-center gap-space-xs">
                                                            <button
                                                                onClick={() => startEdit(f)}
                                                                className="p-space-xs bg-surface-container hover:bg-surface-container-high text-secondary border border-surface-container-high transition-colors"
                                                                title="Modifier"
                                                                type="button"
                                                            >
                                                                <Icon name="edit" size={13} />
                                                            </button>
                                                            <button
                                                                onClick={() => deleteFeeder(f)}
                                                                className={`p-space-xs border transition-colors ${isP0 ? 'bg-error-container/30 hover:bg-error-container text-error border-error/30' : 'bg-surface-container hover:bg-error-container/30 text-on-surface-variant hover:text-error border-surface-container-high hover:border-error/30'}`}
                                                                title="Supprimer"
                                                                type="button"
                                                            >
                                                                <Icon name="delete" size={13} />
                                                            </button>
                                                        </div>
                                                    )
                                                }
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* P0 rule footer */}
                    <div className="px-space-md py-space-sm bg-surface-container-lowest border-t border-surface-container-high flex items-center gap-space-sm font-mono text-[10px] text-on-surface-variant">
                        <Icon name="lock" size={12} className="text-error" />
                        <span>Les départs P0 (infrastructure critique) sont exclus de tout programme de délestage. Toute modification de leur priorité requiert une double confirmation.</span>
                    </div>
                </section>
            )}

            {/* ── IMPORT CSV TAB ───────────────────────────────────────────── */}
            {tab === 'import' && (
                <section className="bg-surface-container-low border border-surface-container-high p-space-lg flex flex-col gap-space-lg shadow-sm">
                    <div className="flex items-center gap-space-sm">
                        <Icon name="upload_file" size={16} className="text-secondary" />
                        <h2 className="font-sans font-semibold text-xs text-on-surface uppercase tracking-wide">
                            Import CSV — Catalogue des départs HTA
                        </h2>
                    </div>

                    {/* Mode selector */}
                    <div className="flex flex-col gap-space-sm">
                        <span className="font-mono text-[10px] text-on-surface-variant uppercase">Mode d'import</span>
                        <div className="grid grid-cols-2 gap-space-sm">
                            {[
                                { key: 'merge',   icon: 'merge',        title: 'Fusionner',     desc: 'Ajouter les nouveaux départs et mettre à jour les existants (par référence)' }
                                ,{ key: 'replace', icon: 'swap_horiz',   title: 'Remplacer tout', desc: 'Remplacer intégralement le catalogue — CONFIRMER requis pour les départs P0' }
                            ].map(({ key, icon, title, desc }) => (
                                <button
                                    key={key}
                                    onClick={() => setImportMode(key)}
                                    className={`flex flex-col gap-space-xs p-space-md text-left border transition-all ${importMode === key ? 'bg-secondary-container/20 border-secondary text-on-surface' : 'bg-surface-container border-surface-container-high text-on-surface-variant hover:bg-surface-container-high'}`}
                                    type="button"
                                >
                                    <div className="flex items-center gap-space-sm">
                                        <Icon name={icon} size={15} className={importMode === key ? 'text-secondary' : 'text-on-surface-variant'} />
                                        <span className="font-mono text-xs font-bold uppercase">{title}</span>
                                    </div>
                                    <span className="font-mono text-[10px]">{desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Drop zone */}
                    <div
                        className={`border-2 border-dashed p-10 flex flex-col items-center gap-space-md text-center cursor-pointer transition-all ${fileName ? 'border-secondary/60 bg-secondary-container/10' : 'border-surface-container-high hover:border-secondary/40 hover:bg-surface-container/30'}`}
                        onClick={() => fileRef.current?.click()}
                    >
                        <Icon name="cloud_upload" size={40} className="text-on-surface-variant" />
                        <div>
                            <p className="font-sans font-semibold text-sm text-on-surface">
                                Glissez-déposez le fichier ou cliquez pour parcourir
                            </p>
                            <p className="font-mono text-[10px] text-on-surface-variant mt-space-xs">
                                Format : CSV uniquement · Taille max : 5 Mo
                            </p>
                        </div>
                        {fileName && (
                            <div className="flex items-center gap-space-sm px-space-md py-space-sm bg-surface-container border border-secondary/40">
                                <Icon name="description" size={16} className="text-secondary" />
                                <span className="font-mono text-xs text-secondary font-bold">{fileName}</span>
                                <Icon name="check_circle" size={14} className="text-[#4ade80]" />
                            </div>
                        )}
                        {importDone && !fileName && (
                            <div className="flex items-center gap-space-sm text-[#4ade80] font-mono text-xs font-bold">
                                <Icon name="check_circle" size={16} className="text-[#4ade80]" />
                                Import effectué avec succès
                            </div>
                        )}
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={handleFileChange}
                        />
                    </div>

                    {fileError && (
                        <div className="flex items-center gap-space-sm px-space-md py-space-sm bg-error-container/20 border border-error/40 font-mono text-xs text-error">
                            <Icon name="error" size={14} />
                            <span>{fileError}</span>
                        </div>
                    )}

                    {/* Expected format */}
                    <div className="bg-surface-container-lowest border border-surface-container-high p-space-md flex flex-col gap-space-sm">
                        <span className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">Format CSV attendu</span>
                        <div className="font-mono text-xs text-on-surface-variant space-y-0.5">
                            <p className="text-on-surface">ref,nom,poste_source,zone,mw_nominal,priorite,statut</p>
                            <p>F47,Ain Snoussi Extension,Tabarka TR1,Ain Snoussi,3.1,P5,Actif</p>
                            <p>F48,Quartier Administratif Beja,Beja Centre TR1,Beja Centre,2.8,P3,Actif</p>
                            <p className="text-on-surface-variant italic">... (une ligne par départ)</p>
                        </div>
                        <div className="flex items-start gap-space-xs px-space-sm py-space-xs bg-tertiary-container/20 border border-tertiary/30 font-mono text-[10px] text-tertiary">
                            <Icon name="info" size={13} className="shrink-0 mt-0.5" />
                            <span>Les départs P0 dans le fichier déclencheront automatiquement la procédure de confirmation CONFIRMER avant import.</span>
                        </div>
                    </div>

                    {/* Import button */}
                    <div className="flex items-center justify-end gap-space-sm">
                        <button
                            onClick={() => setTab('catalogue')}
                            className="px-space-md py-space-xs bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono text-xs border border-surface-container-high transition-colors"
                            type="button"
                        >
                            Annuler
                        </button>
                        <button
                            onClick={handleImport}
                            disabled={!fileName}
                            className="flex items-center gap-space-xs px-space-md py-space-xs bg-secondary-container hover:bg-secondary text-on-secondary-container font-mono text-xs font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                            type="button"
                        >
                            <Icon name="upload" size={14} />
                            <span>Importer le fichier</span>
                        </button>
                    </div>
                </section>
            )}

            {/* ── Modals ──────────────────────────────────────────────────── */}
            {showAdd && (
                <AddFeederModal
                    onSave={handleAdd}
                    onCancel={() => setShowAdd(false)}
                    nextId={Math.max(...feeders.map((f) => f.id)) + 1}
                />
            )}

            {confirmInfo && (
                <ConfirmerModal
                    message={confirmInfo.message}
                    onConfirm={confirmInfo.onConfirm}
                    onCancel={() => setConfirmInfo(null)}
                />
            )}

            {importConf && (
                <ConfirmerModal
                    message={`Import CSV en mode "${importMode}" — ${importMode === 'replace' ? 'Le catalogue entier sera remplacé.' : 'Les départs existants seront mis à jour.'} Action irréversible.`}
                    onConfirm={doImport}
                    onCancel={() => setImportConf(false)}
                />
            )}

            {/* ── Toast ───────────────────────────────────────────────────── */}
            {toast && (
                <div className={`fixed bottom-12 right-4 z-50 flex items-center gap-space-sm px-space-md py-space-sm shadow-xl font-mono text-xs font-bold border transition-all ${toast.type === 'warn' ? 'bg-tertiary-container text-tertiary border-tertiary/40' : 'bg-surface-container-highest text-secondary border-secondary/30'}`}>
                    <Icon name={toast.type === 'warn' ? 'warning' : 'check_circle'} size={15} />
                    <span>{toast.msg}</span>
                </div>
            )}
        </div>
    )
}
