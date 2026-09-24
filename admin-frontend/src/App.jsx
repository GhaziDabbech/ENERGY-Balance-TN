import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'

import InternalLayout  from './layouts/InternalLayout'
import AdminLayout     from './layouts/AdminLayout'
import PublicLayout    from './layouts/PublicLayout'

import LoginPage          from './pages/auth/LoginPage'
import ChangePassword     from './pages/auth/ChangePassword'
import AdminDashboard     from './pages/admin/AdminDashboard'
import DNDashboard        from './pages/dn/DNDashboard'
import DNMap              from './pages/dn/DNMap'
import HistoriqueENS      from './pages/dn/HistoriqueENS'
import SIGEditor          from './pages/dn/SIGEditor'
import ParametresSeuils   from './pages/dn/ParametresSeuils'
import SimulateurReseau   from './pages/dn/SimulateurReseau'
import CRCDashboard       from './pages/crc/CRCDashboard'
import CRCHistorique      from './pages/crc/CRCHistorique'
import BCCDashboard       from './pages/bcc/BCCDashboard'
import BCCHistorique      from './pages/bcc/BCCHistorique'
import BCCDeparts         from './pages/bcc/BCCDeparts'
import CitizenPortal      from './pages/citizen/CitizenPortal'

// ── Guards ────────────────────────────────────────────────────────────────────

function ProtectedRoute({ children, allowedRoles })
{
    const { user } = useAuthStore()
    if (!user) return <Navigate to="/login" replace />
    if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/login" replace />
    // If user must change password, only allow the change-password page
    if (user.must_change_password) return <Navigate to="/change-password" replace />
    return children
}

// Admin has its own layout and no must_change_password redirect bypass
function AdminRoute({ children })
{
    const { user } = useAuthStore()
    if (!user) return <Navigate to="/login" replace />
    if (user.role !== 'ADMIN') return <Navigate to="/login" replace />
    if (user.must_change_password) return <Navigate to="/change-password" replace />
    return children
}

// Change-password route: accessible to any logged-in user at any time
function ChangePasswordRoute()
{
    const { user } = useAuthStore()
    if (!user) return <Navigate to="/login" replace />
    return <ChangePassword />
}

export default function App()
{
    return (
        <BrowserRouter>
            <Routes>

                {/* ── Public routes ─────────────────────────────────────── */}
                <Route path="/login"           element={<LoginPage />} />
                <Route path="/change-password" element={<ChangePasswordRoute />} />
                <Route path="/portail"         element={<PublicLayout />}>
                    <Route index element={<CitizenPortal />} />
                </Route>

                {/* ── Admin routes — own layout, no sidebar ─────────────── */}
                <Route
                    path="/admin"
                    element={
                        <AdminRoute>
                            <AdminLayout />
                        </AdminRoute>
                    }
                >
                    <Route index element={<AdminDashboard />} />
                </Route>

                {/* ── Operational routes — SCADA InternalLayout ─────────── */}
                <Route
                    path="/"
                    element={
                        <ProtectedRoute allowedRoles={['DN', 'CRC', 'BCC']}>
                            <InternalLayout />
                        </ProtectedRoute>
                    }
                >
                    <Route index element={<Navigate to="/dn/dashboard" replace />} />

                    {/* DN */}
                    <Route path="dn/dashboard" element={<ProtectedRoute allowedRoles={['DN']}><DNDashboard /></ProtectedRoute>} />
                    <Route path="dn/map"        element={<ProtectedRoute allowedRoles={['DN']}><DNMap /></ProtectedRoute>} />
                    <Route path="dn/historique" element={<ProtectedRoute allowedRoles={['DN']}><HistoriqueENS /></ProtectedRoute>} />
                    <Route path="dn/sig"        element={<ProtectedRoute allowedRoles={['DN']}><SIGEditor /></ProtectedRoute>} />
                    <Route path="dn/parametres" element={<ProtectedRoute allowedRoles={['DN']}><ParametresSeuils /></ProtectedRoute>} />
                    <Route path="dn/simulateur" element={<ProtectedRoute allowedRoles={['DN']}><SimulateurReseau /></ProtectedRoute>} />

                    {/* CRC */}
                    <Route path="crc/dashboard"  element={<ProtectedRoute allowedRoles={['CRC']}><CRCDashboard /></ProtectedRoute>} />
                    <Route path="crc/historique" element={<ProtectedRoute allowedRoles={['CRC']}><CRCHistorique /></ProtectedRoute>} />

                    {/* BCC */}
                    <Route path="bcc/dashboard"  element={<ProtectedRoute allowedRoles={['BCC']}><BCCDashboard /></ProtectedRoute>} />
                    <Route path="bcc/historique" element={<ProtectedRoute allowedRoles={['BCC']}><BCCHistorique /></ProtectedRoute>} />
                    <Route path="bcc/departs"    element={<ProtectedRoute allowedRoles={['BCC']}><BCCDeparts /></ProtectedRoute>} />
                </Route>

                {/* ── Fallback ──────────────────────────────────────────── */}
                <Route path="*" element={<Navigate to="/login" replace />} />

            </Routes>
        </BrowserRouter>
    )
}
