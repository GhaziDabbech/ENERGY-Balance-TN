import { create }  from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * gridStore — live grid balance values for the DN dashboard and demo simulator.
 *
 * Production and consumption are set manually via the SimulateurReseau page
 * for demo purposes. In a real system they would come from SCADA telemetry.
 *
 * Frequency is derived from the production/consumption imbalance:
 *   - Balanced (within ±10 MW)   → ~50,00 Hz
 *   - Deficit  (consumption > production)  → frequency drops below 50 Hz
 *   - Surplus  (production > consumption)  → frequency rises above 50 Hz
 *
 * Formula approximation (simplified, not IEEE-standard):
 *   f = 50.0 + (production - consumption) / totalCapacity * 0.5
 *   Clamped to [49.0, 51.0] Hz for realism.
 */

const NOMINAL_HZ     = 50.0
const TOTAL_CAPACITY = 4500    // approximate Tunisian grid capacity in MW
const HZ_SENSITIVITY = 0.5     // Hz deviation per full capacity imbalance

function deriveFrequency(production, consumption)
{
    const imbalance = production - consumption   // positive = surplus, negative = deficit
    const deviation = (imbalance / TOTAL_CAPACITY) * HZ_SENSITIVITY
    return Math.max(49.0, Math.min(51.0, NOMINAL_HZ + deviation))
}

export const useGridStore = create
(
    persist
    (
        (set, get) =>
        ({
            // MW values — set by simulator or (in production) by SCADA feed
            production:  1038.5
            ,consumption: 1065.0

            // Derived — recomputed on every set
            ,frequency:  deriveFrequency(1038.5, 1065.0)

            // Setters — always recompute frequency
            ,setProduction: (mw) =>
            {
                const prod = Math.max(0, Number(mw) || 0)
                set({ production: prod, frequency: deriveFrequency(prod, get().consumption) })
            }

            ,setConsumption: (mw) =>
            {
                const cons = Math.max(0, Number(mw) || 0)
                set({ consumption: cons, frequency: deriveFrequency(get().production, cons) })
            }

            ,setBoth: (production, consumption) =>
            {
                const prod = Math.max(0, Number(production) || 0)
                const cons = Math.max(0, Number(consumption) || 0)
                set({ production: prod, consumption: cons, frequency: deriveFrequency(prod, cons) })
            }

            // Active cuts count — updated by dashboard polls (DN & CRC hooks)
            ,activeCuts: 0
            ,setActiveCuts: (n) => set({ activeCuts: Math.max(0, Number(n) || 0) })

            // Computed helpers (not stored — derived on read)
            ,getBalance: () =>
            {
                const { production, consumption } = get()
                return production - consumption    // negative = deficit
            }

            ,getStatus: () =>
            {
                const balance = get().getBalance()
                if (balance >= -10)  return 'ok'      // within ±10 MW — balanced
                if (balance >= -100) return 'warn'    // moderate deficit
                return                       'crit'   // severe deficit
            }
        })
        ,{ name: 'steg-grid' }
    )
)
