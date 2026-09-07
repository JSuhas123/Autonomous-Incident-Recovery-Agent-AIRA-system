import {
  AlertTriangle,
  LoaderCircle,
} from 'lucide-react'

import {
  useProductReliability,
} from '@/hooks/useProductPersonaReadModels'

import {
  FeaturePageHeader,
  MetricCard,
  SafetyBoundary,
  SectionCard,
  StateBadge,
} from '../shared'


export default function ReliabilityOverviewPage() {
  const query =
    useProductReliability()


  if (
    query.isLoading
  ) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
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
          kicker="Reliability intelligence"
          title="Reliability"
          description="Evidence-backed reliability metrics for the selected environment."
        />

        <div className="rounded-xl border border-red-400/20 bg-red-400/[0.04] p-4">
          <AlertTriangle className="h-4 w-4 text-red-300" />

          <p className="mt-2 text-xs">
            Reliability evidence unavailable.
          </p>
        </div>

        <SafetyBoundary />
      </div>
    )
  }


  const model =
    query.data


  return (
    <div className="space-y-6">
      <FeaturePageHeader
        kicker="Reliability intelligence"
        title="Reliability"
        description="Detection, resolution, verified recovery and human-intervention evidence across the selected environment."
      />


      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Active incidents"
          value={String(model.metrics.incidents.active)}
          detail={`${model.metrics.incidents.criticalActive} critical`}
          state={
            model.metrics.incidents.criticalActive > 0
              ? 'critical'
              : model.metrics.incidents.active > 0
                ? 'warning'
                : 'healthy'
          }
        />

        <MetricCard
          label="MTTD"
          value={
            model.metrics.mttd.available
              ? model.metrics.mttd.display ?? 'Unavailable'
              : 'Insufficient evidence'
          }
          detail={model.metrics.mttd.basis}
          state="unknown"
        />

        <MetricCard
          label="MTTR"
          value={
            model.metrics.mttr.available
              ? model.metrics.mttr.display ?? 'Unavailable'
              : 'Insufficient evidence'
          }
          detail={model.metrics.mttr.basis}
          state={
            model.metrics.mttr.available
              ? 'info'
              : 'unknown'
          }
        />

        <MetricCard
          label="Verified recovery"
          value={
            model.metrics.recovery.available &&
            model.metrics.recovery.successPercent !== null
              ? `${model.metrics.recovery.successPercent}%`
              : 'Insufficient evidence'
          }
          detail={`${model.metrics.recovery.confirmed}/${model.metrics.recovery.verifications} current verifications confirmed`}
          state={
            model.metrics.recovery.available
              ? 'info'
              : 'unknown'
          }
        />

        <MetricCard
          label="Human takeover"
          value={String(model.metrics.humanTakeover.total)}
          detail={
            model.metrics.humanTakeover.incidentSharePercent !== null
              ? `${model.metrics.humanTakeover.incidentSharePercent}% of observed incidents`
              : 'Incident share unavailable'
          }
          state={
            model.metrics.humanTakeover.active > 0
              ? 'warning'
              : 'info'
          }
        />

        <MetricCard
          label="Recovery coverage"
          value="Insufficient evidence"
          detail={model.evidenceState.reason}
          state="unknown"
        />
      </section>


      <SectionCard
        kicker="Reliability attention"
        title="Services requiring investigation"
      >
        {model.attention.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No repeated or currently active service incident patterns are present.
          </p>
        ) : (
          <div className="space-y-2">
            {model.attention.map(
              (item) => (
                <div
                  key={item.serviceId}
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/[0.14] p-3"
                >
                  <div>
                    <p className="text-xs font-medium">
                      {item.serviceId}
                    </p>

                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {item.incidentCount} incident(s) · {item.activeIncidents} active · {item.criticalIncidents} critical observed
                    </p>
                  </div>

                  <StateBadge
                    state={item.state}
                  />
                </div>
              ),
            )}
          </div>
        )}
      </SectionCard>


      <SafetyBoundary>
        Reliability outcomes and historical recovery evidence never grant execution authority. Capability, certification and authorization remain separate.
      </SafetyBoundary>
    </div>
  )
}