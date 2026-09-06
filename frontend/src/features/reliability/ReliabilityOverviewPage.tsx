import { FeaturePageHeader, FixtureNotice, MetricCard, SafetyBoundary, SectionCard, StateBadge } from '../shared'
import { RELIABILITY_FIXTURE } from './reliability.fixture'

export default function ReliabilityOverviewPage() {
  const model = RELIABILITY_FIXTURE
  return (
    <div className="space-y-6">
      <FeaturePageHeader
        kicker="Reliability intelligence"
        title="Reliability"
        description="Detection, acknowledgment, recovery, human takeover, coverage, and operational-gap metrics across the selected product scope."
      />
      <FixtureNotice />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {model.metrics.map((metric) => <MetricCard key={metric.id} {...metric} />)}
      </section>

      <SectionCard kicker="Coverage" title="Uncovered recovery capabilities">
        <div className="space-y-2">
          {model.gaps.map((gap) => (
            <div key={gap.id} className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/[0.14] p-3">
              <div>
                <p className="text-xs font-medium">{gap.capability}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{gap.services} affected services</p>
              </div>
              <StateBadge state={gap.state} />
            </div>
          ))}
        </div>
      </SectionCard>

      <SafetyBoundary>
        Reliability metrics summarize outcomes and coverage. They do not imply that a recovery capability is currently authorized to execute.
      </SafetyBoundary>
    </div>
  )
}
