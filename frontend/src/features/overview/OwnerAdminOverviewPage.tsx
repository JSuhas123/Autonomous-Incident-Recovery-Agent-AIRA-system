import { ArrowRight, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { FeaturePageHeader, FixtureNotice, MetricCard, SafetyBoundary, SectionCard, StateBadge } from '../shared'
import { OWNER_ADMIN_OVERVIEW_FIXTURE } from './ownerAdminOverview.fixture'

export default function OwnerAdminOverviewPage() {
  const navigate = useNavigate()
  const model = OWNER_ADMIN_OVERVIEW_FIXTURE

  return (
    <div className="space-y-6">
      <FeaturePageHeader
        kicker="Organization reliability"
        title="Overview"
        description="Organization-wide reliability, human-action, recovery coverage, and integration health for owners and administrators."
      />

      <FixtureNotice />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {model.metrics.map((metric) => (
          <MetricCard key={metric.id} {...metric} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          kicker="Current operations"
          title="Active incidents"
          action={
            <button onClick={() => navigate('/incidents')} className="flex items-center gap-1 text-xs text-primary">
              View all <ArrowRight className="h-3 w-3" />
            </button>
          }
        >
          <div className="space-y-2">
            {model.incidents.map((incident) => (
              <button
                key={incident.id}
                onClick={() => navigate(`/incidents/${incident.id}`)}
                className="flex w-full items-start justify-between gap-3 rounded-xl border border-border/60 bg-secondary/[0.14] p-3 text-left hover:bg-secondary/30"
              >
                <div>
                  <p className="text-xs font-medium">{incident.title}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {incident.service} · {incident.age}
                  </p>
                </div>
                <StateBadge state={incident.severity === 'critical' ? 'critical' : 'warning'} label={incident.status} />
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard kicker="Action queue" title="Needs attention">
          <div className="space-y-2">
            {model.attention.map((item) => (
              <div key={item.id} className="rounded-xl border border-border/60 bg-secondary/[0.14] p-3">
                <p className="text-xs font-medium">{item.title}</p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <SectionCard kicker="Environments" title="Environment health">
          <div className="space-y-2">
            {model.environments.map((environment) => (
              <div key={environment.id} className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/[0.14] p-3">
                <div>
                  <p className="text-xs font-medium">{environment.name}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {environment.healthy}/{environment.total} services healthy · {environment.incidents} incidents
                  </p>
                </div>
                <StateBadge state={environment.state} />
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard kicker="Coverage" title="Reliability gaps">
          <div className="space-y-3">
            {model.reliabilityGaps.map((gap) => (
              <div key={gap.id} className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium">{gap.title}</p>
                    <StateBadge state={gap.state} />
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{gap.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <SafetyBoundary />
    </div>
  )
}
