import {
  AlertTriangle,
  Eye,
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react'

import {
  useProductShadowMode,
} from '@/hooks/useProductReadModels'

import {
  FeaturePageHeader,
  MetricCard,
  SafetyBoundary,
  SectionCard,
  StateBadge,
} from '../shared'


export default function ShadowModePage() {
  const {
    data,
    isLoading,
    error,
    refetch,
  } =
    useProductShadowMode()


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
          kicker="Trust-building mode"
          title="Shadow Mode"
          description="Observation-only AIRA product state."
        />

        <div className="rounded-xl border border-red-400/20 bg-red-400/[0.05] p-5">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-red-300" />

            <div>
              <p className="text-sm font-medium">
                Shadow Mode unavailable
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                {error instanceof Error
                  ? error.message
                  : 'Unable to load Shadow Mode.'}
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
        kicker="Trust-building mode"
        title="Shadow Mode"
        description="Observe AIRA incident understanding and future comparison evidence without permitting autonomous infrastructure execution."
      />


      <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
        <div className="flex items-center gap-2 text-cyan-300">
          <Eye className="h-4 w-4" />

          <p className="text-sm font-medium">
            Shadow Mode active
          </p>
        </div>

        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          AIRA may observe persisted incident and evidence state. This product mode does not grant execution authority or initiate infrastructure recovery.
        </p>
      </div>


      {data.mode
        .autonomousExecutionAllowed && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-amber-300" />

            <div>
              <p className="text-xs font-medium text-amber-300">
                Environment configuration permits autonomous execution
              </p>

              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                Shadow Mode itself still performs no execution. Environment configuration and execution authorization remain separate controls.
              </p>
            </div>
          </div>
        </div>
      )}


      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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


      <SectionCard
        kicker="Comparison evidence"
        title="AIRA vs human decision"
      >
        {data.comparisons.available ? (
          <div className="space-y-3">
            {data.cases.map(
              (
                item,
              ) => (
                <div
                  key={
                    item.id
                  }
                  className="rounded-xl border border-border/60 bg-secondary/[0.14] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs font-medium">
                      {
                        item.incident
                      }
                    </p>

                    <StateBadge
                      state={
                        item.match
                          ? 'healthy'
                          : 'warning'
                      }
                      label={
                        item.match
                          ? 'Matched'
                          : 'Different action'
                      }
                    />
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        AIRA would do
                      </p>

                      <p className="mt-1 text-xs">
                        {
                          item.aira
                        }
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Engineer did
                      </p>

                      <p className="mt-1 text-xs">
                        {
                          item.human
                        }
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Outcome
                      </p>

                      <p className="mt-1 text-xs">
                        {
                          item.outcome
                        }
                      </p>
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 bg-secondary/[0.14] p-5">
            <p className="text-sm font-medium">
              No published comparison aggregate yet
            </p>

            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {
                data
                  .comparisons
                  .reason
              }
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Sample size
                </p>

                <p className="mt-1 text-sm font-semibold">
                  {
                    data
                      .comparisons
                      .sampleSize
                  }
                </p>
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Diagnosis agreement
                </p>

                <p className="mt-1 text-sm font-semibold">
                  —
                </p>
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Action agreement
                </p>

                <p className="mt-1 text-sm font-semibold">
                  —
                </p>
              </div>
            </div>
          </div>
        )}
      </SectionCard>


      <SafetyBoundary>
        Shadow Mode is explicitly non-executing. Observation quality, future comparison accuracy, learning evidence and trust scores can never grant infrastructure execution authorization by themselves.
      </SafetyBoundary>
    </div>
  )
}