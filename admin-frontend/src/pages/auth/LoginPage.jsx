import { useState, useEffect } from 'react'
import { useNavigate }         from 'react-router-dom'
import { useAuthStore }        from '../../stores/authStore'
import api                     from '../../lib/api'

export default function LoginPage()
{
    const { login, user }          = useAuthStore()
    const navigate                 = useNavigate()
    const [username, setUsername]  = useState('')
    const [password, setPassword]  = useState('')
    const [showPass, setShowPass]  = useState(false)
    const [loading,  setLoading]   = useState(false)
    const [error,    setError]     = useState('')
    const [time,     setTime]      = useState(new Date())

    useEffect
    (
        () =>
        {
            if (user)
            {
                if (user.must_change_password)  navigate('/change-password', { replace: true })
                else if (user.role === 'ADMIN') navigate('/admin',           { replace: true })
                else if (user.role === 'DN')    navigate('/dn/dashboard',    { replace: true })
                else if (user.role === 'CRC')   navigate('/crc/dashboard',   { replace: true })
                else if (user.role === 'BCC')   navigate('/bcc/dashboard',   { replace: true })
            }
        }
        ,[user, navigate]
    )

    useEffect
    (
        () =>
        {
            const t = setInterval(() => setTime(new Date()), 1000)
            return () => clearInterval(t)
        }
        ,[]
    )

    const timeStr =
        `${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}:${String(time.getSeconds()).padStart(2,'0')}`

    const handleSubmit = async (e) =>
    {
        e.preventDefault()
        setError('')

        if (!username || !password)
        {
            setError('Identifiant et mot de passe requis.')
            return
        }

        setLoading(true)

        try
        {
            // Step 1 — get JWT tokens from backend
            const { data: tokenData } = await api.post('/api/v1/auth/login', {
                username: username.toLowerCase()
                ,password
            })

            // Step 2 — fetch user profile with the access token
            const { data: userData } = await api.get('/api/v1/auth/me', {
                headers: { Authorization: `Bearer ${tokenData.access_token}` }
            })

            // Normalize user object to match the shape the rest of the app expects
            const user =
            {
                id:                   userData.id
                ,username:            userData.username
                ,role:                userData.role
                ,displayName:         userData.full_name
                ,zone:                userData.zone ?? (userData.role === 'DN' ? 'National' : null)
                ,bcc_id:              userData.bcc_id ?? null
                ,must_change_password: tokenData.must_change_password ?? false
            }

            login(user, tokenData.access_token, tokenData.refresh_token)

            // Force password change before accessing any operational page
            if (user.must_change_password)
            {
                navigate('/change-password')
                return
            }

            if (user.role === 'DN')    navigate('/dn/dashboard')
            if (user.role === 'CRC')   navigate('/crc/dashboard')
            if (user.role === 'BCC')   navigate('/bcc/dashboard')
            if (user.role === 'ADMIN') navigate('/admin')
        }
        catch (err)
        {
            const msg = err?.response?.data?.detail ?? 'Identifiant ou mot de passe incorrect.'
            setError(msg)
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-bg-deep flex flex-col overflow-hidden relative">

            {/* Grid background */}
            <div
                className="absolute inset-0 pointer-events-none"
                style=
                {{
                    backgroundImage: `
                        linear-gradient(rgba(30,111,217,0.04) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(30,111,217,0.04) 1px, transparent 1px)
                    `
                    ,backgroundSize: '40px 40px'
                }}
            />

            {/* Tunisia watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.04]">
                <svg viewBox="0 0 200 350" className="w-80 h-auto fill-text-subtle">
                    <path d="M100 10 L115 15 L130 25 L142 40 L148 58 L144 70 L152 80 L150 95
                             L142 105 L145 118 L138 130 L132 142 L128 158 L122 175 L116 192
                             L110 210 L104 228 L98 248 L94 262 L90 270 L86 262 L82 248
                             L78 228 L73 210 L68 192 L63 175 L58 158 L54 142 L48 130
                             L42 118 L45 105 L38 95 L36 80 L44 70 L40 58 L46 40
                             L58 25 L72 15 Z" />
                </svg>
            </div>

            {/* Top status bar */}
            <div className="relative z-10 h-7 flex items-center justify-between px-6 bg-bg-deep/80 border-b border-border-subtle font-mono text-[10px] text-text-subtle shrink-0">
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse" />
                        SYSTEME EN LIGNE
                    </span>
                    <span className="hidden sm:inline">RESEAU INTERCONNECTE — 225/150/90/30 kV</span>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-accent-blue">{timeStr} UTC+1</span>
                    <span>v5.4.1</span>
                    <span className="text-accent-blue hidden sm:inline">SECURE · AES-256</span>
                </div>
            </div>

            {/* Main content */}
            <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
                <div className="w-full max-w-sm flex flex-col gap-5">

                    {/* Card */}
                    <div className="relative bg-bg-surface/95 border border-border-subtle rounded-sm p-8 shadow-2xl">

                        {/* Corner accents */}
                        {['top-0 left-0 border-t-2 border-l-2'
                          ,'top-0 right-0 border-t-2 border-r-2'
                          ,'bottom-0 left-0 border-b-2 border-l-2'
                          ,'bottom-0 right-0 border-b-2 border-r-2'
                        ].map
                        (
                            (cls, i) => (
                                <div
                                    key={i}
                                    className={`absolute w-4 h-4 border-accent-blue/60 ${cls}`}
                                />
                            )
                        )}

                        {/* Logo */}
                        <div className="flex flex-col items-center gap-3 mb-7">
                            <div className="w-14 h-14 rounded-lg bg-accent-blue flex items-center justify-center shadow-lg">
                                <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
                                    <path
                                        d="M18 4L8 18H16L14 28L24 14H16Z"
                                        fill="#031427"
                                        stroke="#031427"
                                        strokeWidth="0.5"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </div>
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-2 mb-1">
                                    <span className="font-mono text-xl font-bold text-text-primary tracking-widest">
                                        STEG
                                    </span>
                                    <span className="font-mono text-[9px] text-text-subtle border border-border-subtle px-1.5 py-0.5 rounded-sm tracking-wider">
                                        DELESTAGE NATIONAL
                                    </span>
                                </div>
                                <p className="font-mono text-xs text-text-subtle">Connexion Operateur</p>
                                <p className="font-mono text-[10px] text-text-subtle/60 mt-0.5">
                                    Acces reserve au personnel de controle
                                </p>
                            </div>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

                            {/* Username */}
                            <div className="flex flex-col gap-1.5">
                                <label className="steg-label">Identifiant / Matricule</label>
                                <div className="relative">
                                    <svg
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
                                        width="14" height="14" viewBox="0 0 24 24"
                                        fill="none" stroke="currentColor" strokeWidth="2"
                                    >
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                        <circle cx="12" cy="7" r="4" />
                                    </svg>
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder="Ex: dn.admin"
                                        autoComplete="username"
                                        className="steg-input pl-8"
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div className="flex flex-col gap-1.5">
                                <label className="steg-label">Mot de Passe</label>
                                <div className="relative">
                                    <svg
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
                                        width="14" height="14" viewBox="0 0 24 24"
                                        fill="none" stroke="currentColor" strokeWidth="2"
                                    >
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                    <input
                                        type={showPass ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••••"
                                        autoComplete="current-password"
                                        className="steg-input pl-8 pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPass((v) => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text-primary"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            {showPass
                                                ? <>
                                                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                                    <line x1="1" y1="1" x2="23" y2="23" />
                                                  </>
                                                : <>
                                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                    <circle cx="12" cy="12" r="3" />
                                                  </>
                                            }
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Error */}
                            {error && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-error-bg/30 border border-accent-red/50 rounded-sm font-mono text-[11px] text-accent-red">
                                    <span className="font-bold">!</span>
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={loading}
                                className="mt-1 w-full py-3 bg-accent-blue hover:bg-blue-300 disabled:opacity-60 text-bg-deep font-mono font-bold text-sm tracking-widest uppercase rounded-sm transition-colors flex items-center justify-center gap-2"
                            >
                                {loading
                                    ? (
                                        <>
                                            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 12 0 12 4.418A8 8 0 014 12z" />
                                            </svg>
                                            Authentification...
                                        </>
                                    )
                                    : "S'authentifier"
                                }
                            </button>
                        </form>

                        {/* Demo credentials */}
                        <div className="mt-4 p-2 bg-bg-container rounded-sm border border-border-subtle">
                            <p className="font-mono text-[9px] text-text-subtle text-center mb-1 uppercase tracking-wider">
                                Comptes demo
                            </p>
                            <div className="flex flex-col gap-0.5 font-mono text-[10px] text-text-subtle">
                                <span><span className="text-accent-blue">dn.admin</span> / admin1234 — DN</span>
                                <span><span className="text-accent-amber">crc.nord</span> / crcnord1234 — CRC</span>
                                <span><span className="text-accent-green">bcc.3</span>    / bcc31234 — BCC</span>
                            </div>
                        </div>

                        <p className="mt-4 font-mono text-[10px] text-text-subtle/50 text-center">
                            Connexion chiffree TLS 1.3 · Session AES-256
                        </p>
                    </div>

                    <a
                        href="/portail"
                        className="font-mono text-xs text-text-subtle hover:text-accent-blue transition-colors text-center"
                    >
                        Acceder au portail citoyen public
                    </a>
                </div>
            </div>

            {/* Footer */}
            <div className="relative z-10 h-8 flex items-center justify-center border-t border-border-subtle bg-bg-deep/80 shrink-0">
                <p className="font-mono text-[10px] text-text-subtle/50 tracking-wide">
                    Plateforme Nationale de Gestion du Delestage — Usage interne STEG · v5.4.1
                </p>
            </div>
        </div>
    )
}
