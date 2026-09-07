import {
  BriefcaseBusiness,
  LoaderCircle,
  TrendingUp,
} from 'lucide-react'

import {
  useProductExecutive,
} from '@/hooks/useProductPersonaReadModels'

import {
  FeaturePageHeader,
  MetricCard,
  SafetyBoundary,
  SectionCard,
} from '../shared'


export default function ExecutiveOverviewPage() {
  const query =
    useProductExecutive()


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
    !query.data
  ) {
    return (
      <div className="space-y-6">
        <FeaturePageHeader
          kicker="Executive reliability"
          title="Business reliability"
          description="Executive reliability evidence is unavailable."
        />

        <SafetyBoundary />
      </div>
    )
  }


  const model =
    query.data


  return (
    <div className="space-y-6">
      <FeaturePageHeader
        kicker="Executive reliability"
        title="Business reliability"
        description="Operational risk, recovery outcomes and business-impact evidence without infrastructure controls."
      />


      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active incidents"
          value={String(model.metrics.activeIncidents)}
          detail={`${model.metrics.criticalActive} critical`}
          state={
            model.metrics.criticalActive > 0
              ? 'critical'
              : model.metrics.activeIncidents > 0
                ? 'warning'
                : 'healthy'
          }
        />

        <MetricCard
          label="MTTR"
          value={
            model.metrics.medianMttr.available
              ? model.metrics.medianMttr.display ?? 'Unavailable'
              : 'Insufficient evidence'
          }
          detail="Median observed incident recovery duration"
          state={
            model.metrics.medianMttr.available
              ? 'info'
              : 'unknown'
          }
        />

        <MetricCard
          label="Verified recovery"
          value={
            model.metrics.recoverySuccess.available &&
            model.metrics.recoverySuccess.percent !== null
              ? `${model.metrics.recoverySuccess.percent}%`
              : 'Insufficient evidence'
          }
          detail={`${model.metrics.recoverySuccess.confirmed}/${model.metrics.recoverySuccess.total} verified`}
          state={
            model.metrics.recoverySuccess.available
              ? 'info'
              : 'unknown'
          }
        />

        <MetricCard
          label="Human takeover"
          value={String(model.metrics.humanTakeover.total)}
          detail={
            model.metrics.humanTakeover.sharePercent !== null
              ? `${model.metrics.humanTakeover.sharePercent}% incident share`
              : 'Incident share unavailable'
          }
          state="info"
        />
      </section>


      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          kicker="Business impact"
          title="Observed operational impact"
          action={<BriefcaseBusiness className="h-4 w-4 text-muted-foreground" />}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Impact
              label="Customer-impacting incidents"
              value={String(model.impact.customerImpactingIncidents)}
              detail="Only incidents carrying explicit customer-impact evidence"
            />

            <Impact
              label="Observed incident minutes"
              value={String(model.impact.observedIncidentMinutes)}
              detail="Actual persisted incident duration — not minutes saved"
            />

            <Impact
              label="Financial savings"
              value="Unavailable"
              detail={model.impact.financialSavings.reason}
            />
          </div>
        </SectionCard>


        <SectionCard
          kicker="Executive brief"
          title="What the evidence says"
          action={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
        >
          <div className="space-y-3">
            {model.narrative.map(
              (item) => (
                <p
                  key={item}
                  className="text-xs leading-5 text-muted-foreground"
                >
                  {item}
                </p>
              ),
            )}
          </div>
        </SectionCard>
      </section>


      <SafetyBoundary>
        Executive persona is presentation only. Business impact, recovery success and reliability indicators cannot authorize recovery actions.
      </SafetyBoundary>
    </div>
  )
}


function Impact({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/[0.14] p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>

      <p className="mt-2 text-2xl font-semibold">
        {value}
      </p>

      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
        {detail}
      </p>
    </div>
  )
}