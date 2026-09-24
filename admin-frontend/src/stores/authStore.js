import { create }  from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create
(
    persist
    (
        (set) =>
        ({
            user:           null
            ,token:         null          // access token (JWT)
            ,refreshToken:  null          // refresh token
            ,lastDNSubView: 'dashboard'

            ,login: (user, token, refreshToken = null) =>
                set({ user, token, refreshToken: refreshToken ?? null })

            ,logout: () =>
                set({ user: null, token: null, refreshToken: null, lastDNSubView: 'dashboard' })

            ,setUser:  (user)  => set({ user })
            ,setToken: (token) => set({ token })

            ,setLastDNView:  (path) => set({ lastDNSubView: path === '/dn/map' ? 'map' : 'dashboard' })
            ,setDNSubView:   (view) => set({ lastDNSubView: view })
        })
        ,{ name: 'steg-auth' }
    )
)
