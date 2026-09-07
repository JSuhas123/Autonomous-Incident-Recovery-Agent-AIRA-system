import {
  PageLoader,
} from '@/components/shared/PageLoader'

import {
  useAuthStore,
} from '@/store/authStore'

import {
  Navigate,
  useLocation,
} from 'react-router-dom'


interface Props {
  children:
    React.ReactNode
}


export function ProtectedRoute({
  children,
}: Props) {
  const status =
    useAuthStore(
      (
        state,
      ) =>
        state.status,
    )


  const user =
    useAuthStore(
      (
        state,
      ) =>
        state.user,
    )


  const location =
    useLocation()


  if (
    status ===
      'loading'
  ) {
    return (
      <PageLoader />
    )
  }


  if (
    status ===
      'unauthenticated'
  ) {
    return (
      <Navigate
        to="/login"
        state={{
          from:
            location,
        }}
        replace
      />
    )
  }


  /*
   * ========================================================================
   * PHASE 25 — VERIFIED IDENTITY GATE
   * ========================================================================
   *
   * Authenticated != verified.
   *
   * Email verification still does NOT:
   * - grant a role
   * - grant permissions
   * - grant tenant access
   * - grant execution authority
   *
   * It only permits continuation into the authenticated product experience.
   */

  if (
    user &&
    !user
      .emailVerifiedAt
  ) {
    return (
      <Navigate
        to={`/email-verification-pending?email=${encodeURIComponent(
          user.email,
        )}`}
        replace
      />
    )
  }


  return (
    <>
      {
        children
      }
    </>
  )
}