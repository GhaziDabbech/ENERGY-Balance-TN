import { useState }          from 'react'
import { Outlet }            from 'react-router-dom'
import Sidebar               from '../components/shared/Sidebar'
import TopBar                from '../components/shared/TopBar'
import StatusBar             from '../components/shared/StatusBar'
import AlertBar              from '../components/shared/AlertBar'
import CRCUrgencePopup       from '../components/shared/CRCUrgencePopup'
import BCCOrderPopup         from '../components/shared/BCCOrderPopup'
import { useAuthStore }      from '../stores/authStore'
import { useRealtimeOrders } from '../hooks/useRealtimeOrders'
import { useWebSocket }      from '../hooks/useWebSocket'
import { useOrders }         from '../hooks/useOrders'

export default function InternalLayout()
{
    const [collapsed, setCollapsed] = useState(false)
    const { user }                  = useAuthStore()

    // Opens WebSocket connection and drives urgence/realim popups in real time
    useRealtimeOrders()
    // New live system: WebSocket → liveStore + initial REST load
    useWebSocket()
    useOrders()

    return (
        <div className="min-h-screen bg-background text-on-surface font-body-md text-body-md">

            {/* Fixed top bar — h-14 */}
            <TopBar />

            {/* Fixed left sidebar */}
            <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

            {/* Main content area */}
            <div
                className={`transition-all duration-300 pt-14 pb-8 flex flex-col ${collapsed ? 'pl-14' : 'pl-64'}`}
                style={{ height: '100vh' }}
            >
                {/* Alert bar — thin bar only for DN, but panel accessible via bell for all roles */}
                <AlertBar showBar={user?.role === 'DN'} />

                {/* Urgence popup — blocks CRC screen until acknowledged, persists across pages and login */}
                <CRCUrgencePopup />

                {/* Order popup — blocks BCC screen for urgence/réalimentation orders from CRC */}
                <BCCOrderPopup />

                <main className="flex-1 flex flex-col w-full bg-background min-h-0 overflow-y-auto">
                    <Outlet />
                </main>
            </div>

            {/* Fixed bottom status bar — h-8 */}
            <StatusBar />
        </div>
    )
}
