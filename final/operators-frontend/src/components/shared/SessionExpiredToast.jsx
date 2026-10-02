import { useEffect, useState } from 'react'
import { useAuthStore }        from '../../stores/authStore'

const Icon = ({ name }) => (
    <span className="material-symbols-outlined text-[18px] leading-none">{name}</span>
)

/**
 * Renders a full-width fixed banner at the top of the viewport when the
 * session has expired (refresh token also invalid).
 *
 * The api.js interceptor calls markSessionExpired() then waits 3 s before
 * calling logout() + redirect. This component counts down visually so the
 * operator knows exactly what is happening instead of being silently kicked.
 */
export default function SessionExpiredToast()
{
    const sessionExpired = useAuthStore((s) => s.sessionExpired)
    const [countdown,  setCountdown]  = useState(3)

    useEffect(() =>
    {
        if (!sessionExpired) return

        setCountdown(3)
        const interval = setInterval(() =>
        {
            setCountdown((prev) =>
            {
                if (prev <= 1) { clearInterval(interval); return 0 }
                return prev - 1
            })
        }, 1000)

        return () => clearInterval(interval)
    }, [sessionExpired])

    if (!sessionExpired) return null

    return (
        <div
            role="alert"
            aria-live="assertive"
            className="fixed top-0 left-0 right-0 z-[9999] flex items-center gap-3 px-6 py-3
                       bg-error-container border-b-2 border-error text-on-surface shadow-lg"
        >
            {/* Icon */}
            <span className="text-error shrink-0">
                <Icon name="lock_clock" />
            </span>

            {/* Message */}
            <div className="flex-1 min-w-0">
                <span className="font-semibold text-error">Session expirée — </span>
                <span className="text-on-surface-variant text-body-sm">
                    Votre session a expiré. Redirection vers la page de connexion dans&nbsp;
                </span>
                <span className="font-label-caps text-error">{countdown} s</span>
                <span className="text-on-surface-variant text-body-sm">…</span>
            </div>

            {/* Countdown ring — purely visual */}
            <div
                className="shrink-0 w-8 h-8 rounded-full border-2 border-error flex items-center justify-center
                           text-error font-mono text-sm font-bold"
            >
                {countdown}
            </div>
        </div>
    )
}
