import {
  authLifecycleApi,
  type AuthSessionSummary,
  type SecurityEventSummary,
} from '@/api/authLifecycleApi'

import {
  authApi,
} from '@/api/client'

import {
  Badge,
} from '@/components/ui/badge'

import {
  Button,
} from '@/components/ui/button'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

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
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Laptop,
  ListChecks,
  Loader2,
  LockKeyhole,
  LogOut,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react'

import {
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from 'react'

import {
  Link,
  useNavigate,
} from 'react-router-dom'

function formatDate(
  value:
    string | null,
) {
  if (!value) {
    return '—'
  }

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value
  }

  return date.toLocaleString()
}

function sessionIcon(
  value:
    string | null,
) {
  const normalized =
    value?.toLowerCase() ??
    ''

  if (
    normalized.includes(
      'mobile',
    ) ||
    normalized.includes(
      'android',
    ) ||
    normalized.includes(
      'iphone',
    )
  ) {
    return (
      <Smartphone className="h-4 w-4" />
    )
  }

  return (
    <Laptop className="h-4 w-4" />
  )
}

export default function AccountSecurityPage() {
  const navigate =
    useNavigate()

  const user =
    useAuthStore(
      (state) =>
        state.user,
    )

  const currentSession =
    useAuthStore(
      (state) =>
        state.session,
    )

  const setUnauthenticated =
    useAuthStore(
      (state) =>
        state.setUnauthenticated,
    )

  const [
    currentPassword,
    setCurrentPassword,
  ] =
    useState('')

  const [
    newPassword,
    setNewPassword,
  ] =
    useState('')

  const [
    confirmPassword,
    setConfirmPassword,
  ] =
    useState('')

  const [
    showPasswords,
    setShowPasswords,
  ] =
    useState(false)

  const [
    passwordLoading,
    setPasswordLoading,
  ] =
    useState(false)

  const [
    passwordError,
    setPasswordError,
  ] =
    useState<
      string | null
    >(null)

  const [
    passwordSuccess,
    setPasswordSuccess,
  ] =
    useState<
      string | null
    >(null)

  const [
    sessions,
    setSessions,
  ] =
    useState<
      AuthSessionSummary[]
    >([])

  const [
    sessionsLoading,
    setSessionsLoading,
  ] =
    useState(true)

  const [
    sessionsError,
    setSessionsError,
  ] =
    useState<
      string | null
    >(null)

  const [
    revokingSessionId,
    setRevokingSessionId,
  ] =
    useState<
      string | null
    >(null)

  const [
    securityEvents,
    setSecurityEvents,
  ] =
    useState<
      SecurityEventSummary[]
    >([])

  const [
    eventsLoading,
    setEventsLoading,
  ] =
    useState(true)

  const [
    eventsError,
    setEventsError,
  ] =
    useState<
      string | null
    >(null)

  const [
    logoutAllLoading,
    setLogoutAllLoading,
  ] =
    useState(false)

  const loadSessions =
    useCallback(
      async (
        signal?:
          AbortSignal,
      ) => {
        setSessionsLoading(
          true,
        )

        setSessionsError(
          null,
        )

        try {
          const response =
            await authLifecycleApi
              .listSessions(
                signal,
              )

          setSessions(
            response.sessions,
          )
        } catch (
          loadError
        ) {
          if (
            signal?.aborted
          ) {
            return
          }

          setSessionsError(
            loadError instanceof
              Error
              ? loadError.message
              : 'Unable to load sessions.',
          )
        } finally {
          if (
            !signal?.aborted
          ) {
            setSessionsLoading(
              false,
            )
          }
        }
      },
      [],
    )

  const loadSecurityEvents =
    useCallback(
      async (
        signal?:
          AbortSignal,
      ) => {
        setEventsLoading(
          true,
        )

        setEventsError(
          null,
        )

        try {
          const response =
            await authLifecycleApi
              .securityEvents(
                signal,
              )

          setSecurityEvents(
            response.events,
          )
        } catch (
          loadError
        ) {
          if (
            signal?.aborted
          ) {
            return
          }

          setEventsError(
            loadError instanceof
              Error
              ? loadError.message
              : 'Unable to load security history.',
          )
        } finally {
          if (
            !signal?.aborted
          ) {
            setEventsLoading(
              false,
            )
          }
        }
      },
      [],
    )

  useEffect(() => {
    const controller =
      new AbortController()

    void loadSessions(
      controller.signal,
    )

    void loadSecurityEvents(
      controller.signal,
    )

    return () =>
      controller.abort()
  }, [
    loadSessions,
    loadSecurityEvents,
  ])

  async function handlePasswordChange(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    setPasswordError(
      null,
    )

    setPasswordSuccess(
      null,
    )

    if (!currentPassword) {
      setPasswordError(
        'Enter your current password.',
      )

      return
    }

    if (
      newPassword.length <
      12
    ) {
      setPasswordError(
        'The new password must contain at least 12 characters.',
      )

      return
    }

    if (
      newPassword.length >
      1024
    ) {
      setPasswordError(
        'The new password is too long.',
      )

      return
    }

    if (
      newPassword !==
      confirmPassword
    ) {
      setPasswordError(
        'The new passwords do not match.',
      )

      return
    }

    if (
      currentPassword ===
      newPassword
    ) {
      setPasswordError(
        'Choose a new password that differs from the current password.',
      )

      return
    }

    setPasswordLoading(
      true,
    )

    try {
      const response =
        await authLifecycleApi
          .changePassword({
            currentPassword,

            newPassword,
          })

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')

      setPasswordSuccess(
        response.message ||
          'Password changed successfully.',
      )

      await loadSessions()
      await loadSecurityEvents()
    } catch (
      changeError
    ) {
      setPasswordError(
        changeError instanceof
          Error
          ? changeError.message
          : 'Unable to change the password.',
      )
    } finally {
      setPasswordLoading(
        false,
      )
    }
  }

  async function revokeSession(
    sessionId: string,
  ) {
    if (
      revokingSessionId
    ) {
      return
    }

    setRevokingSessionId(
      sessionId,
    )

    setSessionsError(
      null,
    )

    try {
      await authLifecycleApi
        .revokeSession(
          sessionId,
        )

      await loadSessions()
      await loadSecurityEvents()
    } catch (
      revokeError
    ) {
      setSessionsError(
        revokeError instanceof
          Error
          ? revokeError.message
          : 'Unable to revoke the session.',
      )
    } finally {
      setRevokingSessionId(
        null,
      )
    }
  }

  async function logoutAll() {
    if (
      logoutAllLoading
    ) {
      return
    }

    setLogoutAllLoading(
      true,
    )

    try {
      await authApi.logoutAll()
    } finally {
      setUnauthenticated()

      navigate(
        '/login',
        {
          replace: true,
        },
      )
    }
  }

  const emailVerified =
    Boolean(
      user?.emailVerifiedAt,
    )

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Account security
        </h1>

        <p className="mt-1 text-sm text-muted-foreground">
          Manage identity
          verification, password
          security and authenticated
          browser sessions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>
                Identity assurance
              </CardTitle>

              <CardDescription>
                Current account and
                session assurance
                information.
              </CardDescription>
            </div>

            <Badge
              variant={
                emailVerified
                  ? 'default'
                  : 'secondary'
              }
            >
              {emailVerified
                ? 'Email verified'
                : 'Verification pending'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Email
              </p>

              <p className="mt-2 break-all text-sm font-medium">
                {user?.email ??
                  '—'}
              </p>
            </div>

            <div className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Verification
              </p>

              <p className="mt-2 text-sm font-medium">
                {emailVerified
                  ? formatDate(
                      user
                        ?.emailVerifiedAt ??
                        null,
                    )
                  : 'Not verified'}
              </p>
            </div>

            <div className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Session assurance
              </p>

              <p className="mt-2 text-sm font-medium">
                {currentSession
                  ?.assuranceLevel ??
                  'Standard'}
              </p>
            </div>
          </div>

          {!emailVerified &&
          user?.email ? (
            <Button
              variant="outline"
              asChild
            >
              <Link
                to={`/email-verification-pending?email=${encodeURIComponent(
                  user.email,
                )}`}
              >
                <MailCheck className="mr-2 h-4 w-4" />

                Verify email
              </Link>
            </Button>
          ) : null}

          <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

            <p className="text-xs leading-5 text-muted-foreground">
              Authentication assurance
              never overrides AIRA
              organization,
              environment, permission,
              policy, approval, kill
              switch or recovery
              authorization controls.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Change password
          </CardTitle>

          <CardDescription>
            Changing credentials is
            an identity operation and
            does not grant additional
            product permissions.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            className="max-w-xl space-y-4"
            onSubmit={
              handlePasswordChange
            }
          >
            <div className="space-y-2">
              <Label htmlFor="current-password">
                Current password
              </Label>

              <Input
                id="current-password"
                type={
                  showPasswords
                    ? 'text'
                    : 'password'
                }
                autoComplete="current-password"
                value={
                  currentPassword
                }
                onChange={(
                  event,
                ) =>
                  setCurrentPassword(
                    event
                      .target
                      .value,
                  )
                }
                disabled={
                  passwordLoading
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">
                New password
              </Label>

              <Input
                id="new-password"
                type={
                  showPasswords
                    ? 'text'
                    : 'password'
                }
                autoComplete="new-password"
                minLength={12}
                maxLength={1024}
                value={
                  newPassword
                }
                onChange={(
                  event,
                ) =>
                  setNewPassword(
                    event
                      .target
                      .value,
                  )
                }
                disabled={
                  passwordLoading
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-new-password">
                Confirm new password
              </Label>

              <Input
                id="confirm-new-password"
                type={
                  showPasswords
                    ? 'text'
                    : 'password'
                }
                autoComplete="new-password"
                minLength={12}
                maxLength={1024}
                value={
                  confirmPassword
                }
                onChange={(
                  event,
                ) =>
                  setConfirmPassword(
                    event
                      .target
                      .value,
                  )
                }
                disabled={
                  passwordLoading
                }
              />
            </div>

            <button
              type="button"
              className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() =>
                setShowPasswords(
                  (current) =>
                    !current,
                )
              }
            >
              {showPasswords ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}

              {showPasswords
                ? 'Hide passwords'
                : 'Show passwords'}
            </button>

            {passwordError ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                {
                  passwordError
                }
              </div>
            ) : null}

            {passwordSuccess ? (
              <div className="flex gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />

                {
                  passwordSuccess
                }
              </div>
            ) : null}

            <Button
              type="submit"
              disabled={
                passwordLoading
              }
            >
              <KeyRound className="mr-2 h-4 w-4" />

              {passwordLoading
                ? 'Changing password…'
                : 'Change password'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>
                Active sessions
              </CardTitle>

              <CardDescription>
                Review and revoke
                authenticated browser
                sessions.
              </CardDescription>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void loadSessions()
              }
              disabled={
                sessionsLoading
              }
            >
              <RefreshCw className="mr-2 h-4 w-4" />

              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {sessionsLoading ? (
            <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />

              Loading sessions…
            </div>
          ) : null}

          {sessionsError ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {sessionsError}
            </div>
          ) : null}

          {!sessionsLoading &&
          sessions.length ===
            0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No session records
              were returned.
            </p>
          ) : null}

          {sessions.map(
            (session) => (
              <div
                key={
                  session.id
                }
                className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex min-w-0 gap-3">
                  <div className="mt-1 text-muted-foreground">
                    {sessionIcon(
                      session
                        .userAgentSummary,
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">
                        {session
                          .userAgentSummary ??
                          'Browser session'}
                      </p>

                      {session.current ? (
                        <Badge variant="secondary">
                          Current
                        </Badge>
                      ) : null}

                      <Badge variant="outline">
                        {session
                          .assuranceLevel ||
                          'standard'}
                      </Badge>
                    </div>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Last activity:{' '}
                      {formatDate(
                        session
                          .lastActivityAt,
                      )}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      IP:{' '}
                      {session
                        .ipAddressMasked ??
                        'Unavailable'}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Expires:{' '}
                      {formatDate(
                        session
                          .absoluteExpiresAt,
                      )}
                    </p>
                  </div>
                </div>

                {!session.current ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      revokingSessionId ===
                      session.id
                    }
                    onClick={() =>
                      void revokeSession(
                        session.id,
                      )
                    }
                  >
                    <Trash2 className="mr-2 h-4 w-4" />

                    {revokingSessionId ===
                    session.id
                      ? 'Revoking…'
                      : 'Revoke'}
                  </Button>
                ) : null}
              </div>
            ),
          )}

          <div className="border-t pt-4">
            <Button
              variant="destructive"
              onClick={() =>
                void logoutAll()
              }
              disabled={
                logoutAllLoading
              }
            >
              <LogOut className="mr-2 h-4 w-4" />

              {logoutAllLoading
                ? 'Signing out…'
                : 'Sign out all sessions'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" />

            <div>
              <CardTitle>
                Security history
              </CardTitle>

              <CardDescription>
                Recent identity and
                authentication events
                associated with this
                account.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {eventsLoading ? (
            <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />

              Loading security
              history…
            </div>
          ) : null}

          {eventsError ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {eventsError}
            </div>
          ) : null}

          {!eventsLoading &&
          securityEvents.length ===
            0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No security events
              were returned.
            </p>
          ) : null}

          {securityEvents.map(
            (event) => (
              <div
                key={
                  event.id
                }
                className="flex items-start gap-3 rounded-lg border p-3"
              >
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {
                        event.type
                      }
                    </p>

                    <span className="text-xs text-muted-foreground">
                      {formatDate(
                        event
                          .occurredAt,
                      )}
                    </span>
                  </div>

                  {event.description ? (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {
                        event.description
                      }
                    </p>
                  ) : null}

                  {event.ipAddressMasked ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {
                        event.ipAddressMasked
                      }
                    </p>
                  ) : null}
                </div>
              </div>
            ),
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />

        <div>
          <p className="text-sm font-medium">
            Authentication boundary
          </p>

          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Account security changes
            never create recovery
            authority. Capability,
            certification,
            authorization, tenant
            policy and environment
            policy remain separate
            AIRA control layers.
          </p>
        </div>
      </div>
    </div>
  )
}