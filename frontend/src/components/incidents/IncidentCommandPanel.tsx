import {
  useAcknowledgeHumanTask,
  useAcquireHumanControl,
  useAuthorizeHumanControl,
  useHeartbeatHumanControl,
  useIncidentCommand,
  useRequestHumanControl,
  useReturnHumanControl,
} from '@/api/hooks/useIncidentCommand'

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
  Separator,
} from '@/components/ui/separator'

import {
  Skeleton,
} from '@/components/ui/skeleton'

import {
  useToast,
} from '@/hooks/useToast'

import type {
  IncidentCommandHandoff,
} from '@/types/incidentCommand'

import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  FileText,
  Hand,
  HeartPulse,
  LockKeyhole,
  RotateCcw,
  Shield,
  ShieldAlert,
  UserCheck,
} from 'lucide-react'


interface Props {
  incidentId: string
}


function formatTime(
  value?: string | null,
) {
  if (
    !value
  ) {
    return '—'
  }


  const parsed =
    new Date(
      value,
    )


  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return String(
      value,
    )
  }


  return parsed
    .toLocaleString()
}


function statusVariant(
  status?: string | null,
):
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline' {
  const value =
    String(
      status ??
      '',
    ).toUpperCase()


  if (
    [
      'ACTIVE',
      'DELIVERED',
      'SATISFIED',
      'ACKNOWLEDGED',
      'IN_PROGRESS',
    ].includes(
      value,
    )
  ) {
    return 'default'
  }


  if (
    [
      'FAILED',
      'DEAD_LETTER',
      'EXPIRED',
      'REVOKED',
      'DENIED',
    ].includes(
      value,
    )
  ) {
    return 'destructive'
  }


  if (
    [
      'REQUESTED',
      'WAITING',
      'WAITING_ACK',
      'REQUIRES_FRESH_EVALUATION',
    ].includes(
      value,
    )
  ) {
    return 'secondary'
  }


  return 'outline'
}


function stringifyBriefValue(
  value: unknown,
) {
  if (
    typeof value ===
      'string'
  ) {
    return value
  }


  if (
    typeof value ===
      'number' ||
    typeof value ===
      'boolean'
  ) {
    return String(
      value,
    )
  }


  return null
}


function handoffBrief(
  handoff: IncidentCommandHandoff | null,
) {
  if (
    !handoff
  ) {
    return []
  }


  const packageData =
    handoff.package ??
    {}


  const operatorBrief =
    packageData.operatorBrief


  if (
    typeof operatorBrief ===
      'string'
  ) {
    return [
      operatorBrief,
    ]
  }


  if (
    operatorBrief &&
    typeof operatorBrief ===
      'object'
  ) {
    return Object
      .entries(
        operatorBrief as
          Record<string, unknown>,
      )
      .map(
        (
          [, value],
        ) =>
          stringifyBriefValue(
            value,
          ),
      )
      .filter(
        (
          value,
        ): value is string =>
          Boolean(
            value,
          ),
      )
      .slice(
        0,
        4,
      )
  }


  return []
}


function StateRow({
  label,
  value,
  status,
}: {
  label: string
  value: React.ReactNode
  status?: string | null
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">
        {label}
      </span>

      <div className="flex items-center gap-2 text-right">
        {status && (
          <Badge
            variant={
              statusVariant(
                status,
              )
            }
            className="text-[10px]"
          >
            {status.replace(
              /_/g,
              ' ',
            )}
          </Badge>
        )}

        {value}
      </div>
    </div>
  )
}


export function IncidentCommandPanel({
  incidentId,
}: Props) {
  const {
    toast,
  } =
    useToast()


  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching,
  } =
    useIncidentCommand(
      incidentId,
    )


  const acknowledge =
    useAcknowledgeHumanTask()

  const requestControl =
    useRequestHumanControl()

  const authorizeControl =
    useAuthorizeHumanControl()

  const acquireControl =
    useAcquireHumanControl()

  const heartbeatControl =
    useHeartbeatHumanControl()

  const returnControl =
    useReturnHumanControl()


  const model =
    data?.command


  async function runCommand(
    action: () => Promise<unknown>,
    successTitle: string,
  ) {
    try {
      await action()

      toast({
        title:
          successTitle,
      })
    } catch (
      error
    ) {
      toast({
        title:
          'Command failed',

        description:
          (
            error as Error
          ).message,

        variant:
          'destructive',
      })
    }
  }


  if (
    isLoading
  ) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Incident Command
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    )
  }


  if (
    error ||
    !model
  ) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" />
            Incident Command
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Incident Command state could not be loaded.
          </p>

          <Button
            size="sm"
            variant="outline"
            onClick={
              () =>
                void refetch()
            }
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }


  const {
    capabilities,
  } =
    model


  const {
    task,
    escalation,
    notification,
    handoff,
  } =
    model


  const session =
    model.control.session


  const lease =
    model.control.lease


  const returnFence =
    model.returnControl.fence


  const brief =
    handoffBrief(
      handoff,
    )


  const hasCommand =
    Object
      .entries(
        capabilities,
      )
      .some(
        (
          [key, enabled],
        ) =>
          key !==
            'executionAuthorized' &&
          enabled ===
            true,
      )


  const commandPending =
    acknowledge.isPending ||
    requestControl.isPending ||
    authorizeControl.isPending ||
    acquireControl.isPending ||
    heartbeatControl.isPending ||
    returnControl.isPending


  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="w-4 h-4" />

              Incident Command

              {model.control.humanControlActive && (
                <Badge>
                  HUMAN CONTROL ACTIVE
                </Badge>
              )}
            </CardTitle>

            <p className="text-xs text-muted-foreground mt-1">
              Server-calculated human-operation capabilities.
              This panel never grants infrastructure execution authority.
            </p>
          </div>

          <Button
            size="sm"
            variant="ghost"
            disabled={
              isFetching ||
              commandPending
            }
            onClick={
              () =>
                void refetch()
            }
          >
            <RotateCcw
              className={
                `w-3.5 h-3.5 mr-1 ${
                  isFetching
                    ? 'animate-spin'
                    : ''
                }`
              }
            />

            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {model.control.humanControlActive && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
            <div className="flex items-start gap-2">
              <Hand className="w-4 h-4 mt-0.5 shrink-0" />

              <div>
                <p className="text-sm font-medium">
                  Human control lease is active
                </p>

                <p className="text-xs mt-1">
                  AIRA autonomous continuation is blocked while
                  this authoritative PostgreSQL lease remains active.
                </p>
              </div>
            </div>
          </div>
        )}


        {model.returnControl.requiresFreshEvaluation && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />

              <div>
                <p className="text-sm font-medium">
                  Fresh AIRA evaluation required
                </p>

                <p className="text-xs mt-1">
                  Human control has ended, but the pre-takeover
                  investigation and recovery plan may not resume.
                  A fresh diagnosis and fresh recovery decision are required.
                </p>

                {returnFence?.freshAfter && (
                  <p className="text-xs mt-1">
                    Fresh evidence boundary:{' '}
                    <strong>
                      {formatTime(
                        returnFence.freshAfter,
                      )}
                    </strong>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}


        {model.returnControl.freshEvaluationSatisfied && (
          <div className="rounded-md border border-green-300 bg-green-50 p-3 text-green-900">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />

              <div>
                <p className="text-sm font-medium">
                  Fresh evaluation certified
                </p>

                <p className="text-xs mt-1">
                  The return-control fence is satisfied.
                  Canonical execution authorization is still required
                  for any infrastructure action.
                </p>
              </div>
            </div>
          </div>
        )}


        <div className="rounded-md border">
          <div className="px-3 py-2 border-b bg-muted/40">
            <p className="text-xs font-semibold uppercase tracking-wide">
              Human operation state
            </p>
          </div>

          <div className="px-3 divide-y">
            <StateRow
              label="Human task"
              status={
                task?.status
              }
              value={
                task
                  ? task.title
                  : 'No active task'
              }
            />

            <StateRow
              label="Escalation"
              status={
                escalation?.status
              }
              value={
                escalation
                  ? escalation.reasonCode ??
                    escalation.decision ??
                    'Escalated'
                  : 'None'
              }
            />

            <StateRow
              label="Notification"
              status={
                notification?.status
              }
              value={
                notification
                  ? (
                      <span className="inline-flex items-center gap-1">
                        <Bell className="w-3.5 h-3.5" />

                        {notification.targetType ??
                          'delivery'}
                      </span>
                    )
                  : 'None'
              }
            />

            <StateRow
              label="Takeover session"
              status={
                session?.status
              }
              value={
                session
                  ? session.publicId
                  : 'None'
              }
            />

            <StateRow
              label="Control lease"
              status={
                lease?.status
              }
              value={
                lease
                  ? (
                      <span className="inline-flex items-center gap-1">
                        <LockKeyhole className="w-3.5 h-3.5" />

                        epoch {lease.controlEpoch}
                      </span>
                    )
                  : 'None'
              }
            />

            <StateRow
              label="Return fence"
              status={
                returnFence?.state
              }
              value={
                returnFence
                  ? `epoch ${returnFence.requiredControlEpoch}`
                  : 'None'
              }
            />
          </div>
        </div>


        {lease && (
          <div className="rounded-md border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide mb-3">
              Active lease
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground">
                  Holder
                </p>

                <p className="font-mono truncate">
                  {lease.holderUserId ??
                    'unknown'}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground">
                  Last heartbeat
                </p>

                <p>
                  {formatTime(
                    lease.heartbeatAt,
                  )}
                </p>
              </div>

              <div>
                <p className="text-muted-foreground">
                  Expires
                </p>

                <p className="flex items-center gap-1">
                  <Clock3 className="w-3.5 h-3.5" />

                  {formatTime(
                    lease.expiresAt,
                  )}
                </p>
              </div>
            </div>
          </div>
        )}


        {handoff && (
          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" />

                Incident handoff
              </p>

              <Badge variant="outline">
                revision {handoff.revision}
              </Badge>
            </div>

            {brief.length > 0 ? (
              <div className="space-y-1">
                {brief.map(
                  (
                    line,
                    index,
                  ) => (
                    <p
                      key={
                        `${index}-${line}`
                      }
                      className="text-xs text-muted-foreground"
                    >
                      {line}
                    </p>
                  ),
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Canonical handoff package is available for this incident.
              </p>
            )}
          </div>
        )}


        <Separator />


        <div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-medium">
                Human commands
              </p>

              <p className="text-xs text-muted-foreground">
                Buttons are rendered only from server-provided capabilities.
                The server validates state again when clicked.
              </p>
            </div>

            <Badge variant="outline">
              execution authority: NO
            </Badge>
          </div>


          <div className="flex flex-wrap gap-2">
            {capabilities.acknowledge &&
              task && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    commandPending
                  }
                  onClick={
                    () =>
                      void runCommand(
                        () =>
                          acknowledge.mutateAsync({
                            incidentId,

                            taskId:
                              task.publicId,
                          }),

                        'Human task acknowledged',
                      )
                  }
                >
                  <UserCheck className="w-4 h-4 mr-1" />
                  Acknowledge task
                </Button>
              )}


            {capabilities.requestControl &&
              task && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    commandPending
                  }
                  onClick={
                    () =>
                      void runCommand(
                        () =>
                          requestControl.mutateAsync({
                            incidentId,

                            taskId:
                              task.publicId,

                            reason:
                              'Operator requested control from Incident Command',
                          }),

                        'Takeover requested',
                      )
                  }
                >
                  <Hand className="w-4 h-4 mr-1" />
                  Request control
                </Button>
              )}


            {capabilities.authorizeControl &&
              session && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    commandPending
                  }
                  onClick={
                    () =>
                      void runCommand(
                        () =>
                          authorizeControl.mutateAsync({
                            incidentId,

                            sessionId:
                              session.publicId,
                          }),

                        'Takeover authorized',
                      )
                  }
                >
                  <Shield className="w-4 h-4 mr-1" />
                  Authorize takeover
                </Button>
              )}


            {capabilities.acquireControl &&
              session && (
                <Button
                  size="sm"
                  disabled={
                    commandPending
                  }
                  onClick={
                    () =>
                      void runCommand(
                        () =>
                          acquireControl.mutateAsync({
                            incidentId,

                            sessionId:
                              session.publicId,

                            leaseDurationMs:
                              300_000,
                          }),

                        'Human control acquired',
                      )
                  }
                >
                  <LockKeyhole className="w-4 h-4 mr-1" />
                  Take control
                </Button>
              )}


            {capabilities.heartbeatControl &&
              lease && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    commandPending
                  }
                  onClick={
                    () =>
                      void runCommand(
                        () =>
                          heartbeatControl.mutateAsync({
                            incidentId,

                            leaseId:
                              lease.publicId,

                            extensionMs:
                              300_000,
                          }),

                        'Control lease refreshed',
                      )
                  }
                >
                  <HeartPulse className="w-4 h-4 mr-1" />
                  Refresh lease
                </Button>
              )}


            {capabilities.returnControl &&
              lease && (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={
                    commandPending
                  }
                  onClick={
                    () =>
                      void runCommand(
                        () =>
                          returnControl.mutateAsync({
                            incidentId,

                            leaseId:
                              lease.publicId,

                            reason:
                              'Operator returned control from Incident Command',
                          }),

                        'Control returned to AIRA safety boundary',
                      )
                  }
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Return control
                </Button>
              )}


            {!hasCommand && (
              <p className="text-xs text-muted-foreground py-2">
                No human command is currently available for this operator.
              </p>
            )}
          </div>
        </div>


        <div className="rounded-md bg-muted/50 p-2.5 flex items-start gap-2">
          <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />

          <p className="text-xs text-muted-foreground">
            Human takeover, acknowledgement, assignment, notification,
            and return-control state never grant AIRA infrastructure
            execution authority. Canonical execution authorization remains
            a separate safety boundary.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}