import { useState, useCallback, useEffect, useRef } from 'react'
import api from '../../lib/api'
import { useProgrammesStore } from '../../stores/programmesStore'

// ── Local timezone helper (Tunis = UTC+1) ─────────────────────────────────────
function tunisTime()
{
    const d = new Date()
    // UTC+1 offset
    d.setTime(d.getTime() + 60 * 60 * 1000)
    const h = d.getUTCHours(), m = d.getUTCMinutes()
    const slot = `${String(h).padStart(2,'0')}:${m < 30 ? '00' : '30'}`
    return { h, m, slot }
}

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

// ── Initial state ─────────────────────────────────────────────────────────────
const DEFAULTS =
{
    seuilDeficit:    25
    ,seuilPct:       10
    ,dureeMax:       45
    ,intervalleRepos: 8
    ,pasTemps:       30
    ,heureLimite:    '06:00'
    ,rappelHeure:    '20:00'
    ,rappelActif:    true
    ,splitNord:      67
    ,crcNordIngenieur:  'Ing. M. Trabelsi'
    ,crcNordTel:        '+216 71 340 102'
    ,crcNordRadio:      'VHF 04-Nord'
    ,crcNordEmail:      'crc.nord@steg.com.tn'
    ,crcSudIngenieur:   'Ing. R. Karray'
    ,crcSudTel:         '+216 73 221 800'
    ,crcSudRadio:       'VHF 07-Sud'
    ,crcSudEmail:       'crc.sud@steg.com.tn'
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ icon, iconCls = 'text-secondary', title, subtitle, badge, children })
{
    return (
        <div className="bg-surface-container-lowest border border-surface-container rounded overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 bg-surface-container border-b border-surface-container flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                    <Icon name={icon} size={20} className={iconCls} />
                    <div>
                        <h2 className="font-headline-sm text-sm text-on-surface font-semibold uppercase tracking-wide">
                            {title}
                        </h2>
                        <p className="font-body-sm text-[11px] text-on-surface-variant">{subtitle}</p>
                    </div>
                </div>
                {badge && (
                    <span className="font-label-telemetry-sm text-[11px] text-on-surface-variant px-2 py-0.5 rounded bg-surface-container-lowest border border-surface-container-high">
                        {badge}
                    </span>
                )}
            </div>
            {children}
        </div>
    )
}

// ── Labelled text/number input ────────────────────────────────────────────────
function ParamField({ label, description, children, changed = false, footerNote = null, footerIcon = null, footerCls = 'text-on-surface-variant' })
{
    return (
        <div className={`bg-surface-container-low border p-4 rounded flex flex-col justify-between transition-all ${changed ? 'border-l-4 border-l-tertiary border-surface-container-highest bg-tertiary-container/10' : 'border-surface-container-highest'}`}>
            <div>
                <p className="font-label-caps text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">{label}</p>
                <p className="font-body-sm text-[11px] text-outline leading-relaxed mb-3">{description}</p>
            </div>
            <div>
                {children}
                {footerNote && (
                    <div className={`mt-2 text-[10px] flex items-center gap-1 font-body-sm ${footerCls}`}>
                        {footerIcon && <Icon name={footerIcon} size={13} />}
                        <span>{footerNote}</span>
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Number input with unit ────────────────────────────────────────────────────
function NumInput({ id, value, onChange, min, max, step, unit })
{
    return (
        <div className="relative flex items-center">
            <input
                id={id}
                type="number"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full bg-[#0b1c30] border border-[#26364a] focus:border-secondary focus:ring-1 focus:ring-secondary/50 text-on-surface font-label-telemetry-md text-sm px-3 py-2 rounded focus:outline-none transition-all shadow-inner"
            />
            {unit && (
                <span className="absolute right-3 font-label-telemetry-sm text-xs text-on-surface-variant pointer-events-none font-semibold">
                    {unit}
                </span>
            )}
        </div>
    )
}

// ── Text input with optional icon ─────────────────────────────────────────────
function TextInput({ value, onChange, type = 'text', iconName = null, focusCls = 'focus:border-secondary focus:ring-secondary/50' })
{
    return (
        <div className="relative flex items-center">
            {iconName && (
                <Icon name={iconName} size={16} className="absolute left-2.5 text-on-surface-variant pointer-events-none" />
            )}
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={`w-full bg-[#0b1c30] border border-[#26364a] ${focusCls} focus:ring-1 text-on-surface font-label-telemetry-md text-xs ${iconName ? 'pl-8' : 'px-3'} pr-3 py-1.5 rounded focus:outline-none transition-all`}
            />
        </div>
    )
}

// ── Toast notification ────────────────────────────────────────────────────────
function Toast({ visible })
{
    return (
        <div className={`fixed bottom-12 right-6 z-50 flex items-center gap-3 bg-surface-container-low border border-secondary/50 text-on-surface px-4 py-3 rounded shadow-2xl transition-all duration-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}>
            <div className="w-8 h-8 rounded bg-[#16a34a]/20 border border-[#16a34a]/40 text-[#4ade80] flex items-center justify-center shrink-0">
                <Icon name="check_circle" size={20} />
            </div>
            <div>
                <div className="font-headline-sm text-xs font-semibold text-on-surface">
                    Modifications enregistrees avec succes
                </div>
                <div className="font-label-telemetry-sm text-[10px] text-on-surface-variant">
                    Les nouveaux seuils ont ete repliquer sur les calculateurs EMS/SCADA.
                </div>
            </div>
        </div>
    )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ParametresSeuils()
{
    const { syncRappelSettings } = useProgrammesStore()

    // ── Seuils d'alerte
    const [seuilDeficit, setSeuilDeficit] = useState(DEFAULTS.seuilDeficit)
    const [seuilPct,     setSeuilPct]     = useState(DEFAULTS.seuilPct)
    const [dureeMax,     setDureeMax]     = useState(DEFAULTS.dureeMax)
    const [intervalleRepos, setIntervalleRepos] = useState(DEFAULTS.intervalleRepos)

    // ── Programme J-1
    const [pasTemps,    setPasTemps]    = useState(DEFAULTS.pasTemps)
    const [rappelHeure, setRappelHeure] = useState(DEFAULTS.rappelHeure)
    const [rappelActif, setRappelActif] = useState(DEFAULTS.rappelActif)

    // ── CRC split
    const [splitNord, setSplitNord] = useState(DEFAULTS.splitNord)
    const splitSud                  = 100 - splitNord

    // ── Contacts
    const [crcNord, setCrcNord] = useState
    ({
        ingenieur: DEFAULTS.crcNordIngenieur
        ,tel:      DEFAULTS.crcNordTel
        ,radio:    DEFAULTS.crcNordRadio
        ,email:    DEFAULTS.crcNordEmail
    })
    const [crcSud, setCrcSud] = useState
    ({
        ingenieur: DEFAULTS.crcSudIngenieur
        ,tel:      DEFAULTS.crcSudTel
        ,radio:    DEFAULTS.crcSudRadio
        ,email:    DEFAULTS.crcSudEmail
    })

    // ── Accounts
    // ── UI state
    const [toast,       setToast]       = useState(false)
    const [hasChanges,  setHasChanges]  = useState(false)

    // Load persisted split key from backend on mount
    useEffect(() =>
    {
        api.get('/api/v1/settings/crc-split')
            .then(({ data }) =>
            {
                setSplitNord(data.split_nord)
                if (data.intervalle_min_heures != null) setIntervalleRepos(data.intervalle_min_heures)
            })
            .catch(() => { /* keep defaults */ })

        // Push current rappel settings into programmesStore so useJ1Reminder
        // always reads the latest values even before the operator opens Paramètres.
        syncRappelSettings(rappelActif, rappelHeure)
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-save the split whenever it changes (debounced 800 ms).
    // This ensures the value survives navigation without requiring
    // the operator to click "Sauvegarder" for this specific field.
    const splitAutoSaveRef = useRef(false)   // skip the very first render (initial load)
    useEffect(() =>
    {
        if (!splitAutoSaveRef.current) { splitAutoSaveRef.current = true; return }
        const timer = setTimeout(() =>
        {
            api.put('/api/v1/settings/crc-split', {
                split_nord:            splitNord,
                intervalle_min_heures: intervalleRepos,
            }).catch((err) => console.error('[Paramètres] Auto-save split failed:', err?.response?.data ?? err.message))
        }, 800)
        return () => clearTimeout(timer)
    }, [splitNord]) // eslint-disable-line react-hooks/exhaustive-deps

    // Mark unsaved on any change
    const touch = useCallback(() => setHasChanges(true), [])

    // Helpers that also touch
    const updateSeuilDeficit = (v) => { setSeuilDeficit(v); touch() }
    const updateSeuilPct     = (v) => { setSeuilPct(v);     touch() }
    const updateDureeMax     = (v) => { setDureeMax(v);     touch() }
    const updatePasTemps     = (v) => { setPasTemps(v);     touch() }
    const updateRappelHeure  = (v) => { setRappelHeure(v);  touch(); syncRappelSettings(rappelActif, v)  }
    const updateRappelActif  = (v) => { setRappelActif(v);  touch(); syncRappelSettings(v, rappelHeure) }
    const updateSplit        = (v) =>
    {
        const clamped = Math.max(0, Math.min(100, Number(v)))
        setSplitNord(clamped)
        touch()
    }
    const updateCrcNord = (field, val) => { setCrcNord((c) => ({ ...c, [field]: val })); touch() }
    const updateCrcSud  = (field, val) => { setCrcSud((c)  => ({ ...c, [field]: val })); touch() }

    const handleSave = () =>
    {
        // Persist the CRC split key and cooldown threshold to the backend
        api.put('/api/v1/settings/crc-split', {
            split_nord:            splitNord,
            intervalle_min_heures: intervalleRepos,
        })
            .catch((err) => console.error('[Paramètres] Failed to save settings:', err?.response?.data ?? err.message))

        setHasChanges(false)
        setToast(true)
        setTimeout(() => setToast(false), 3500)
    }

    const handleReset = () =>
    {
        setSeuilDeficit(DEFAULTS.seuilDeficit)
        setSeuilPct(DEFAULTS.seuilPct)
        setDureeMax(DEFAULTS.dureeMax)
        setIntervalleRepos(DEFAULTS.intervalleRepos)
        setPasTemps(DEFAULTS.pasTemps)
        setRappelHeure(DEFAULTS.rappelHeure)
        setRappelActif(DEFAULTS.rappelActif)
        setSplitNord(DEFAULTS.splitNord)
        setCrcNord
        ({
            ingenieur: DEFAULTS.crcNordIngenieur
            ,tel:      DEFAULTS.crcNordTel
            ,radio:    DEFAULTS.crcNordRadio
            ,email:    DEFAULTS.crcNordEmail
        })
        setCrcSud
        ({
            ingenieur: DEFAULTS.crcSudIngenieur
            ,tel:      DEFAULTS.crcSudTel
            ,radio:    DEFAULTS.crcSudRadio
            ,email:    DEFAULTS.crcSudEmail
        })
        setHasChanges(false)
    }

    // ── Changed helpers (compare to defaults)
    const changed = (val, def) => val !== def

    // ── Auto-exec state ───────────────────────────────────────────────────────
    const [autoExecBccs,      setAutoExecBccs]      = useState([])    // [{id,name,zone,auto_mode}]
    const [autoExecLoading,   setAutoExecLoading]   = useState(true)
    const [toggleLoading,     setToggleLoading]     = useState({})    // {bcc_id: bool}
    const [triggerLoading,    setTriggerLoading]    = useState(false)
    const [triggerResult,     setTriggerResult]     = useState(null)  // {slot, bccs_processed} | 'error'

    // Load BCC auto-exec status on mount
    useEffect(() =>
    {
        api.get('/api/v1/settings/auto-exec')
            .then(({ data }) => { setAutoExecBccs(data.bccs ?? []); setAutoExecLoading(false) })
            .catch(() => setAutoExecLoading(false))
    }, [])

    const handleAutoExecToggle = async (bccId, currentMode) =>
    {
        setToggleLoading((prev) => ({ ...prev, [bccId]: true }))
        try
        {
            const { data } = await api.post(`/api/v1/settings/auto-exec/${bccId}`, { auto_mode: !currentMode })
            setAutoExecBccs((prev) => prev.map((b) => b.id === bccId ? { ...b, auto_mode: data.auto_mode } : b))
        }
        catch (err) { console.error('[Paramètres] toggle auto-exec failed:', err?.response?.data ?? err.message) }
        finally { setToggleLoading((prev) => ({ ...prev, [bccId]: false })) }
    }

    const handleTriggerNow = async () =>
    {
        setTriggerLoading(true)
        setTriggerResult(null)
        try
        {
            const { data } = await api.post('/api/v1/settings/auto-exec/trigger-now')
            setTriggerResult(data)
            setTimeout(() => setTriggerResult(null), 8000)
        }
        catch (err)
        {
            console.error('[Paramètres] trigger-now failed:', err?.response?.data ?? err.message)
            setTriggerResult('error')
            setTimeout(() => setTriggerResult(null), 5000)
        }
        finally { setTriggerLoading(false) }
    }

    const autoOnCount  = autoExecBccs.filter((b) => b.auto_mode).length
    const currentSlot  = tunisTime().slot

    return (
        <div className="w-full min-h-full bg-background text-on-surface font-body-md text-body-md">
            <div className="p-6 max-w-7xl mx-auto space-y-6">

                {/* ── Section 1 — Page header ─────────────────────────────── */}
                <div className="bg-surface-container-lowest border border-surface-container rounded p-5 shadow-sm">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex items-start gap-3.5">
                            <div className="p-2.5 rounded bg-surface-container text-secondary flex items-center justify-center shrink-0 border border-surface-container-high">
                                <Icon name="tune" size={28} />
                            </div>
                            <div>
                                <div className="flex items-center gap-2.5 flex-wrap">
                                    <h1 className="font-headline-lg text-xl text-on-surface font-semibold tracking-tight">
                                        Parametres &amp; Seuils
                                    </h1>
                                    <span className="px-2 py-0.5 rounded bg-surface-container-highest text-secondary font-label-telemetry-sm text-[11px] uppercase font-semibold border border-surface-container-high">
                                        CONFIGURATION SYSTEME · DN TUNIS
                                    </span>
                                    {hasChanges && (
                                        <span className="px-2 py-0.5 rounded bg-tertiary-container text-tertiary font-label-telemetry-sm text-[11px] font-semibold border border-tertiary/40 animate-pulse">
                                            MODIFICATIONS NON SAUVEGARDEES
                                        </span>
                                    )}
                                </div>
                                <p className="font-body-sm text-xs text-on-surface-variant mt-1">
                                    Configuration operationnelle — Regles metier et seuils d'arbitrage du systeme national de delestage
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 flex-wrap">
                            <button
                                onClick={handleReset}
                                type="button"
                                className="px-3.5 py-2 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface font-body-sm text-xs flex items-center gap-1.5 border border-surface-container-highest transition-colors"
                            >
                                <Icon name="restart_alt" size={16} />
                                <span>Reinitialiser les valeurs par defaut</span>
                            </button>
                            <button
                                onClick={handleSave}
                                type="button"
                                className="px-4 py-2 rounded bg-secondary-container hover:bg-secondary-container/90 text-on-secondary-container font-headline-sm text-xs font-semibold uppercase tracking-wider flex items-center gap-2 transition-all shadow-sm"
                            >
                                <Icon name="save" size={18} />
                                <span>Sauvegarder les modifications</span>
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-surface-container flex items-start gap-2 text-on-surface-variant font-body-sm text-xs">
                        <Icon name="info" size={16} className="text-tertiary shrink-0 mt-0.5" />
                        <p className="leading-relaxed">
                            <strong className="text-tertiary">Note d'exploitation :</strong>{' '}
                            Toute modification des parametres prend effet immediatement apres sauvegarde et s'applique aux prochains programmes de delestage et au cycle de surveillance SCADA.
                        </p>
                    </div>
                </div>

                {/* ── Section 2 — Seuils d'alerte ────────────────────────── */}
                <Section
                    icon="warning"
                    iconCls="text-tertiary"
                    title="Seuils d'alerte"
                    subtitle="Definissent les conditions de declenchement des alertes sur le tableau de bord DN"
                    badge="3 SEUILS CRITIQUES"
                >
                    <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">

                        {/* Seuil déficit */}
                        <ParamField
                            label="Seuil de deficit national"
                            description="Declenche l'alerte rouge sur le tableau de bord DN si l'ecart entre planifie et realise depasse cette valeur."
                            changed={changed(seuilDeficit, DEFAULTS.seuilDeficit)}
                            footerNote={`Plage conseillee : 15 — 50 MW  |  Defaut : ${DEFAULTS.seuilDeficit} MW`}
                        >
                            <NumInput
                                id="seuilDeficit"
                                value={seuilDeficit}
                                onChange={updateSeuilDeficit}
                                min={5} max={200} step={1}
                                unit="MW"
                            />
                        </ParamField>

                        {/* Seuil pourcentage */}
                        <ParamField
                            label="Seuil d'ecart en pourcentage"
                            description="Declenche l'alerte si le realise est inferieur au planifie de plus de ce pourcentage relatif."
                            changed={changed(seuilPct, DEFAULTS.seuilPct)}
                            footerNote={`Tolerance SCADA : 5 — 15 %  |  Defaut : ${DEFAULTS.seuilPct} %`}
                        >
                            <NumInput
                                id="seuilPct"
                                value={seuilPct}
                                onChange={updateSeuilPct}
                                min={1} max={30} step={0.5}
                                unit="%"
                            />
                        </ParamField>

                        {/* Durée max */}
                        <ParamField
                            label="Duree maximale par depart"
                            description="Duree maximale autorisee pour une coupure sur un depart avant declenchement d'une alerte de depassement aux BCCs."
                            changed={changed(dureeMax, DEFAULTS.dureeMax)}
                            footerNote="Recommandation Note Conceptuelle STEG : 45 minutes maximum"
                            footerIcon="verified"
                            footerCls="text-tertiary"
                        >
                            <NumInput
                                id="dureeMax"
                                value={dureeMax}
                                onChange={updateDureeMax}
                                min={15} max={120} step={5}
                                unit="min"
                            />
                        </ParamField>

                        {/* Intervalle minimum de repos entre coupures */}
                        <ParamField
                            label="Intervalle minimum de repos entre coupures"
                            description="Duree minimale requise entre deux coupures successives sur le meme depart HTA. Garantit l'equite de la rotation entre les zones."
                            changed={changed(intervalleRepos, DEFAULTS.intervalleRepos)}
                            footerNote={`Plage conseillée : 4 — 48 h  |  Défaut : ${DEFAULTS.intervalleRepos} h`}
                            footerIcon="autorenew"
                            footerCls="text-secondary"
                        >
                            <NumInput
                                id="intervalleRepos"
                                value={intervalleRepos}
                                onChange={(v) => { setIntervalleRepos(v); touch() }}
                                min={1} max={168} step={1}
                                unit="h"
                            />
                        </ParamField>
                    </div>
                </Section>

                {/* ── Section 3 — Programme J-1 ───────────────────────────── */}
                <Section
                    icon="event_note"
                    iconCls="text-secondary"
                    title="Programme J-1"
                    subtitle="Parametres de construction du programme previsionnel jour-suivant"
                    badge={rappelActif ? `RAPPEL J+1 — ${rappelHeure}` : 'RAPPEL J+1 — DESACTIVE'}
                >
                    <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">

                        {/* Pas de temps */}
                        <ParamField
                            label="Pas de temps du programme"
                            description="Granularite temporelle du programme J-1. 15 minutes = 96 creneaux/jour. 30 minutes = 48 creneaux/jour."
                            changed={changed(pasTemps, DEFAULTS.pasTemps)}
                            footerNote="Alignement SCADA DN avec pas de compensation EMS standard"
                        >
                            <div className="grid grid-cols-2 gap-2 bg-[#000f21] p-1 rounded border border-[#26364a]">
                                <button
                                    onClick={() => updatePasTemps(15)}
                                    type="button"
                                    className={`py-2 px-3 rounded text-xs font-label-telemetry-sm transition-all flex items-center justify-center gap-1.5 ${
                                        pasTemps === 15
                                            ? 'bg-surface-container-high text-secondary border border-secondary/40 font-semibold shadow-sm'
                                            : 'text-on-surface-variant hover:text-on-surface'
                                    }`}
                                >
                                    {pasTemps === 15 && <span className="w-1.5 h-1.5 rounded-full bg-secondary" />}
                                    <span>15 minutes</span>
                                    <span className="text-[10px] opacity-70">(96 cr.)</span>
                                </button>
                                <button
                                    onClick={() => updatePasTemps(30)}
                                    type="button"
                                    className={`py-2 px-3 rounded text-xs font-label-telemetry-sm transition-all flex items-center justify-center gap-1.5 ${
                                        pasTemps === 30
                                            ? 'bg-surface-container-high text-secondary border border-secondary/40 font-semibold shadow-sm'
                                            : 'text-on-surface-variant hover:text-on-surface'
                                    }`}
                                >
                                    {pasTemps === 30 && <span className="w-1.5 h-1.5 rounded-full bg-secondary" />}
                                    <span>30 minutes (defaut)</span>
                                </button>
                            </div>
                        </ParamField>

                        {/* Rappel programme J+1 */}
                        <ParamField
                            label="Rappel — Programme J+1 non saisi"
                            description="Si le programme du lendemain n'a pas encore ete saisi, le systeme envoie une notification de rappel au DN a l'heure configuree."
                            changed={changed(rappelHeure, DEFAULTS.rappelHeure) || changed(rappelActif, DEFAULTS.rappelActif)}
                        >
                            {/* Toggle activer / desactiver */}
                            <div className="flex items-center justify-between mb-3">
                                <span className="font-label-caps text-[10px] text-outline uppercase tracking-wider font-semibold">
                                    Rappel automatique
                                </span>
                                <button
                                    type="button"
                                    onClick={() => updateRappelActif(!rappelActif)}
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors duration-200 focus:outline-none ${rappelActif ? 'bg-secondary border-secondary/60' : 'bg-surface-container-highest border-surface-container-high'}`}
                                    aria-pressed={rappelActif}
                                    title={rappelActif ? 'Desactiver le rappel' : 'Activer le rappel'}
                                >
                                    <span
                                        className={`inline-block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform duration-200 ${rappelActif ? 'translate-x-4' : 'translate-x-0.5'}`}
                                    />
                                </button>
                            </div>

                            {/* Time picker */}
                            <div className={`transition-opacity duration-200 ${rappelActif ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                                <input
                                    type="time"
                                    value={rappelHeure}
                                    onChange={(e) => updateRappelHeure(e.target.value)}
                                    disabled={!rappelActif}
                                    className="w-full bg-[#0b1c30] border border-[#26364a] focus:border-secondary focus:ring-1 focus:ring-secondary/50 text-on-surface font-label-telemetry-md text-sm px-3 py-2 rounded focus:outline-none transition-all shadow-inner disabled:cursor-not-allowed"
                                />
                            </div>

                            {/* Footer note */}
                            <div className={`mt-2 text-[10px] flex items-center gap-1 font-body-sm transition-opacity duration-200 ${rappelActif ? 'text-secondary' : 'text-on-surface-variant'}`}>
                                <Icon name={rappelActif ? 'notifications_active' : 'notifications_off'} size={13} />
                                <span>
                                    {rappelActif
                                        ? `Rappel active — notification envoyee a ${rappelHeure} si J+1 non saisi`
                                        : 'Rappel desactive — aucune notification ne sera envoyee'
                                    }
                                </span>
                            </div>
                        </ParamField>
                    </div>
                </Section>

                {/* ── Section 4 — Clé de répartition CRC ─────────────────── */}
                <Section
                    icon="alt_route"
                    iconCls="text-secondary"
                    title="Cle de repartition CRC"
                    subtitle="Repartition par defaut de l'objectif national entre CRC Nord et CRC Sud. Ajustable manuellement lors de chaque programme."
                >
                    <div className="p-5 space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            {/* CRC Nord */}
                            <div className="bg-surface-container-low border border-surface-container-highest p-4 rounded">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-secondary" />
                                        <span className="font-headline-sm text-xs text-on-surface font-semibold uppercase tracking-wider">
                                            CRC NORD (Grand Tunis, Bizerte, Nord-Ouest)
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number"
                                            min={0} max={100}
                                            value={splitNord}
                                            onChange={(e) => updateSplit(e.target.value)}
                                            className="w-16 bg-[#000f21] border border-[#26364a] text-secondary font-label-telemetry-md font-bold text-sm text-right px-2 py-1 rounded focus:outline-none focus:border-secondary"
                                        />
                                        <span className="font-label-telemetry-sm text-xs text-secondary font-semibold">%</span>
                                    </div>
                                </div>
                                <input
                                    type="range"
                                    min={0} max={100}
                                    value={splitNord}
                                    onChange={(e) => updateSplit(e.target.value)}
                                    className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-secondary"
                                />
                                <div className="mt-3 flex items-center justify-between text-[11px] font-label-telemetry-sm">
                                    <span className="text-on-surface-variant">Quote-part cible :</span>
                                    <span className="text-secondary font-semibold">~ {splitNord * 10} MW sur base 1 000 MW</span>
                                </div>
                            </div>

                            {/* CRC Sud */}
                            <div className="bg-surface-container-low border border-surface-container-highest p-4 rounded">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-tertiary" />
                                        <span className="font-headline-sm text-xs text-on-surface font-semibold uppercase tracking-wider">
                                            CRC SUD (Centre, Sahel, Sud)
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number"
                                            min={0} max={100}
                                            value={splitSud}
                                            onChange={(e) => updateSplit(100 - Number(e.target.value))}
                                            className="w-16 bg-[#000f21] border border-[#26364a] text-tertiary font-label-telemetry-md font-bold text-sm text-right px-2 py-1 rounded focus:outline-none focus:border-tertiary"
                                        />
                                        <span className="font-label-telemetry-sm text-xs text-tertiary font-semibold">%</span>
                                    </div>
                                </div>
                                <input
                                    type="range"
                                    min={0} max={100}
                                    value={splitSud}
                                    onChange={(e) => updateSplit(100 - Number(e.target.value))}
                                    className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-amber-400"
                                    style={{ accentColor: '#ffb95f' }}
                                />
                                <div className="mt-3 flex items-center justify-between text-[11px] font-label-telemetry-sm">
                                    <span className="text-on-surface-variant">Quote-part cible :</span>
                                    <span className="text-tertiary font-semibold">~ {splitSud * 10} MW sur base 1 000 MW</span>
                                </div>
                            </div>
                        </div>

                        {/* Live preview bar */}
                        <div className="bg-surface-container-low p-4 rounded border border-surface-container-highest">
                            <div className="flex justify-between items-center mb-2 font-label-caps text-[10px] uppercase tracking-wider font-semibold">
                                <span className="text-on-surface-variant">PREVISUALISATION DYNAMIQUE DE LA CLE NATIONALE (SOMME STRICTE : 100 %)</span>
                                <span className="font-label-telemetry-sm text-xs text-on-surface">{splitNord}% NORD / {splitSud}% SUD</span>
                            </div>
                            <div className="w-full h-4 bg-surface-container-lowest rounded overflow-hidden flex border border-[#26364a]">
                                <div
                                    className="bg-secondary h-full transition-all duration-150 flex items-center justify-center font-label-telemetry-sm text-[10px] text-background font-bold"
                                    style={{ width: `${splitNord}%` }}
                                >
                                    {splitNord}%
                                </div>
                                <div
                                    className="bg-tertiary h-full transition-all duration-150 flex items-center justify-center font-label-telemetry-sm text-[10px] text-background font-bold"
                                    style={{ width: `${splitSud}%` }}
                                >
                                    {splitSud}%
                                </div>
                            </div>
                            <div className="flex items-center justify-between mt-2.5 text-[11px] text-on-surface-variant">
                                <span className="flex items-center gap-1">
                                    <Icon name="info" size={14} className="text-secondary" />
                                    <span>Cette cle est ajustable en temps reel par les operateurs CRC lors de l'execution</span>
                                </span>
                                <span className="font-label-telemetry-sm text-on-surface-variant">Ecart max inter-BCC admis : 15%</span>
                            </div>
                        </div>
                    </div>
                </Section>

                {/* ── Section 5 — Exécution automatique J+1 ──────────────── */}
                <Section
                    icon="smart_screen"
                    iconCls="text-tertiary"
                    title="Execution automatique J+1"
                    subtitle="Pilotage du mode auto-exec par BCC — declenche les fenetres horaires planifiees sans intervention operateur"
                    badge={autoExecLoading ? 'CHARGEMENT…' : `${autoOnCount}/${autoExecBccs.length} BCCs EN AUTO`}
                >
                    <div className="p-5 flex flex-col gap-5">

                        {/* Trigger Now panel */}
                        <div className="bg-surface-container-low border border-tertiary/30 rounded p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div className="flex items-start gap-3">
                                <div className="w-9 h-9 rounded bg-tertiary/10 border border-tertiary/30 flex items-center justify-center text-tertiary shrink-0">
                                    <Icon name="play_circle" size={22} />
                                </div>
                                <div>
                                    <p className="font-headline-sm text-xs text-on-surface font-semibold uppercase tracking-wide">
                                        Declencher le creneau maintenant
                                    </p>
                                    <p className="font-body-sm text-[11px] text-on-surface-variant mt-0.5">
                                        Force l'execution immediate du creneau actuel ({currentSlot}) sur tous les BCCs en mode AUTO.
                                        Utile apres un redemarrage serveur ou un creneau manque.
                                    </p>
                                    {triggerResult && triggerResult !== 'error' && (
                                        <div className="mt-2 flex items-center gap-1.5 font-label-telemetry-sm text-[11px] text-[#4ade80]">
                                            <Icon name="check_circle" size={14} />
                                            <span>
                                                Creneau {triggerResult.slot} declenche — {triggerResult.bccs_processed} BCC(s) traites
                                            </span>
                                        </div>
                                    )}
                                    {triggerResult === 'error' && (
                                        <div className="mt-2 flex items-center gap-1.5 font-label-telemetry-sm text-[11px] text-error">
                                            <Icon name="error" size={14} />
                                            <span>Echec du declenchement — verifiez les logs serveur</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleTriggerNow}
                                disabled={triggerLoading || autoOnCount === 0}
                                className="flex items-center gap-2 px-4 py-2 rounded bg-tertiary/20 hover:bg-tertiary/30 border border-tertiary/50 text-tertiary font-headline-sm text-xs font-semibold uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                                title={autoOnCount === 0 ? 'Aucun BCC en mode AUTO' : 'Declencher immediatement'}
                            >
                                {triggerLoading
                                    ? <><Icon name="hourglass_top" size={16} className="animate-spin" /><span>Execution…</span></>
                                    : <><Icon name="bolt" size={16} /><span>Declencher {currentSlot}</span></>
                                }
                            </button>
                        </div>

                        {/* Per-BCC toggle grid */}
                        {autoExecLoading
                            ? (
                                <div className="flex items-center justify-center py-6 gap-2 font-body-sm text-xs text-on-surface-variant">
                                    <Icon name="hourglass_empty" size={16} className="text-secondary animate-spin" />
                                    <span>Chargement de l'etat des BCCs…</span>
                                </div>
                            )
                            : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                    {autoExecBccs.map((bcc) =>
                                    {
                                        const isOn      = bcc.auto_mode
                                        const isLoading = !!toggleLoading[bcc.id]
                                        return (
                                            <div
                                                key={bcc.id}
                                                className={`bg-surface-container-low rounded p-3.5 flex flex-col gap-3 border transition-all ${isOn ? 'border-tertiary/40 bg-tertiary/5' : 'border-surface-container-highest'}`}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <p className="font-headline-sm text-xs text-on-surface font-semibold uppercase tracking-wide truncate">
                                                            {bcc.name}
                                                        </p>
                                                        <p className="font-body-sm text-[10px] text-on-surface-variant truncate mt-0.5">
                                                            {bcc.zone}
                                                        </p>
                                                    </div>
                                                    {/* Toggle */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAutoExecToggle(bcc.id, isOn)}
                                                        disabled={isLoading}
                                                        aria-pressed={isOn}
                                                        title={isOn ? 'Desactiver le mode automatique' : 'Activer le mode automatique'}
                                                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors duration-200 focus:outline-none disabled:opacity-50 ${isOn ? 'bg-tertiary border-tertiary/60' : 'bg-surface-container-highest border-surface-container-high'}`}
                                                    >
                                                        {isLoading
                                                            ? <span className="absolute inset-0 flex items-center justify-center"><Icon name="hourglass_top" size={12} className={isOn ? 'text-background' : 'text-on-surface-variant'} /></span>
                                                            : <span className={`inline-block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform duration-200 ${isOn ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                        }
                                                    </button>
                                                </div>

                                                {/* Status badge */}
                                                <div className={`flex items-center gap-1.5 px-2 py-1 rounded font-label-telemetry-sm text-[10px] font-semibold uppercase ${isOn ? 'bg-tertiary/10 text-tertiary border border-tertiary/30' : 'bg-surface-container text-on-surface-variant border border-surface-container-highest'}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOn ? 'bg-tertiary animate-pulse' : 'bg-on-surface-variant/30'}`} />
                                                    <span>{isOn ? 'AUTO — Execution programmee' : 'MANUEL — Operateur requis'}</span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                        }

                        {/* Info note */}
                        <div className="flex items-start gap-2 text-on-surface-variant font-body-sm text-[11px] bg-surface-container-lowest border border-surface-container rounded px-3 py-2.5">
                            <Icon name="info" size={14} className="text-secondary shrink-0 mt-0.5" />
                            <p className="leading-relaxed">
                                Le mode AUTO execute automatiquement les fenetres de delestage J+1 a l'heure planifiee (creneau ± 2 min).
                                Si le plan du BCC ne contient pas de <code className="font-label-telemetry-sm text-secondary">feeder_refs</code> pour un creneau, le slot est traite comme 0 MW (realimentation automatique).
                                Le bouton "Declencher" ci-dessus force l'execution du creneau en cours sans contrainte de delai — utile apres une interruption.
                            </p>
                        </div>
                    </div>
                </Section>

                {/* ── Section 6 — Contacts d'urgence ──────────────────────── */}
                <Section
                    icon="contacts"
                    iconCls="text-secondary"
                    title="Contacts d'urgence"
                    subtitle="Coordonnees des responsables CRC affichees au survol des cartes CRC sur le tableau de bord DN"
                >
                    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">

                        {/* CRC Nord */}
                        <div className="bg-surface-container-low border border-surface-container-highest p-4 rounded">
                            <div className="flex items-center justify-between pb-3 mb-3 border-b border-surface-container">
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-secondary" />
                                    <span className="font-headline-sm text-xs text-on-surface font-semibold uppercase tracking-wide">
                                        POSTE DE CONDUITE REGIONALE — CRC NORD
                                    </span>
                                </div>
                                <span className="font-label-telemetry-sm text-[10px] text-secondary px-1.5 py-0.5 rounded bg-surface-container-high border border-secondary/30">
                                    ASTREINTE ACTIF
                                </span>
                            </div>
                            <div className="space-y-3 font-body-sm text-xs">
                                {[
                                    { label: "Ingenieur de quart",             field: 'ingenieur', icon: null,    type: 'text'  }
                                    ,{ label: "Telephone (Ligne directe)",      field: 'tel',       icon: 'phone', type: 'text'  }
                                    ,{ label: "Canal radio d'exploitation",     field: 'radio',     icon: 'radio', type: 'text'  }
                                    ,{ label: "Email SCADA / Quart",            field: 'email',     icon: 'mail',  type: 'email' }
                                ].map(({ label, field, icon, type }) => (
                                    <div key={field}>
                                        <label className="font-label-caps text-[10px] text-outline uppercase tracking-wider font-semibold block mb-1">
                                            {label}
                                        </label>
                                        <TextInput
                                            type={type}
                                            value={crcNord[field]}
                                            onChange={(v) => updateCrcNord(field, v)}
                                            iconName={icon}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* CRC Sud */}
                        <div className="bg-surface-container-low border border-surface-container-highest p-4 rounded">
                            <div className="flex items-center justify-between pb-3 mb-3 border-b border-surface-container">
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-tertiary" />
                                    <span className="font-headline-sm text-xs text-on-surface font-semibold uppercase tracking-wide">
                                        POSTE DE CONDUITE REGIONALE — CRC SUD
                                    </span>
                                </div>
                                <span className="font-label-telemetry-sm text-[10px] text-tertiary px-1.5 py-0.5 rounded bg-surface-container-high border border-tertiary/30">
                                    ASTREINTE ACTIF
                                </span>
                            </div>
                            <div className="space-y-3 font-body-sm text-xs">
                                {[
                                    { label: "Ingenieur de quart",             field: 'ingenieur', icon: null,    type: 'text'  }
                                    ,{ label: "Telephone (Ligne directe)",      field: 'tel',       icon: 'phone', type: 'text'  }
                                    ,{ label: "Canal radio d'exploitation",     field: 'radio',     icon: 'radio', type: 'text'  }
                                    ,{ label: "Email SCADA / Quart",            field: 'email',     icon: 'mail',  type: 'email' }
                                ].map(({ label, field, icon, type }) => (
                                    <div key={field}>
                                        <label className="font-label-caps text-[10px] text-outline uppercase tracking-wider font-semibold block mb-1">
                                            {label}
                                        </label>
                                        <TextInput
                                            type={type}
                                            value={crcSud[field]}
                                            onChange={(v) => updateCrcSud(field, v)}
                                            iconName={icon}
                                            focusCls="focus:border-tertiary focus:ring-tertiary/50"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </Section>


            </div>

            {/* Toast */}
            <Toast visible={toast} />
        </div>
    )
}
