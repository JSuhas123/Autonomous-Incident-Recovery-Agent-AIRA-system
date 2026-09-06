import { passwordResetApi } from '@/api/passwordResetApi'
import { AuthProductShell } from '@/components/auth/AuthProductShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  CheckCircle2,
  KeyRound,
  Mail,
  ShieldCheck,
} from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'

export default function ForgotPasswordPage() {
  const [email, setEmail] =
    useState('')

  const [loading, setLoading] =
    useState(false)

  const [submitted, setSubmitted] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const [
    developmentResetUrl,
    setDevelopmentResetUrl,
  ] = useState<string | null>(null)

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

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
        await passwordResetApi.requestReset(
          normalizedEmail,
        )

      setSubmitted(true)

      setDevelopmentResetUrl(
        response.developmentResetUrl ??
          null,
      )
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to process the password reset request.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthProductShell
      title="Recover your AIRA account"
      description="Request a secure password reset for your AIRA account."
    >
      <div className="space-y-6">
        <p className="text-sm leading-6 text-muted-foreground">
          Request a one-time password
          reset. AIRA does not reveal
          whether an account exists for
          the submitted address.
        </p>

        {submitted ? (
          <>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />

                <div>
                  <p className="text-sm font-medium">
                    Request accepted
                  </p>

                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    If an eligible AIRA
                    account exists for
                    that email address,
                    password reset
                    instructions have
                    been prepared.
                  </p>
                </div>
              </div>
            </div>

            {developmentResetUrl ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="flex gap-3">
                  <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />

                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      Development reset
                      link
                    </p>

                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      AIRA is exposing
                      this reset URL only
                      for local
                      development. A
                      production system
                      must deliver the
                      reset link through
                      the configured
                      account-recovery
                      channel instead.
                    </p>

                    <a
                      href={
                        developmentResetUrl
                      }
                      className="mt-3 block break-all text-xs font-medium text-primary underline underline-offset-4"
                    >
                      {
                        developmentResetUrl
                      }
                    </a>
                  </div>
                </div>
              </div>
            ) : null}

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setSubmitted(false)
                setDevelopmentResetUrl(
                  null,
                )
                setError(null)
              }}
            >
              Request another reset
            </Button>

            <Button
              className="w-full"
              asChild
            >
              <Link to="/login">
                Return to sign in
              </Link>
            </Button>
          </>
        ) : (
          <form
            className="space-y-5"
            onSubmit={
              handleSubmit
            }
          >
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
                  className="pl-9"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(
                    event,
                  ) => {
                    setEmail(
                      event.target
                        .value,
                    )

                    if (error) {
                      setError(null)
                    }
                  }}
                  disabled={loading}
                  required
                />
              </div>
            </div>

            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </div>
            ) : null}

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading
                ? 'Preparing reset…'
                : 'Continue'}
            </Button>

            <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 p-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

              <p className="text-xs leading-5 text-muted-foreground">
                Password recovery does
                not authenticate this
                browser and never grants
                operational or execution
                authority.
              </p>
            </div>

            <p className="text-center text-sm text-muted-foreground">
              Remembered your
              password?{' '}
              <Link
                className="font-medium text-primary hover:underline"
                to="/login"
              >
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </AuthProductShell>
  )
}