import { BriefcaseBusiness, TrendingUp } from 'lucide-react'
import { FeaturePageHeader, FixtureNotice, MetricCard, SafetyBoundary, SectionCard } from '../shared'
import { EXECUTIVE_OVERVIEW_FIXTURE } from './executiveOverview.fixture'

export default function ExecutiveOverviewPage() {
  const model = EXECUTIVE_OVERVIEW_FIXTURE
  return (
    <div className="space-y-6">
      <FeaturePageHeader
        kicker="Executive reliability"
        title="Business reliability"
        description="Reliability, operational risk, recovery coverage, and business-impact indicators without low-level execution controls."
      />
      <FixtureNotice />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {model.metrics.map((metric) => <MetricCard key={metric.id} {...metric} />)}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard kicker="Business impact" title="Operational impact" action={<BriefcaseBusiness className="h-4 w-4 text-muted-foreground" />}>
          <div className="grid gap-3 sm:grid-cols-3">
            {model.impact.map((item) => (
              <div key={item.id} className="rounded-xl border border-border/60 bg-secondary/[0.14] p-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold">{item.value}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard kicker="Executive brief" title="What changed" action={<TrendingUp className="h-4 w-4 text-muted-foreground" />}>
          <div className="space-y-3">
            {model.narrative.map((item) => (
              <p key={item} className="text-xs leading-5 text-muted-foreground">{item}</p>
            ))}
          </div>
        </SectionCard>
      </section>

      <SafetyBoundary>
        Executive persona is a presentation mode, not an authorization role. Recovery and approval controls remain absent from this experience.
      </SafetyBoundary>
    </div>
  )
}
