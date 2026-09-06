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
  useAuthStore,
} from '@/store/authStore'

import type {
  SafeMembership,
  SafeOrganization,
  SafeUser,
} from '@/types'

import {
  Building2,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  UserRound,
} from 'lucide-react'

import {
  useState,
} from 'react'

import {
  Link,
  Navigate,
  useNavigate,
} from 'react-router-dom'


interface FormState {
  fullName: string

  email: string

  password: string

  organizationName: string

  terms: boolean
}


type ErrorState =
  Partial<
    Record<
      keyof FormState,
      string
    >
  >


const INITIAL_FORM:
  FormState = {
    fullName: '',

    email: '',

    password: '',

    organizationName: '',

    terms: false,
  }


const PASSWORD_REQUIREMENTS = [
  'At least 12 characters',
  'Use a unique organization password',
  'Stored using the AIRA password security layer',
]


export default function SignupPage() {
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

  const [
    form,
    setForm,
  ] =
    useState<FormState>(
      INITIAL_FORM,
    )

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
    useState<ErrorState>(
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
        to="/dashboard"
        replace
      />
    )
  }


  function validate():
    ErrorState {
    const next:
      ErrorState = {}

    const fullName =
      form.fullName.trim()

    const email =
      form.email.trim()

    const organizationName =
      form
        .organizationName
        .trim()

    if (!fullName) {
      next.fullName =
        'Full name is required.'
    } else if (
      fullName.length >
      100
    ) {
      next.fullName =
        'Full name must be 100 characters or fewer.'
    }

    if (!email) {
      next.email =
        'Work email is required.'
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(email)
    ) {
      next.email =
        'Enter a valid work email address.'
    }

    if (!form.password) {
      next.password =
        'Password is required.'
    } else if (
      form.password.length <
      12
    ) {
      next.password =
        'Password must contain at least 12 characters.'
    } else if (
      form.password.length >
      1024
    ) {
      next.password =
        'Password is too long.'
    }

    if (!organizationName) {
      next.organizationName =
        'Organization name is required.'
    } else if (
      organizationName.length >
      100
    ) {
      next.organizationName =
        'Organization name must be 100 characters or fewer.'
    }

    if (!form.terms) {
      next.terms =
        'Accept the terms to create the organization.'
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
        await authApi.register({
          fullName:
            form
              .fullName
              .trim(),

          email:
            form
              .email
              .trim(),

          password:
            form.password,

          organizationName:
            form
              .organizationName
              .trim(),
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

      /*
       * Phase 25.2A:
       *
       * The canonical organization bootstrap has completed.
       *
       * 25.2B / 25.4 will replace this with the authoritative
       * ProductContext landing destination after server
       * product-context resolution is connected.
       */
      navigate(
        '/dashboard',
        {
          replace: true,
        },
      )
    } catch (
      error: any
    ) {
      if (
        error?.status ===
        409
      ) {
        setErrors({
          email:
            'An account with this email already exists.',
        })
      } else if (
        error?.status ===
          400 &&
        error?.details
      ) {
        const response =
          error.details as {
            details?: Array<{
              field: string
              message: string
            }>
          }

        const fieldErrors:
          ErrorState = {}

        for (
          const detail
          of
          response.details ??
          []
        ) {
          if (
            detail.field in
            INITIAL_FORM
          ) {
            fieldErrors[
              detail.field as
                keyof FormState
            ] =
              detail.message
          }
        }

        setErrors(
          fieldErrors,
        )
      } else {
        setGlobalError(
          error?.message ||
            'Registration failed. Please try again.',
        )
      }
    } finally {
      setLoading(false)
    }
  }


  function updateText(
    key:
      | 'fullName'
      | 'email'
      | 'password'
      | 'organizationName',
  ) {
    return (
      event:
        React.ChangeEvent<HTMLInputElement>,
    ) => {
      const value =
        event.target.value

      setForm(
        (current) => ({
          ...current,

          [key]:
            value,
        }),
      )

      if (
        errors[key]
      ) {
        setErrors(
          (current) => ({
            ...current,

            [key]:
              undefined,
          }),
        )
      }
    }
  }


  return (
    <AuthProductShell
      eyebrow="Create your AIRA workspace"
      title="Start in controlled observation."
      description="Create the organization control plane first. AIRA begins with bounded defaults and a development environment before infrastructure recovery is ever considered."
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
            className="rounded-xl border border-destructive/30 bg-destructive/[0.08] px-4 py-3 text-sm text-destructive"
          >
            {globalError}
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label
              htmlFor="fullName"
            >
              Full name
            </Label>

            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                id="fullName"
                type="text"
                value={
                  form.fullName
                }
                onChange={
                  updateText(
                    'fullName',
                  )
                }
                placeholder="Jane Smith"
                autoComplete="name"
                aria-invalid={
                  Boolean(
                    errors.fullName,
                  )
                }
                aria-describedby={
                  errors.fullName
                    ? 'fullName-error'
                    : undefined
                }
                className={[
                  'h-11 pl-10',
                  'bg-background/60',
                  errors.fullName
                    ? 'border-destructive'
                    : '',
                ].join(' ')}
              />
            </div>

            {errors.fullName && (
              <p
                id="fullName-error"
                className="text-xs text-destructive"
              >
                {
                  errors.fullName
                }
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="organizationName"
            >
              Organization
            </Label>

            <div className="relative">
              <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                id="organizationName"
                type="text"
                value={
                  form.organizationName
                }
                onChange={
                  updateText(
                    'organizationName',
                  )
                }
                placeholder="Acme Technologies"
                autoComplete="organization"
                aria-invalid={
                  Boolean(
                    errors
                      .organizationName,
                  )
                }
                aria-describedby={
                  errors
                    .organizationName
                    ? 'organization-error'
                    : undefined
                }
                className={[
                  'h-11 pl-10',
                  'bg-background/60',
                  errors
                    .organizationName
                    ? 'border-destructive'
                    : '',
                ].join(' ')}
              />
            </div>

            {errors
              .organizationName && (
              <p
                id="organization-error"
                className="text-xs text-destructive"
              >
                {
                  errors
                    .organizationName
                }
              </p>
            )}
          </div>
        </div>

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
                updateText(
                  'email',
                )
              }
              placeholder="you@company.com"
              autoComplete="email"
              aria-invalid={
                Boolean(
                  errors.email,
                )
              }
              aria-describedby={
                errors.email
                  ? 'email-error'
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
              id="email-error"
              className="text-xs text-destructive"
            >
              {errors.email}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="password"
          >
            Password
          </Label>

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
                updateText(
                  'password',
                )
              }
              placeholder="At least 12 characters"
              autoComplete="new-password"
              aria-invalid={
                Boolean(
                  errors.password,
                )
              }
              aria-describedby={
                errors.password
                  ? 'password-error'
                  : 'password-help'
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

          {errors.password ? (
            <p
              id="password-error"
              className="text-xs text-destructive"
            >
              {
                errors.password
              }
            </p>
          ) : (
            <div
              id="password-help"
              className="grid gap-1 pt-1 sm:grid-cols-3"
            >
              {PASSWORD_REQUIREMENTS.map(
                (
                  requirement,
                ) => (
                  <span
                    key={
                      requirement
                    }
                    className="flex items-start gap-1.5 text-[10px] leading-4 text-muted-foreground"
                  >
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />

                    {
                      requirement
                    }
                  </span>
                ),
              )}
            </div>
          )}
        </div>

        <div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-card/40 p-3.5 transition-colors hover:bg-secondary/40">
            <input
              id="terms"
              type="checkbox"
              checked={
                form.terms
              }
              onChange={
                (event) => {
                  setForm(
                    (
                      current,
                    ) => ({
                      ...current,

                      terms:
                        event
                          .target
                          .checked,
                    }),
                  )

                  if (
                    errors.terms
                  ) {
                    setErrors(
                      (
                        current,
                      ) => ({
                        ...current,

                        terms:
                          undefined,
                      }),
                    )
                  }
                }
              }
              className="mt-0.5 h-4 w-4 accent-primary"
            />

            <span>
              <span className="block text-sm font-medium text-foreground">
                Create an organization workspace
              </span>

              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                I agree to the terms of service and privacy policy.
                The first account becomes the organization owner.
              </span>
            </span>
          </label>

          {errors.terms && (
            <p className="mt-1.5 text-xs text-destructive">
              {errors.terms}
            </p>
          )}
        </div>

        <Button
          type="submit"
          disabled={
            loading
          }
          className="h-11 w-full font-medium shadow-[0_0_28px_hsl(var(--primary)/0.14)]"
        >
          {loading
            ? 'Creating secure workspace…'
            : 'Create organization'}
        </Button>

        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>

          <div className="relative flex justify-center">
            <span className="bg-background px-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Existing organization
            </span>
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Already have access?
          {' '}

          <Link
            to="/login"
            className="font-medium text-primary transition-colors hover:text-primary/80"
          >
            Sign in to AIRA
          </Link>
        </p>
      </form>
    </AuthProductShell>
  )
}