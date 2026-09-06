import {
  authApi,
} from '@/api/client'

import {
  AuthProductShell,
} from '@/components/auth/AuthProductShell'

import {
  Button,
} from '@/components/ui/button'

import {
  Input,
} from '@/components/ui/input'

import {
  Label,
} from '@/components/ui/label'

import {
  toast,
} from '@/hooks/useToast'

import {
  useAuthStore,
} from '@/store/authStore'

import type {
  SafeMembership,
  SafeOrganization,
  SafeUser,
} from '@/types'

import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react'

import {
  useState,
} from 'react'

import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from 'react-router-dom'


interface LoginForm {
  email: string

  password: string

  rememberMe: boolean
}


type LoginErrors =
  Partial<
    Record<
      'email' |
      'password',
      string
    >
  >


export default function LoginPage() {
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

  const navigate =
    useNavigate()

  const location =
    useLocation()

  const locationState =
    location.state as
      | {
          from?: {
            pathname?: string
          }
        }
      | null

  const from =
    locationState
      ?.from
      ?.pathname ||
    '/dashboard'

  const [
    form,
    setForm,
  ] =
    useState<LoginForm>({
      email: '',

      password: '',

      rememberMe: false,
    })

  const [
    showPassword,
    setShowPassword,
  ] =
    useState(false)

  const [
    loading,
    setLoading,
  ] =
    useState(false)

  const [
    errors,
    setErrors,
  ] =
    useState<LoginErrors>(
      {},
    )

  const [
    globalError,
    setGlobalError,
  ] =
    useState<
      string | null
    >(null)


  if (
    status ===
    'authenticated'
  ) {
    return (
      <Navigate
        to={from}
        replace
      />
    )
  }


  function validate():
    LoginErrors {
    const next:
      LoginErrors = {}

    const email =
      form.email.trim()

    if (!email) {
      next.email =
        'Work email is required.'
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(email)
    ) {
      next.email =
        'Enter a valid email address.'
    }

    if (
      !form.password
    ) {
      next.password =
        'Password is required.'
    }

    return next
  }


  async function handleSubmit(
    event:
      React.FormEvent,
  ) {
    event.preventDefault()

    const nextErrors =
      validate()

    if (
      Object.keys(
        nextErrors,
      ).length
    ) {
      setErrors(
        nextErrors,
      )

      return
    }

    setErrors({})
    setGlobalError(null)
    setLoading(true)

    try {
      const data =
        await authApi.login({
          email:
            form
              .email
              .trim(),

          password:
            form.password,

          rememberMe:
            form.rememberMe,
        })

      setAuthenticated({
        user:
          data.user as
            SafeUser,

        organization:
          data.organization as
            SafeOrganization |
            null,

        membership:
          data.membership as
            SafeMembership |
            null,

        session:
          null,

        csrfToken:
          data.csrfToken,
      })

      navigate(
        from,
        {
          replace: true,
        },
      )
    } catch (
      error: any
    ) {
      if (
        error?.status ===
        401
      ) {
        setGlobalError(
          'The email or password is incorrect.',
        )
      } else if (
        error?.status ===
        403
      ) {
        setGlobalError(
          error?.message ||
            'This account cannot currently access the organization.',
        )
      } else {
        toast.error(
          'Login failed',
          error?.message,
        )

        setGlobalError(
          'AIRA could not complete the secure sign-in request.',
        )
      }
    } finally {
      setLoading(false)
    }
  }


  return (
    <AuthProductShell
      eyebrow="Secure platform access"
      title="Return to reliability operations."
      description="Sign in to your organization-scoped AIRA control plane. Your role, permissions and active environment are resolved again by the backend before protected operations are exposed."
    >
      <form
        onSubmit={
          handleSubmit
        }
        className="space-y-5"
        noValidate
      >
        {globalError && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/[0.08] px-4 py-3 text-sm leading-5 text-destructive"
          >
            {
              globalError
            }
          </div>
        )}

        <div className="space-y-2">
          <Label
            htmlFor="email"
          >
            Work email
          </Label>

          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              id="email"
              type="email"
              value={
                form.email
              }
              onChange={
                (event) => {
                  setForm(
                    (
                      current,
                    ) => ({
                      ...current,

                      email:
                        event
                          .target
                          .value,
                    }),
                  )

                  if (
                    errors.email
                  ) {
                    setErrors(
                      (
                        current,
                      ) => ({
                        ...current,

                        email:
                          undefined,
                      }),
                    )
                  }
                }
              }
              placeholder="you@company.com"
              autoComplete="email"
              autoFocus
              aria-invalid={
                Boolean(
                  errors.email,
                )
              }
              aria-describedby={
                errors.email
                  ? 'login-email-error'
                  : undefined
              }
              className={[
                'h-11 pl-10',
                'bg-background/60',
                errors.email
                  ? 'border-destructive'
                  : '',
              ].join(' ')}
            />
          </div>

          {errors.email && (
            <p
              id="login-email-error"
              className="text-xs text-destructive"
            >
              {
                errors.email
              }
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="password"
            >
              Password
            </Label>

            <span className="text-[11px] text-muted-foreground">
              Organization credentials
            </span>
          </div>

          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              id="password"
              type={
                showPassword
                  ? 'text'
                  : 'password'
              }
              value={
                form.password
              }
              onChange={
                (event) => {
                  setForm(
                    (
                      current,
                    ) => ({
                      ...current,

                      password:
                        event
                          .target
                          .value,
                    }),
                  )

                  if (
                    errors.password
                  ) {
                    setErrors(
                      (
                        current,
                      ) => ({
                        ...current,

                        password:
                          undefined,
                      }),
                    )
                  }
                }
              }
              placeholder="Your password"
              autoComplete="current-password"
              aria-invalid={
                Boolean(
                  errors.password,
                )
              }
              aria-describedby={
                errors.password
                  ? 'login-password-error'
                  : undefined
              }
              className={[
                'h-11 pl-10 pr-11',
                'bg-background/60',
                errors.password
                  ? 'border-destructive'
                  : '',
              ].join(' ')}
            />

            <button
              type="button"
              onClick={() =>
                setShowPassword(
                  (current) =>
                    !current,
                )
              }
              className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label={
                showPassword
                  ? 'Hide password'
                  : 'Show password'
              }
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>

          {errors.password && (
            <p
              id="login-password-error"
              className="text-xs text-destructive"
            >
              {
                errors.password
              }
            </p>
          )}
        </div>

        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border/70 bg-card/40 px-4 py-3 transition-colors hover:bg-secondary/40">
          <div className="flex items-center gap-3">
            <input
              id="rememberMe"
              type="checkbox"
              checked={
                form.rememberMe
              }
              onChange={
                (event) =>
                  setForm(
                    (
                      current,
                    ) => ({
                      ...current,

                      rememberMe:
                        event
                          .target
                          .checked,
                    }),
                  )
              }
              className="h-4 w-4 accent-primary"
            />

            <div>
              <span className="block text-sm font-medium">
                Keep me signed in
              </span>

              <span className="block text-[11px] text-muted-foreground">
                Use only on a trusted device.
              </span>
            </div>
          </div>

          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        </label>

        <Button
          type="submit"
          disabled={
            loading
          }
          className="h-11 w-full font-medium shadow-[0_0_28px_hsl(var(--primary)/0.14)]"
        >
          {loading
            ? 'Establishing secure session…'
            : 'Enter AIRA'}
        </Button>

        <div className="rounded-xl border border-border/70 bg-secondary/20 px-4 py-3">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />

            <p className="text-xs leading-5 text-muted-foreground">
              Signing in identifies you. Your organization membership,
              environment access and operational permissions are evaluated
              independently before protected functionality is exposed.
            </p>
          </div>
        </div>

        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>

          <div className="relative flex justify-center">
            <span className="bg-background px-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              New organization
            </span>
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Need an AIRA workspace?
          {' '}

          <Link
            to="/signup"
            className="font-medium text-primary transition-colors hover:text-primary/80"
          >
            Create organization
          </Link>
        </p>
      </form>
    </AuthProductShell>
  )
}