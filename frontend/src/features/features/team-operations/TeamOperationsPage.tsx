import { Users } from 'lucide-react'
import { FeaturePageHeader, FixtureNotice, MetricCard, SafetyBoundary, SectionCard, StateBadge } from '../shared'
import { TEAM_OPERATIONS_FIXTURE } from './teamOperations.fixture'

export default function TeamOperationsPage() {
  const model = TEAM_OPERATIONS_FIXTURE
  return (
    <div className="space-y-6">
      <FeaturePageHeader
        kicker="Team operations"
        title="Human response & routing"
        description="On-call coverage, eligible approvers, human tasks, escalation paths, and notification routing for operational events."
      />
      <FixtureNotice />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {model.metrics.map((metric) => <MetricCard key={metric.id} {...metric} />)}
      </section>

      <SectionCard kicker="Routing" title="Operational notification routes" action={<Users className="h-4 w-4 text-muted-foreground" />}>
        <div className="space-y-2">
          {model.routing.map((route) => (
            <div key={route.id} className="grid gap-2 rounded-xl border border-border/60 bg-secondary/[0.14] p-3 md:grid-cols-[1fr_1fr_auto] md:items-center">
              <div><p className="text-[10px] text-muted-foreground">Event</p><p className="mt-1 text-xs font-medium">{route.event}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Target</p><p className="mt-1 text-xs">{route.target}</p><p className="mt-1 text-[10px] text-muted-foreground">{route.channels}</p></div>
              <StateBadge state={route.state} />
            </div>
          ))}
        </div>
      </SectionCard>

      <SafetyBoundary>
        Routing can notify eligible users, but only backend permission checks may determine who can approve or authorize an action.
      </SafetyBoundary>
    </div>
  )
}
