import {
  FileCheck2,
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react'

import {
  useProductGovernance,
} from '@/hooks/useProductPersonaReadModels'

import {
  FeaturePageHeader,
  MetricCard,
  SafetyBoundary,
  SectionCard,
  StateBadge,
} from '../shared'


export default function GovernanceOverviewPage() {
  const query =
    useProductGovernance()


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
          kicker="Governance"
          title="Policy, execution & audit"
          description="Governance evidence unavailable."
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
        kicker="Governance"
        title="Policy, execution & audit"
        description="Real policy, approval, human-control and decision-trace evidence for security and audit personas."
      />


      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active policies"
          value={String(model.metrics.policies.active)}
          detail={`${model.metrics.policies.total} policy record(s)`}
          state={
            model.metrics.policies.active > 0
              ? 'healthy'
              : 'warning'
          }
        />

        <MetricCard
          label="Pending approvals"
          value={String(model.metrics.approvals.pending)}
          detail={`${model.metrics.approvals.total} approval record(s)`}
          state={
            model.metrics.approvals.pending > 0
              ? 'warning'
              : 'healthy'
          }
        />

        <MetricCard
          label="Decision traces"
          value={String(model.metrics.auditDecisionTraces)}
          detail="Recent scoped governance evidence"
          state="info"
        />

        <MetricCard
          label="Audit completeness"
          value="Insufficient evidence"
          detail={model.unavailable.auditCompletenessPercent.reason}
          state="unknown"
        />
      </section>


      <section className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          kicker="Control posture"
          title="Safety controls"
          action={<ShieldCheck className="h-4 w-4 text-primary" />}
        >
          <div className="space-y-3">
            {model.controls.map(
              (control) => (
                <div
                  key={control.id}
                  className="rounded-xl border border-border/60 bg-secondary/[0.14] p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium">
                      {control.title}
                    </p>

                    <StateBadge
                      state={control.state}
                    />
                  </div>

                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                    {control.detail}
                  </p>
                </div>
              ),
            )}
          </div>
        </SectionCard>


        <SectionCard
          kicker="Evidence"
          title="Recent governance decisions"
          action={<FileCheck2 className="h-4 w-4 text-muted-foreground" />}
        >
          {model.recentEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No decision-trace evidence exists in the selected environment.
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {model.recentEvents.map(
                (event) => (
                  <div
                    key={event.id}
                    className="py-3"
                  >
                    <p className="text-xs font-medium">
                      {event.title}
                    </p>

                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {event.actor}
                    </p>

                    <p className="mt-1 text-[11px]">
                      {event.result}
                    </p>
                  </div>
                ),
              )}
            </div>
          )}
        </SectionCard>
      </section>


      <SafetyBoundary>
        Governance evidence exposes control state only. Certification does not equal authorization, trust does not equal authorization, and persona does not equal permission.
      </SafetyBoundary>
    </div>
  )
}