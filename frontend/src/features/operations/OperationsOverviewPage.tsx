import {
  AlertTriangle,
  ArrowRight,
  LoaderCircle,
  LockKeyhole,
} from 'lucide-react'

import {
  useNavigate,
} from 'react-router-dom'

import {
  useProductOperations,
} from '@/hooks/useProductReadModels'

import {
  FeaturePageHeader,
  MetricCard,
  SafetyBoundary,
  SectionCard,
  StateBadge,
} from '../shared'

import {
  WorkflowStateBadge,
} from './WorkflowStateBadge'


export default function OperationsOverviewPage() {
  const navigate =
    useNavigate()


  const {
    data,
    isLoading,
    error,
    refetch,
  } =
    useProductOperations()


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
          kicker="Live operations"
          title="Operations"
          description="Authoritative environment-scoped operational read model."
        />

        <div className="rounded-xl border border-red-400/20 bg-red-400/[0.05] p-5">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-red-300" />

            <div>
              <p className="text-sm font-medium">
                Operations unavailable
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                {error instanceof Error
                  ? error.message
                  : 'Unable to load operations.'}
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


  const incident =
    data.primaryIncident


  return (
    <div className="space-y-6">
      <FeaturePageHeader
        kicker="Live operations"
        title="Operations"
        description="Environment-scoped incident pressure and workflow state from the AIRA Product BFF."
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


      {incident ? (
        <section className="aira-surface overflow-hidden">
          <div className="border-b border-border/70 bg-red-400/[0.025] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
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
                      incident.rawSeverity
                    }
                  />

                  <WorkflowStateBadge
                    state={
                      incident.workflowState as any
                    }
                  />
                </div>

                <h2 className="mt-3 text-xl font-semibold">
                  {
                    incident.title
                  }
                </h2>

                <p className="mt-1 text-xs text-muted-foreground">
                  {
                    incident.service
                  }
                </p>
              </div>


              <button
                type="button"
                onClick={
                  () =>
                    navigate(
                      `/incidents/${incident.id}`,
                    )
                }
                className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary"
              >
                Open incident

                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>


          <div className="grid gap-px bg-border/60 xl:grid-cols-3">
            <div className="bg-card p-5">
              <p className="aira-kicker">
                Current state
              </p>

              <p className="mt-3 text-xs capitalize">
                {
                  incident.status
                }
              </p>
            </div>


            <div className="bg-card p-5">
              <p className="aira-kicker">
                Correlation
              </p>

              <p className="mt-3 text-xs">
                {incident.correlationConfidence ==
                null
                  ? 'Not available'
                  : `${Math.round(
                      incident.correlationConfidence *
                        100,
                    )}% confidence`}
              </p>

              <p className="mt-1 text-[10px] text-muted-foreground">
                {
                  incident.providerCount
                } providers
                {' · '}
                {
                  incident.evidenceCount
                } evidence items
              </p>
            </div>


            <div className="bg-card p-5">
              <div className="flex items-center gap-2">
                <LockKeyhole className="h-4 w-4 text-red-300" />

                <p className="aira-kicker">
                  Execution
                </p>
              </div>

              <p className="mt-3 text-xs font-medium text-red-300">
                NOT AUTHORIZED
              </p>
            </div>
          </div>
        </section>
      ) : (
        <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-5">
          <p className="text-sm font-medium text-emerald-300">
            No active incidents
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            The current environment has no active incident pressure.
          </p>
        </div>
      )}


      <SectionCard
        kicker="Incident pressure"
        title="Active incident queue"
      >
        {data.incidents.length ===
        0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No active incidents.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {data.incidents.map(
              (
                item,
              ) => (
                <button
                  key={
                    item.id
                  }
                  type="button"
                  onClick={
                    () =>
                      navigate(
                        `/incidents/${item.id}`,
                      )
                  }
                  className="flex w-full items-center gap-3 py-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {
                        item.title
                      }
                    </p>

                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {
                        item.service
                      }
                      {' · '}
                      {
                        item.age
                      }
                    </p>
                  </div>

                  <WorkflowStateBadge
                    state={
                      item.workflowState as any
                    }
                  />
                </button>
              ),
            )}
          </div>
        )}
      </SectionCard>


      <SafetyBoundary>
        This page is a Product BFF read model. Incident state, diagnosis, certification, persona and UI controls remain separate from execution authorization.
      </SafetyBoundary>
    </div>
  )
}