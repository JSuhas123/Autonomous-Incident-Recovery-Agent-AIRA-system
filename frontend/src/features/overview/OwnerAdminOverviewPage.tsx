import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react'

import {
  useNavigate,
} from 'react-router-dom'

import {
  useProductOverview,
} from '@/hooks/useProductReadModels'

import {
  FeaturePageHeader,
  MetricCard,
  SafetyBoundary,
  SectionCard,
  StateBadge,
} from '../shared'


export default function OwnerAdminOverviewPage() {
  const navigate =
    useNavigate()


  const {
    data,
    isLoading,
    error,
    refetch,
  } =
    useProductOverview()


  if (
    isLoading
  ) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }


  if (
    error ||
    !data
  ) {
    return (
      <div className="space-y-6">
        <FeaturePageHeader
          kicker="Organization reliability"
          title="Overview"
          description="Authoritative organization and environment reliability read model."
        />

        <div className="rounded-xl border border-red-400/20 bg-red-400/[0.05] p-5">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-red-300" />

            <div>
              <p className="text-sm font-medium">
                Product overview unavailable
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                {error instanceof Error
                  ? error.message
                  : 'AIRA could not resolve the product read model.'}
              </p>

              <button
                type="button"
                onClick={
                  () =>
                    void refetch()
                }
                className="mt-3 text-xs text-primary"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }


  return (
    <div className="space-y-6">
      <FeaturePageHeader
        kicker="Organization reliability"
        title="Overview"
        description="Live organization reliability derived from the authoritative AIRA Product BFF."
      />


      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {data.metrics.map(
          (
            metric,
          ) => (
            <MetricCard
              key={
                metric.id
              }
              {...metric}
            />
          ),
        )}
      </section>


      <section className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          kicker="Current operations"
          title="Active incidents"
          action={
            <button
              type="button"
              onClick={
                () =>
                  navigate(
                    '/incidents',
                  )
              }
              className="flex items-center gap-1 text-xs text-primary"
            >
              View all

              <ArrowRight className="h-3 w-3" />
            </button>
          }
        >
          {data.incidents.length ===
          0 ? (
            <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4">
              <p className="text-xs font-medium text-emerald-300">
                No active incidents
              </p>

              <p className="mt-1 text-[11px] text-muted-foreground">
                No active incident is currently recorded for this environment.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.incidents.map(
                (
                  incident,
                ) => (
                  <button
                    key={
                      incident.id
                    }
                    type="button"
                    onClick={
                      () =>
                        navigate(
                          `/incidents/${incident.id}`,
                        )
                    }
                    className="flex w-full items-start justify-between gap-3 rounded-xl border border-border/60 bg-secondary/[0.14] p-3 text-left hover:bg-secondary/30"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">
                        {
                          incident.title
                        }
                      </p>

                      <p className="mt-1 truncate text-[10px] text-muted-foreground">
                        {
                          incident.service
                        }
                        {' · '}
                        {
                          incident.age
                        }
                      </p>
                    </div>

                    <StateBadge
                      state={
                        incident.severity ===
                        'critical'
                          ? 'critical'
                          : incident.severity ===
                              'high'
                            ? 'warning'
                            : 'info'
                      }
                      label={
                        incident.status
                      }
                    />
                  </button>
                ),
              )}
            </div>
          )}
        </SectionCard>


        <SectionCard
          kicker="Environment"
          title="Current organization capacity"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/[0.14] p-4">
              <Boxes className="h-5 w-5 text-muted-foreground" />

              <div>
                <p className="text-xs font-medium">
                  {
                    data
                      .environmentSummary
                      .total
                  }{' '}
                  environments
                </p>

                <p className="mt-1 text-[11px] text-muted-foreground">
                  {
                    data
                      .environmentSummary
                      .active
                  } active
                  {' · '}
                  {
                    data
                      .environmentSummary
                      .maintenance
                  } maintenance
                </p>
              </div>
            </div>


            <div className="rounded-xl border border-border/60 bg-secondary/[0.14] p-4">
              <p className="text-xs font-medium">
                Plan
              </p>

              <p className="mt-1 text-sm capitalize">
                {
                  data
                    .environmentSummary
                    .plan
                }
              </p>
            </div>
          </div>
        </SectionCard>
      </section>


      <SectionCard
        kicker="Safety"
        title="Authority boundary"
      >
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-300" />

          <div>
            <p className="text-xs font-medium">
              Product BFF is read-only
            </p>

            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              executionAuthorized=false. Product persona and dashboard state cannot grant infrastructure execution authority.
            </p>
          </div>
        </div>
      </SectionCard>


      <SafetyBoundary />
    </div>
  )
}