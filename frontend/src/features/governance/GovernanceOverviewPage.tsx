import { FileCheck2, ShieldCheck } from 'lucide-react'
import { FeaturePageHeader, FixtureNotice, MetricCard, SafetyBoundary, SectionCard, StateBadge } from '../shared'
import { GOVERNANCE_OVERVIEW_FIXTURE } from './governanceOverview.fixture'

export default function GovernanceOverviewPage() {
  const model = GOVERNANCE_OVERVIEW_FIXTURE
  return (
    <div className="space-y-6">
      <FeaturePageHeader
        kicker="Governance"
        title="Policy, execution & audit"
        description="Policy enforcement, approval boundaries, audit completeness, trust, and certification state for security and audit personas."
      />
      <FixtureNotice />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {model.metrics.map((metric) => <MetricCard key={metric.id} {...metric} />)}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <SectionCard kicker="Control posture" title="Safety controls" action={<ShieldCheck className="h-4 w-4 text-primary" />}>
          <div className="space-y-3">
            {model.controls.map((control) => (
              <div key={control.id} className="rounded-xl border border-border/60 bg-secondary/[0.14] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium">{control.title}</p>
                  <StateBadge state={control.state} />
                </div>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{control.detail}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard kicker="Evidence" title="Recent governance events" action={<FileCheck2 className="h-4 w-4 text-muted-foreground" />}>
          <div className="divide-y divide-border/60">
            {model.recentEvents.map((event) => (
              <div key={event.id} className="py-3">
                <p className="text-xs font-medium">{event.title}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{event.actor}</p>
                <p className="mt-1 text-[11px]">{event.result}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <SafetyBoundary>
        Governance views expose evidence and control state. They never infer execution authority from certification, trust, or persona.
      </SafetyBoundary>
    </div>
  )
}
