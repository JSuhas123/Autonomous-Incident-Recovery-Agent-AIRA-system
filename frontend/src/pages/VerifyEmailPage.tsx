import {
  authApi,
} from '@/api/client'

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
  useAuthStore,
} from '@/store/authStore'

import type {
  SafeMembership,
  SafeOrganization,
  SafeSession,
  SafeUser,
} from '@/types'

import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  MailCheck,
  ShieldCheck,
} from 'lucide-react'

import {
  useMemo,
  useState,
} from 'react'

import {
  Link,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'


type VerificationState =
  | 'ready'
  | 'verifying'
  | 'verified'
  | 'failed'


export default function VerifyEmailPage() {
  const [
    searchParams,
  ] =
    useSearchParams()


  const navigate =
    useNavigate()


  const authStatus =
    useAuthStore(
      (
        state,
      ) =>
        state.status,
    )


  const setAuthenticated =
    useAuthStore(
      (
        state,
      ) =>
        state
          .setAuthenticated,
    )


  const token =
    useMemo(
      () =>
        searchParams
          .get(
            'token',
          )
          ?.trim() ??
        '',

      [
        searchParams,
      ],
    )


  const [
    verificationState,
    setVerificationState,
  ] =
    useState<VerificationState>(
      token
        ? 'ready'
        : 'failed',
    )


  const [
    message,
    setMessage,
  ] =
    useState(
      token
        ? ''
        : 'This verification link is missing its token.',
    )


  async function refreshSessionAfterVerification() {
    try {
      const data =
        await authApi
          .session()


      if (
        !data
          .authenticated
      ) {
        return false
      }


      setAuthenticated({
        user:
          data
            .user as
            SafeUser,

        organization:
          data
            .organization as
            SafeOrganization |
            null,

        membership:
          data
            .membership as
            SafeMembership |
            null,

        session:
          data
            .session as
            SafeSession |
            null,

        csrfToken:
          data
            .csrfToken,

        environment:
          data
            .environment ??
          null,
      })


      return true
    } catch {
      return false
    }
  }


  async function verify() {
    if (
      !token ||
      verificationState ===
        'verifying' ||
      verificationState ===
        'verified'
    ) {
      return
    }


    setVerificationState(
      'verifying',
    )

    setMessage(
      '',
    )


    try {
      const response =
        await authLifecycleApi
          .verifyEmail(
            token,
          )


      if (
        !response
          .verified
      ) {
        setVerificationState(
          'failed',
        )

        setMessage(
          response
            .message ||
            'Email verification could not be completed.',
        )

        return
      }


      const restored =
        await refreshSessionAfterVerification()


      setVerificationState(
        'verified',
      )


      setMessage(
        response
          .message ||
        'Your email address has been verified.',
      )


      /*
       * Existing signup browser session:
       *
       * verify -> refresh canonical session -> workspace.
       */

      if (
        restored
      ) {
        window.setTimeout(
          () => {
            navigate(
              '/dashboard',
              {
                replace:
                  true,
              },
            )
          },
          700,
        )
      }
    } catch (
      verificationError
    ) {
      setVerificationState(
        'failed',
      )


      if (
        verificationError instanceof
          AuthLifecycleApiError &&
        (
          verificationError.status ===
            400 ||
          verificationError.status ===
            404 ||
          verificationError.status ===
            410
        )
      ) {
        setMessage(
          'This verification link is invalid, expired, revoked or already used.',
        )
      } else if (
        verificationError instanceof
          AuthLifecycleApiError &&
        verificationError.status ===
          429
      ) {
        setMessage(
          'Verification requests are temporarily limited. Try again later.',
        )
      } else {
        setMessage(
          verificationError instanceof
            Error
            ? verificationError.message
            : 'Unable to verify the email address.',
        )
      }
    }
  }


  return (
    <AuthProductShell
      eyebrow="Identity Verification"
      title={
        verificationState ===
          'verified'
          ? 'Email verified'
          : 'Confirm your email'
      }
      description="Verification confirms control of the account email. It never grants recovery or infrastructure execution authority."
    >
      <div className="space-y-6">
        {verificationState ===
          'verified' && (
          <div className="flex gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />

            <div>
              <p className="text-sm font-medium">
                Verification complete
              </p>

              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {
                  message
                }
              </p>
            </div>
          </div>
        )}


        {verificationState ===
          'ready' && (
          <div className="flex gap-3 rounded-xl border border-border bg-muted/30 p-4">
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />

            <div>
              <p className="text-sm font-medium">
                One-time verification
              </p>

              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Verify ownership of the email address associated with this token before entering the AIRA workspace.
              </p>
            </div>
          </div>
        )}


        {verificationState ===
          'failed' && (
          <div
            role="alert"
            className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />

            <div>
              <p className="text-sm font-medium text-destructive">
                Verification unavailable
              </p>

              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {
                  message
                }
              </p>
            </div>
          </div>
        )}


        {verificationState ===
          'ready' && (
          <Button
            type="button"
            className="w-full"
            onClick={
              () =>
                void verify()
            }
          >
            Verify email
          </Button>
        )}


        {verificationState ===
          'verifying' && (
          <Button
            type="button"
            className="w-full"
            disabled
          >
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />

            Verifying…
          </Button>
        )}


        {verificationState ===
          'failed' && (
          <Button
            className="w-full"
            asChild
          >
            <Link to="/email-verification-pending">
              Request another verification
            </Link>
          </Button>
        )}


        {verificationState ===
          'verified' && (
          <Button
            className="w-full"
            asChild
          >
            <Link
              to={
                authStatus ===
                  'authenticated'
                  ? '/dashboard'
                  : '/login'
              }
            >
              {authStatus ===
                'authenticated'
                ? 'Continue to AIRA'
                : 'Continue to sign in'}
            </Link>
          </Button>
        )}


        <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/30 p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

          <p className="text-xs leading-5 text-muted-foreground">
            Verification cannot grant organization roles, environment access, recovery permissions, autonomy or execution authority.
          </p>
        </div>
      </div>
    </AuthProductShell>
  )
}