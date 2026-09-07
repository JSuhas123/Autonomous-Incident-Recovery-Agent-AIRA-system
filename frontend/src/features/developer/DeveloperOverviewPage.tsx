import {
  GitBranch,
  LoaderCircle,
  Wrench,
} from 'lucide-react'

import {
  useNavigate,
} from 'react-router-dom'

import {
  useProductDeveloper,
} from '@/hooks/useProductPersonaReadModels'

import {
  FeaturePageHeader,
  MetricCard,
  SafetyBoundary,
  SectionCard,
  StateBadge,
} from '../shared'


export default function DeveloperOverviewPage() {
  const navigate =
    useNavigate()


  const query =
    useProductDeveloper()


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
          kicker="Developer reliability"
          title="My services"
          description="Developer reliability evidence unavailable."
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
        kicker="Developer reliability"
        title="My services"
        description="Service-level incident evidence and reliability recommendations for the selected environment."
      />


      {!model.ownership.available && (
        <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.035] px-4 py-3">
          <p className="text-xs font-medium">
            Service ownership not yet authoritative
          </p>

          <p className="mt-1 text-[11px] text-muted-foreground">
            {model.ownership.reason} The services below are observed services, not claimed user-owned services.
          </p>
        </div>
      )}


      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Observed services"
          value={String(model.metrics.observedServices)}
          detail="Services present in real incident evidence"
          state="info"
        />

        <MetricCard
          label="Active incidents"
          value={String(model.metrics.activeIncidents)}
          detail="Across observed services"
          state={
            model.metrics.activeIncidents > 0
              ? 'warning'
              : 'healthy'
          }
        />

        <MetricCard
          label="Affected services"
          value={String(model.metrics.servicesWithActiveIncidents)}
          detail="Services with active incidents"
          state={
            model.metrics.servicesWithActiveIncidents > 0
              ? 'warning'
              : 'healthy'
          }
        />

        <MetricCard
          label="Critical services"
          value={String(model.metrics.criticalServices)}
          detail="Active critical incident evidence"
          state={
            model.metrics.criticalServices > 0
              ? 'critical'
              : 'healthy'
          }
        />
      </section>


      <section className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          kicker="Observed scope"
          title="Service reliability"
        >
          {model.services.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No service incident evidence exists yet.
            </p>
          ) : (
            <div className="space-y-2">
              {model.services.map(
                (service) => (
                  <button
                    key={service.id}
                    type="button"
                    onClick={
                      () =>
                        navigate(
                          '/incidents',
                        )
                    }
                    className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-secondary/[0.14] p-3 text-left"
                  >
                    <div>
                      <p className="text-xs font-medium">
                        {service.name}
                      </p>

                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {service.activeIncidents} active · {service.incidentCount} total observed incidents
                      </p>
                    </div>

                    <StateBadge
                      state={service.health}
                    />
                  </button>
                ),
              )}
            </div>
          )}
        </SectionCard>


        <SectionCard
          kicker="AIRA recommendations"
          title="Reliability attention"
          action={<Wrench className="h-4 w-4 text-muted-foreground" />}
        >
          {model.recommendations.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No evidence-backed reliability recommendation is currently required.
            </p>
          ) : (
            <div className="space-y-3">
              {model.recommendations.map(
                (item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-border/60 bg-secondary/[0.14] p-3"
                  >
                    <p className="text-xs font-medium">
                      {item.title}
                    </p>

                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                ),
              )}
            </div>
          )}
        </SectionCard>
      </section>


      <SectionCard
        kicker="Change intelligence"
        title="Recent changes"
        action={<GitBranch className="h-4 w-4 text-muted-foreground" />}
      >
        <div className="rounded-xl border border-border/60 bg-secondary/[0.14] p-4">
          <p className="text-xs font-medium">
            Change correlation unavailable
          </p>

          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            {model.changes.reason}
          </p>
        </div>
      </SectionCard>


      <SafetyBoundary>
        Developer presentation can expose incidents and evidence-backed recommendations, but cannot grant approval or recovery execution permissions.
      </SafetyBoundary>
    </div>
  )
}