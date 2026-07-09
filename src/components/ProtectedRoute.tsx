import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
    </div>
  )
}

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

export function GuestRoute() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (user) return <Navigate to="/" replace />
  return <Outlet />
}
