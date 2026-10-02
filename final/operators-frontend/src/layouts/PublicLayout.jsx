import { Outlet } from 'react-router-dom'

export default function PublicLayout()
{
    return (
        <div className="min-h-screen bg-white text-gray-900">
            <Outlet />
        </div>
    )
}
