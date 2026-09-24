import { useState, useCallback } from 'react'

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
    ,pasTemps:       30
    ,heureLimite:    '06:00'
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

const INITIAL_ACCOUNTS =
[
    { id:1, initials:'KB', nom:'Ing. K. Ben Salem', role:'DN',  roleCls:'bg-secondary/15 text-secondary border-secondary/30',       zone:'National (DN Tunis)',   login:'dn.admin', matricule:'ST-84920', actif:true  }
    ,{ id:2, initials:'MT', nom:'Ing. M. Trabelsi',  role:'CRC', roleCls:'bg-tertiary/15 text-tertiary border-tertiary/30',           zone:'CRC Nord (Rades II)',   login:'crc.nord', matricule:'ST-62145', actif:true  }
    ,{ id:3, initials:'SD', nom:'Tech. S. Dridi',    role:'BCC', roleCls:'bg-surface-container-high text-on-surface-variant border-surface-container-highest', zone:'BCC 3 — Nord-Ouest', login:'bcc.3', matricule:'ST-91044', actif:true  }
    ,{ id:4, initials:'RK', nom:'Ing. R. Karray',    role:'CRC', roleCls:'bg-tertiary/15 text-tertiary border-tertiary/30',           zone:'CRC Sud (Sousse Nord)', login:'crc.sud',  matricule:'ST-55891', actif:true  }
    ,{ id:5, initials:'HJ', nom:'Tech. H. Jaziri',   role:'BCC', roleCls:'bg-surface-container text-outline border-surface-container-high',                     zone:'BCC 5 — Centre',    login:'bcc.5',  matricule:'ST-47201', actif:false }
]

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
    // ── Seuils d'alerte
    const [seuilDeficit, setSeuilDeficit] = useState(DEFAULTS.seuilDeficit)
    const [seuilPct,     setSeuilPct]     = useState(DEFAULTS.seuilPct)
    const [dureeMax,     setDureeMax]     = useState(DEFAULTS.dureeMax)

    // ── Programme J-1
    const [pasTemps,    setPasTemps]    = useState(DEFAULTS.pasTemps)
    const [heureLimite, setHeureLimite] = useState(DEFAULTS.heureLimite)

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
    const [accounts, setAccounts] = useState(INITIAL_ACCOUNTS)

    // ── UI state
    const [toast,       setToast]       = useState(false)
    const [hasChanges,  setHasChanges]  = useState(false)

    // Mark unsaved on any change
    const touch = useCallback(() => setHasChanges(true), [])

    // Helpers that also touch
    const updateSeuilDeficit = (v) => { setSeuilDeficit(v); touch() }
    const updateSeuilPct     = (v) => { setSeuilPct(v);     touch() }
    const updateDureeMax     = (v) => { setDureeMax(v);     touch() }
    const updatePasTemps     = (v) => { setPasTemps(v);     touch() }
    const updateHeure        = (v) => { setHeureLimite(v);  touch() }
    const updateSplit        = (v) =>
    {
        const clamped = Math.max(10, Math.min(90, Number(v)))
        setSplitNord(clamped)
        touch()
    }
    const updateCrcNord = (field, val) => { setCrcNord((c) => ({ ...c, [field]: val })); touch() }
    const updateCrcSud  = (field, val) => { setCrcSud((c)  => ({ ...c, [field]: val })); touch() }

    const toggleAccount = (id) =>
    {
        setAccounts((prev) => prev.map((a) => a.id === id ? { ...a, actif: !a.actif } : a))
        touch()
    }

    const handleSave = () =>
    {
        setHasChanges(false)
        setToast(true)
        setTimeout(() => setToast(false), 3500)
    }

    const handleReset = () =>
    {
        setSeuilDeficit(DEFAULTS.seuilDeficit)
        setSeuilPct(DEFAULTS.seuilPct)
        setDureeMax(DEFAULTS.dureeMax)
        setPasTemps(DEFAULTS.pasTemps)
        setHeureLimite(DEFAULTS.heureLimite)
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
        setAccounts(INITIAL_ACCOUNTS)
        setHasChanges(false)
    }

    // ── Changed helpers (compare to defaults)
    const changed = (val, def) => val !== def

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
                    </div>
                </Section>

                {/* ── Section 3 — Programme J-1 ───────────────────────────── */}
                <Section
                    icon="event_note"
                    iconCls="text-secondary"
                    title="Programme J-1"
                    subtitle="Parametres de construction du programme previsionnel jour-suivant"
                    badge="ECHEANCE J-1 06:00"
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

                        {/* Heure limite */}
                        <ParamField
                            label="Heure limite de validation J-1"
                            description="Heure avant laquelle le programme du lendemain doit etre imperativement valide par l'operateur DN."
                            changed={changed(heureLimite, DEFAULTS.heureLimite)}
                            footerNote="Le programme non valide avant cette heure genere une alerte automatique d'astreinte DSI / DN"
                            footerIcon="alarm"
                            footerCls="text-error"
                        >
                            <input
                                type="time"
                                value={heureLimite}
                                onChange={(e) => updateHeure(e.target.value)}
                                className="w-full bg-[#0b1c30] border border-[#26364a] focus:border-secondary focus:ring-1 focus:ring-secondary/50 text-on-surface font-label-telemetry-md text-sm px-3 py-2 rounded focus:outline-none transition-all shadow-inner"
                            />
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
                                            min={10} max={90}
                                            value={splitNord}
                                            onChange={(e) => updateSplit(e.target.value)}
                                            className="w-16 bg-[#000f21] border border-[#26364a] text-secondary font-label-telemetry-md font-bold text-sm text-right px-2 py-1 rounded focus:outline-none focus:border-secondary"
                                        />
                                        <span className="font-label-telemetry-sm text-xs text-secondary font-semibold">%</span>
                                    </div>
                                </div>
                                <input
                                    type="range"
                                    min={10} max={90}
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
                                            min={10} max={90}
                                            value={splitSud}
                                            onChange={(e) => updateSplit(100 - Number(e.target.value))}
                                            className="w-16 bg-[#000f21] border border-[#26364a] text-tertiary font-label-telemetry-md font-bold text-sm text-right px-2 py-1 rounded focus:outline-none focus:border-tertiary"
                                        />
                                        <span className="font-label-telemetry-sm text-xs text-tertiary font-semibold">%</span>
                                    </div>
                                </div>
                                <input
                                    type="range"
                                    min={10} max={90}
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

                {/* ── Section 5 — Contacts d'urgence ──────────────────────── */}
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

                {/* ── Section 6 — Gestion des comptes ─────────────────────── */}
                <div className="bg-surface-container-lowest border border-surface-container rounded overflow-hidden shadow-sm">
                    <div className="px-5 py-3.5 bg-surface-container border-b border-surface-container flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2.5">
                            <Icon name="manage_accounts" size={20} className="text-secondary" />
                            <div>
                                <h2 className="font-headline-sm text-sm text-on-surface font-semibold uppercase tracking-wide">
                                    Gestion des comptes operateurs
                                </h2>
                                <p className="font-body-sm text-[11px] text-on-surface-variant">
                                    Comptes autorises a acceder a la plateforme. Les mots de passe et certificats PKI sont geres separement par la DSI.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            className="px-3 py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-secondary hover:text-on-surface border border-surface-container-highest font-body-sm text-xs flex items-center gap-1.5 transition-colors"
                            onClick={() => alert("Ouverture du formulaire d'enregistrement d'un operateur SCADA certifie (Module DSI / PKI).")}
                        >
                            <Icon name="person_add" size={16} />
                            <span>+ Ajouter un compte</span>
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left font-body-sm text-xs">
                            <thead>
                                <tr className="border-b border-surface-container bg-surface-container-low/60 font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider">
                                    <th className="py-2.5 px-4 font-semibold">Nom complet</th>
                                    <th className="py-2.5 px-4 font-semibold text-center">Role</th>
                                    <th className="py-2.5 px-4 font-semibold">Zone d'affectation</th>
                                    <th className="py-2.5 px-4 font-semibold">Matricule / Login</th>
                                    <th className="py-2.5 px-4 font-semibold text-center">Statut</th>
                                    <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-container/60 font-label-telemetry-sm text-xs">
                                {accounts.map
                                (
                                    (a) => (
                                        <tr
                                            key={a.id}
                                            className={`hover:bg-surface-container-high/30 transition-colors ${!a.actif ? 'opacity-75' : ''}`}
                                        >
                                            <td className="py-3 px-4 font-body-sm font-semibold text-on-surface">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${a.actif ? 'bg-surface-container text-primary' : 'bg-surface-container-lowest text-outline'}`}>
                                                        {a.initials}
                                                    </span>
                                                    <span className={a.actif ? '' : 'text-on-surface-variant'}>{a.nom}</span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <span className={`px-2 py-0.5 rounded border font-semibold text-[10px] ${a.roleCls}`}>
                                                    {a.role}
                                                </span>
                                            </td>
                                            <td className={`py-3 px-4 ${a.actif ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                                                {a.zone}
                                            </td>
                                            <td className="py-3 px-4 text-on-surface-variant">
                                                {a.login}{' '}
                                                <span className="text-[10px] text-outline font-normal">({a.matricule})</span>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                {a.actif
                                                    ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#16a34a]/20 text-[#4ade80] border border-[#16a34a]/30 font-semibold text-[10px]">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
                                                            <span>Actif</span>
                                                        </span>
                                                    )
                                                    : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container-high text-outline border border-surface-container-highest font-semibold text-[10px]">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-outline" />
                                                            <span>Inactif</span>
                                                        </span>
                                                    )
                                                }
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <button
                                                    onClick={() => toggleAccount(a.id)}
                                                    type="button"
                                                    className={`text-xs hover:underline transition-colors font-medium ${a.actif ? 'text-error hover:text-error/80' : 'text-secondary hover:text-secondary/80'}`}
                                                >
                                                    {a.actif ? 'Desactiver' : 'Activer'}
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="px-5 py-2.5 bg-surface-container-lowest border-t border-surface-container font-label-telemetry-sm text-[11px] text-on-surface-variant flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Icon name="shield" size={14} className="text-outline" />
                            <span>Authentification double facteur requise (PKI USB + Mot de passe operateur)</span>
                        </div>
                        <span>
                            {accounts.length} comptes repertories · {accounts.filter((a) => a.actif).length} actifs
                        </span>
                    </div>
                </div>

            </div>

            {/* Toast */}
            <Toast visible={toast} />
        </div>
    )
}
