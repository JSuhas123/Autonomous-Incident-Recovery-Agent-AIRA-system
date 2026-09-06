import { ArrowRight, GitBranch, Wrench } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { FeaturePageHeader, FixtureNotice, MetricCard, SafetyBoundary, SectionCard, StateBadge } from '../shared'
import { DEVELOPER_OVERVIEW_FIXTURE } from './developerOverview.fixture'

export default function DeveloperOverviewPage() {
  const navigate = useNavigate()
  const model = DEVELOPER_OVERVIEW_FIXTURE

  return (
    <div className="space-y-6">
      <FeaturePageHeader
        kicker="Developer reliability"
        title="My services"
        description="Service health, relevant incidents, correlated changes, and reliability recommendations for the services you own."
      />
      <FixtureNotice />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {model.metrics.map((metric) => <MetricCard key={metric.id} {...metric} />)}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <SectionCard kicker="Ownership" title="Service reliability">
          <div className="space-y-2">
            {model.services.map((service) => (
              <button key={service.id} onClick={() => navigate(`/services/${service.id}`)} className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-secondary/[0.14] p-3 text-left">
                <div>
                  <p className="text-xs font-medium">{service.name}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{service.incidents} active incidents · {service.coverage} recovery coverage</p>
                </div>
                <StateBadge state={service.health} />
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard kicker="AIRA recommendations" title="Improve reliability" action={<Wrench className="h-4 w-4 text-muted-foreground" />}>
          <div className="space-y-3">
            {model.recommendations.map((item) => (
              <div key={item.id} className="rounded-xl border border-border/60 bg-secondary/[0.14] p-3">
                <p className="text-xs font-medium">{item.title}</p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <SectionCard kicker="Change intelligence" title="Recent changes" action={<GitBranch className="h-4 w-4 text-muted-foreground" />}>
        <div className="grid gap-3 xl:grid-cols-2">
          {model.changes.map((change) => (
            <div key={change.id} className="rounded-xl border border-border/60 bg-secondary/[0.14] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium">{change.service}</p>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="mt-2 text-[11px]">{change.change}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{change.impact}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SafetyBoundary>
        Developer presentation can explain incidents and recommendations, but does not grant approval or recovery execution permissions.
      </SafetyBoundary>
    </div>
  )
}
