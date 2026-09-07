import {
  AlertTriangle,
  BellRing,
  LoaderCircle,
  Route,
  Users,
} from 'lucide-react'

import {
  useQuery,
} from '@tanstack/react-query'

import {
  teamOperationsApi,
} from '@/api/teamOperationsApi'

import {
  useProductRuntimeStore,
} from '@/store/productRuntimeStore'

import {
  FeaturePageHeader,
  MetricCard,
  SafetyBoundary,
  SectionCard,
  StateBadge,
} from '../shared'


export default function TeamOperationsPage() {
  const organizationId =
    useProductRuntimeStore(
      (state) =>
        state.organization?.id,
    )

  const environmentId =
    useProductRuntimeStore(
      (state) =>
        state.environment?.id,
    )

  const tenantEpoch =
    useProductRuntimeStore(
      (state) =>
        state.tenantEpoch,
    )

  const query =
    useQuery({
      queryKey: [
        'product',
        organizationId,
        environmentId,
        tenantEpoch,
        'team-operations',
      ],

      queryFn:
        async () => {
          const [
            teams,
            channels,
            rules,
          ] =
            await Promise.all([
              teamOperationsApi.teams(),
              teamOperationsApi.channels(),
              teamOperationsApi.rules(),
            ])

          return {
            teams,
            channels,
            rules,
          }
        },

      enabled:
        Boolean(
          organizationId &&
          environmentId,
        ),

      staleTime:
        15_000,

      refetchOnWindowFocus:
        true,
    })


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
          kicker="Human response"
          title="Team operations"
          description="Teams and operational notification routing."
        />

        <div className="rounded-xl border border-red-400/20 bg-red-400/[0.04] p-5">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-red-300" />

            <div>
              <p className="text-sm font-medium">
                Team operations unavailable
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                {query.error instanceof Error
                  ? query.error.message
                  : 'Unable to load team operations.'}
              </p>

              <button
                type="button"
                onClick={
                  () =>
                    void query.refetch()
                }
                className="mt-3 text-xs text-primary"
              >
                Retry
              </button>
            </div>
          </div>
        </div>

        <SafetyBoundary>
          Failure to load team or routing state cannot grant operational authority.
        </SafetyBoundary>
      </div>
    )
  }


  const {
    teams,
    channels,
    rules,
  } =
    query.data


  const activeChannels =
    channels.filter(
      (channel) =>
        channel.status ===
        'active',
    )


  const activeRules =
    rules.filter(
      (rule) =>
        rule.enabled,
    )


  return (
    <div className="space-y-6">
      <FeaturePageHeader
        kicker="Human response"
        title="Team operations"
        description="Real organization teams, operational notification channels and escalation-routing rules."
      />


      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Teams"
          value={
            String(
              teams.length,
            )
          }
          detail="Organization teams"
          state="info"
        />

        <MetricCard
          label="Active channels"
          value={
            String(
              activeChannels.length,
            )
          }
          detail={`${channels.length} configured`}
          state={
            activeChannels.length > 0
              ? 'healthy'
              : 'warning'
          }
        />

        <MetricCard
          label="Routing rules"
          value={
            String(
              activeRules.length,
            )
          }
          detail={`${rules.length} configured`}
          state={
            activeRules.length > 0
              ? 'healthy'
              : 'warning'
          }
        />

        <MetricCard
          label="Routing authority"
          value="Notification only"
          detail="Does not grant control"
          state="healthy"
        />
      </section>


      <section className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          kicker="Responders"
          title="Organization teams"
          action={
            <Users className="h-4 w-4 text-muted-foreground" />
          }
        >
          {teams.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-secondary/[0.14] p-4">
              <p className="text-xs text-muted-foreground">
                No teams are configured.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {teams.map(
                (
                  team,
                  index,
                ) => (
                  <div
                    key={
                      team.publicId ??
                      team.public_id ??
                      team.id ??
                      `${team.name}-${index}`
                    }
                    className="rounded-xl border border-border/60 bg-secondary/[0.14] p-3"
                  >
                    <p className="text-xs font-medium">
                      {team.name}
                    </p>

                    {team.description && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {team.description}
                      </p>
                    )}
                  </div>
                ),
              )}
            </div>
          )}
        </SectionCard>


        <SectionCard
          kicker="Delivery"
          title="Notification channels"
          action={
            <BellRing className="h-4 w-4 text-muted-foreground" />
          }
        >
          {channels.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-secondary/[0.14] p-4">
              <p className="text-xs text-muted-foreground">
                No external notification channels configured.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {channels.map(
                (channel) => (
                  <div
                    key={
                      channel.public_id
                    }
                    className="grid gap-2 rounded-xl border border-border/60 bg-secondary/[0.14] p-3 sm:grid-cols-[1fr_auto] sm:items-center"
                  >
                    <div>
                      <p className="text-xs font-medium">
                        {channel.name}
                      </p>

                      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {channel.channel_type}
                      </p>
                    </div>

                    <StateBadge
                      state={
                        channel.status ===
                        'active'
                          ? 'healthy'
                          : 'warning'
                      }
                      label={
                        channel.status
                      }
                    />
                  </div>
                ),
              )}
            </div>
          )}
        </SectionCard>
      </section>


      <SectionCard
        kicker="Routing policy"
        title="Operational notification routes"
        action={
          <Route className="h-4 w-4 text-muted-foreground" />
        }
      >
        {rules.length === 0 ? (
          <div className="rounded-xl border border-border/60 bg-secondary/[0.14] p-4">
            <p className="text-xs text-muted-foreground">
              No routing rules are configured.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map(
              (rule) => (
                <div
                  key={
                    rule.public_id
                  }
                  className="grid gap-3 rounded-xl border border-border/60 bg-secondary/[0.14] p-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-center"
                >
                  <div>
                    <p className="text-[10px] text-muted-foreground">
                      Rule
                    </p>

                    <p className="mt-1 text-xs font-medium">
                      {rule.name}
                    </p>

                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Priority {rule.priority}
                    </p>
                  </div>


                  <div>
                    <p className="text-[10px] text-muted-foreground">
                      Events
                    </p>

                    <p className="mt-1 text-xs">
                      {rule.event_types.length > 0
                        ? rule.event_types.join(', ')
                        : 'All events'}
                    </p>
                  </div>


                  <div>
                    <p className="text-[10px] text-muted-foreground">
                      Severity
                    </p>

                    <p className="mt-1 text-xs">
                      {rule.severities.length > 0
                        ? rule.severities.join(', ')
                        : 'All severities'}
                    </p>

                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {rule.channel_ids.length} channel target(s)
                    </p>
                  </div>


                  <StateBadge
                    state={
                      rule.enabled
                        ? 'healthy'
                        : 'warning'
                    }
                    label={
                      rule.enabled
                        ? 'Active'
                        : 'Disabled'
                    }
                  />
                </div>
              ),
            )}
          </div>
        )}
      </SectionCard>


      <SafetyBoundary>
        Notification routes determine who receives operational information. They cannot approve recovery, acquire human control, change certification or authorize infrastructure execution.
      </SafetyBoundary>
    </div>
  )
}