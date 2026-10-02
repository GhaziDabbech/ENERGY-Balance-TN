import { useState } from 'react'
import { useGridStore } from '../../stores/gridStore'

function Icon({ name, size = 18, className = '' })
{
    return (
        <span className={`material-symbols-outlined ${className}`} style={{ fontSize: size }}>
            {name}
        </span>
    )
}

// ── Preset scenarios ──────────────────────────────────────────────────────────
const PRESETS =
[
    { label: 'Réseau équilibré',        prod: 1060, cons: 1055, desc: 'Production légèrement supérieure à la consommation — situation nominale' }
    ,{ label: 'Déficit léger',          prod: 1020, cons: 1060, desc: 'Déficit de 40 MW — vigilance, délestage préventif recommandé' }
    ,{ label: 'Déficit modéré',         prod:  980, cons: 1060, desc: 'Déficit de 80 MW — délestage d\'urgence requis' }
    ,{ label: 'Déficit critique',       prod:  900, cons: 1060, desc: 'Déficit de 160 MW — situation de crise, mobilisation immédiate' }
    ,{ label: 'Surplus (surproduction)',prod: 1120, cons: 1050, desc: 'Surplus de 70 MW — fréquence monte, délestage inutile' }
    ,{ label: 'Pointe hivernale',       prod: 1250, cons: 1380, desc: 'Pointe de consommation 22h00 — déficit 130 MW, situation réelle hiver 2026' }
]

// ── Frequency gauge ───────────────────────────────────────────────────────────
function FrequencyGauge({ frequency })
{
    // Map 49.0 → 51.0 Hz onto a 0→100% gauge
    const pct   = ((frequency - 49.0) / 2.0) * 100
    const isLow  = frequency < 49.8
    const isHigh = frequency > 50.2
    const isWarn = (frequency >= 49.8 && frequency < 49.95) || (frequency > 50.05 && frequency <= 50.2)
    const isOk   = !isLow && !isHigh && !isWarn

    const barColor  = isLow  ? 'bg-error'
                    : isWarn ? 'bg-tertiary'
                    : isHigh ? 'bg-secondary'
                    : 'bg-[#4ade80]'

    const textColor = isLow  ? 'text-error'
                    : isWarn ? 'text-tertiary'
                    : isHigh ? 'text-secondary'
                    : 'text-[#4ade80]'

    const label = isLow  ? 'SOUS-FRÉQUENCE — ALERTE'
                : isWarn ? 'FRÉQUENCE BASSE — VIGILANCE'
                : isHigh ? 'SUR-FRÉQUENCE — VIGILANCE'
                : 'NOMINALE'

    return (
        <div className="bg-surface-container-low border border-surface-container-high p-space-lg flex flex-col gap-space-md">
            <div className="flex items-center gap-space-sm">
                <Icon name="electric_meter" size={18} className={textColor} />
                <h3 className="font-sans font-bold text-xs text-on-surface uppercase tracking-wide">
                    Fréquence réseau dérivée
                </h3>
                <span className={`ml-auto px-space-sm py-0.5 font-mono text-[10px] font-bold ${isLow ? 'bg-error-container text-on-error-container animate-pulse' : isWarn ? 'bg-tertiary-container/40 text-tertiary' : 'bg-[#4ade80]/20 text-[#4ade80]'}`}>
                    {label}
                </span>
            </div>

            {/* Large frequency display */}
            <div className="flex items-baseline gap-space-md justify-center py-space-md">
                <span className={`font-mono text-5xl font-bold ${textColor} ${isLow ? 'animate-pulse' : ''}`}>
                    {frequency.toFixed(3)}
                </span>
                <span className="font-mono text-xl text-on-surface-variant">Hz</span>
            </div>

            {/* Gauge bar — 49.0 to 51.0 Hz */}
            <div className="flex flex-col gap-space-xs">
                <div className="relative w-full h-4 bg-surface-container-lowest overflow-hidden">
                    {/* Center line at 50 Hz */}
                    <div className="absolute top-0 bottom-0 w-px bg-on-surface-variant/30" style={{ left: '50%' }} />
                    {/* Danger zones */}
                    <div className="absolute top-0 bottom-0 bg-error/10" style={{ left: '0%', width: '10%' }} />
                    <div className="absolute top-0 bottom-0 bg-error/10" style={{ left: '90%', width: '10%' }} />
                    {/* Fill */}
                    <div
                        className={`absolute top-0 bottom-0 transition-all duration-500 ${barColor} opacity-80`}
                        style={{ left: '50%', width: `${((pct - 50) * 0.5).toFixed(2)}%`, transform: pct >= 50 ? 'none' : 'scaleX(-1)', transformOrigin: 'left' }}
                    />
                    {/* Needle */}
                    <div
                        className={`absolute top-0 bottom-0 w-0.5 ${barColor} transition-all duration-500`}
                        style={{ left: `${Math.max(1, Math.min(99, pct)).toFixed(2)}%` }}
                    />
                </div>
                <div className="flex justify-between font-mono text-[9px] text-on-surface-variant">
                    <span>49,00 Hz</span>
                    <span className="text-on-surface-variant/50">49,80</span>
                    <span className={isOk ? 'text-[#4ade80] font-bold' : 'text-on-surface-variant'}>50,00</span>
                    <span className="text-on-surface-variant/50">50,20</span>
                    <span>51,00 Hz</span>
                </div>
            </div>

            <p className="font-mono text-[10px] text-on-surface-variant border-t border-surface-container-high pt-space-sm">
                La fréquence est calculée automatiquement à partir du déséquilibre production / consommation.
                Un déficit fait chuter la fréquence en dessous de 50 Hz. En dessous de 49,8 Hz, le système
                de protection se déclenche automatiquement.
            </p>
        </div>
    )
}

// ── MW input control ──────────────────────────────────────────────────────────
function MWControl({ label, value, onChange, color, icon, description })
{
    const [local, setLocal] = useState(String(value))

    const handleChange = (v) =>
    {
        setLocal(v)
        const n = parseFloat(v)
        if (!isNaN(n) && n >= 0) onChange(n)
    }

    const step = (delta) =>
    {
        const n = Math.max(0, value + delta)
        setLocal(String(n))
        onChange(n)
    }

    return (
        <div className={`bg-surface-container-low border p-space-lg flex flex-col gap-space-md ${color === 'green' ? 'border-[#4ade80]/30' : color === 'error' ? 'border-error/30' : 'border-surface-container-high'}`}>
            <div className="flex items-center gap-space-sm">
                <Icon name={icon} size={18} className={color === 'green' ? 'text-[#4ade80]' : color === 'error' ? 'text-error' : 'text-secondary'} />
                <div>
                    <h3 className="font-sans font-bold text-sm text-on-surface uppercase tracking-wide">{label}</h3>
                    <p className="font-mono text-[10px] text-on-surface-variant mt-space-xs">{description}</p>
                </div>
            </div>

            {/* Large value display */}
            <div className="flex items-baseline gap-space-sm justify-center py-space-md bg-surface-container-lowest">
                <span className={`font-mono text-5xl font-bold ${color === 'green' ? 'text-[#4ade80]' : color === 'error' ? 'text-error' : 'text-secondary'}`}>
                    {value.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
                <span className="font-mono text-xl text-on-surface-variant">MW</span>
            </div>

            {/* Input + step buttons */}
            <div className="flex items-center gap-space-sm">
                <button onClick={() => step(-100)} className="w-10 h-10 bg-surface-container hover:bg-surface-container-high text-on-surface font-mono text-sm font-bold border border-surface-container-high transition-colors" type="button">-100</button>
                <button onClick={() => step(-10)}  className="w-10 h-10 bg-surface-container hover:bg-surface-container-high text-on-surface font-mono text-sm font-bold border border-surface-container-high transition-colors" type="button">-10</button>
                <input
                    type="number"
                    value={local}
                    onChange={(e) => handleChange(e.target.value)}
                    onBlur={() => setLocal(String(value))}
                    min={0}
                    max={5000}
                    step={1}
                    className="flex-1 bg-surface-container-lowest border-2 border-surface-container-high focus:border-secondary text-on-surface font-mono text-2xl font-bold px-space-md py-space-sm text-center focus:outline-none transition-colors"
                />
                <button onClick={() => step(10)}  className="w-10 h-10 bg-surface-container hover:bg-surface-container-high text-on-surface font-mono text-sm font-bold border border-surface-container-high transition-colors" type="button">+10</button>
                <button onClick={() => step(100)} className="w-10 h-10 bg-surface-container hover:bg-surface-container-high text-on-surface font-mono text-sm font-bold border border-surface-container-high transition-colors" type="button">+100</button>
            </div>

            {/* Quick preset values */}
            <div className="flex items-center gap-space-xs flex-wrap">
                <span className="font-mono text-[10px] text-on-surface-variant uppercase">Valeurs rapides :</span>
                {[800, 900, 1000, 1060, 1200, 1400].map((v) => (
                    <button
                        key={v}
                        onClick={() => { setLocal(String(v)); onChange(v) }}
                        className={`px-space-sm py-space-xs font-mono text-[10px] border transition-colors ${value === v ? 'bg-secondary-container text-on-secondary-container border-secondary' : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant border-surface-container-high'}`}
                        type="button"
                    >
                        {v.toLocaleString('fr-FR')}
                    </button>
                ))}
            </div>
        </div>
    )
}

// ── Balance indicator ─────────────────────────────────────────────────────────
function BalanceIndicator({ production, consumption, frequency })
{
    const balance   = production - consumption
    const isDeficit = balance < -10
    const isSurplus = balance > 10
    const pct       = production > 0 ? (production / consumption) * 100 : 0

    return (
        <div className={`p-space-lg flex flex-col gap-space-md border ${isDeficit ? 'bg-error-container/10 border-error/40' : isSurplus ? 'bg-secondary-container/10 border-secondary/30' : 'bg-[#4ade80]/10 border-[#4ade80]/30'}`}>
            <div className="flex items-center justify-between flex-wrap gap-space-md">
                <div className="flex items-center gap-space-sm">
                    <Icon name={isDeficit ? 'warning' : isSurplus ? 'trending_up' : 'check_circle'} size={20} className={isDeficit ? 'text-error' : isSurplus ? 'text-secondary' : 'text-[#4ade80]'} />
                    <div>
                        <p className="font-sans font-bold text-sm text-on-surface uppercase tracking-wide">Bilan Production / Consommation</p>
                        <p className="font-mono text-[10px] text-on-surface-variant mt-space-xs">
                            {isDeficit ? 'Déficit énergétique — délestage requis pour compenser'
                            : isSurplus ? 'Surplus de production — réseau surchargé, fréquence monte'
                            : 'Réseau équilibré — aucune action requise'}
                        </p>
                    </div>
                </div>
                <div className="text-right">
                    <div className={`font-mono text-3xl font-bold ${isDeficit ? 'text-error' : isSurplus ? 'text-secondary' : 'text-[#4ade80]'}`}>
                        {balance >= 0 ? '+' : ''}{balance.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MW
                    </div>
                    <div className="font-mono text-[10px] text-on-surface-variant">
                        Production : {pct.toFixed(1)}% de la consommation
                    </div>
                </div>
            </div>

            {/* Balance bar */}
            <div className="flex flex-col gap-space-xs">
                <div className="flex items-center gap-space-sm text-[10px] font-mono text-on-surface-variant mb-space-xs">
                    <span>Production</span>
                    <div className="flex-1 h-3 bg-surface-container-lowest overflow-hidden relative">
                        <div className="h-full bg-[#4ade80] transition-all duration-300" style={{ width: `${Math.min(100, (production / Math.max(production, consumption)) * 100).toFixed(1)}%` }} />
                    </div>
                    <span className="text-[#4ade80] font-bold w-20 text-right">{production.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} MW</span>
                </div>
                <div className="flex items-center gap-space-sm text-[10px] font-mono text-on-surface-variant">
                    <span>Consommation</span>
                    <div className="flex-1 h-3 bg-surface-container-lowest overflow-hidden relative">
                        <div className={`h-full transition-all duration-300 ${isDeficit ? 'bg-error' : 'bg-primary'}`} style={{ width: `${Math.min(100, (consumption / Math.max(production, consumption)) * 100).toFixed(1)}%` }} />
                    </div>
                    <span className={`font-bold w-20 text-right ${isDeficit ? 'text-error' : 'text-on-surface'}`}>{consumption.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} MW</span>
                </div>
            </div>

            {/* Action advice */}
            {isDeficit && (
                <div className="flex items-start gap-space-sm px-space-md py-space-sm bg-error-container/20 border border-error/30 font-mono text-[10px] text-error">
                    <Icon name="bolt" size={13} className="shrink-0 mt-0.5" />
                    <span>
                        Déficit de {Math.abs(balance).toFixed(0)} MW. Pour compenser, le DN doit émettre un ordre de délestage d'urgence d'au moins {Math.ceil(Math.abs(balance) / 10) * 10} MW.
                        La fréquence actuelle de {frequency.toFixed(3)} Hz confirme le déséquilibre.
                    </span>
                </div>
            )}
            {isSurplus && (
                <div className="flex items-start gap-space-sm px-space-md py-space-sm bg-secondary-container/20 border border-secondary/30 font-mono text-[10px] text-secondary">
                    <Icon name="info" size={13} className="shrink-0 mt-0.5" />
                    <span>
                        Surplus de {balance.toFixed(0)} MW. La fréquence monte à {frequency.toFixed(3)} Hz.
                        Un surplus prolongé peut endommager les équipements. Réduire la production ou augmenter la consommation.
                    </span>
                </div>
            )}
        </div>
    )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SimulateurReseau()
{
    const { production, consumption, frequency, setProduction, setConsumption, setBoth } = useGridStore()

    const applyPreset = (preset) =>
    {
        setBoth(preset.prod, preset.cons)
    }

    return (
        <div className="w-full text-on-surface flex flex-col gap-space-md p-space-md">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <section className="bg-surface-container-low border border-surface-container-high p-space-md flex flex-col lg:flex-row lg:items-center justify-between gap-space-md shadow-sm">
                <div className="flex items-center gap-space-md">
                    <div className="w-10 h-10 bg-error-container/30 border border-error/40 flex items-center justify-center shrink-0">
                        <Icon name="science" size={22} className="text-error" />
                    </div>
                    <div>
                        <div className="flex items-center gap-space-sm">
                            <h1 className="font-sans font-bold text-sm text-on-surface uppercase tracking-wide">
                                Simulateur Réseau — Mode Démo
                            </h1>
                            <span className="px-space-sm py-0.5 bg-error-container/30 text-error font-mono text-[10px] font-bold border border-error/40 animate-pulse">
                                DÉMO UNIQUEMENT
                            </span>
                        </div>
                        <p className="font-mono text-[10px] text-on-surface-variant mt-space-xs">
                            Modifiez production et consommation pour simuler des situations réelles.
                            Les valeurs sont immédiatement reflétées dans le tableau de bord DN.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-space-xs font-mono text-[10px] text-on-surface-variant">
                    <Icon name="info" size={13} className="text-tertiary" />
                    <span>Cette page n'existe pas en production — pour usage démonstratif uniquement</span>
                </div>
            </section>

            {/* ── Preset scenarios ────────────────────────────────────────── */}
            <section className="flex flex-col gap-space-sm">
                <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">
                    Scénarios prédéfinis — cliquez pour appliquer instantanément
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-space-sm">
                    {PRESETS.map((p) => (
                        <button
                            key={p.label}
                            onClick={() => applyPreset(p)}
                            className="flex flex-col gap-space-xs p-space-md text-left bg-surface-container-low border border-surface-container-high hover:bg-surface-container hover:border-secondary/40 transition-all"
                            type="button"
                        >
                            <span className="font-mono text-xs font-bold text-secondary uppercase">{p.label}</span>
                            <div className="flex items-center gap-space-md font-mono text-[10px]">
                                <span className="text-[#4ade80]">↑ {p.prod.toLocaleString('fr-FR')} MW</span>
                                <span className="text-on-surface-variant">↓ {p.cons.toLocaleString('fr-FR')} MW</span>
                                <span className={`font-bold ${p.prod - p.cons < -10 ? 'text-error' : p.prod - p.cons > 10 ? 'text-secondary' : 'text-[#4ade80]'}`}>
                                    {p.prod - p.cons >= 0 ? '+' : ''}{(p.prod - p.cons).toLocaleString('fr-FR')} MW
                                </span>
                            </div>
                            <span className="font-mono text-[9px] text-on-surface-variant">{p.desc}</span>
                        </button>
                    ))}
                </div>
            </section>

            {/* ── Two input controls ──────────────────────────────────────── */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-space-md">
                <MWControl
                    label="Production Nationale"
                    value={production}
                    onChange={setProduction}
                    color="green"
                    icon="electric_bolt"
                    description="Puissance totale injectée sur le réseau HTB national (centrales + imports)"
                />
                <MWControl
                    label="Consommation Nationale"
                    value={consumption}
                    onChange={setConsumption}
                    color="error"
                    icon="power"
                    description="Charge totale consommée par le réseau (résidentiel + industriel + tertiaire)"
                />
            </section>

            {/* ── Balance indicator ────────────────────────────────────────── */}
            <section>
                <BalanceIndicator
                    production={production}
                    consumption={consumption}
                    frequency={frequency}
                />
            </section>

            {/* ── Frequency gauge ─────────────────────────────────────────── */}
            <section>
                <FrequencyGauge frequency={frequency} />
            </section>

            {/* ── How it works ─────────────────────────────────────────────── */}
            <section className="bg-surface-container-low border border-surface-container-high p-space-lg">
                <div className="flex items-center gap-space-sm mb-space-md">
                    <Icon name="info" size={16} className="text-secondary" />
                    <h3 className="font-sans font-bold text-xs text-on-surface uppercase">Comment fonctionne le simulateur</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md font-mono text-[10px] text-on-surface-variant">
                    <div className="bg-surface-container p-space-md flex flex-col gap-space-xs">
                        <span className="text-secondary font-bold uppercase">Fréquence dérivée</span>
                        <span>La fréquence réseau est calculée automatiquement : f = 50 + (P_prod - P_cons) / P_totale × 0,5 Hz. Un déficit de 450 MW sur un réseau de 4500 MW fait chuter la fréquence de 0,05 Hz.</span>
                    </div>
                    <div className="bg-surface-container p-space-md flex flex-col gap-space-xs">
                        <span className="text-secondary font-bold uppercase">Impact sur le tableau de bord</span>
                        <span>Les valeurs modifiées ici sont immédiatement visibles dans les KPI cards du tableau de bord DN, dans le badge fréquence de la barre du haut, et dans les indicateurs de toutes les pages.</span>
                    </div>
                    <div className="bg-surface-container p-space-md flex flex-col gap-space-xs">
                        <span className="text-secondary font-bold uppercase">Seuils d'alerte</span>
                        <span>Fréquence &lt; 49,95 Hz → Vigilance (amber). Fréquence &lt; 49,8 Hz → Alerte critique (rouge, animation). En dessous de 49,5 Hz, le délestage automatique se déclenche dans un vrai réseau.</span>
                    </div>
                </div>
            </section>
        </div>
    )
}
