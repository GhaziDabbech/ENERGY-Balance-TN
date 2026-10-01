import { create }  from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
    persist(
        (set) => ({
            user:            null,
            token:           null,
            refreshToken:    null,
            lastDNSubView:   'dashboard',
            // true when refresh has failed and the user must re-authenticate
            sessionExpired:  false,

            login: (user, token, refreshToken = null) =>
                set({ user, token, refreshToken: refreshToken ?? null, sessionExpired: false }),

            logout: () => {
                // Clear all session-scoped stores on logout
                // so stale orders / state don't bleed into the next session
                try {
                    localStorage.removeItem('steg-urgences')
                    localStorage.removeItem('steg-bcc-orders')
                    localStorage.removeItem('steg-grid')
                    // Clear completedOrderIds from liveStore so the next operator
                    // session doesn't inherit dismissed order IDs from the previous one.
                    const stegLive = JSON.parse(localStorage.getItem('steg-live') || '{}')
                    if (stegLive?.state) {
                        stegLive.state.completedOrderIds = []
                        localStorage.setItem('steg-live', JSON.stringify(stegLive))
                    }
                } catch {}
                set({ user: null, token: null, refreshToken: null, lastDNSubView: 'dashboard', sessionExpired: false })
            },

            // Called by the API interceptor when the refresh token is also expired/invalid
            markSessionExpired: () => set({ sessionExpired: true }),

            setUser:        (user)  => set({ user }),
            setToken:       (token) => set({ token }),
            setLastDNView:  (path)  => set({ lastDNSubView: path === '/dn/map' ? 'map' : 'dashboard' }),
            setDNSubView:   (view)  => set({ lastDNSubView: view }),
        }),
        { name: 'steg-auth' }
    )
)
