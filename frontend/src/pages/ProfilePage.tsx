import {
  Avatar,
  AvatarFallback,
} from '@/components/ui/avatar'

import {
  Badge,
} from '@/components/ui/badge'

import {
  Button,
} from '@/components/ui/button'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import {
  useLogout,
} from '@/hooks/useLogout'

import {
  useAuthStore,
} from '@/store/authStore'

import {
  motion,
} from 'framer-motion'

import {
  KeyRound,
  LogOut,
  MailCheck,
  ShieldCheck,
} from 'lucide-react'

import {
  Link,
} from 'react-router-dom'

export default function ProfilePage() {
  const user =
    useAuthStore(
      (state) =>
        state.user,
    )

  const organization =
    useAuthStore(
      (state) =>
        state.organization,
    )

  const membership =
    useAuthStore(
      (state) =>
        state.membership,
    )

  const session =
    useAuthStore(
      (state) =>
        state.session,
    )

  const logout =
    useLogout()

  const initials =
    (
      user?.fullName ??
      user?.email ??
      'U'
    )
      .slice(0, 2)
      .toUpperCase()

  const emailVerified =
    Boolean(
      user?.emailVerifiedAt,
    )

  return (
    <motion.div
      className="max-w-2xl space-y-5"
      initial={{
        opacity: 0,
        y: 8,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      transition={{
        duration: 0.25,
      }}
    >
      <div>
        <h1 className="text-xl font-semibold">
          Profile
        </h1>

        <p className="mt-0.5 text-sm text-muted-foreground">
          Your AIRA account,
          organization and identity
          status.
        </p>
      </div>

      <Card>
        <CardContent className="flex items-center gap-4 p-6">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-base">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">
              {user?.fullName ??
                user?.email ??
                'Unknown'}
            </p>

            <p className="truncate text-sm text-muted-foreground">
              {organization
                ?.name ??
                organization
                  ?.tenantId ??
                'No organization'}
            </p>
          </div>

          <Badge
            variant={
              emailVerified
                ? 'default'
                : 'secondary'
            }
          >
            {emailVerified
              ? 'Verified'
              : 'Unverified'}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Account
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">
              Email
            </span>

            <span className="break-all text-right font-mono text-xs">
              {user?.email ??
                '—'}
            </span>
          </div>

          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">
              Organization
            </span>

            <span className="text-right font-mono text-xs">
              {organization
                ?.name ??
                '—'}
            </span>
          </div>

          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">
              Tenant ID
            </span>

            <span className="text-right font-mono text-xs">
              {organization
                ?.tenantId ??
                '—'}
            </span>
          </div>

          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">
              Role
            </span>

            <span className="text-right font-mono text-xs">
              {membership
                ?.role ??
                '—'}
            </span>
          </div>

          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">
              Session assurance
            </span>

            <span className="text-right font-mono text-xs">
              {session
                ?.assuranceLevel ??
                '—'}
            </span>
          </div>
        </CardContent>
      </Card>

      {!emailVerified &&
      user?.email ? (
        <Card>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />

              <div>
                <p className="text-sm font-medium">
                  Verify your email
                </p>

                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Complete email
                  ownership verification
                  for this account.
                </p>
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              asChild
            >
              <Link
                to={`/email-verification-pending?email=${encodeURIComponent(
                  user.email,
                )}`}
              >
                Verify
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            Security controls
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <Button
            variant="outline"
            className="w-full justify-start"
            asChild
          >
            <Link to="/account/security">
              <ShieldCheck className="mr-2 h-4 w-4" />

              Account security
            </Link>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start"
            asChild
          >
            <Link to="/account/security">
              <KeyRound className="mr-2 h-4 w-4" />

              Password and
              sessions
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Button
        variant="destructive"
        size="sm"
        onClick={logout}
      >
        <LogOut className="mr-2 h-4 w-4" />

        Sign out
      </Button>
    </motion.div>
  )
}