import { useAuthStore } from '@/store/authStore'
import { Navigate, useLocation } from 'react-router-dom'

interface Props {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: Props) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
