import { passwordResetApi } from '@/api/passwordResetApi'
import { AuthProductShell } from '@/components/auth/AuthProductShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react'
import {
  type FormEvent,
  useMemo,
  useState,
} from 'react'
import {
  Link,
  useSearchParams,
} from 'react-router-dom'

export default function ResetPasswordPage() {
  const [searchParams] =
    useSearchParams()

  const token = useMemo(
    () =>
      searchParams
        .get('token')
        ?.trim() ?? '',
    [searchParams],
  )

  const [password, setPassword] =
    useState('')

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState('')

  const [
    showPassword,
    setShowPassword,
  ] = useState(false)

  const [loading, setLoading] =
    useState(false)

  const [complete, setComplete] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    setError(null)

    if (!token) {
      setError(
        'This password reset link is missing its token. Request a new reset link.',
      )

      return
    }

    if (password.length < 12) {
      setError(
        'Password must contain at least 12 characters.',
      )

      return
    }

    if (password.length > 1024) {
      setError(
        'Password is too long.',
      )

      return
    }

    if (
      password !==
      confirmPassword
    ) {
      setError(
        'The passwords do not match.',
      )

      return
    }

    setLoading(true)

    try {
      await passwordResetApi.resetPassword(
        token,
        password,
      )

      setPassword('')
      setConfirmPassword('')
      setComplete(true)
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : 'Unable to reset the password.',
      )
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <AuthProductShell
        title="Invalid reset link"
        description="Request a new password reset link to continue."
      >
        <div className="space-y-5">
          <p className="text-sm leading-6 text-muted-foreground">
            This password reset URL is
            incomplete because it does
            not contain a reset token.
          </p>

          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            Request a new password reset
            before continuing.
          </div>

          <Button
            className="w-full"
            asChild
          >
            <Link to="/forgot-password">
              Request new reset link
            </Link>
          </Button>

          <Button
            className="w-full"
            variant="outline"
            asChild
          >
            <Link to="/login">
              Return to sign in
            </Link>
          </Button>
        </div>
      </AuthProductShell>
    )
  }

  return (
    <AuthProductShell
      title={
        complete
          ? 'Password changed'
          : 'Set a new password'
      }
      description={
        complete
          ? 'Your password has been updated successfully.'
          : 'Create a new password for your AIRA account.'
      }
    >
      {complete ? (
        <div className="space-y-5">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />

              <div>
                <p className="text-sm font-medium">
                  Password reset
                  complete
                </p>

                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Your password has
                  changed successfully.
                  Existing browser
                  sessions have been
                  revoked. Sign in again
                  using the new
                  password.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

            <p className="text-xs leading-5 text-muted-foreground">
              Password reset does not
              authenticate this browser.
              A new authenticated
              session must be
              established explicitly.
            </p>
          </div>

          <Button
            className="w-full"
            asChild
          >
            <Link to="/login">
              Continue to sign in
            </Link>
          </Button>
        </div>
      ) : (
        <form
          className="space-y-5"
          onSubmit={
            handleSubmit
          }
        >
          <p className="text-sm leading-6 text-muted-foreground">
            Choose a new password for
            your AIRA account. A
            successful reset revokes
            existing browser sessions.
          </p>

          <div className="space-y-2">
            <Label htmlFor="password">
              New password
            </Label>

            <div className="relative">
              <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                id="password"
                type={
                  showPassword
                    ? 'text'
                    : 'password'
                }
                autoComplete="new-password"
                className="pl-9 pr-10"
                value={password}
                onChange={(
                  event,
                ) => {
                  setPassword(
                    event.target
                      .value,
                  )

                  if (error) {
                    setError(null)
                  }
                }}
                disabled={loading}
                minLength={12}
                maxLength={1024}
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
                disabled={loading}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Minimum 12 characters.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">
              Confirm new password
            </Label>

            <Input
              id="confirmPassword"
              type={
                showPassword
                  ? 'text'
                  : 'password'
              }
              autoComplete="new-password"
              value={
                confirmPassword
              }
              onChange={(
                event,
              ) => {
                setConfirmPassword(
                  event.target
                    .value,
                )

                if (error) {
                  setError(null)
                }
              }}
              disabled={loading}
              minLength={12}
              maxLength={1024}
              required
            />
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
              ? 'Changing password…'
              : 'Change password'}
          </Button>

          <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

            <p className="text-xs leading-5 text-muted-foreground">
              Reset tokens are
              single-use credentials.
              Changing the password does
              not log you in
              automatically.
            </p>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Need another
            link?{' '}
            <Link
              className="font-medium text-primary hover:underline"
              to="/forgot-password"
            >
              Request another reset
            </Link>
          </p>
        </form>
      )}
    </AuthProductShell>
  )
}