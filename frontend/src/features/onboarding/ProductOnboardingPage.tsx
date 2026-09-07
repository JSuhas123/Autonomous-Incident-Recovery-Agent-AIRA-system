import {
  AlertTriangle,
  Check,
  Circle,
  CircleDot,
  ExternalLink,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import {
  useNavigate,
} from 'react-router-dom'

import {
  useProductOnboarding,
} from '@/hooks/useProductOnboarding'

import {
  FeaturePageHeader,
  SafetyBoundary,
  SectionCard,
} from '../shared'


function StepIcon({
  status,
}: {
  status:
    'complete' |
    'current' |
    'pending'
}) {
  if (
    status ===
    'complete'
  ) {
    return (
      <Check className="h-3.5 w-3.5" />
    )
  }


  if (
    status ===
    'current'
  ) {
    return (
      <CircleDot className="h-3.5 w-3.5" />
    )
  }


  return (
    <Circle className="h-3.5 w-3.5" />
  )
}


export default function ProductOnboardingPage() {
  const navigate =
    useNavigate()


  const query =
    useProductOnboarding()


  if (
    query.isLoading
  ) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }


  if (
    query.error ||
    !query.data
  ) {
    return (
      <div className="space-y-6">
        <FeaturePageHeader
          kicker="Evidence-driven onboarding"
          title="Set up AIRA"
          description="AIRA computes customer readiness from authoritative backend evidence."
        />

        <div className="rounded-xl border border-red-400/20 bg-red-400/[0.04] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-red-300" />

            <div>
              <p className="text-sm font-medium">
                Onboarding evidence unavailable
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                {query.error instanceof Error
                  ? query.error.message
                  : 'Unable to calculate onboarding readiness.'}
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

        <SafetyBoundary>
          Failure to load onboarding evidence cannot grant readiness, certification or execution authority.
        </SafetyBoundary>
      </div>
    )
  }


  const {
    readiness,
    steps,
    evidence,
    recommendations,
  } =
    query.data


  const current =
    steps.find(
      (
        item,
      ) =>
        item.status ===
        'current',
    )


  return (
    <div className="space-y-6">
      <FeaturePageHeader
        kicker="Evidence-driven onboarding"
        title="Set up AIRA"
        description="AIRA advances setup only when corresponding organization and environment evidence exists."
      />


      <section className="grid gap-3 md:grid-cols-3">
        <div className="aira-surface p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Readiness
          </p>

          <p className="mt-2 text-2xl font-semibold">
            {readiness.percent}%
          </p>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{
                width:
                  `${readiness.percent}%`,
              }}
            />
          </div>
        </div>


        <div className="aira-surface p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Evidence complete
          </p>

          <p className="mt-2 text-2xl font-semibold">
            {readiness.completed}
            <span className="text-sm font-normal text-muted-foreground">
              /{readiness.total}
            </span>
          </p>
        </div>


        <div className="aira-surface p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Current objective
          </p>

          <p className="mt-2 text-sm font-semibold">
            {readiness.fullyReady
              ? 'Core onboarding complete'
              : current?.label ??
                'Waiting for evidence'}
          </p>
        </div>
      </section>


      <SectionCard
        kicker="Customer journey"
        title="Organization readiness"
      >
        <div className="space-y-2">
          {steps.map(
            (
              item,
              index,
            ) => (
              <div
                key={
                  item.id
                }
                className={[
                  'flex items-start gap-3 rounded-xl border p-4',

                  item.status ===
                    'complete'
                    ? 'border-emerald-400/15 bg-emerald-400/[0.025]'
                    : item.status ===
                        'current'
                      ? 'border-primary/20 bg-primary/[0.035]'
                      : 'border-border/60 bg-secondary/[0.14]',
                ].join(
                  ' ',
                )}
              >
                <div
                  className={[
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',

                    item.status ===
                      'complete'
                      ? 'border-emerald-400/20 text-emerald-300'
                      : item.status ===
                          'current'
                        ? 'border-primary/30 text-primary'
                        : 'border-border text-muted-foreground',
                  ].join(
                    ' ',
                  )}
                >
                  <StepIcon
                    status={
                      item.status
                    }
                  />
                </div>


                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">
                    {index + 1}. {item.label}
                  </p>

                  <p className="mt-1 text-[10px] font-medium text-muted-foreground">
                    {item.evidence}
                  </p>

                  <p className="mt-1 text-[10px] leading-4 text-muted-foreground/80">
                    {item.detail}
                  </p>
                </div>


                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={[
                      'text-[9px] uppercase tracking-wider',

                      item.status ===
                        'complete'
                        ? 'text-emerald-300'
                        : item.status ===
                            'current'
                          ? 'text-primary'
                          : 'text-muted-foreground',
                    ].join(
                      ' ',
                    )}
                  >
                    {item.status}
                  </span>


                  {item.actionPath && (
                    <button
                      type="button"
                      onClick={
                        () =>
                          navigate(
                            item.actionPath!,
                          )
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      </SectionCard>


      <section className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          kicker="Observed evidence"
          title="Current environment"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <Evidence
              label="Profile"
              value={
                evidence.profileStatus
              }
            />

            <Evidence
              label="Members"
              value={
                String(
                  evidence.activeMembers,
                )
              }
            />

            <Evidence
              label="Pending invitations"
              value={
                String(
                  evidence.pendingInvitations,
                )
              }
            />

            <Evidence
              label="Teams"
              value={
                String(
                  evidence.teams,
                )
              }
            />

            <Evidence
              label="Integrations"
              value={`${evidence.integrations.connected}/${evidence.integrations.total} connected`}
            />

            <Evidence
              label="Signals"
              value={
                String(
                  evidence.signals,
                )
              }
            />

            <Evidence
              label="Resources"
              value={
                String(
                  evidence.resources,
                )
              }
            />

            <Evidence
              label="Incidents"
              value={
                String(
                  evidence.incidents,
                )
              }
            />

            <Evidence
              label="Policies"
              value={
                String(
                  evidence.policies,
                )
              }
            />

            <Evidence
              label="Notification channels"
              value={
                String(
                  evidence.notificationChannels,
                )
              }
            />

            <Evidence
              label="Notification routes"
              value={
                String(
                  evidence.notificationRoutes,
                )
              }
            />

            <Evidence
              label="Environment"
              value={`${evidence.environment.type ?? 'unclassified'} · ${evidence.environment.criticality ?? 'unknown'}`}
            />
          </div>
        </SectionCard>


        <SectionCard
          kicker="Product guide"
          title="Recommended next actions"
        >
          {recommendations.length ===
          0 ? (
            <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.035] p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-300" />

                <p className="text-xs font-medium">
                  Core operating recommendations satisfied
                </p>
              </div>

              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                Team and notification-routing evidence is present. Continue building real operational evidence through Shadow Mode and incident observation.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recommendations.map(
                (
                  recommendation,
                ) => (
                  <button
                    key={
                      recommendation.id
                    }
                    type="button"
                    onClick={
                      () =>
                        navigate(
                          recommendation.actionPath,
                        )
                    }
                    className="flex w-full items-start justify-between gap-3 rounded-xl border border-border/60 bg-secondary/[0.14] p-4 text-left transition-colors hover:bg-secondary/30"
                  >
                    <div>
                      <p className="text-xs font-medium">
                        {recommendation.title}
                      </p>

                      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                        {recommendation.description}
                      </p>
                    </div>

                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                ),
              )}
            </div>
          )}
        </SectionCard>
      </section>


      <div className="rounded-xl border border-primary/15 bg-primary/[0.035] p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />

          <p className="text-xs font-medium">
            Server-owned readiness
          </p>
        </div>

        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          There is no browser “mark complete” action. Each onboarding state is derived from authoritative persisted AIRA evidence in the active organization and environment.
        </p>
      </div>


      <SafetyBoundary>
        Onboarding completion is product-readiness evidence only. It cannot certify recovery capability, elevate autonomy, bypass policy or authorize infrastructure execution.
      </SafetyBoundary>
    </div>
  )
}


function Evidence({
  label,
  value,
}: {
  label:
    string

  value:
    string
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-secondary/[0.12] p-3">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 truncate text-xs font-medium">
        {value}
      </p>
    </div>
  )
}