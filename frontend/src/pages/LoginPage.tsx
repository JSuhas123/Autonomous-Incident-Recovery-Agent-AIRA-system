import { authApi } from '@/api/client'
import { AuthProductShell } from '@/components/auth/AuthProductShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/store/authStore'
import type {
  SafeMembership,
  SafeOrganization,
  SafeUser,
} from '@/types'
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react'
import {
  type FormEvent,
  useState,
} from 'react'
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from 'react-router-dom'

interface LocationState {
  from?: {
    pathname?: string
  }
}

interface LoginResponse {
  user: SafeUser

  organization:
    | SafeOrganization
    | null

  membership:
    | SafeMembership
    | null

  csrfToken:
    | string
    | null
}

export default function LoginPage() {
  const navigate =
    useNavigate()

  const location =
    useLocation()

  const status =
    useAuthStore(
      (state) =>
        state.status,
    )

  const setAuthenticated =
    useAuthStore(
      (state) =>
        state.setAuthenticated,
    )

  const [email, setEmail] =
    useState('')

  const [
    password,
    setPassword,
  ] = useState('')

  const [
    rememberMe,
    setRememberMe,
  ] = useState(true)

  const [
    showPassword,
    setShowPassword,
  ] = useState(false)

  const [
    submitting,
    setSubmitting,
  ] = useState(false)

  const [error, setError] =
    useState<string | null>(
      null,
    )

  if (
    status ===
    'authenticated'
  ) {
    const state =
      location.state as
        | LocationState
        | null

    return (
      <Navigate
        to={
          state?.from
            ?.pathname ??
          '/dashboard'
        }
        replace
      />
    )
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    setError(null)

    const normalizedEmail =
      email
        .trim()
        .toLowerCase()

    if (!normalizedEmail) {
      setError(
        'Enter your email address.',
      )

      return
    }

    if (!password) {
      setError(
        'Enter your password.',
      )

      return
    }

    setSubmitting(true)

    try {
      /*
       * authApi currently exposes the
       * decoded login payload fields as
       * unknown at its generic client
       * boundary.
       *
       * The browser auth endpoint
       * contract is the authoritative
       * source for this response.
       */
      const response =
        (await authApi.login({
          email:
            normalizedEmail,

          password,

          rememberMe,
        })) as LoginResponse

      setAuthenticated({
        user:
          response.user,

        organization:
          response.organization,

        membership:
          response.membership,

        session:
          null,

        csrfToken:
          response.csrfToken,
      })

      const state =
        location.state as
          | LocationState
          | null

      const target =
        state?.from
          ?.pathname ??
        '/dashboard'

      navigate(
        target,
        {
          replace: true,
        },
      )
    } catch (
      loginError: unknown
    ) {
      const apiError =
        loginError as {
          status?: number
          message?: string
        }

      if (
        apiError.status ===
        401
      ) {
        setError(
          'The email or password is incorrect.',
        )
      } else if (
        apiError.status ===
        403
      ) {
        setError(
          apiError.message ||
            'This account cannot currently access AIRA.',
        )
      } else {
        setError(
          apiError.message ||
            'Unable to sign in. Please try again.',
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthProductShell
      title="Sign in to AIRA"
      description="Use your organization credentials to access the AIRA reliability control plane."
    >
      <form
        className="space-y-5"
        onSubmit={
          handleSubmit
        }
      >
        <p className="text-sm leading-6 text-muted-foreground">
          Enter your organization
          credentials to continue to the
          AIRA reliability control
          plane.
        </p>

        <div className="space-y-2">
          <Label htmlFor="email">
            Work email
          </Label>

          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              className="pl-9"
              value={email}
              onChange={(
                event,
              ) => {
                setEmail(
                  event.target.value,
                )

                if (error) {
                  setError(null)
                }
              }}
              disabled={
                submitting
              }
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="password">
              Password
            </Label>

            <Link
              to="/forgot-password"
              className="text-xs font-medium text-primary transition-colors hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <div className="relative">
            <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              id="password"
              type={
                showPassword
                  ? 'text'
                  : 'password'
              }
              autoComplete="current-password"
              className="pl-9 pr-10"
              value={password}
              onChange={(
                event,
              ) => {
                setPassword(
                  event.target.value,
                )

                if (error) {
                  setError(null)
                }
              }}
              disabled={
                submitting
              }
              required
            />

            <button
              type="button"
              aria-label={
                showPassword
                  ? 'Hide password'
                  : 'Show password'
              }
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() =>
                setShowPassword(
                  (current) =>
                    !current,
                )
              }
              disabled={
                submitting
              }
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={
              rememberMe
            }
            onChange={(
              event,
            ) =>
              setRememberMe(
                event.target
                  .checked,
              )
            }
            disabled={
              submitting
            }
            className="h-4 w-4 rounded border-border"
          />

          Keep me signed in
        </label>

        {error ? (
          <div
            role="alert"
            className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

            <span>
              {error}
            </span>
          </div>
        ) : null}

        <Button
          type="submit"
          className="w-full"
          disabled={
            submitting
          }
        >
          {submitting ? (
            'Signing in…'
          ) : (
            <>
              Sign in

              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>

        <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/30 p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

          <p className="text-xs leading-5 text-muted-foreground">
            Authentication establishes
            identity only.
            Organization,
            environment, policy and
            permission controls remain
            authoritative for every
            AIRA operation.
          </p>
        </div>

        <div className="border-t border-border pt-5 text-center text-sm text-muted-foreground">
          Need an AIRA
          organization?{' '}

          <Link
            to="/signup"
            className="font-medium text-primary hover:underline"
          >
            Create one
          </Link>
        </div>
      </form>
    </AuthProductShell>
  )
}