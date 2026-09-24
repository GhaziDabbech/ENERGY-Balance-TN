import { useState, useEffect, useCallback } from 'react'
import api from '../../lib/api'
import { useNetworkStore } from '../../stores/networkStore'

function Icon({ name, size = 18, className = '' })
{
    return (
        <span className={`material-symbols-outlined ${className}`} style={{ fontSize: size }}>
            {name}
        </span>
    )
}

// ── Role badge ────────────────────────────────────────────────────────────────
function RoleBadge({ role })
{
    const cfg =
    {
        ADMIN: 'bg-secondary-container text-on-secondary-container'
        ,DN:   'bg-surface-container-highest text-secondary'
        ,CRC:  'bg-tertiary-container/40 text-tertiary'
        ,BCC:  'bg-surface-container text-on-surface-variant'
    }
    return (
        <span className={`px-space-sm py-0.5 font-mono text-[9px] font-bold uppercase ${cfg[role] ?? cfg.BCC}`}>
            {role}
        </span>
    )
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ isActive, mustChange })
{
    if (!isActive)
        return <span className="px-space-sm py-0.5 font-mono text-[9px] font-bold bg-error-container/40 text-error uppercase">INACTIF</span>
    if (mustChange)
        return <span className="px-space-sm py-0.5 font-mono text-[9px] font-bold bg-tertiary-container/40 text-tertiary uppercase animate-pulse">MDP À CHANGER</span>
    return <span className="px-space-sm py-0.5 font-mono text-[9px] font-bold bg-[#4ade80]/20 text-[#4ade80] uppercase">ACTIF</span>
}

// ── Confirm modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onCancel, variant = 'warn' })
{
    const color = variant === 'danger'
        ? 'border-error/40 bg-error-container/10'
        : 'border-tertiary/40 bg-tertiary-container/10'
    const btnCls = variant === 'danger'
        ? 'bg-error-container hover:bg-error text-on-error-container font-bold'
        : 'bg-tertiary-container hover:bg-tertiary text-tertiary font-bold'

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-space-md">
            <div className={`bg-surface-container-low border w-full max-w-md flex flex-col shadow-2xl ${color}`}>
                <div className="flex items-center gap-space-md px-space-lg py-space-md border-b border-surface-container-high">
                    <Icon name="warning" size={18} className={variant === 'danger' ? 'text-error' : 'text-tertiary'} />
                    <p className="font-sans font-bold text-xs text-on-surface uppercase">Confirmation requise</p>
                </div>
                <div className="p-space-lg">
                    <p className="font-sans text-sm text-on-surface-variant">{message}</p>
                </div>
                <div className="flex items-center justify-end gap-space-sm px-space-lg py-space-md border-t border-surface-container-high">
                    <button onClick={onCancel} className="px-space-md py-space-xs bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono text-xs border border-surface-container-high" type="button">
                        Annuler
                    </button>
                    <button onClick={onConfirm} className={`px-space-md py-space-xs font-mono text-xs transition-colors ${btnCls}`} type="button">
                        Confirmer
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Reset password modal ──────────────────────────────────────────────────────
function ResetPwdModal({ user, onClose, onDone })
{
    const [pwd,  setPwd]  = useState('')
    const [pwd2, setPwd2] = useState('')
    const [err,  setErr]  = useState('')
    const [done, setDone] = useState(false)

    const handleSubmit = async () =>
    {
        setErr('')
        if (pwd.length < 8) { setErr('Minimum 8 caractères.'); return }
        if (pwd !== pwd2)   { setErr('Les mots de passe ne correspondent pas.'); return }
        try
        {
            await api.patch(`/api/v1/admin/users/${user.id}/reset-password`, { new_password: pwd })
            setDone(true)
            setTimeout(() => { onDone(); onClose() }, 1200)
        }
        catch (e)
        {
            setErr(e?.response?.data?.detail ?? 'Erreur serveur.')
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-space-md">
            <div className="bg-surface-container-low border border-surface-container-high w-full max-w-md flex flex-col shadow-2xl">
                <div className="flex items-center justify-between px-space-lg py-space-md bg-surface-container border-b border-surface-container-high">
                    <div className="flex items-center gap-space-sm">
                        <Icon name="lock_reset" size={16} className="text-secondary" />
                        <p className="font-sans font-bold text-xs text-on-surface uppercase">Réinitialiser le mot de passe</p>
                    </div>
                    <button onClick={onClose} className="p-space-xs hover:bg-surface-container-high text-on-surface-variant" type="button">
                        <Icon name="close" size={16} />
                    </button>
                </div>
                <div className="p-space-lg flex flex-col gap-space-md">
                    <p className="font-mono text-[10px] text-on-surface-variant">
                        Réinitialisation pour <strong className="text-on-surface">{user.full_name}</strong> ({user.username}). L'opérateur devra changer ce mot de passe à sa prochaine connexion.
                    </p>
                    {[
                        { label: 'Nouveau mot de passe', val: pwd,  set: setPwd  }
                        ,{ label: 'Confirmer',            val: pwd2, set: setPwd2 }
                    ].map(({ label, val, set }) => (
                        <div key={label} className="flex flex-col gap-space-xs">
                            <label className="font-mono text-[10px] text-on-surface-variant uppercase">{label}</label>
                            <input
                                type="password"
                                value={val}
                                onChange={(e) => set(e.target.value)}
                                className="bg-surface-container-lowest border border-surface-container-high focus:border-secondary text-on-surface font-mono text-sm px-space-md py-space-xs focus:outline-none"
                            />
                        </div>
                    ))}
                    {err && <p className="font-mono text-[10px] text-error">{err}</p>}
                </div>
                <div className="flex items-center justify-end gap-space-sm px-space-lg py-space-md border-t border-surface-container-high">
                    <button onClick={onClose} className="px-space-md py-space-xs bg-surface-container-high text-on-surface font-mono text-xs border border-surface-container-high" type="button">
                        Annuler
                    </button>
                    <button onClick={handleSubmit} className="flex items-center gap-space-xs px-space-md py-space-xs bg-secondary-container hover:bg-secondary text-on-secondary-container font-mono text-xs font-bold transition-colors" type="button">
                        {done ? <><Icon name="check_circle" size={13} className="text-[#4ade80]" /><span>Fait !</span></>
                              : <><Icon name="lock_reset" size={13} /><span>Réinitialiser</span></>}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Create user form ──────────────────────────────────────────────────────────
function CreateUserForm({ bccs, crcs, onCreated })
{
    const empty = { username: '', full_name: '', password: '', password2: '', role: 'BCC', zone: '', bcc_id: '' }
    const [form,    setForm]    = useState(empty)
    const [err,     setErr]     = useState({})
    const [success, setSuccess] = useState(false)
    const [loading, setLoading] = useState(false)

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

    const validate = () =>
    {
        const e = {}
        if (!form.username.trim())      e.username  = 'Requis'
        if (!form.full_name.trim())     e.full_name = 'Requis'
        if (form.password.length < 8)   e.password  = 'Minimum 8 caractères'
        if (form.password !== form.password2) e.password2 = 'Ne correspond pas'
        if (form.role === 'CRC' && !form.zone)   e.zone   = 'Sélectionnez un CRC'
        if (form.role === 'BCC' && !form.bcc_id) e.bcc_id = 'Sélectionnez un BCC'
        return e
    }

    const handleSubmit = async (e) =>
    {
        e.preventDefault()
        const errors = validate()
        if (Object.keys(errors).length > 0) { setErr(errors); return }
        setErr({})
        setLoading(true)
        try
        {
            await api.post('/api/v1/admin/users',
            {
                username:  form.username.trim()
                ,full_name: form.full_name.trim()
                ,password:  form.password
                ,role:      form.role
                ,zone:      form.role === 'CRC' ? form.zone : null
                ,bcc_id:    form.role === 'BCC' ? Number(form.bcc_id) : null
            })
            setSuccess(true)
            setForm(empty)
            onCreated()
            setTimeout(() => setSuccess(false), 3000)
        }
        catch (ex)
        {
            const detail = ex?.response?.data?.detail ?? 'Erreur lors de la création.'
            setErr({ api: detail })
        }
        finally { setLoading(false) }
    }

    const inputCls = (field) =>
        `bg-surface-container-lowest border ${err[field] ? 'border-error' : 'border-surface-container-high focus:border-secondary'} text-on-surface font-mono text-xs px-space-md py-space-sm focus:outline-none transition-colors w-full`

    return (
        <div className="bg-surface-container-low border border-surface-container-high p-space-lg flex flex-col gap-space-lg">
            <div className="flex items-center gap-space-sm pb-space-md border-b border-surface-container-high">
                <Icon name="person_add" size={18} className="text-secondary" />
                <h2 className="font-sans font-bold text-sm text-on-surface uppercase tracking-wide">
                    Créer un compte opérateur
                </h2>
            </div>

            {success && (
                <div className="flex items-center gap-space-sm px-space-md py-space-sm bg-[#4ade80]/10 border border-[#4ade80]/30 font-mono text-xs text-[#4ade80] font-bold">
                    <Icon name="check_circle" size={14} />
                    Compte créé. L'opérateur devra changer son mot de passe à la première connexion.
                </div>
            )}
            {err.api && (
                <div className="flex items-center gap-space-sm px-space-md py-space-sm bg-error-container/20 border border-error/40 font-mono text-xs text-error">
                    <Icon name="error" size={14} />
                    {err.api}
                </div>
            )}

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">

                {/* Username */}
                <div className="flex flex-col gap-space-xs">
                    <label className="font-mono text-[10px] text-on-surface-variant uppercase">Identifiant *</label>
                    <input value={form.username} onChange={(e) => set('username', e.target.value)} placeholder="ex: tech.dridi" className={inputCls('username')} />
                    {err.username && <span className="font-mono text-[9px] text-error">{err.username}</span>}
                    <span className="font-mono text-[9px] text-on-surface-variant">Minuscules, points, chiffres uniquement</span>
                </div>

                {/* Full name */}
                <div className="flex flex-col gap-space-xs">
                    <label className="font-mono text-[10px] text-on-surface-variant uppercase">Nom complet *</label>
                    <input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="ex: Tech. S. Dridi" className={inputCls('full_name')} />
                    {err.full_name && <span className="font-mono text-[9px] text-error">{err.full_name}</span>}
                </div>

                {/* Password */}
                <div className="flex flex-col gap-space-xs">
                    <label className="font-mono text-[10px] text-on-surface-variant uppercase">Mot de passe provisoire *</label>
                    <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Min. 8 caractères" className={inputCls('password')} />
                    {err.password && <span className="font-mono text-[9px] text-error">{err.password}</span>}
                    <span className="font-mono text-[9px] text-on-surface-variant">L'opérateur devra le changer à la première connexion</span>
                </div>

                {/* Confirm password */}
                <div className="flex flex-col gap-space-xs">
                    <label className="font-mono text-[10px] text-on-surface-variant uppercase">Confirmer le mot de passe *</label>
                    <input type="password" value={form.password2} onChange={(e) => set('password2', e.target.value)} placeholder="Répéter le mot de passe" className={inputCls('password2')} />
                    {err.password2 && <span className="font-mono text-[9px] text-error">{err.password2}</span>}
                </div>

                {/* Role */}
                <div className="flex flex-col gap-space-xs">
                    <label className="font-mono text-[10px] text-on-surface-variant uppercase">Rôle opérationnel *</label>
                    <select value={form.role} onChange={(e) => set('role', e.target.value)} className={inputCls('role')}>
                        <option value="DN">DN — Dispatching National</option>
                        <option value="CRC">CRC — Centre Régional de Conduite</option>
                        <option value="BCC">BCC — Bureau de Conduite et Contrôle</option>
                    </select>
                </div>

                {/* CRC assignment */}
                {form.role === 'CRC' && (
                    <div className="flex flex-col gap-space-xs">
                        <label className="font-mono text-[10px] text-on-surface-variant uppercase">CRC assigné *</label>
                        <select value={form.zone} onChange={(e) => set('zone', e.target.value)} className={inputCls('zone')}>
                            <option value="">— Sélectionner un CRC —</option>
                            {crcs.map((c) => (
                                <option key={c.id} value={c.name}>{c.name} ({c.city})</option>
                            ))}
                        </select>
                        {err.zone && <span className="font-mono text-[9px] text-error">{err.zone}</span>}
                    </div>
                )}

                {/* BCC assignment */}
                {form.role === 'BCC' && (
                    <div className="flex flex-col gap-space-xs">
                        <label className="font-mono text-[10px] text-on-surface-variant uppercase">BCC assigné *</label>
                        <select value={form.bcc_id} onChange={(e) => set('bcc_id', e.target.value)} className={inputCls('bcc_id')}>
                            <option value="">— Sélectionner un BCC —</option>
                            {bccs.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.name} ({b.crc_name})
                                </option>
                            ))}
                        </select>
                        {err.bcc_id && <span className="font-mono text-[9px] text-error">{err.bcc_id}</span>}
                        <span className="font-mono text-[9px] text-on-surface-variant">
                            Le CRC de tutelle est déterminé automatiquement par le BCC sélectionné
                        </span>
                    </div>
                )}

                {/* DN — no extra field */}
                {form.role === 'DN' && (
                    <div className="flex items-center gap-space-sm px-space-md py-space-sm bg-surface-container border border-surface-container-high font-mono text-[10px] text-on-surface-variant self-end">
                        <Icon name="info" size={13} className="text-secondary" />
                        Accès national complet — aucune zone spécifique requise
                    </div>
                )}

                {/* Submit */}
                <div className="md:col-span-2 flex items-center justify-between pt-space-md border-t border-surface-container-high">
                    <span className="font-mono text-[10px] text-on-surface-variant flex items-center gap-space-xs">
                        <Icon name="lock" size={12} className="text-secondary" />
                        Compte créé avec must_change_password = true — changement forcé à la première connexion
                    </span>
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex items-center gap-space-xs px-space-lg py-space-sm bg-secondary-container hover:bg-secondary text-on-secondary-container font-mono text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                    >
                        {loading
                            ? <><Icon name="hourglass_empty" size={14} /><span>Création...</span></>
                            : <><Icon name="person_add" size={14} /><span>Créer le compte</span></>
                        }
                    </button>
                </div>
            </form>
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminDashboard()
{
    const [tab,     setTab]     = useState('users')   // 'users' | 'create' | 'audit'
    const [users,   setUsers]   = useState([])
    const [stats,   setStats]   = useState(null)
    const [bccs,    setBccs]    = useState([])
    const [crcs,    setCrcs]    = useState([])
    const [loading, setLoading] = useState(true)

    // The DN's hierarchy editor stores BCC names in networkStore (localStorage).
    // We use those names to override the DB names in the dropdown so they match
    // what the DN has configured.
    const networkCrcs = useNetworkStore((s) => s.crcs)

    // Modal state
    const [confirmInfo,  setConfirmInfo]  = useState(null)
    const [resetTarget,  setResetTarget]  = useState(null)
    const [toast,        setToast]        = useState(null)

    // Filter state
    const [search,    setSearch]    = useState('')
    const [roleFilter,setRoleFilter]= useState('tous')

    const showToast = (msg, type = 'ok') =>
    {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3500)
    }

    // Merge DB BCCs with networkStore labels — networkStore wins on name/zone
    // networkStore BCC name is already the full label set by the DN, e.g. "BCC 1 — Grand Tunis"
    const mergedBccs = bccs.map((dbBcc) =>
    {
        const num = dbBcc.name.match(/\d+/)?.[0]
        for (const crc of networkCrcs)
        {
            const match = crc.bccs?.find(
                (b) => b.name?.match(/\d+/)?.[0] === num || b.id === `bcc-${num}`
            )
            if (match)
            {
                return {
                    ...dbBcc
                    // Use the exact name the DN set (e.g. "BCC 1 — Grand Tunis")
                    ,name:     match.name ?? dbBcc.name
                    ,zone:     match.name ?? dbBcc.zone
                    ,crc_name: crc.name   ?? dbBcc.crc_name
                }
            }
        }
        return dbBcc
    })

    // Merge DB CRCs with networkStore labels
    const mergedCrcs = crcs.map((dbCrc) =>
    {
        const match = networkCrcs.find((c) => c.name === dbCrc.name || c.name?.includes(dbCrc.name?.replace('CRC ', '')))
        return match ? { ...dbCrc, name: match.name ?? dbCrc.name } : dbCrc
    })

    const loadAll = useCallback(async () =>
    {
        try
        {
            setLoading(true)
            const [usersRes, statsRes, bccsRes, crcsRes] = await Promise.all
            ([
                api.get('/api/v1/admin/users')
                ,api.get('/api/v1/admin/stats')
                ,api.get('/api/v1/admin/bccs')
                ,api.get('/api/v1/admin/crcs')
            ])
            setUsers(usersRes.data)
            setStats(statsRes.data)
            setBccs(bccsRes.data)
            setCrcs(crcsRes.data)
        }
        catch (err)
        {
            console.error('[AdminDashboard] loadAll failed:', err)
        }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { loadAll() }, [loadAll])

    const handleDeactivate = (user) =>
    {
        setConfirmInfo
        ({
            message:  `Désactiver le compte de ${user.full_name} (${user.username}) ? L'opérateur ne pourra plus se connecter.`
            ,variant: 'danger'
            ,onConfirm: async () =>
            {
                await api.patch(`/api/v1/admin/users/${user.id}/deactivate`)
                setConfirmInfo(null)
                showToast(`Compte ${user.username} désactivé.`, 'warn')
                loadAll()
            }
        })
    }

    const handleActivate = async (user) =>
    {
        await api.patch(`/api/v1/admin/users/${user.id}/activate`)
        showToast(`Compte ${user.username} réactivé.`)
        loadAll()
    }

    // Filtered users
    const filtered = users.filter((u) =>
    {
        const matchSearch = !search
            || u.username.toLowerCase().includes(search.toLowerCase())
            || u.full_name.toLowerCase().includes(search.toLowerCase())
        const matchRole = roleFilter === 'tous' || u.role === roleFilter
        return matchSearch && matchRole
    })

    const fmtDate = (iso) =>
    {
        if (!iso) return '—'
        const d = new Date(iso)
        return `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
    }

    return (
        <div className="max-w-7xl mx-auto px-space-xl py-space-xl flex flex-col gap-space-lg">

            {/* ── Page header ─────────────────────────────────────────────── */}
            <div className="flex items-center justify-between flex-wrap gap-space-md">
                <div>
                    <h1 className="font-sans font-bold text-base text-on-surface uppercase tracking-wide">
                        Gestion des Comptes Opérateurs
                    </h1>
                    <p className="font-mono text-[10px] text-on-surface-variant mt-space-xs">
                        Plateforme Nationale de Gestion du Délestage — STEG · Accès DSI uniquement
                    </p>
                </div>
                <div className="flex items-center gap-space-xs font-mono text-[10px] text-on-surface-variant">
                    <Icon name="verified_user" size={13} className="text-secondary" />
                    <span>Toutes les actions sont horodatées et auditées</span>
                </div>
            </div>

            {/* ── KPI strip ───────────────────────────────────────────────── */}
            {stats && (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-space-md">
                    {[
                        { label: 'Total comptes',   value: stats.total_users,        unit: '',      cls: 'text-on-surface',  icon: 'group'         }
                        ,{ label: 'Actifs',          value: stats.active_users,       unit: '',      cls: 'text-[#4ade80]',   icon: 'check_circle'  }
                        ,{ label: 'Inactifs',        value: stats.inactive_users,     unit: '',      cls: stats.inactive_users > 0 ? 'text-error' : 'text-on-surface-variant', icon: 'block' }
                        ,{ label: 'MDP à changer',   value: stats.pending_pwd_change, unit: '',      cls: stats.pending_pwd_change > 0 ? 'text-tertiary' : 'text-on-surface-variant', icon: 'lock_reset' }
                        ,{ label: 'Opérateurs BCC',  value: stats.by_role?.BCC ?? 0,  unit: '/ 7 BCC', cls: 'text-secondary', icon: 'domain'       }
                    ].map(({ label, value, unit, cls, icon }) => (
                        <div key={label} className="bg-surface-container-low border border-surface-container-high p-space-md flex items-center justify-between gap-space-md">
                            <div className="flex flex-col">
                                <span className="font-mono text-[9px] text-on-surface-variant uppercase">{label}</span>
                                <div className="flex items-baseline gap-space-xs mt-space-xs">
                                    <span className={`font-mono text-2xl font-bold ${cls}`}>{value}</span>
                                    {unit && <span className="font-mono text-[10px] text-on-surface-variant">{unit}</span>}
                                </div>
                            </div>
                            <Icon name={icon} size={24} className={`${cls} opacity-20`} />
                        </div>
                    ))}
                </div>
            )}

            {/* ── Tabs ────────────────────────────────────────────────────── */}
            <div className="flex items-center gap-space-xs bg-surface-container-lowest border border-surface-container-high p-space-xs self-start">
                {[
                    { key: 'users',  icon: 'manage_accounts', label: 'Comptes opérateurs'   }
                    ,{ key: 'create', icon: 'person_add',      label: 'Nouvel opérateur'     }
                    ,{ key: 'audit',  icon: 'history',         label: 'Journal d\'activité'  }
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

            {/* ── USERS TAB ───────────────────────────────────────────────── */}
            {tab === 'users' && (
                <div className="bg-surface-container-low border border-surface-container-high flex flex-col shadow-sm">

                    {/* Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-space-sm px-space-md py-space-sm bg-surface-container-lowest border-b border-surface-container-high">
                        <div className="flex items-center gap-space-sm flex-wrap">
                            <div className="flex items-center gap-space-xs bg-surface-container border border-surface-container-high px-space-sm py-space-xs">
                                <Icon name="search" size={13} className="text-on-surface-variant" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Chercher identifiant ou nom..."
                                    className="bg-transparent text-on-surface font-mono text-[10px] focus:outline-none w-44"
                                />
                                {search && (
                                    <button onClick={() => setSearch('')} className="text-on-surface-variant hover:text-on-surface" type="button">
                                        <Icon name="close" size={12} />
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-space-xs">
                                <span className="font-mono text-[10px] text-on-surface-variant">Rôle :</span>
                                <select
                                    value={roleFilter}
                                    onChange={(e) => setRoleFilter(e.target.value)}
                                    className="bg-surface-container-lowest border border-surface-container-high text-on-surface font-mono text-[10px] px-space-sm py-space-xs focus:outline-none focus:border-secondary"
                                >
                                    <option value="tous">Tous</option>
                                    <option value="DN">DN</option>
                                    <option value="CRC">CRC</option>
                                    <option value="BCC">BCC</option>
                                </select>
                            </div>
                        </div>
                        <span className="font-mono text-[10px] text-on-surface-variant">
                            {filtered.length} compte{filtered.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {/* Table */}
                    {loading
                        ? (
                            <div className="flex items-center justify-center py-space-xl gap-space-sm text-on-surface-variant font-mono text-xs">
                                <Icon name="hourglass_empty" size={16} className="animate-spin" />
                                Chargement...
                            </div>
                        )
                        : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left font-mono text-[10px] border-collapse">
                                    <thead className="bg-surface-container border-b border-surface-container-high text-on-surface-variant uppercase tracking-wider">
                                        <tr>
                                            <th className="py-space-sm px-space-md">Identifiant</th>
                                            <th className="py-space-sm px-space-md">Nom complet</th>
                                            <th className="py-space-sm px-space-md text-center">Rôle</th>
                                            <th className="py-space-sm px-space-md">Affectation</th>
                                            <th className="py-space-sm px-space-md text-center">Statut</th>
                                            <th className="py-space-sm px-space-md">Créé le</th>
                                            <th className="py-space-sm px-space-md">Dernière connexion</th>
                                            <th className="py-space-sm px-space-md text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-surface-container-high">
                                        {filtered.length === 0 && (
                                            <tr>
                                                <td colSpan={8} className="py-space-xl text-center text-on-surface-variant italic">
                                                    Aucun compte correspondant aux filtres.
                                                </td>
                                            </tr>
                                        )}
                                        {filtered.map((u) => (
                                            <tr
                                                key={u.id}
                                                className={`transition-colors ${!u.is_active ? 'opacity-50 bg-surface-container-lowest' : 'hover:bg-surface-container'}`}
                                            >
                                                <td className="py-space-sm px-space-md font-bold text-secondary">{u.username}</td>
                                                <td className="py-space-sm px-space-md text-on-surface">{u.full_name}</td>
                                                <td className="py-space-sm px-space-md text-center"><RoleBadge role={u.role} /></td>
                                                <td className="py-space-sm px-space-md text-on-surface-variant">
                                                    {u.role === 'BCC' && u.bcc_name
                                                        ? <span>{u.bcc_name} <span className="text-on-surface-variant/50">({u.crc_name})</span></span>
                                                        : u.role === 'CRC' ? u.crc_name
                                                        : u.role === 'DN' ? 'National'
                                                        : u.role === 'ADMIN' ? <span className="text-secondary">Système</span>
                                                        : '—'
                                                    }
                                                </td>
                                                <td className="py-space-sm px-space-md text-center">
                                                    <StatusBadge isActive={u.is_active} mustChange={u.must_change_password} />
                                                </td>
                                                <td className="py-space-sm px-space-md text-on-surface-variant">{fmtDate(u.created_at)}</td>
                                                <td className="py-space-sm px-space-md text-on-surface-variant">
                                                    {u.last_login ? fmtDate(u.last_login) : <span className="text-on-surface-variant/40 italic">Jamais connecté</span>}
                                                </td>
                                                <td className="py-space-sm px-space-md text-center">
                                                    {u.role !== 'ADMIN' && (
                                                        <div className="flex items-center justify-center gap-space-xs">
                                                            <button
                                                                onClick={() => setResetTarget(u)}
                                                                title="Réinitialiser le mot de passe"
                                                                className="p-space-xs bg-surface-container hover:bg-surface-container-high text-secondary border border-surface-container-high transition-colors"
                                                                type="button"
                                                            >
                                                                <Icon name="lock_reset" size={13} />
                                                            </button>
                                                            {u.is_active
                                                                ? (
                                                                    <button
                                                                        onClick={() => handleDeactivate(u)}
                                                                        title="Désactiver le compte"
                                                                        className="p-space-xs bg-surface-container hover:bg-error-container/30 hover:text-error text-on-surface-variant border border-surface-container-high transition-colors"
                                                                        type="button"
                                                                    >
                                                                        <Icon name="person_off" size={13} />
                                                                    </button>
                                                                )
                                                                : (
                                                                    <button
                                                                        onClick={() => handleActivate(u)}
                                                                        title="Réactiver le compte"
                                                                        className="p-space-xs bg-surface-container hover:bg-[#4ade80]/20 hover:text-[#4ade80] text-on-surface-variant border border-surface-container-high transition-colors"
                                                                        type="button"
                                                                    >
                                                                        <Icon name="person_check" size={13} />
                                                                    </button>
                                                                )
                                                            }
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )
                    }

                    {/* Footer note */}
                    <div className="px-space-md py-space-sm bg-surface-container-lowest border-t border-surface-container-high flex items-center gap-space-sm font-mono text-[9px] text-on-surface-variant">
                        <Icon name="info" size={11} className="text-secondary" />
                        <span>Les comptes sont désactivés, jamais supprimés — l'historique opérationnel est préservé pour l'audit.</span>
                    </div>
                </div>
            )}

            {/* ── CREATE TAB ──────────────────────────────────────────────── */}
            {tab === 'create' && (
                <CreateUserForm
                    bccs={mergedBccs}
                    crcs={mergedCrcs}
                    onCreated={() => { loadAll(); setTab('users') }}
                />
            )}

            {/* ── AUDIT TAB ───────────────────────────────────────────────── */}
            {tab === 'audit' && (
                <div className="bg-surface-container-low border border-surface-container-high flex flex-col shadow-sm">
                    <div className="px-space-md py-space-sm bg-surface-container-lowest border-b border-surface-container-high flex items-center gap-space-sm">
                        <Icon name="history" size={14} className="text-secondary" />
                        <h2 className="font-sans font-semibold text-xs text-on-surface uppercase">
                            Journal d'activité des comptes
                        </h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left font-mono text-[10px] border-collapse">
                            <thead className="bg-surface-container border-b border-surface-container-high text-on-surface-variant uppercase tracking-wider">
                                <tr>
                                    <th className="py-space-sm px-space-md">Identifiant</th>
                                    <th className="py-space-sm px-space-md">Nom</th>
                                    <th className="py-space-sm px-space-md text-center">Rôle</th>
                                    <th className="py-space-sm px-space-md">Affectation</th>
                                    <th className="py-space-sm px-space-md text-center">Statut</th>
                                    <th className="py-space-sm px-space-md">Créé le</th>
                                    <th className="py-space-sm px-space-md">Dernière connexion</th>
                                    <th className="py-space-sm px-space-md text-center">MDP à changer</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-container-high">
                                {users.map((u) => (
                                    <tr key={u.id} className={`transition-colors ${!u.is_active ? 'opacity-40' : 'hover:bg-surface-container'}`}>
                                        <td className="py-space-sm px-space-md font-bold text-secondary">{u.username}</td>
                                        <td className="py-space-sm px-space-md text-on-surface">{u.full_name}</td>
                                        <td className="py-space-sm px-space-md text-center"><RoleBadge role={u.role} /></td>
                                        <td className="py-space-sm px-space-md text-on-surface-variant">
                                            {u.role === 'BCC' ? `${u.bcc_name ?? '—'} (${u.crc_name ?? '—'})`
                                             : u.role === 'CRC' ? u.crc_name ?? '—'
                                             : u.role === 'DN' ? 'National'
                                             : 'Système'}
                                        </td>
                                        <td className="py-space-sm px-space-md text-center">
                                            <StatusBadge isActive={u.is_active} mustChange={u.must_change_password} />
                                        </td>
                                        <td className="py-space-sm px-space-md text-on-surface-variant">{fmtDate(u.created_at)}</td>
                                        <td className={`py-space-sm px-space-md ${u.last_login ? 'text-on-surface-variant' : 'text-on-surface-variant/40 italic'}`}>
                                            {u.last_login ? fmtDate(u.last_login) : 'Jamais'}
                                        </td>
                                        <td className="py-space-sm px-space-md text-center">
                                            {u.must_change_password
                                                ? <Icon name="warning" size={14} className="text-tertiary" />
                                                : <Icon name="check_circle" size={14} className="text-[#4ade80]" />
                                            }
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Modals ──────────────────────────────────────────────────── */}
            {confirmInfo && (
                <ConfirmModal
                    message={confirmInfo.message}
                    variant={confirmInfo.variant ?? 'warn'}
                    onConfirm={confirmInfo.onConfirm}
                    onCancel={() => setConfirmInfo(null)}
                />
            )}
            {resetTarget && (
                <ResetPwdModal
                    user={resetTarget}
                    onClose={() => setResetTarget(null)}
                    onDone={() => { loadAll(); showToast(`Mot de passe de ${resetTarget.username} réinitialisé.`) }}
                />
            )}

            {/* ── Toast ───────────────────────────────────────────────────── */}
            {toast && (
                <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-space-sm px-space-md py-space-sm shadow-xl font-mono text-xs font-bold border transition-all ${toast.type === 'warn' ? 'bg-tertiary-container text-tertiary border-tertiary/40' : 'bg-surface-container-highest text-secondary border-secondary/30'}`}>
                    <Icon name={toast.type === 'warn' ? 'warning' : 'check_circle'} size={15} />
                    {toast.msg}
                </div>
            )}
        </div>
    )
}
