import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import api from '../../lib/api'

function Icon({ name, size = 18, className = '' })
{
    return (
        <span className={`material-symbols-outlined ${className}`} style={{ fontSize: size }}>
            {name}
        </span>
    )
}

export default function ChangePassword()
{
    const { user, setUser, logout } = useAuthStore()
    const navigate                  = useNavigate()

    const [current,  setCurrent]  = useState('')
    const [next,     setNext]     = useState('')
    const [confirm,  setConfirm]  = useState('')
    const [showPwd,  setShowPwd]  = useState(false)
    const [loading,  setLoading]  = useState(false)
    const [error,    setError]    = useState('')
    const [done,     setDone]     = useState(false)

    const strength = (pwd) =>
    {
        if (pwd.length < 8)   return { score: 0, label: 'Trop court',  cls: 'bg-error' }
        if (pwd.length < 10)  return { score: 1, label: 'Faible',      cls: 'bg-tertiary' }
        const hasUpper  = /[A-Z]/.test(pwd)
        const hasDigit  = /\d/.test(pwd)
        const hasSymbol = /[^a-zA-Z0-9]/.test(pwd)
        const score = 1 + (hasUpper ? 1 : 0) + (hasDigit ? 1 : 0) + (hasSymbol ? 1 : 0)
        if (score <= 2) return { score: 2, label: 'Acceptable',  cls: 'bg-tertiary' }
        if (score === 3) return { score: 3, label: 'Bon',         cls: 'bg-secondary' }
        return              { score: 4, label: 'Fort',         cls: 'bg-[#4ade80]' }
    }

    const isForced    = user?.must_change_password === true
    const str         = strength(next)
    const headerTitle = isForced
        ? 'Changement de mot de passe requis'
        : 'Modifier mon mot de passe'
    const headerSub = isForced
        ? 'Votre compte nécessite un nouveau mot de passe avant de continuer'
        : 'Mettez à jour votre mot de passe de connexion'
    const currentLabel = isForced
        ? 'Mot de passe provisoire reçu de l\'administrateur'
        : 'Mot de passe actuel'

    const handleCancel = () =>
    {
        if (user?.role === 'ADMIN') navigate('/admin')
        else if (user?.role === 'DN')  navigate('/dn/dashboard')
        else if (user?.role === 'CRC') navigate('/crc/dashboard')
        else if (user?.role === 'BCC') navigate('/bcc/dashboard')
        else navigate('/login')
    }

    const handleSubmit = async (e) =>
    {
        e.preventDefault()
        setError('')

        if (next.length < 8)
        {
            setError('Le nouveau mot de passe doit contenir au moins 8 caractères.')
            return
        }
        if (next !== confirm)
        {
            setError('Les mots de passe ne correspondent pas.')
            return
        }
        if (next === current)
        {
            setError('Le nouveau mot de passe doit être différent de l\'actuel.')
            return
        }

        setLoading(true)
        try
        {
            await api.post('/api/v1/admin/change-password',
            {
                current_password: current
                ,new_password:    next
            })

            setDone(true)

            // Update local user state — clear the must_change_password flag
            if (user) setUser({ ...user, must_change_password: false })

            // Redirect to the right dashboard after 2 seconds
            setTimeout
            (
                () =>
                {
                    if (user?.role === 'ADMIN') navigate('/admin')
                    else if (user?.role === 'DN')  navigate('/dn/dashboard')
                    else if (user?.role === 'CRC') navigate('/crc/dashboard')
                    else if (user?.role === 'BCC') navigate('/bcc/dashboard')
                    else navigate('/login')
                }
                ,2000
            )
        }
        catch (err)
        {
            setError(err?.response?.data?.detail ?? 'Erreur lors du changement de mot de passe.')
        }
        finally { setLoading(false) }
    }

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">

            {/* Background grid */}
            <div
                className="absolute inset-0 pointer-events-none opacity-30"
                style={{
                    backgroundImage: `
                        linear-gradient(rgba(30,111,217,0.04) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(30,111,217,0.04) 1px, transparent 1px)
                    `
                    ,backgroundSize: '40px 40px'
                }}
            />

            <div className="relative z-10 w-full max-w-md flex flex-col gap-5">

                {/* Card */}
                <div className="bg-surface-container-low border border-surface-container-high shadow-2xl">

                    {/* Header */}
                    <div className="flex items-center gap-space-md px-space-lg py-space-md bg-surface-container border-b border-surface-container-high">
                        <div className="w-9 h-9 bg-secondary-container flex items-center justify-center shrink-0">
                            <Icon name="lock_reset" size={20} className="text-on-secondary-container" />
                        </div>
                        <div>
                            <h1 className="font-sans font-bold text-sm text-on-surface uppercase tracking-wide">
                                {headerTitle}
                            </h1>
                            <p className="font-mono text-[10px] text-on-surface-variant mt-space-xs">
                                {headerSub}
                            </p>
                        </div>
                    </div>

                    {/* User info strip */}
                    <div className="px-space-lg py-space-sm bg-surface-container-lowest border-b border-surface-container-high flex items-center gap-space-md font-mono text-[10px]">
                        <Icon name="person" size={13} className="text-on-surface-variant" />
                        <span className="text-on-surface-variant">Connecté en tant que :</span>
                        <span className="text-secondary font-bold">{user?.displayName}</span>
                        <span className="px-space-xs py-0.5 bg-surface-container text-on-surface-variant border border-surface-container-high text-[9px] uppercase">
                            {user?.role}
                        </span>
                    </div>

                    {/* Success state */}
                    {done
                        ? (
                            <div className="p-space-xl flex flex-col items-center gap-space-md text-center">
                                <div className="w-12 h-12 bg-[#4ade80]/20 border border-[#4ade80]/40 flex items-center justify-center">
                                    <Icon name="check_circle" size={28} className="text-[#4ade80]" />
                                </div>
                                <div>
                                    <p className="font-sans font-bold text-sm text-on-surface">
                                        Mot de passe mis à jour
                                    </p>
                                    <p className="font-mono text-[10px] text-on-surface-variant mt-space-xs">
                                        {isForced ? 'Redirection vers votre tableau de bord...' : 'Retour au tableau de bord...'}
                                    </p>
                                </div>
                            </div>
                        )
                        : (
                            <form onSubmit={handleSubmit} className="p-space-lg flex flex-col gap-space-lg">

                                {/* Current password */}
                                <div className="flex flex-col gap-space-xs">
                                    <label className="font-mono text-[10px] text-on-surface-variant uppercase">
                                        Mot de passe actuel
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showPwd ? 'text' : 'password'}
                                            value={current}
                                            onChange={(e) => setCurrent(e.target.value)}
                                            placeholder={currentLabel}
                                            autoComplete="current-password"
                                            className="w-full bg-surface-container-lowest border border-surface-container-high focus:border-secondary text-on-surface font-mono text-sm px-space-md py-space-sm focus:outline-none transition-colors pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPwd((v) => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                                        >
                                            <Icon name={showPwd ? 'visibility_off' : 'visibility'} size={15} />
                                        </button>
                                    </div>
                                </div>

                                {/* New password */}
                                <div className="flex flex-col gap-space-xs">
                                    <label className="font-mono text-[10px] text-on-surface-variant uppercase">
                                        Nouveau mot de passe
                                    </label>
                                    <input
                                        type={showPwd ? 'text' : 'password'}
                                        value={next}
                                        onChange={(e) => setNext(e.target.value)}
                                        placeholder="Minimum 8 caractères"
                                        autoComplete="new-password"
                                        className="w-full bg-surface-container-lowest border border-surface-container-high focus:border-secondary text-on-surface font-mono text-sm px-space-md py-space-sm focus:outline-none transition-colors"
                                    />
                                    {/* Strength bar */}
                                    {next.length > 0 && (
                                        <div className="flex flex-col gap-space-xs">
                                            <div className="flex gap-space-xs">
                                                {[1, 2, 3, 4].map((i) => (
                                                    <div
                                                        key={i}
                                                        className={`flex-1 h-1 transition-all ${i <= str.score ? str.cls : 'bg-surface-container-highest'}`}
                                                    />
                                                ))}
                                            </div>
                                            <span className="font-mono text-[9px] text-on-surface-variant">
                                                Force : <span className={str.score >= 3 ? 'text-[#4ade80]' : str.score >= 2 ? 'text-tertiary' : 'text-error'}>{str.label}</span>
                                            </span>
                                        </div>
                                    )}
                                    <div className="font-mono text-[9px] text-on-surface-variant">
                                        Recommandé : majuscules, chiffres et caractères spéciaux
                                    </div>
                                </div>

                                {/* Confirm password */}
                                <div className="flex flex-col gap-space-xs">
                                    <label className="font-mono text-[10px] text-on-surface-variant uppercase">
                                        Confirmer le nouveau mot de passe
                                    </label>
                                    <input
                                        type={showPwd ? 'text' : 'password'}
                                        value={confirm}
                                        onChange={(e) => setConfirm(e.target.value)}
                                        placeholder="Répéter le nouveau mot de passe"
                                        autoComplete="new-password"
                                        className={`w-full bg-surface-container-lowest border focus:outline-none text-on-surface font-mono text-sm px-space-md py-space-sm transition-colors ${confirm.length > 0 && confirm !== next ? 'border-error' : 'border-surface-container-high focus:border-secondary'}`}
                                    />
                                    {confirm.length > 0 && confirm !== next && (
                                        <span className="font-mono text-[9px] text-error">Les mots de passe ne correspondent pas</span>
                                    )}
                                </div>

                                {/* Error */}
                                {error && (
                                    <div className="flex items-center gap-space-sm px-space-md py-space-sm bg-error-container/20 border border-error/40 font-mono text-[10px] text-error">
                                        <Icon name="error" size={13} />
                                        {error}
                                    </div>
                                )}

                                {/* Submit */}
                                <div className="flex flex-col gap-space-sm pt-space-xs border-t border-surface-container-high">
                                    <button
                                        type="submit"
                                        disabled={loading || !current || !next || !confirm}
                                        className="w-full flex items-center justify-center gap-space-sm py-space-md bg-secondary-container hover:bg-secondary text-on-secondary-container font-mono font-bold text-sm uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                                    >
                                        {loading
                                            ? <><Icon name="hourglass_empty" size={16} className="animate-spin" /><span>Mise à jour...</span></>
                                            : <><Icon name="lock" size={16} /><span>Enregistrer le nouveau mot de passe</span></>
                                        }
                                    </button>
                                    <button
                                        type="button"
                                        onClick={isForced ? () => { logout(); navigate('/login') } : handleCancel}
                                        className="w-full py-space-xs font-mono text-[10px] text-on-surface-variant hover:text-error transition-colors"
                                    >
                                        {isForced ? 'Se déconnecter et annuler' : '← Retour au tableau de bord'}
                                    </button>
                                </div>
                            </form>
                        )
                    }
                </div>

                <p className="font-mono text-[10px] text-on-surface-variant/50 text-center">
                    Plateforme Nationale de Gestion du Délestage — STEG · v5.4.1
                </p>
            </div>
        </div>
    )
}
