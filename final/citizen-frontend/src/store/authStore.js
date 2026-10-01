/**
 * Zustand store for citizen authentication.
 *
 * Persisted to localStorage under the key "citizen-auth" so the session
 * survives page refreshes.
 *
 * Shape:
 *   { token, citizen, login(), logout() }
 *
 * `citizen` mirrors CitizenTokenResponse from the backend:
 *   { access_token, citizen_id, full_name, zone_id, zone_name }
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"

export const useCitizenAuthStore = create(
  persist(
    (set) => ({
      token:   null,   // raw JWT string
      citizen: null,   // CitizenTokenResponse payload

      login: (tokenResponse) =>
        set({
          token:   tokenResponse.access_token,
          citizen: tokenResponse,
        }),

      logout: () =>
        set({ token: null, citizen: null }),
    }),
    {
      name: "citizen-auth",   // localStorage key — matches what api.js reads
    }
  )
)
