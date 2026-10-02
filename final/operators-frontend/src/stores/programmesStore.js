/**
 * programmesStore — J+1 programme state shared across DN and CRC.
 *
 * Populated two ways:
 *   1. REST poll at startup (GET /api/v1/programmes/j1-status)
 *   2. WebSocket push (j1_published event — handled in useWebSocket)
 *
 * Consumed by:
 *   - DNDashboard  (show "programme non saisi" badge, open editor modal)
 *   - useJ1Reminder (reminder polling hook)
 *   - CRCDashboard  (show "Programme DN validé" banner + update balance column)
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useProgrammesStore = create(
    persist(
        (set, get) =>
        ({
            // ── J+1 status fetched / received via WS ─────────────────────────
            // 'no_programme' | 'draft' | 'validated' | 'active' | 'completed'
            j1Status:       'no_programme'
            ,j1ProgrammeId:  null
            ,j1ProgrammeDate: null    // ISO string, tomorrow

            // Slots received from j1_published WS event.
            // Shape: [{ time_slot, mw_national, mw_nord, mw_sud }]
            ,j1Slots: []

            // True when the j1_published WS event was received this session
            // and the CRC banner has NOT been dismissed yet.
            ,j1NotificationPending: false
            ,j1NotificationIsAutoZero: false   // true when DN missed deadline → auto-zero

            // ── Reminder state (DN-side only) ─────────────────────────────────
            // These mirror the ParametresSeuils values but are persisted here
            // so the reminder hook can read them without mounting Paramètres.
            ,rappelActif: true
            ,rappelHeure: '20:00'   // 'HH:MM' 24h

            // Tracks whether the reminder notification has already fired today
            // (reset when the date changes or a programme is submitted).
            ,reminderFiredDate: null    // ISO date string 'YYYY-MM-DD'

            // ── Actions ───────────────────────────────────────────────────────

            // Called by useJ1Reminder after REST poll
            ,setJ1Status: (status, programmeId = null, programmeDate = null) =>
                set({ j1Status: status, j1ProgrammeId: programmeId, j1ProgrammeDate: programmeDate })

            // Called by useWebSocket when j1_published event arrives (CRC side)
            ,receiveJ1Published: (event) =>
                set
                ({
                    j1Status:                  event.status ?? 'validated'
                    ,j1ProgrammeId:            event.programme_id
                    ,j1ProgrammeDate:          event.programme_date
                    ,j1Slots:                  event.slots ?? []
                    ,j1NotificationPending:    true
                    ,j1NotificationIsAutoZero: event.is_auto_zero ?? false
                })

            // CRC dismisses the notification banner
            ,dismissJ1Notification: () =>
                set({ j1NotificationPending: false })

            // Called by ParametresSeuils when the operator saves settings
            ,syncRappelSettings: (rappelActif, rappelHeure) =>
                set({ rappelActif, rappelHeure })

            // Mark that the reminder fired today — prevents duplicate toasts
            ,markReminderFired: () =>
            {
                const today = new Date().toISOString().slice(0, 10)
                set({ reminderFiredDate: today })
            }

            // Reset reminder fired flag (called on new day or on successful submit)
            ,resetReminderFired: () =>
                set({ reminderFiredDate: null })

            // Computed: has the reminder already fired today?
            ,hasReminderFiredToday: () =>
            {
                const today  = new Date().toISOString().slice(0, 10)
                return get().reminderFiredDate === today
            }

            // Reset on logout
            ,reset: () =>
                set
                ({
                    j1Status:               'no_programme'
                    ,j1ProgrammeId:          null
                    ,j1ProgrammeDate:        null
                    ,j1Slots:                []
                    ,j1NotificationPending:  false
                    ,j1NotificationIsAutoZero: false
                    ,reminderFiredDate:      null
                })
        })
        ,{
            name: 'steg-programmes'
            // Persist settings and notification state across navigation,
            // but not j1Slots (they are rebuilt from WS / REST on next load).
            ,partialize: (state) => ({
                rappelActif:           state.rappelActif
                ,rappelHeure:          state.rappelHeure
                ,reminderFiredDate:    state.reminderFiredDate
                ,j1Status:             state.j1Status
                ,j1ProgrammeId:        state.j1ProgrammeId
                ,j1ProgrammeDate:      state.j1ProgrammeDate
                ,j1NotificationPending:     state.j1NotificationPending
                ,j1NotificationIsAutoZero:  state.j1NotificationIsAutoZero
            })
        }
    )
)
