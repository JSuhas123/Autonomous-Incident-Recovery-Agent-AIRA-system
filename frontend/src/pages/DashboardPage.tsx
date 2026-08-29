import {
  useCoverageDomains,
  useCoverageHistory,
  useCoverageResources,
  useCoverageSummary,
  useOnboardingStatus,
  useRefreshCoverage,
} from '@/api/hooks/useDashboard'

import { ActiveIncidentsPanel } from '@/components/incidents/ActiveIncidentsPanel'

import { Button } from '@/components/ui/button'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { Skeleton } from '@/components/ui/skeleton'

import { useAuthStore } from '@/store/authStore'

import { motion } from 'framer-motion'

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Database,
  HelpCircle,
  History,
  RefreshCw,
  Server,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react'

import { useMemo } from 'react'


const ONBOARDING_STEPS = [
  {
    key:
      'workspaceCreated' as const,

    label:
      'Workspace created',

    description:
      'Your organization workspace is ready.',
  },

  {
    key:
      'serviceAdded' as const,

    label:
      'First service added',

    description:
      'Register infrastructure AIRA will monitor.',
  },

  {
    key:
      'monitoringConnected' as const,

    label:
      'Monitoring connected',

    description:
      'Connect an observability integration.',
  },

  {
    key:
      'firstEventReceived' as const,

    label:
      'First event received',

    description:
      'AIRA received its first infrastructure signal.',
  },

  {
    key:
      'firstInsightGenerated' as const,

    label:
      'First insight generated',

    description:
      'AIRA produced its first operational insight.',
  },
]


export default function DashboardPage() {
  const user =
    useAuthStore(
      (
        state
      ) =>
        state.user,
    )


  const organization =
    useAuthStore(
      (
        state
      ) =>
        state.organization,
    )


  const activeEnvironment =
    useAuthStore(
      (
        state
      ) =>
        state.activeEnvironment,
    )


  const {
    data:
      onboarding,

    isLoading:
      onboardingLoading,
  } =
    useOnboardingStatus()


  const {
    data:
      coverage,

    isLoading:
      coverageLoading,

    isError:
      coverageError,
  } =
    useCoverageSummary()


  const {
    data:
      domains =
        [],

    isLoading:
      domainsLoading,
  } =
    useCoverageDomains()


  const {
    data:
      resources =
        [],

    isLoading:
      resourcesLoading,
  } =
    useCoverageResources()


  const {
    data:
      history =
        [],

    isLoading:
      historyLoading,
  } =
    useCoverageHistory()


  const refreshCoverage =
    useRefreshCoverage()


  const completedCount =
    onboarding
      ? ONBOARDING_STEPS
          .filter(
            (
              step
            ) =>
              onboarding[
                step.key
              ],
          )
          .length
      : 0


  const highestRiskResources =
    useMemo(
      () =>
        [...resources]
          .sort(
            (
              left,
              right,
            ) => {
              if (
                left.unknown !==
                right.unknown
              ) {
                return (
                  right.unknown -
                  left.unknown
                )
              }


              if (
                left.partial !==
                right.partial
              ) {
                return (
                  right.partial -
                  left.partial
                )
              }


              return (
                left.coveragePercentage -
                right.coveragePercentage
              )
            },
          )
          .slice(
            0,
            5,
          ),

      [
        resources,
      ],
    )


  const firstName =
    user?.fullName
      ? user.fullName
          .split(
            ' ',
          )[0]
      : null


  return (
    <motion.div
      className="space-y-8"
      initial={{
        opacity:
          0,

        y:
          8,
      }}
      animate={{
        opacity:
          1,

        y:
          0,
      }}
      transition={{
        duration:
          0.25,
      }}
    >
      {/* ================================================================ */}
      {/* HEADER                                                           */}
      {/* ================================================================ */}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {firstName
              ? `Welcome to AIRA, ${firstName}`
              : 'AIRA Recovery Coverage'}
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            {organization?.name
              ? organization.name
              : 'Organization'}

            {activeEnvironment?.name
              ? ` · ${activeEnvironment.name}`
              : ''}
          </p>

          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Recovery coverage measures how much of your actual infrastructure
            AIRA can prove it has production-ready recovery knowledge for.
            Coverage does not authorize execution.
          </p>
        </div>


        <Button
          variant="outline"
          className="gap-2"
          disabled={
            refreshCoverage
              .isPending ||
            !activeEnvironment
          }
          onClick={() =>
            refreshCoverage
              .mutate()
          }
        >
          <RefreshCw
            className={`h-4 w-4 ${
              refreshCoverage
                .isPending
                ? 'animate-spin'
                : ''
            }`}
          />

          {refreshCoverage
            .isPending
            ? 'Refreshing coverage'
            : 'Refresh coverage'}
        </Button>
      </div>


      {/* ================================================================ */}
      {/* NO ENVIRONMENT                                                   */}
      {/* ================================================================ */}

      {!activeEnvironment && (
        <Card>
          <CardContent className="py-8">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-500" />

              <div>
                <p className="font-medium">
                  No active environment selected
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  Select an environment before evaluating recovery coverage.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}


      {/* ================================================================ */}
      {/* COVERAGE ERROR                                                   */}
      {/* ================================================================ */}

      {activeEnvironment &&
        coverageError && (
          <Card>
            <CardContent className="py-8">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-500" />

                <div>
                  <p className="font-medium">
                    Coverage data is not available yet
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Run a coverage refresh after Phase 17 resource discovery
                    and Phase 18 recovery knowledge are available.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}


      {/* ================================================================ */}
      {/* HEADLINE COVERAGE                                                */}
      {/* ================================================================ */}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          title="Recovery coverage"
          value={
            coverageLoading
              ? null
              : `${coverage?.coveragePercentage ?? 0}%`
          }
          subtitle={
            `${coverage?.covered ?? 0} of ${
              coverage?.applicableFailureModes ??
              0
            } applicable recovery cases`
          }
          icon={
            <ShieldCheck className="h-4 w-4" />
          }
        />


        <MetricCard
          title="Covered"
          value={
            coverageLoading
              ? null
              : coverage?.covered ??
                0
          }
          subtitle="Production-ready recovery path"
          icon={
            <CheckCircle2 className="h-4 w-4" />
          }
        />


        <MetricCard
          title="Partial"
          value={
            coverageLoading
              ? null
              : coverage?.partial ??
                0
          }
          subtitle="Known but incomplete recovery"
          icon={
            <AlertTriangle className="h-4 w-4" />
          }
        />


        <MetricCard
          title="Human only"
          value={
            coverageLoading
              ? null
              : coverage?.humanOnly ??
                0
          }
          subtitle="Recovery intentionally human-gated"
          icon={
            <UserRoundCheck className="h-4 w-4" />
          }
        />


        <MetricCard
          title="Unknown"
          value={
            coverageLoading
              ? null
              : coverage?.unknown ??
                0
          }
          subtitle="Blind spots requiring knowledge"
          icon={
            <HelpCircle className="h-4 w-4" />
          }
        />
      </div>


      {/* ================================================================ */}
      {/* COVERAGE POSTURE                                                 */}
      {/* ================================================================ */}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-muted-foreground" />

              Recovery posture
            </CardTitle>
          </CardHeader>


          <CardContent>
            {coverageLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
              </div>
            ) : coverage?.hasSnapshot ? (
              <div className="space-y-5">
                <CoverageRow
                  label="Covered"
                  value={
                    coverage.covered
                  }
                  total={
                    coverage.applicableFailureModes
                  }
                />


                <CoverageRow
                  label="Partial"
                  value={
                    coverage.partial
                  }
                  total={
                    coverage.applicableFailureModes
                  }
                />


                <CoverageRow
                  label="Human only"
                  value={
                    coverage.humanOnly
                  }
                  total={
                    coverage.applicableFailureModes
                  }
                />


                <CoverageRow
                  label="Unknown"
                  value={
                    coverage.unknown
                  }
                  total={
                    coverage.applicableFailureModes
                  }
                />
              </div>
            ) : (
              <EmptyState
                title="No coverage snapshot yet"
                description="Run the first recovery coverage refresh to establish AIRA's current recovery posture."
              />
            )}
          </CardContent>
        </Card>


        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />

              Knowledge gaps
            </CardTitle>
          </CardHeader>


          <CardContent>
            {coverageLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : (
              <div className="space-y-3">
                <GapRow
                  label="Critical"
                  value={
                    coverage?.criticalGapCount ??
                    0
                  }
                />

                <GapRow
                  label="High"
                  value={
                    coverage?.highGapCount ??
                    0
                  }
                />

                <GapRow
                  label="Medium"
                  value={
                    coverage?.mediumGapCount ??
                    0
                  }
                />

                <GapRow
                  label="Low"
                  value={
                    coverage?.lowGapCount ??
                    0
                  }
                />


                <div className="mt-4 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Total gaps
                    </span>

                    <span className="text-lg font-semibold">
                      {coverage?.totalGapCount ??
                        0}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>


      {/* ================================================================ */}
      {/* DOMAIN COVERAGE                                                  */}
      {/* ================================================================ */}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-muted-foreground" />

            Coverage by infrastructure domain
          </CardTitle>
        </CardHeader>


        <CardContent>
          {domainsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : domains.length ===
            0 ? (
            <EmptyState
              title="No domain coverage yet"
              description="Domain coverage will appear after resources and applicable Failure Modes have been evaluated."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">
                      Domain
                    </th>

                    <th className="pb-3 px-4 font-medium">
                      Coverage
                    </th>

                    <th className="pb-3 px-4 font-medium">
                      Covered
                    </th>

                    <th className="pb-3 px-4 font-medium">
                      Partial
                    </th>

                    <th className="pb-3 px-4 font-medium">
                      Human
                    </th>

                    <th className="pb-3 pl-4 font-medium">
                      Unknown
                    </th>
                  </tr>
                </thead>


                <tbody>
                  {domains.map(
                    (
                      domain
                    ) => (
                      <tr
                        key={
                          domain.domain
                        }
                        className="border-b last:border-0"
                      >
                        <td className="py-4 pr-4 font-medium capitalize">
                          {formatDomain(
                            domain.domain,
                          )}
                        </td>

                        <td className="py-4 px-4">
                          <span className="font-semibold">
                            {domain.coveragePercentage}%
                          </span>

                          <span className="ml-2 text-xs text-muted-foreground">
                            {
                              domain.applicableFailureModes
                            }{' '}
                            cases
                          </span>
                        </td>

                        <td className="py-4 px-4">
                          {domain.covered}
                        </td>

                        <td className="py-4 px-4">
                          {domain.partial}
                        </td>

                        <td className="py-4 px-4">
                          {domain.humanOnly}
                        </td>

                        <td className="py-4 pl-4">
                          {domain.unknown}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>


      {/* ================================================================ */}
      {/* RESOURCES + HISTORY                                              */}
      {/* ================================================================ */}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4 text-muted-foreground" />

              Resources needing attention
            </CardTitle>
          </CardHeader>


          <CardContent>
            {resourcesLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : highestRiskResources.length ===
              0 ? (
              <EmptyState
                title="No evaluated resources"
                description="Resource-level coverage will appear after a recovery coverage refresh."
              />
            ) : (
              <div className="divide-y">
                {highestRiskResources.map(
                  (
                    resource
                  ) => (
                    <div
                      key={
                        resource.resourceId
                      }
                      className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {
                            resource.resourcePublicId
                          }
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          {
                            resource.resourceType
                          }
                        </p>
                      </div>


                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {
                            resource.coveragePercentage
                          }
                          %
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          {
                            resource.unknown
                          }{' '}
                          unknown ·{' '}
                          {
                            resource.partial
                          }{' '}
                          partial
                        </p>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </CardContent>
        </Card>


        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-muted-foreground" />

              Coverage history
            </CardTitle>
          </CardHeader>


          <CardContent>
            {historyLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : history.length ===
              0 ? (
              <EmptyState
                title="No historical snapshots"
                description="Each successful refresh creates a new immutable recovery coverage snapshot."
              />
            ) : (
              <div className="divide-y">
                {history
                  .slice(
                    0,
                    6,
                  )
                  .map(
                    (
                      snapshot
                    ) => (
                      <div
                        key={
                          snapshot.publicId
                        }
                        className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {
                              snapshot.coveragePercentage
                            }
                            % covered
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            {
                              snapshot.applicableFailureModesCount
                            }{' '}
                            applicable recovery cases
                          </p>
                        </div>


                        <p className="text-xs text-muted-foreground">
                          {formatTimestamp(
                            snapshot.generatedAt,
                          )}
                        </p>
                      </div>
                    ),
                  )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>


      {/* ================================================================ */}
      {/* ACTIVE INCIDENTS                                                 */}
      {/* ================================================================ */}

      <ActiveIncidentsPanel />


      {/* ================================================================ */}
      {/* ONBOARDING                                                       */}
      {/* ================================================================ */}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" />

              Setup progress
            </span>


            {onboardingLoading ? (
              <Skeleton className="h-4 w-12" />
            ) : (
              <span className="text-xs font-normal text-muted-foreground">
                {completedCount} /{' '}
                {
                  ONBOARDING_STEPS.length
                }{' '}
                completed
              </span>
            )}
          </CardTitle>
        </CardHeader>


        <CardContent>
          {onboardingLoading ? (
            <div className="space-y-3">
              {ONBOARDING_STEPS.map(
                (
                  _,
                  index
                ) => (
                  <Skeleton
                    key={
                      index
                    }
                    className="h-9"
                  />
                ),
              )}
            </div>
          ) : (
            <ul className="space-y-2">
              {ONBOARDING_STEPS.map(
                ({
                  key,
                  label,
                  description,
                }) => {
                  const done =
                    onboarding?.[
                      key
                    ] ??
                    false


                  return (
                    <li
                      key={
                        key
                      }
                      className="flex items-start gap-3 py-1"
                    >
                      {done ? (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                      ) : (
                        <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground/40" />
                      )}


                      <div>
                        <p
                          className={`text-sm font-medium ${
                            done
                              ? 'line-through text-muted-foreground'
                              : ''
                          }`}
                        >
                          {label}
                        </p>


                        {!done && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {
                              description
                            }
                          </p>
                        )}
                      </div>
                    </li>
                  )
                },
              )}
            </ul>
          )}
        </CardContent>
      </Card>


      {/* ================================================================ */}
      {/* SAFETY FOOTER                                                    */}
      {/* ================================================================ */}

      <div className="rounded-lg border bg-muted/20 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Recovery Coverage is an assessment of AIRA's production recovery
          knowledge and readiness. A COVERED classification does not grant
          infrastructure execution authorization. Policy, approval,
          authorization, kill switches and execution safety gates remain
          authoritative.
        </p>
      </div>
    </motion.div>
  )
}


/* ============================================================================
 * COMPONENTS
 * ============================================================================
 */


function MetricCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string

  value:
    | string
    | number
    | null

  subtitle: string

  icon:
    React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">
            {title}
          </p>

          <span className="text-muted-foreground">
            {icon}
          </span>
        </div>


        {value ===
        null ? (
          <Skeleton className="mt-3 h-8 w-16" />
        ) : (
          <p className="mt-3 text-2xl font-semibold">
            {value}
          </p>
        )}


        <p className="mt-1 text-xs text-muted-foreground">
          {subtitle}
        </p>
      </CardContent>
    </Card>
  )
}


function CoverageRow({
  label,
  value,
  total,
}: {
  label: string
  value: number
  total: number
}) {
  const percentage =
    total >
    0
      ? Math.round(
          (
            value /
            total
          ) *
            1000,
        ) /
        10
      : 0


  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">
          {label}
        </span>

        <span className="text-muted-foreground">
          {value} · {percentage}%
        </span>
      </div>


      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground/70 transition-all"
          style={{
            width:
              `${percentage}%`,
          }}
        />
      </div>
    </div>
  )
}


function GapRow({
  label,
  value,
}: {
  label: string
  value: number
}) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <span className="text-sm text-muted-foreground">
        {label}
      </span>

      <span className="text-sm font-semibold">
        {value}
      </span>
    </div>
  )
}


function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm font-medium">
        {title}
      </p>

      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
        {description}
      </p>
    </div>
  )
}


function formatDomain(
  domain: string,
) {
  return domain
    .replace(
      /[_-]+/g,
      ' ',
    )
    .replace(
      /\b\w/g,
      (
        value
      ) =>
        value.toUpperCase(),
    )
}


function formatTimestamp(
  value:
    | string
    | null
    | undefined,
) {
  if (
    !value
  ) {
    return '—'
  }


  const date =
    new Date(
      value,
    )


  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '—'
  }


  return date.toLocaleString()
}