import {
  AlertTriangle,
  Bell,
  CheckCheck,
  ChevronRight,
  LoaderCircle,
  ShieldCheck,
  Trash2,
} from 'lucide-react'

import {
  useState,
} from 'react'

import {
  useNavigate,
} from 'react-router-dom'

import {
  type ProductNotification,
  type ProductNotificationKind,
} from '@/api/productNotificationsApi'

import {
  useDismissProductNotification,
  useMarkAllProductNotificationsRead,
  useMarkProductNotificationRead,
  useProductNotifications,
} from '@/hooks/useProductNotifications'

import {
  FeaturePageHeader,
  SafetyBoundary,
  SectionCard,
  StateBadge,
} from '../shared'


const KINDS:
  Array<{
    value:
      ProductNotificationKind |
      null

    label:
      string
  }> = [
    {
      value:
        null,

      label:
        'All',
    },

    {
      value:
        'incident',

      label:
        'Incidents',
    },

    {
      value:
        'approval',

      label:
        'Approvals',
    },

    {
      value:
        'human_task',

      label:
        'Human tasks',
    },

    {
      value:
        'recovery',

      label:
        'Recovery',
    },

    {
      value:
        'integration',

      label:
        'Integrations',
    },

    {
      value:
        'security',

      label:
        'Security',
    },

    {
      value:
        'trust',

      label:
        'Trust',
    },

    {
      value:
        'certification',

      label:
        'Certification',
    },

    {
      value:
        'system',

      label:
        'System',
    },
  ]


function stateFor(
  severity:
    ProductNotification['severity'],
) {
  switch (
    severity
  ) {
    case 'CRITICAL':
      return 'critical' as const

    case 'HIGH':
    case 'MEDIUM':
      return 'warning' as const

    case 'LOW':
    case 'INFO':
    default:
      return 'info' as const
  }
}


function relative(
  value:
    string,
) {
  const date =
    new Date(
      value,
    )


  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value
  }


  const seconds =
    Math.floor(
      (
        Date.now() -
        date.getTime()
      ) /
      1000,
    )


  if (
    seconds <
    60
  ) {
    return 'just now'
  }


  const minutes =
    Math.floor(
      seconds /
      60,
    )


  if (
    minutes <
    60
  ) {
    return `${minutes}m ago`
  }


  const hours =
    Math.floor(
      minutes /
      60,
    )


  if (
    hours <
    24
  ) {
    return `${hours}h ago`
  }


  const days =
    Math.floor(
      hours /
      24,
    )


  return `${days}d ago`
}


export default function ProductNotificationsPage() {
  const navigate =
    useNavigate()


  const [
    selectedKind,
    setSelectedKind,
  ] =
    useState<
      ProductNotificationKind |
      null
    >(
      null,
    )


  const [
    unreadOnly,
    setUnreadOnly,
  ] =
    useState(
      false,
    )


  const query =
    useProductNotifications({
      unreadOnly,

      kind:
        selectedKind,
    })


  const markRead =
    useMarkProductNotificationRead()


  const markAll =
    useMarkAllProductNotificationsRead()


  const dismiss =
    useDismissProductNotification()


  const items =
    query.data ??
    []


  const unreadCount =
    items.filter(
      (
        item,
      ) =>
        !item.read,
    ).length


  async function openNotification(
    item:
      ProductNotification,
  ) {
    if (
      !item.read
    ) {
      await markRead
        .mutateAsync(
          item.id,
        )
        .catch(
          () => {},
        )
    }


    if (
      item.actionPath
    ) {
      navigate(
        item.actionPath,
      )
    }
  }


  return (
    <div className="space-y-6">
      <FeaturePageHeader
        kicker="Operational communication"
        title="Notifications"
        description="Tenant- and environment-scoped incident, approval, human-task, recovery, integration, security, trust, certification, policy and system notifications."
      />


      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={
            () =>
              setUnreadOnly(
                false,
              )
          }
          className={[
            'rounded-lg border px-3 py-1.5 text-xs transition-colors',

            !unreadOnly
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-secondary',
          ].join(
            ' ',
          )}
        >
          All
        </button>


        <button
          type="button"
          onClick={
            () =>
              setUnreadOnly(
                true,
              )
          }
          className={[
            'rounded-lg border px-3 py-1.5 text-xs transition-colors',

            unreadOnly
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-secondary',
          ].join(
            ' ',
          )}
        >
          Unread
        </button>


        <div className="mx-1 h-5 w-px bg-border" />


        {KINDS.map(
          (
            kind,
          ) => (
            <button
              key={
                kind.label
              }
              type="button"
              onClick={
                () =>
                  setSelectedKind(
                    kind.value,
                  )
              }
              className={[
                'rounded-lg px-2.5 py-1.5 text-[11px] transition-colors',

                selectedKind ===
                  kind.value
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/60',
              ].join(
                ' ',
              )}
            >
              {
                kind.label
              }
            </button>
          ),
        )}
      </div>


      <SectionCard
        kicker="Inbox"
        title={`${unreadCount} unread`}
        action={
          unreadCount >
          0 ? (
            <button
              type="button"
              disabled={
                markAll.isPending
              }
              onClick={
                () =>
                  markAll
                    .mutate()
              }
              className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              {markAll.isPending ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5" />
              )}

              Mark all read
            </button>
          ) : undefined
        }
      >
        {query.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground">
            <LoaderCircle className="h-5 w-5 animate-spin" />

            Loading notification inbox…
          </div>
        ) : query.error ? (
          <div className="rounded-xl border border-red-400/20 bg-red-400/[0.04] p-5">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-red-300" />

              <div>
                <p className="text-sm font-medium">
                  Notification inbox unavailable
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {query.error instanceof Error
                    ? query.error.message
                    : 'Unable to load notifications.'}
                </p>

                <button
                  type="button"
                  onClick={
                    () =>
                      void query.refetch()
                  }
                  className="mt-3 text-xs text-primary"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        ) : items.length ===
          0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-secondary/30">
              <Bell className="h-5 w-5 text-muted-foreground" />
            </div>

            <p className="mt-4 text-sm font-medium">
              No notifications
            </p>

            <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
              No product notification currently matches this environment and filter.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(
              (
                item,
              ) => (
                <div
                  key={
                    item.id
                  }
                  className={[
                    'group flex items-start gap-3 rounded-xl border p-4 transition-colors',

                    item.read
                      ? 'border-border/60 bg-secondary/[0.10]'
                      : 'border-primary/20 bg-primary/[0.035]',
                  ].join(
                    ' ',
                  )}
                >
                  <button
                    type="button"
                    onClick={
                      () =>
                        void openNotification(
                          item,
                        )
                    }
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background/50">
                      <Bell className="h-4 w-4 text-muted-foreground" />

                      {!item.read && (
                        <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>


                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-medium">
                          {
                            item.title
                          }
                        </p>

                        <StateBadge
                          state={
                            stateFor(
                              item.severity,
                            )
                          }
                          label={
                            item.severity
                          }
                        />
                      </div>

                      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                        {
                          item.message
                        }
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-wider text-muted-foreground">
                        <span>
                          {
                            item.kind.replace(
                              /_/g,
                              ' ',
                            )
                          }
                        </span>

                        <span>
                          ·
                        </span>

                        <span>
                          {
                            relative(
                              item.createdAt,
                            )
                          }
                        </span>

                        <span>
                          ·
                        </span>

                        <span>
                          {
                            item.targetType
                          }
                        </span>
                      </div>
                    </div>


                    {item.actionPath && (
                      <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>


                  <button
                    type="button"
                    aria-label="Dismiss notification"
                    disabled={
                      dismiss.isPending
                    }
                    onClick={
                      () =>
                        dismiss
                          .mutate(
                            item.id,
                          )
                    }
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-all hover:bg-red-400/10 hover:text-red-300 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ),
            )}
          </div>
        )}
      </SectionCard>


      <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.035] p-4">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-300" />

          <div>
            <p className="text-xs font-medium">
              Reading is not acknowledgement
            </p>

            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              Marking a product notification read or dismissing it does not acknowledge an incident, resolve a human task, grant approval, acquire human control or authorize infrastructure execution.
            </p>
          </div>
        </div>
      </div>


      <SafetyBoundary>
        Notification eligibility, team targeting, environment scope and routing originate from backend state. Browser persona cannot manufacture notification recipients or authorization.
      </SafetyBoundary>
    </div>
  )
}