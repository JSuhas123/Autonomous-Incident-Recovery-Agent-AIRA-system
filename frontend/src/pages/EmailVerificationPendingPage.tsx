import {
  authLifecycleApi,
  AuthLifecycleApiError,
} from '@/api/authLifecycleApi'

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

import {
  CheckCircle2,
  MailCheck,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'

import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  Link,
  useSearchParams,
} from 'react-router-dom'

const RESEND_COOLDOWN_SECONDS =
  60

export default function EmailVerificationPendingPage() {
  const [searchParams] =
    useSearchParams()

  const authenticatedEmail =
    useAuthStore(
      (state) =>
        state.user?.email ??
        '',
    )

  const initialEmail =
    useMemo(
      () =>
        searchParams
          .get('email')
          ?.trim()
          .toLowerCase() ??
        authenticatedEmail,
      [
        searchParams,
        authenticatedEmail,
      ],
    )

  const [email, setEmail] =
    useState(
      initialEmail,
    )

  const [loading, setLoading] =
    useState(false)

  const [sent, setSent] =
    useState(false)

  const [
    cooldown,
    setCooldown,
  ] =
    useState(0)

  const [error, setError] =
    useState<
      string | null
    >(null)

  const [
    developmentVerificationUrl,
    setDevelopmentVerificationUrl,
  ] =
    useState<
      string | null
    >(null)

  useEffect(() => {
    if (
      cooldown <= 0
    ) {
      return
    }

    const timer =
      window.setInterval(
        () => {
          setCooldown(
            (current) =>
              Math.max(
                0,
                current - 1,
              ),
          )
        },
        1000,
      )

    return () =>
      window.clearInterval(
        timer,
      )
  }, [cooldown])

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (
      loading ||
      cooldown > 0
    ) {
      return
    }

    const normalizedEmail =
      email
        .trim()
        .toLowerCase()

    if (
      !normalizedEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        normalizedEmail,
      )
    ) {
      setError(
        'Enter a valid email address.',
      )

      return
    }

    setLoading(true)
    setError(null)

    try {
      const response =
        await authLifecycleApi
          .resendEmailVerification(
            normalizedEmail,
          )

      setSent(true)

      setCooldown(
        RESEND_COOLDOWN_SECONDS,
      )

      setDevelopmentVerificationUrl(
        response
          .developmentVerificationUrl ??
          null,
      )
    } catch (requestError) {
      if (
        requestError instanceof
          AuthLifecycleApiError &&
        requestError.status ===
          429
      ) {
        /*
         * Do not expose backend
         * throttling internals.
         */
        setError(
          'Please wait before requesting another verification message.',
        )

        setCooldown(
          RESEND_COOLDOWN_SECONDS,
        )
      } else {
        setError(
          requestError instanceof
            Error
            ? requestError.message
            : 'Unable to process the verification request.',
        )
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthProductShell
      eyebrow="Identity Verification"
      title="Verify your email"
      description="AIRA uses verified identity as one input to account assurance. Email verification never grants infrastructure execution authority."
    >
      <div className="space-y-6">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />

          <div>
            <p className="text-sm font-medium">
              Verification required
            </p>

            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Use the one-time link
              sent to your email
              address to verify
              ownership of the
              account.
            </p>
          </div>
        </div>

        <form
          className="space-y-5"
          onSubmit={
            handleSubmit
          }
        >
          <div className="space-y-2">
            <Label htmlFor="verification-email">
              Work email
            </Label>

            <Input
              id="verification-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(
                event,
              ) => {
                setEmail(
                  event
                    .target
                    .value,
                )

                if (error) {
                  setError(null)
                }
              }}
              disabled={
                loading
              }
              required
            />
          </div>

          {sent ? (
            <div className="flex gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />

              <p className="text-sm leading-6">
                If the account is
                eligible for
                verification,
                instructions have
                been prepared.
              </p>
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}

          {developmentVerificationUrl ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="text-sm font-medium">
                Development
                verification link
              </p>

              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                This link must never
                be returned by the
                production backend.
              </p>

              <a
                href={
                  developmentVerificationUrl
                }
                className="mt-3 block break-all text-xs font-medium text-primary underline underline-offset-4"
              >
                {
                  developmentVerificationUrl
                }
              </a>
            </div>
          ) : null}

          <Button
            type="submit"
            className="w-full"
            disabled={
              loading ||
              cooldown > 0
            }
          >
            <RefreshCw className="mr-2 h-4 w-4" />

            {loading
              ? 'Preparing verification…'
              : cooldown > 0
                ? `Resend available in ${cooldown}s`
                : 'Resend verification'}
          </Button>
        </form>

        <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/30 p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

          <p className="text-xs leading-5 text-muted-foreground">
            Verification proves
            control of an email
            address. Organization,
            membership, environment,
            policy and recovery
            authorization remain
            independently enforced.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            asChild
          >
            <Link to="/login">
              Sign in
            </Link>
          </Button>

          <Button asChild>
            <Link to="/dashboard">
              Open AIRA
            </Link>
          </Button>
        </div>
      </div>
    </AuthProductShell>
  )
}