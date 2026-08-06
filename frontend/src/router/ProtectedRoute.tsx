import { PageLoader } from '@/components/shared/PageLoader'
import { useAuthStore } from '@/store/authStore'
import { Navigate, useLocation } from 'react-router-dom'

interface Props {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: Props) {
  const status = useAuthStore((s) => s.status)
  const location = useLocation()

  if (status === 'loading') return <PageLoader />

  if (status === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
